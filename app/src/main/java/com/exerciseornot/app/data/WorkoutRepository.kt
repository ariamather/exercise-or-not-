package com.exerciseornot.app.data

import androidx.room.withTransaction
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.db.WorkoutEntity
import com.exerciseornot.app.data.db.WorkoutExerciseEntity
import com.exerciseornot.app.data.model.WorkoutDetail
import com.exerciseornot.app.data.model.toDetail
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID

data class AddedExercise(val workoutId: String, val workoutExerciseId: String)

/** Thrown when an [WorkoutTarget.Existing] workout no longer exists (e.g. deleted from history). */
class WorkoutNotFoundException : IllegalStateException("这次训练已被删除")

/**
 * All rules about workouts and sets live here. Validation failures throw
 * [IllegalArgumentException] with a user-facing message.
 */
class WorkoutRepository(
    private val db: AppDatabase,
    private val clock: Clock = Clock.systemDefaultZone(),
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    private val dao = db.workoutDao()

    fun today(): LocalDate = LocalDate.now(clock)

    fun observeHistory(): Flow<List<WorkoutDetail>> =
        dao.observeWorkouts().map { list -> list.map { it.toDetail() } }

    fun observeWorkout(id: String): Flow<WorkoutDetail?> =
        dao.observeWorkout(id).map { it?.toDetail() }

    fun observeLatestWorkout(): Flow<WorkoutEntity?> = dao.observeLatestWorkout()

    suspend fun latestWorkout(): WorkoutEntity? = dao.latestWorkout()

    /**
     * Puts [exerciseId] into the target workout (creating the workout for [WorkoutTarget.New]) with
     * one pending row prefilled from the previous time this exercise was done. Adding an exercise
     * that is already there returns the existing item.
     */
    suspend fun addExercise(target: WorkoutTarget, exerciseId: String): AddedExercise = db.withTransaction {
        val now = clock.millis()
        val exercise = requireNotNull(dao.getExercise(exerciseId)) { "动作不存在" }
        val workout = when (target) {
            is WorkoutTarget.Existing -> dao.getWorkout(target.workoutId) ?: throw WorkoutNotFoundException()
            is WorkoutTarget.New -> {
                requireNotFuture(target.date)
                WorkoutEntity(
                    id = newId(),
                    performedAt = performedAtFor(target.date, now),
                    trainingDate = target.date.toString(),
                    zoneId = clock.zone.id,
                    createdAt = now,
                    updatedAt = now,
                ).also { dao.upsertWorkout(it) }
            }
        }

        val item = dao.findWorkoutExercise(workout.id, exercise.id)
            ?: WorkoutExerciseEntity(
                id = newId(),
                workoutId = workout.id,
                exerciseId = exercise.id,
                position = (dao.maxWorkoutExercisePosition(workout.id) ?: -1) + 1,
                nameSnapshot = exercise.name,
                weightModeSnapshot = exercise.weightMode,
                createdAt = now,
                updatedAt = now,
            ).also { dao.upsertWorkoutExercise(it) }

        if (dao.draftsOf(item.id).isEmpty()) {
            val seed = dao.loggedOf(item.id).lastOrNull() ?: previousSetsOf(item, workout).lastOrNull()
            insertDraft(item.id, seed?.weightGrams, seed?.reps, now)
        }
        AddedExercise(workout.id, item.id)
    }

    /**
     * Confirms a pending row with the given values and creates the next pending row carrying the
     * same values, returning its id. Confirming a row that is already logged changes nothing.
     */
    suspend fun confirmDraft(setId: String, weightGrams: Int?, reps: Int?): String = db.withTransaction {
        val set = requireNotNull(dao.getSet(setId)) { "这一组不存在" }
        if (set.status == SetStatus.LOGGED) {
            return@withTransaction dao.draftsOf(set.workoutExerciseId).firstOrNull()?.id
                ?: insertDraft(set.workoutExerciseId, set.weightGrams, set.reps, clock.millis())
        }
        val item = dao.getWorkoutExercise(set.workoutExerciseId)!!
        validateValues(item.weightModeSnapshot, weightGrams, reps)
        val now = clock.millis()
        dao.upsertSet(
            set.copy(weightGrams = weightGrams, reps = reps, status = SetStatus.LOGGED, loggedAt = now, updatedAt = now)
        )
        dao.draftsOf(item.id).firstOrNull()?.id ?: insertDraft(item.id, weightGrams, reps, now)
    }

    /** Logged sets from the last time this item's exercise was done before this workout. */
    suspend fun previousSets(workoutExerciseId: String): List<SetEntryEntity> {
        val item = dao.getWorkoutExercise(workoutExerciseId) ?: return emptyList()
        val workout = dao.getWorkout(item.workoutId) ?: return emptyList()
        return previousSetsOf(item, workout)
    }

    /** Removes an exercise and all its sets from a workout. */
    suspend fun removeExercise(workoutExerciseId: String): DeletedSnapshot = db.withTransaction {
        val item = dao.getWorkoutExercise(workoutExerciseId) ?: return@withTransaction DeletedSnapshot()
        val snapshot = DeletedSnapshot(workoutExercises = listOf(item), sets = dao.setsOf(item.id))
        dao.deleteWorkoutExercise(item)
        snapshot
    }

    private suspend fun previousSetsOf(item: WorkoutExerciseEntity, workout: WorkoutEntity) =
        dao.previousLoggedSets(item.exerciseId, workout.id, workout.trainingDate, workout.performedAt)

    private suspend fun insertDraft(workoutExerciseId: String, weightGrams: Int?, reps: Int?, now: Long): String {
        val id = newId()
        dao.upsertSet(
            SetEntryEntity(
                id = id,
                workoutExerciseId = workoutExerciseId,
                position = (dao.maxSetPosition(workoutExerciseId) ?: -1) + 1,
                weightGrams = weightGrams,
                reps = reps,
                status = SetStatus.DRAFT,
                loggedAt = null,
                createdAt = now,
                updatedAt = now,
            )
        )
        return id
    }

    /**
     * Updates a pending row's values; they may be incomplete. Rows that are already logged
     * (or gone) are left untouched: the draft path must never demote a confirmed set.
     */
    suspend fun saveDraft(setId: String, weightGrams: Int?, reps: Int?) {
        require(reps == null || reps > 0) { "次数需为正整数" }
        require(weightGrams == null || weightGrams >= 0) { "重量不能为负数" }
        db.withTransaction {
            val existing = dao.getSet(setId) ?: return@withTransaction
            if (existing.status == SetStatus.LOGGED) return@withTransaction
            if (existing.weightGrams == weightGrams && existing.reps == reps) return@withTransaction
            dao.upsertSet(existing.copy(weightGrams = weightGrams, reps = reps, updatedAt = clock.millis()))
        }
    }

    /** Edits a logged set's values; it stays logged and keeps its original [SetEntryEntity.loggedAt]. */
    suspend fun updateLoggedSet(setId: String, weightGrams: Int?, reps: Int?) = db.withTransaction {
        val set = requireNotNull(dao.getSet(setId)) { "这一组不存在" }
        require(set.status == SetStatus.LOGGED) { "只能修改已记录的组" }
        val we = dao.getWorkoutExercise(set.workoutExerciseId)!!
        validateValues(we.weightModeSnapshot, weightGrams, reps)
        dao.upsertSet(set.copy(weightGrams = weightGrams, reps = reps, updatedAt = clock.millis()))
    }

    /** Deletes one set; an exercise item left without any set is removed with it. */
    suspend fun deleteSet(setId: String): DeletedSnapshot = db.withTransaction {
        val set = dao.getSet(setId) ?: return@withTransaction DeletedSnapshot()
        val we = dao.getWorkoutExercise(set.workoutExerciseId)!!
        dao.deleteSet(set)
        if (dao.setsOf(we.id).isEmpty()) {
            dao.deleteWorkoutExercise(we)
            DeletedSnapshot(workoutExercises = listOf(we), sets = listOf(set))
        } else {
            DeletedSnapshot(sets = listOf(set))
        }
    }

    suspend fun deleteWorkout(workoutId: String): DeletedSnapshot = db.withTransaction {
        val workout = dao.getWorkout(workoutId) ?: return@withTransaction DeletedSnapshot()
        val snapshot = DeletedSnapshot(
            workouts = listOf(workout),
            workoutExercises = dao.workoutExercisesOf(workoutId),
            sets = dao.setsOfWorkout(workoutId),
        )
        dao.deleteWorkout(workout)
        snapshot
    }

    /** Writes back exactly the rows a delete removed (same ids and timestamps). */
    suspend fun restore(snapshot: DeletedSnapshot) = db.withTransaction {
        val restoredWorkouts = snapshot.workouts.map { it.id }.toSet()
        val restoredItems = snapshot.workoutExercises.map { it.id }.toSet()
        snapshot.workoutExercises.forEach {
            if (it.workoutId !in restoredWorkouts && dao.getWorkout(it.workoutId) == null) {
                throw IllegalStateException("无法撤销：所属训练已被删除")
            }
        }
        snapshot.sets.forEach {
            if (it.workoutExerciseId !in restoredItems && dao.getWorkoutExercise(it.workoutExerciseId) == null) {
                throw IllegalStateException("无法撤销：所属训练已被删除")
            }
        }
        dao.upsertWorkouts(snapshot.workouts)
        dao.upsertWorkoutExercises(snapshot.workoutExercises)
        dao.upsertSets(snapshot.sets)
    }

    /** Moves a workout to another day, keeping its time of day. */
    suspend fun changeWorkoutDate(workoutId: String, date: LocalDate) = db.withTransaction {
        requireNotFuture(date)
        val workout = dao.getWorkout(workoutId) ?: throw WorkoutNotFoundException()
        val zone = ZoneId.of(workout.zoneId)
        val time = Instant.ofEpochMilli(workout.performedAt).atZone(zone).toLocalTime()
        dao.upsertWorkout(
            workout.copy(
                trainingDate = date.toString(),
                performedAt = date.atTime(time).atZone(zone).toInstant().toEpochMilli(),
                updatedAt = clock.millis(),
            )
        )
    }

    private fun performedAtFor(date: LocalDate, now: Long): Long =
        if (date == today()) now
        else date.atTime(LocalTime.NOON).atZone(clock.zone).toInstant().toEpochMilli()

    private fun requireNotFuture(date: LocalDate) =
        require(!date.isAfter(today())) { "训练日期不能晚于今天" }

    companion object {
        fun validateValues(mode: WeightMode, weightGrams: Int?, reps: Int?) {
            require(reps != null && reps > 0) { "次数需为正整数" }
            require(weightGrams == null || weightGrams >= 0) { "重量不能为负数" }
            require(mode == WeightMode.BODYWEIGHT || weightGrams != null) {
                "这个动作按重量记录，请填写重量"
            }
        }
    }
}

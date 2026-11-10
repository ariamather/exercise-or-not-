package com.exerciseornot.app.data

import androidx.room.withTransaction
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.ExerciseEntity
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
     * Records a confirmed set and returns the id of the workout it went into.
     * [setId] is chosen by the caller and reused on retries, so repeated confirmation of the
     * same set updates one row instead of inserting another.
     */
    suspend fun logSet(
        target: WorkoutTarget,
        setId: String,
        exerciseName: String,
        weightGrams: Int?,
        reps: Int?,
    ): String = db.withTransaction {
        val now = clock.millis()

        dao.getSet(setId)?.let { existing ->
            val we = dao.getWorkoutExercise(existing.workoutExerciseId)!!
            validateValues(we.weightModeSnapshot, weightGrams, reps)
            dao.upsertSet(
                existing.copy(
                    weightGrams = weightGrams,
                    reps = reps,
                    status = SetStatus.LOGGED,
                    loggedAt = existing.loggedAt ?: now,
                    updatedAt = now,
                )
            )
            return@withTransaction we.workoutId
        }

        val name = exerciseName.trim()
        require(name.isNotEmpty()) { "请填写动作名称" }

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

        val exercise = resolveExercise(name, weightGrams, now)
        val existingItem = dao.findWorkoutExercise(workout.id, exercise.id)
        validateValues(existingItem?.weightModeSnapshot ?: exercise.weightMode, weightGrams, reps)

        val workoutExercise = existingItem
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

        dao.upsertSet(
            SetEntryEntity(
                id = setId,
                workoutExerciseId = workoutExercise.id,
                position = (dao.maxSetPosition(workoutExercise.id) ?: -1) + 1,
                weightGrams = weightGrams,
                reps = reps,
                status = SetStatus.LOGGED,
                loggedAt = now,
                createdAt = now,
                updatedAt = now,
            )
        )
        workout.id
    }

    /**
     * Saves pending input as a draft. Values may be incomplete. A set that is already
     * logged is left untouched: the draft path must never demote a confirmed set.
     */
    suspend fun saveDraft(setId: String, workoutExerciseId: String, weightGrams: Int?, reps: Int?) {
        require(reps == null || reps > 0) { "次数需为正整数" }
        require(weightGrams == null || weightGrams >= 0) { "重量不能为负数" }
        db.withTransaction {
            val now = clock.millis()
            val existing = dao.getSet(setId)
            when {
                existing?.status == SetStatus.LOGGED -> Unit
                existing != null -> dao.upsertSet(existing.copy(weightGrams = weightGrams, reps = reps, updatedAt = now))
                else -> {
                    requireNotNull(dao.getWorkoutExercise(workoutExerciseId)) { "动作项不存在" }
                    dao.upsertSet(
                        SetEntryEntity(
                            id = setId,
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
                }
            }
        }
    }

    /** Turns a draft into a logged set. Idempotent for sets that are already logged. */
    suspend fun confirmSet(setId: String) = db.withTransaction {
        val set = requireNotNull(dao.getSet(setId)) { "这一组不存在" }
        if (set.status == SetStatus.LOGGED) return@withTransaction
        val we = dao.getWorkoutExercise(set.workoutExerciseId)!!
        validateValues(we.weightModeSnapshot, set.weightGrams, set.reps)
        val now = clock.millis()
        dao.upsertSet(set.copy(status = SetStatus.LOGGED, loggedAt = now, updatedAt = now))
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

    /** Active exercise with this name, else an archived one (unarchived), else a new one. */
    private suspend fun resolveExercise(name: String, weightGrams: Int?, now: Long): ExerciseEntity {
        val found = dao.findExerciseByName(name)
        return when {
            found == null -> ExerciseEntity(
                id = newId(),
                name = name,
                weightMode = if (weightGrams == null) WeightMode.BODYWEIGHT else WeightMode.TOTAL,
                createdAt = now,
                updatedAt = now,
            ).also { dao.upsertExercise(it) }
            found.archived -> found.copy(archived = false, updatedAt = now).also { dao.upsertExercise(it) }
            else -> found
        }
    }

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

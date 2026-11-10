package com.exerciseornot.app.data

import androidx.room.withTransaction
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.ExerciseEntity
import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.db.WorkoutEntity
import com.exerciseornot.app.data.db.WorkoutExerciseEntity
import com.exerciseornot.app.data.db.WorkoutWithExercises
import kotlinx.coroutines.flow.Flow
import java.time.Clock
import java.time.LocalDate
import java.util.UUID

class WorkoutRepository(
    private val db: AppDatabase,
    private val clock: Clock = Clock.systemDefaultZone(),
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    private val dao = db.workoutDao()

    fun today(): LocalDate = LocalDate.now(clock)

    fun observeWorkouts(): Flow<List<WorkoutWithExercises>> = dao.observeWorkouts()

    fun observeTodayWorkout(): Flow<WorkoutWithExercises?> =
        dao.observeLatestWorkoutOn(today().toString())

    /**
     * Records a confirmed set. [setId] is chosen by the caller and reused on retries,
     * so repeated confirmation of the same set updates one row instead of inserting another.
     */
    suspend fun logSet(setId: String, exerciseName: String, weightGrams: Int?, reps: Int) {
        val name = exerciseName.trim()
        require(name.isNotEmpty()) { "exercise name is blank" }
        require(reps > 0) { "reps must be positive" }
        require(weightGrams == null || weightGrams >= 0) { "weight must not be negative" }

        db.withTransaction {
            val now = clock.millis()

            val existing = dao.getSet(setId)
            if (existing != null) {
                dao.upsertSet(
                    existing.copy(
                        weightGrams = weightGrams,
                        reps = reps,
                        status = SetStatus.LOGGED,
                        loggedAt = existing.loggedAt ?: now,
                        updatedAt = now,
                    )
                )
                return@withTransaction
            }

            val workout = dao.latestWorkoutOn(today().toString())
                ?: WorkoutEntity(
                    id = newId(),
                    performedAt = now,
                    trainingDate = today().toString(),
                    zoneId = clock.zone.id,
                    createdAt = now,
                    updatedAt = now,
                ).also { dao.upsertWorkout(it) }

            val exercise = dao.findActiveExerciseByName(name)
                ?: ExerciseEntity(
                    id = newId(),
                    name = name,
                    weightMode = WeightMode.TOTAL,
                    createdAt = now,
                    updatedAt = now,
                ).also { dao.upsertExercise(it) }

            val workoutExercise = dao.findWorkoutExercise(workout.id, exercise.id)
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
        }
    }
}

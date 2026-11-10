package com.exerciseornot.app.data.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkoutDao {

    @Upsert suspend fun upsertExercise(exercise: ExerciseEntity)
    @Upsert suspend fun upsertWorkout(workout: WorkoutEntity)
    @Upsert suspend fun upsertWorkoutExercise(workoutExercise: WorkoutExerciseEntity)
    @Upsert suspend fun upsertSet(set: SetEntryEntity)

    @Upsert suspend fun upsertWorkouts(workouts: List<WorkoutEntity>)
    @Upsert suspend fun upsertWorkoutExercises(workoutExercises: List<WorkoutExerciseEntity>)
    @Upsert suspend fun upsertSets(sets: List<SetEntryEntity>)

    @Delete suspend fun deleteExercise(exercise: ExerciseEntity)
    @Delete suspend fun deleteWorkout(workout: WorkoutEntity)
    @Delete suspend fun deleteWorkoutExercise(workoutExercise: WorkoutExerciseEntity)
    @Delete suspend fun deleteSet(set: SetEntryEntity)

    // ---- exercise ----

    @Query("SELECT * FROM exercise WHERE id = :id")
    suspend fun getExercise(id: String): ExerciseEntity?

    @Query("SELECT * FROM exercise WHERE archived = 0 AND name = :name COLLATE NOCASE LIMIT 1")
    suspend fun findActiveExerciseByName(name: String): ExerciseEntity?

    /** Active match first; otherwise the most recently touched archived one. */
    @Query(
        "SELECT * FROM exercise WHERE name = :name COLLATE NOCASE " +
            "ORDER BY archived ASC, updatedAt DESC LIMIT 1"
    )
    suspend fun findExerciseByName(name: String): ExerciseEntity?

    @Query(
        "SELECT e.*, MAX(s.loggedAt) AS lastUsedAt FROM exercise e " +
            "LEFT JOIN workout_exercise we ON we.exerciseId = e.id " +
            "LEFT JOIN set_entry s ON s.workoutExerciseId = we.id AND s.status = 'LOGGED' " +
            "WHERE e.archived = 0 GROUP BY e.id " +
            "ORDER BY lastUsedAt IS NULL, lastUsedAt DESC, e.name COLLATE NOCASE"
    )
    fun observePickerList(): Flow<List<ExerciseWithLastUsed>>

    @Query("SELECT EXISTS(SELECT 1 FROM workout_exercise WHERE exerciseId = :exerciseId)")
    suspend fun isExerciseUsed(exerciseId: String): Boolean

    // ---- workout ----

    @Query("SELECT * FROM workout WHERE id = :id")
    suspend fun getWorkout(id: String): WorkoutEntity?

    // "Latest" = the workout the user last added a set to (falling back to its creation time),
    // not the one with the latest training date: backfilling last week makes that the latest.
    @Query(
        "SELECT w.* FROM workout w " +
            "LEFT JOIN workout_exercise we ON we.workoutId = w.id " +
            "LEFT JOIN set_entry s ON s.workoutExerciseId = we.id " +
            "GROUP BY w.id " +
            "ORDER BY COALESCE(MAX(s.createdAt), w.createdAt) DESC, w.performedAt DESC LIMIT 1"
    )
    suspend fun latestWorkout(): WorkoutEntity?

    @Query(
        "SELECT w.* FROM workout w " +
            "LEFT JOIN workout_exercise we ON we.workoutId = w.id " +
            "LEFT JOIN set_entry s ON s.workoutExerciseId = we.id " +
            "GROUP BY w.id " +
            "ORDER BY COALESCE(MAX(s.createdAt), w.createdAt) DESC, w.performedAt DESC LIMIT 1"
    )
    fun observeLatestWorkout(): Flow<WorkoutEntity?>

    @Transaction
    @Query("SELECT * FROM workout ORDER BY trainingDate DESC, performedAt DESC")
    fun observeWorkouts(): Flow<List<WorkoutWithExercises>>

    @Transaction
    @Query("SELECT * FROM workout WHERE id = :id")
    fun observeWorkout(id: String): Flow<WorkoutWithExercises?>

    // ---- workout_exercise ----

    @Query("SELECT * FROM workout_exercise WHERE id = :id")
    suspend fun getWorkoutExercise(id: String): WorkoutExerciseEntity?

    @Query("SELECT * FROM workout_exercise WHERE workoutId = :workoutId AND exerciseId = :exerciseId LIMIT 1")
    suspend fun findWorkoutExercise(workoutId: String, exerciseId: String): WorkoutExerciseEntity?

    @Query("SELECT * FROM workout_exercise WHERE workoutId = :workoutId")
    suspend fun workoutExercisesOf(workoutId: String): List<WorkoutExerciseEntity>

    @Query("SELECT MAX(position) FROM workout_exercise WHERE workoutId = :workoutId")
    suspend fun maxWorkoutExercisePosition(workoutId: String): Int?

    // ---- set_entry ----

    @Query("SELECT * FROM set_entry WHERE id = :id")
    suspend fun getSet(id: String): SetEntryEntity?

    @Query("SELECT * FROM set_entry WHERE workoutExerciseId = :workoutExerciseId")
    suspend fun setsOf(workoutExerciseId: String): List<SetEntryEntity>

    @Query(
        "SELECT s.* FROM set_entry s JOIN workout_exercise we ON s.workoutExerciseId = we.id " +
            "WHERE we.workoutId = :workoutId"
    )
    suspend fun setsOfWorkout(workoutId: String): List<SetEntryEntity>

    @Query("SELECT MAX(position) FROM set_entry WHERE workoutExerciseId = :workoutExerciseId")
    suspend fun maxSetPosition(workoutExerciseId: String): Int?

    @Query("SELECT * FROM set_entry WHERE workoutExerciseId = :workoutExerciseId AND status = 'DRAFT' ORDER BY position")
    suspend fun draftsOf(workoutExerciseId: String): List<SetEntryEntity>

    @Query("SELECT * FROM set_entry WHERE workoutExerciseId = :workoutExerciseId AND status = 'LOGGED' ORDER BY position")
    suspend fun loggedOf(workoutExerciseId: String): List<SetEntryEntity>

    /**
     * Logged sets of [exerciseId] in the most recent workout that happened before the given one
     * (by training date, then time), skipping workouts with no logged set for it.
     */
    @Query(
        "SELECT s.* FROM set_entry s WHERE s.status = 'LOGGED' AND s.workoutExerciseId = (" +
            "SELECT we.id FROM workout_exercise we JOIN workout w ON w.id = we.workoutId " +
            "WHERE we.exerciseId = :exerciseId AND w.id != :workoutId " +
            "AND (w.trainingDate < :date OR (w.trainingDate = :date AND w.performedAt < :performedAt)) " +
            "AND EXISTS (SELECT 1 FROM set_entry x WHERE x.workoutExerciseId = we.id AND x.status = 'LOGGED') " +
            "ORDER BY w.trainingDate DESC, w.performedAt DESC LIMIT 1" +
            ") ORDER BY s.position"
    )
    suspend fun previousLoggedSets(exerciseId: String, workoutId: String, date: String, performedAt: Long): List<SetEntryEntity>

    /** Logged sets of [exerciseId] from its [limit] most recent workouts (by training date, then time). */
    @Query(
        "SELECT w.id AS workoutId, w.trainingDate, w.performedAt, s.id AS setId, s.weightGrams, s.reps " +
            "FROM set_entry s JOIN workout_exercise we ON s.workoutExerciseId = we.id " +
            "JOIN workout w ON w.id = we.workoutId " +
            "WHERE we.exerciseId = :exerciseId AND s.status = 'LOGGED' AND w.id IN (" +
            "SELECT w2.id FROM workout w2 JOIN workout_exercise we2 ON we2.workoutId = w2.id " +
            "WHERE we2.exerciseId = :exerciseId " +
            "AND EXISTS (SELECT 1 FROM set_entry x WHERE x.workoutExerciseId = we2.id AND x.status = 'LOGGED') " +
            "ORDER BY w2.trainingDate DESC, w2.performedAt DESC LIMIT :limit" +
            ") ORDER BY w.trainingDate DESC, w.performedAt DESC, w.id, s.position, s.createdAt"
    )
    fun observeExerciseHistory(exerciseId: String, limit: Int): Flow<List<ExerciseHistoryRow>>

    // ---- test / diagnostics ----

    @Query("SELECT COUNT(*) FROM workout") suspend fun countWorkouts(): Int
    @Query("SELECT COUNT(*) FROM exercise") suspend fun countExercises(): Int
    @Query("SELECT COUNT(*) FROM workout_exercise") suspend fun countWorkoutExercises(): Int
    @Query("SELECT * FROM set_entry") suspend fun allSets(): List<SetEntryEntity>
    @Query("SELECT * FROM workout_exercise") suspend fun allWorkoutExercises(): List<WorkoutExerciseEntity>
    @Query("SELECT * FROM workout") suspend fun allWorkouts(): List<WorkoutEntity>
}

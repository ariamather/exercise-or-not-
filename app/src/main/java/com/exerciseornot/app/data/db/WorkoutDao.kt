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

    @Delete suspend fun deleteExercise(exercise: ExerciseEntity)
    @Delete suspend fun deleteWorkout(workout: WorkoutEntity)

    @Query("SELECT * FROM exercise WHERE archived = 0 AND name = :name COLLATE NOCASE LIMIT 1")
    suspend fun findActiveExerciseByName(name: String): ExerciseEntity?

    @Query("SELECT * FROM workout WHERE trainingDate = :date ORDER BY performedAt DESC LIMIT 1")
    suspend fun latestWorkoutOn(date: String): WorkoutEntity?

    @Query("SELECT * FROM workout_exercise WHERE workoutId = :workoutId AND exerciseId = :exerciseId LIMIT 1")
    suspend fun findWorkoutExercise(workoutId: String, exerciseId: String): WorkoutExerciseEntity?

    @Query("SELECT MAX(position) FROM workout_exercise WHERE workoutId = :workoutId")
    suspend fun maxWorkoutExercisePosition(workoutId: String): Int?

    @Query("SELECT * FROM set_entry WHERE id = :id")
    suspend fun getSet(id: String): SetEntryEntity?

    @Query("SELECT MAX(position) FROM set_entry WHERE workoutExerciseId = :workoutExerciseId")
    suspend fun maxSetPosition(workoutExerciseId: String): Int?

    @Transaction
    @Query("SELECT * FROM workout ORDER BY trainingDate DESC, performedAt DESC")
    fun observeWorkouts(): Flow<List<WorkoutWithExercises>>

    @Transaction
    @Query("SELECT * FROM workout WHERE trainingDate = :date ORDER BY performedAt DESC LIMIT 1")
    fun observeLatestWorkoutOn(date: String): Flow<WorkoutWithExercises?>

    @Query("SELECT COUNT(*) FROM workout") suspend fun countWorkouts(): Int
    @Query("SELECT COUNT(*) FROM exercise") suspend fun countExercises(): Int
    @Query("SELECT COUNT(*) FROM workout_exercise") suspend fun countWorkoutExercises(): Int
    @Query("SELECT * FROM set_entry") suspend fun allSets(): List<SetEntryEntity>
}

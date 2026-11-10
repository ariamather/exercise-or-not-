package com.exerciseornot.app.data.db

import androidx.room.Embedded
import androidx.room.Relation

data class WorkoutExerciseWithSets(
    @Embedded val workoutExercise: WorkoutExerciseEntity,
    @Relation(parentColumn = "id", entityColumn = "workoutExerciseId")
    val sets: List<SetEntryEntity>,
)

data class WorkoutWithExercises(
    @Embedded val workout: WorkoutEntity,
    @Relation(
        entity = WorkoutExerciseEntity::class,
        parentColumn = "id",
        entityColumn = "workoutId",
    )
    val exercises: List<WorkoutExerciseWithSets>,
)

/** One logged set of an exercise, with the workout it belongs to. */
data class ExerciseHistoryRow(
    val workoutId: String,
    val trainingDate: String,
    val performedAt: Long,
    val setId: String,
    val weightGrams: Int?,
    val reps: Int?,
)

data class ExerciseWithLastUsed(
    @Embedded val exercise: ExerciseEntity,
    /** When a set of this exercise was last confirmed; null if never. */
    val lastUsedAt: Long?,
)

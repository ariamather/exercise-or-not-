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

data class ExerciseWithLastUsed(
    @Embedded val exercise: ExerciseEntity,
    /** When a set of this exercise was last confirmed; null if never. */
    val lastUsedAt: Long?,
)

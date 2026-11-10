package com.exerciseornot.app.data

import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.WorkoutEntity
import com.exerciseornot.app.data.db.WorkoutExerciseEntity

/** Every row removed by one delete, so [WorkoutRepository.restore] can put them back unchanged. */
data class DeletedSnapshot(
    val workouts: List<WorkoutEntity> = emptyList(),
    val workoutExercises: List<WorkoutExerciseEntity> = emptyList(),
    val sets: List<SetEntryEntity> = emptyList(),
)

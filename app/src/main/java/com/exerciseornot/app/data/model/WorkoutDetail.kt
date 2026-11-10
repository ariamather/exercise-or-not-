package com.exerciseornot.app.data.model

import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WorkoutEntity
import com.exerciseornot.app.data.db.WorkoutExerciseEntity
import com.exerciseornot.app.data.db.WorkoutWithExercises
import java.time.LocalDate

/** One exercise within a workout. Only [logged] sets count as training done; [drafts] are pending input. */
data class ExerciseItem(
    val workoutExercise: WorkoutExerciseEntity,
    val logged: List<SetEntryEntity>,
    val drafts: List<SetEntryEntity>,
)

data class WorkoutDetail(
    val workout: WorkoutEntity,
    val items: List<ExerciseItem>,
) {
    val trainingDate: LocalDate get() = LocalDate.parse(workout.trainingDate)
    val loggedItems: List<ExerciseItem> get() = items.filter { it.logged.isNotEmpty() }
    val loggedSetCount: Int get() = items.sumOf { it.logged.size }
}

private val setOrder = compareBy<SetEntryEntity>({ it.position }, { it.createdAt })

internal fun WorkoutWithExercises.toDetail() = WorkoutDetail(
    workout = workout,
    items = exercises
        .sortedWith(compareBy({ it.workoutExercise.position }, { it.workoutExercise.createdAt }))
        .map { e ->
            val sets = e.sets.sortedWith(setOrder)
            ExerciseItem(
                workoutExercise = e.workoutExercise,
                logged = sets.filter { it.status == SetStatus.LOGGED },
                drafts = sets.filter { it.status == SetStatus.DRAFT },
            )
        },
)

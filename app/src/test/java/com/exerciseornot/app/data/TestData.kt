package com.exerciseornot.app.data

import com.exerciseornot.app.data.db.AppDatabase

/** Adds [exerciseId] to [target] and logs one set per (grams, reps) through the pending row, as the UI does. */
internal suspend fun WorkoutRepository.logSets(
    db: AppDatabase,
    target: WorkoutTarget,
    exerciseId: String,
    vararg sets: Pair<Int?, Int?>,
): AddedExercise {
    val added = addExercise(target, exerciseId)
    sets.forEach { (grams, reps) ->
        confirmDraft(db.workoutDao().draftsOf(added.workoutExerciseId).single().id, grams, reps)
    }
    return added
}

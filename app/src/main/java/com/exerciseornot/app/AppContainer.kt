package com.exerciseornot.app

import android.content.Context
import com.exerciseornot.app.data.ExerciseRepository
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.db.AppDatabase
import java.time.Clock

class AppContainer(context: Context) {
    private val database = AppDatabase.create(context)
    private val clock: Clock = Clock.systemDefaultZone()
    val workoutRepository = WorkoutRepository(database, clock)
    val exerciseRepository = ExerciseRepository(database, clock)
}

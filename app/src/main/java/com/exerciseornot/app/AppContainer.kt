package com.exerciseornot.app

import android.content.Context
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.db.AppDatabase

class AppContainer(context: Context) {
    private val database = AppDatabase.create(context)
    val workoutRepository = WorkoutRepository(database)
}

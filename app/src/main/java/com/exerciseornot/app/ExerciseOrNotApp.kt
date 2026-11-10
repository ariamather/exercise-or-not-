package com.exerciseornot.app

import android.app.Application

class ExerciseOrNotApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

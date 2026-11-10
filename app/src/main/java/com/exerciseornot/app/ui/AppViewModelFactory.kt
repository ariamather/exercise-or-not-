package com.exerciseornot.app.ui

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.exerciseornot.app.ExerciseOrNotApp
import com.exerciseornot.app.ui.history.HistoryViewModel
import com.exerciseornot.app.ui.record.RecordViewModel

object AppViewModelFactory {
    val Factory: ViewModelProvider.Factory = viewModelFactory {
        initializer {
            val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ExerciseOrNotApp
            RecordViewModel(app.container.workoutRepository, app.container.exerciseRepository, createSavedStateHandle())
        }
        initializer {
            val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ExerciseOrNotApp
            HistoryViewModel(app.container.workoutRepository)
        }
    }
}

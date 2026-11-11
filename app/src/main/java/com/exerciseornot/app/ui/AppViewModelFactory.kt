package com.exerciseornot.app.ui

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.exerciseornot.app.ExerciseOrNotApp
import com.exerciseornot.app.ui.dice.DiceViewModel
import com.exerciseornot.app.ui.history.HistoryViewModel
import com.exerciseornot.app.ui.hints.HintsViewModel
import com.exerciseornot.app.ui.record.RecordViewModel
import com.exerciseornot.app.ui.settings.SettingsViewModel

object AppViewModelFactory {
    val Factory: ViewModelProvider.Factory = viewModelFactory {
        initializer {
            val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ExerciseOrNotApp
            RecordViewModel(
                app.container.workoutRepository,
                app.container.exerciseRepository,
                app.container.recordRequests,
                createSavedStateHandle(),
            )
        }
        initializer {
            val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ExerciseOrNotApp
            HistoryViewModel(app.container.workoutRepository, app.container.recordRequests)
        }
        initializer {
            val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ExerciseOrNotApp
            DiceViewModel(app.container.dicePreferences, app.container.clock)
        }
        initializer {
            val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ExerciseOrNotApp
            SettingsViewModel(app.container.backupService)
        }
        initializer {
            val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ExerciseOrNotApp
            HintsViewModel(
                app.container.hintPreferences,
                app.container.workoutRepository,
                app.container.dicePreferences,
                app.container.backupService.lastExportAt,
            )
        }
    }
}

package com.exerciseornot.app.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.db.WorkoutWithExercises
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

class HistoryViewModel(repository: WorkoutRepository) : ViewModel() {
    val workouts: StateFlow<List<WorkoutWithExercises>> = repository.observeWorkouts()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}

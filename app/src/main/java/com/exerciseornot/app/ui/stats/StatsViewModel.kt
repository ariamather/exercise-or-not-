package com.exerciseornot.app.ui.stats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.ui.RecordRequests
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

class StatsViewModel(
    private val repository: WorkoutRepository,
    private val requests: RecordRequests,
) : ViewModel() {
    /** Null until the first database read; recomputed whenever any workout changes. */
    val stats: StateFlow<StatsSummary?> = repository.observeHistory()
        .map { computeStats(it, repository.today()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** Asks the record screen to show [workoutId]; the caller then switches to the record tab. */
    fun open(workoutId: String) = requests.open(workoutId)
}

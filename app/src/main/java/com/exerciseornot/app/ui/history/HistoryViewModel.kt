package com.exerciseornot.app.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.data.DeletedSnapshot
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.model.WorkoutDetail
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class HistoryViewModel(private val repository: WorkoutRepository) : ViewModel() {
    val workouts: StateFlow<List<WorkoutDetail>> = repository.observeHistory()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _deletions = Channel<DeletedSnapshot>(Channel.BUFFERED)
    val deletions: Flow<DeletedSnapshot> = _deletions.receiveAsFlow()

    fun deleteWorkout(workoutId: String) {
        viewModelScope.launch { _deletions.send(repository.deleteWorkout(workoutId)) }
    }

    fun undo(snapshot: DeletedSnapshot) {
        viewModelScope.launch { repository.restore(snapshot) }
    }
}

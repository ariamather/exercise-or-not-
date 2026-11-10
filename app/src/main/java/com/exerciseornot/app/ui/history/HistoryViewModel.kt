package com.exerciseornot.app.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.data.DeletedSnapshot
import com.exerciseornot.app.data.ReuseResult
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.model.WorkoutDetail
import com.exerciseornot.app.ui.RecordRequests
import com.exerciseornot.app.ui.record.userMessage
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class HistoryViewModel(
    private val repository: WorkoutRepository,
    private val requests: RecordRequests,
) : ViewModel() {
    val workouts: StateFlow<List<WorkoutDetail>> = repository.observeHistory()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _deletions = Channel<DeletedSnapshot>(Channel.BUFFERED)
    val deletions: Flow<DeletedSnapshot> = _deletions.receiveAsFlow()

    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages: Flow<String> = _messages.receiveAsFlow()

    private val _openRecord = Channel<Unit>(Channel.CONFLATED)
    /** Emits when the record screen should be shown (a request is already pending). */
    val openRecord: Flow<Unit> = _openRecord.receiveAsFlow()

    val today get() = repository.today()

    fun open(workoutId: String) {
        requests.open(workoutId)
        _openRecord.trySend(Unit)
    }

    fun reuse(sourceWorkoutId: String) {
        viewModelScope.launch {
            try {
                val result = repository.reuseWorkout(sourceWorkoutId, repository.defaultTarget())
                val workoutId = result.workoutId
                if (result.added > 0 && workoutId != null) {
                    requests.open(workoutId, reuseNotice(result))
                    _openRecord.send(Unit)
                } else {
                    _messages.send(reuseNotice(result))
                }
            } catch (e: Exception) {
                _messages.send(e.userMessage())
            }
        }
    }

    fun deleteWorkout(workoutId: String) {
        viewModelScope.launch {
            runCatching { repository.deleteWorkout(workoutId) }
                .onSuccess { _deletions.send(it) }
                .onFailure { _messages.send(it.userMessage()) }
        }
    }

    fun undo(snapshot: DeletedSnapshot) {
        viewModelScope.launch {
            runCatching { repository.restore(snapshot) }.onFailure { _messages.send(it.userMessage()) }
        }
    }
}

internal fun reuseNotice(r: ReuseResult): String {
    val skipped = buildList {
        if (r.skippedExisting > 0) add("${r.skippedExisting} 个已在今天的记录里")
        if (r.skippedArchived > 0) add("${r.skippedArchived} 个已归档")
    }.joinToString("，")
    return when {
        r.added > 0 && skipped.isEmpty() -> "已复用 ${r.added} 个动作"
        r.added > 0 -> "已复用 ${r.added} 个动作（跳过：$skipped）"
        r.skippedExisting > 0 && r.skippedArchived == 0 -> "这些动作都已在今天的记录里"
        skipped.isNotEmpty() -> "没有可复用的动作（$skipped）"
        else -> "这次训练没有已记录的动作"
    }
}

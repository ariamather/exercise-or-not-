package com.exerciseornot.app.ui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class RecordRequest(val workoutId: String, val notice: String? = null)

/**
 * Asks the record screen to switch to a workout. Held as state rather than an event so a request
 * made before the record screen is collecting is still picked up.
 */
class RecordRequests {
    private val _pending = MutableStateFlow<RecordRequest?>(null)
    val pending: StateFlow<RecordRequest?> = _pending.asStateFlow()

    fun open(workoutId: String, notice: String? = null) { _pending.value = RecordRequest(workoutId, notice) }

    fun consume(request: RecordRequest) { _pending.compareAndSet(request, null) }
}

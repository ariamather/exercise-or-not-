package com.exerciseornot.app.ui.record

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.db.WorkoutWithExercises
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID

data class RecordUiState(
    val saving: Boolean = false,
    val error: String? = null,
)

class RecordViewModel(
    private val repository: WorkoutRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {

    val today: LocalDate = repository.today()

    // Plain Compose state (not StateFlow) so TextField edits apply synchronously; mirrored to
    // SavedStateHandle so unsaved input survives process death.
    var exerciseName by mutableStateOf(savedState[KEY_NAME] ?: "")
        private set
    var weightKg by mutableStateOf(savedState[KEY_WEIGHT] ?: "")
        private set
    var reps by mutableStateOf(savedState[KEY_REPS] ?: "")
        private set

    private val _ui = MutableStateFlow(RecordUiState())
    val ui: StateFlow<RecordUiState> = _ui.asStateFlow()

    val todayWorkout: StateFlow<WorkoutWithExercises?> = repository.observeTodayWorkout()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun onExerciseNameChange(value: String) { exerciseName = value; savedState[KEY_NAME] = value }
    fun onWeightChange(value: String) { weightKg = value; savedState[KEY_WEIGHT] = value }
    fun onRepsChange(value: String) { reps = value; savedState[KEY_REPS] = value }

    /** The id of the set currently being entered; survives process death so a retry reuses it. */
    private fun pendingSetId(): String =
        savedState.get<String>(KEY_PENDING_SET_ID)
            ?: UUID.randomUUID().toString().also { savedState[KEY_PENDING_SET_ID] = it }

    fun confirmSet() {
        if (_ui.value.saving) return
        val name = exerciseName.trim()
        val repsValue = reps.trim().toIntOrNull()
        val weightText = weightKg
        val grams = WeightFormat.parseKgToGrams(weightText)

        val error = when {
            name.isEmpty() -> "请填写动作名称"
            repsValue == null || repsValue <= 0 -> "次数需为正整数"
            weightText.isNotBlank() && grams == null -> "重量格式不正确"
            else -> null
        }
        if (error != null) {
            _ui.update { it.copy(error = error) }
            return
        }

        _ui.update { RecordUiState(saving = true) }
        viewModelScope.launch {
            try {
                repository.logSet(pendingSetId(), name, grams, repsValue!!)
                // Keep name and values so the next set needs only one tap; only the set id rotates.
                savedState.remove<String>(KEY_PENDING_SET_ID)
                _ui.update { RecordUiState() }
            } catch (e: Exception) {
                _ui.update { RecordUiState(error = "保存失败，请重试（${e.message}）") }
            }
        }
    }

    private companion object {
        const val KEY_NAME = "record.name"
        const val KEY_WEIGHT = "record.weight"
        const val KEY_REPS = "record.reps"
        const val KEY_PENDING_SET_ID = "record.pendingSetId"
    }
}

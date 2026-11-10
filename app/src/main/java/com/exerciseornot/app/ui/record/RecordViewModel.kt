package com.exerciseornot.app.ui.record

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.data.DeletedSnapshot
import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.data.WorkoutNotFoundException
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.db.WorkoutEntity
import com.exerciseornot.app.data.model.WorkoutDetail
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID

data class RecordUiState(
    val saving: Boolean = false,
    val error: String? = null,
)

data class EditSetState(
    val setId: String,
    val weight: String,
    val reps: String,
    val weightMode: WeightMode,
    val saving: Boolean = false,
    val error: String? = null,
)

@OptIn(ExperimentalCoroutinesApi::class)
class RecordViewModel(
    private val repository: WorkoutRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {

    // Plain Compose state (not StateFlow) so TextField edits apply synchronously; mirrored to
    // SavedStateHandle so unsaved input survives process death.
    var exerciseName by mutableStateOf(savedState[KEY_NAME] ?: "")
        private set
    var weightKg by mutableStateOf(savedState[KEY_WEIGHT] ?: "")
        private set
    var reps by mutableStateOf(savedState[KEY_REPS] ?: "")
        private set

    var editing by mutableStateOf<EditSetState?>(null)
        private set

    private val _ui = MutableStateFlow(RecordUiState())
    val ui: StateFlow<RecordUiState> = _ui.asStateFlow()

    /** Null only until the initial choice is made. Persisted, so it never shifts on its own (e.g. at midnight). */
    private val _target = MutableStateFlow(restoreTarget())
    val target: StateFlow<WorkoutTarget?> = _target.asStateFlow()

    val detail: StateFlow<WorkoutDetail?> = _target
        .flatMapLatest { t -> if (t is WorkoutTarget.Existing) repository.observeWorkout(t.workoutId) else flowOf(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** The most recent workout, offered as "continue that one" while a new record is selected. */
    val resumeCandidate: StateFlow<WorkoutEntity?> =
        combine(_target, repository.observeLatestWorkout()) { t, latest -> latest.takeIf { t is WorkoutTarget.New } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _deletions = Channel<DeletedSnapshot>(Channel.BUFFERED)
    /** Each emission should offer an undo; the snapshot lives only in memory. */
    val deletions: Flow<DeletedSnapshot> = _deletions.receiveAsFlow()

    init {
        if (_target.value == null) {
            viewModelScope.launch {
                val latest = repository.latestWorkout()
                val today = repository.today()
                setTarget(
                    if (latest != null && latest.trainingDate == today.toString()) WorkoutTarget.Existing(latest.id)
                    else WorkoutTarget.New(today)
                )
            }
        }
        viewModelScope.launch {
            // If the selected workout is deleted (e.g. from history), fall back to a new record for today.
            _target
                .flatMapLatest { t ->
                    if (t is WorkoutTarget.Existing) repository.observeWorkout(t.workoutId) else emptyFlow()
                }
                .collect { if (it == null) setTarget(WorkoutTarget.New(repository.today())) }
        }
    }

    fun today(): LocalDate = repository.today()

    fun onExerciseNameChange(value: String) { exerciseName = value; savedState[KEY_NAME] = value }
    fun onWeightChange(value: String) { weightKg = value; savedState[KEY_WEIGHT] = value }
    fun onRepsChange(value: String) { reps = value; savedState[KEY_REPS] = value }

    fun continueWorkout(workoutId: String) = setTarget(WorkoutTarget.Existing(workoutId))

    fun startNewRecord(date: LocalDate) {
        if (date.isAfter(repository.today())) return showError("训练日期不能晚于今天")
        setTarget(WorkoutTarget.New(date))
    }

    fun changeDate(date: LocalDate) {
        when (val t = _target.value) {
            is WorkoutTarget.New -> startNewRecord(date)
            is WorkoutTarget.Existing -> viewModelScope.launch {
                runCatching { repository.changeWorkoutDate(t.workoutId, date) }
                    .onFailure { showError(it.userMessage()) }
            }
            null -> Unit
        }
    }

    /** The id of the set currently being entered; survives process death so a retry reuses it. */
    private fun pendingSetId(): String =
        savedState.get<String>(KEY_PENDING_SET_ID)
            ?: UUID.randomUUID().toString().also { savedState[KEY_PENDING_SET_ID] = it }

    fun confirmSet() {
        val target = _target.value ?: return
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
        if (error != null) return showError(error)

        _ui.update { RecordUiState(saving = true) }
        viewModelScope.launch {
            try {
                val workoutId = repository.logSet(target, pendingSetId(), name, grams, repsValue)
                // Keep name and values so the next set needs only one tap; only the set id rotates.
                savedState.remove<String>(KEY_PENDING_SET_ID)
                setTarget(WorkoutTarget.Existing(workoutId))
                _ui.update { RecordUiState() }
            } catch (e: WorkoutNotFoundException) {
                setTarget(WorkoutTarget.New(repository.today()))
                showError("${e.message}，已切换到新记录，请重新确认")
            } catch (e: Exception) {
                showError(e.userMessage())
            }
        }
    }

    fun startEditing(set: SetEntryEntity, weightMode: WeightMode) {
        editing = EditSetState(
            setId = set.id,
            weight = set.weightGrams?.let(WeightFormat::gramsToKgText).orEmpty(),
            reps = set.reps?.toString().orEmpty(),
            weightMode = weightMode,
        )
    }

    fun onEditWeightChange(value: String) { editing = editing?.copy(weight = value) }
    fun onEditRepsChange(value: String) { editing = editing?.copy(reps = value) }
    fun dismissEditing() { editing = null }

    fun saveEditing() {
        val e = editing ?: return
        if (e.saving) return
        val repsValue = e.reps.trim().toIntOrNull()
        val grams = WeightFormat.parseKgToGrams(e.weight)
        val error = when {
            repsValue == null || repsValue <= 0 -> "次数需为正整数"
            e.weight.isNotBlank() && grams == null -> "重量格式不正确"
            else -> null
        }
        if (error != null) { editing = e.copy(error = error); return }

        editing = e.copy(saving = true, error = null)
        viewModelScope.launch {
            try {
                repository.updateLoggedSet(e.setId, grams, repsValue)
                editing = null
            } catch (ex: Exception) {
                editing = editing?.copy(saving = false, error = ex.userMessage())
            }
        }
    }

    fun deleteEditing() {
        val e = editing ?: return
        if (e.saving) return
        editing = e.copy(saving = true, error = null)
        viewModelScope.launch {
            try {
                val snapshot = repository.deleteSet(e.setId)
                editing = null
                _deletions.send(snapshot)
            } catch (ex: Exception) {
                editing = editing?.copy(saving = false, error = ex.userMessage())
            }
        }
    }

    fun undo(snapshot: DeletedSnapshot) {
        viewModelScope.launch {
            runCatching { repository.restore(snapshot) }.onFailure { showError(it.userMessage()) }
        }
    }

    fun dismissError() = _ui.update { it.copy(error = null) }

    private fun showError(message: String) = _ui.update { RecordUiState(error = message) }

    private fun setTarget(target: WorkoutTarget) {
        when (target) {
            is WorkoutTarget.Existing -> {
                savedState[KEY_TARGET_WORKOUT] = target.workoutId
                savedState.remove<String>(KEY_TARGET_DATE)
            }
            is WorkoutTarget.New -> {
                savedState[KEY_TARGET_DATE] = target.date.toString()
                savedState.remove<String>(KEY_TARGET_WORKOUT)
            }
        }
        _target.value = target
    }

    private fun restoreTarget(): WorkoutTarget? {
        savedState.get<String>(KEY_TARGET_WORKOUT)?.let { return WorkoutTarget.Existing(it) }
        savedState.get<String>(KEY_TARGET_DATE)?.let { return WorkoutTarget.New(LocalDate.parse(it)) }
        return null
    }

    private companion object {
        const val KEY_NAME = "record.name"
        const val KEY_WEIGHT = "record.weight"
        const val KEY_REPS = "record.reps"
        const val KEY_PENDING_SET_ID = "record.pendingSetId"
        const val KEY_TARGET_WORKOUT = "record.targetWorkoutId"
        const val KEY_TARGET_DATE = "record.targetNewDate"
    }
}

internal fun Throwable.userMessage(): String = when (this) {
    is IllegalArgumentException, is IllegalStateException -> message ?: "操作失败"
    else -> "保存失败，请重试（${message ?: javaClass.simpleName}）"
}

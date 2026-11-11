package com.exerciseornot.app.ui.record

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.data.DeletedSnapshot
import com.exerciseornot.app.data.ExerciseRepository
import com.exerciseornot.app.data.ExerciseSession
import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.data.WorkoutNotFoundException
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.ui.RecordRequests
import com.exerciseornot.app.data.db.ExerciseWithLastUsed
import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.db.WorkoutEntity
import com.exerciseornot.app.data.model.WorkoutDetail
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

data class RecordUiState(
    val error: String? = null,
)

/** Text the user is typing into a pending row; kept as text so partial input like "4." survives. */
data class DraftInput(
    val weight: String,
    val reps: String,
    val error: String? = null,
    val saving: Boolean = false,
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
    private val exercises: ExerciseRepository,
    private val requests: RecordRequests,
    private val savedState: SavedStateHandle,
) : ViewModel() {

    /** Keyed by draft set id. Plain Compose state so TextField edits apply synchronously. */
    val draftInputs = mutableStateMapOf<String, DraftInput>()

    var expanded by mutableStateOf<Pair<String, DraftField>?>(null)
        private set

    var editing by mutableStateOf<EditSetState?>(null)
        private set

    var pickerError by mutableStateOf<String?>(null)
        private set

    private val _ui = MutableStateFlow(RecordUiState())
    val ui: StateFlow<RecordUiState> = _ui.asStateFlow()

    /** Null only until the initial choice is made. Persisted, so it never shifts on its own (e.g. at midnight). */
    private val _target = MutableStateFlow(restoreTarget())
    val target: StateFlow<WorkoutTarget?> = _target.asStateFlow()

    val detail: StateFlow<WorkoutDetail?> = _target
        .flatMapLatest { t -> if (t is WorkoutTarget.Existing) repository.observeWorkout(t.workoutId) else flowOf(null) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** workoutExerciseId → logged sets from the previous time that exercise was done. */
    val previous: StateFlow<Map<String, List<SetEntryEntity>>> = detail
        .map { d -> d?.let { Triple(it.workout.trainingDate, it.workout.performedAt, it.items.map { i -> i.workoutExercise.id }) } }
        .distinctUntilChanged()
        .mapLatest { key -> key?.third.orEmpty().associateWith { repository.previousSets(it) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    /** The most recent workout, offered as "continue that one" while a new record is selected. */
    val resumeCandidate: StateFlow<WorkoutEntity?> =
        combine(_target, repository.observeLatestWorkout()) { t, latest -> latest.takeIf { t is WorkoutTarget.New } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val pickerList: StateFlow<List<ExerciseWithLastUsed>> = exercises.observePickerList()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _deletions = Channel<DeletedSnapshot>(Channel.BUFFERED)
    /** Each emission should offer an undo; the snapshot lives only in memory. */
    val deletions: Flow<DeletedSnapshot> = _deletions.receiveAsFlow()

    private val _scrollTo = Channel<String>(Channel.CONFLATED)
    /** workoutExerciseId the list should bring into view. */
    val scrollTo: Flow<String> = _scrollTo.receiveAsFlow()

    private val _notices = Channel<String>(Channel.BUFFERED)
    /** One-off messages to show in a snackbar. */
    val notices: Flow<String> = _notices.receiveAsFlow()

    private val _historyExerciseId = MutableStateFlow<String?>(null)
    /** Exercise whose history sheet is open. */
    val historyExerciseId: StateFlow<String?> = _historyExerciseId.asStateFlow()

    val exerciseHistory: StateFlow<List<ExerciseSession>> = _historyExerciseId
        .flatMapLatest { id -> if (id == null) flowOf(emptyList()) else repository.observeExerciseHistory(id) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val saveJobs = mutableMapOf<String, Job>()

    init {
        val initialChoice = if (_target.value == null) {
            viewModelScope.launch { setTarget(repository.defaultTarget()) }
        } else null
        viewModelScope.launch {
            // Wait for the initial choice so it can't overwrite a request from history.
            initialChoice?.join()
            requests.pending.filterNotNull().collect { request ->
                flushDrafts()
                setTarget(WorkoutTarget.Existing(request.workoutId))
                request.notice?.let { _notices.send(it) }
                requests.consume(request)
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
        viewModelScope.launch {
            detail.filterNotNull().collect(::syncDraftInputs)
        }
        viewModelScope.launch {
            // After a backup restore every id on screen may be gone: drop in-memory edits and start over.
            requests.dataReplaced.drop(1).collect {
                saveJobs.values.forEach(Job::cancel)
                saveJobs.clear()
                draftInputs.clear()
                expanded = null
                editing = null
                _historyExerciseId.value = null
                val target = repository.defaultTarget()
                setTarget(target)
                // detail won't re-emit if the restored workout equals what was shown, so resync from the db.
                if (target is WorkoutTarget.Existing) {
                    repository.observeWorkout(target.workoutId).first()?.let(::syncDraftInputs)
                }
            }
        }
    }

    fun today(): LocalDate = repository.today()

    // ---- target & date ----

    fun continueWorkout(workoutId: String) = setTarget(WorkoutTarget.Existing(workoutId))

    /** Leaves an older workout opened from history for today's record. */
    fun backToToday() {
        flushDrafts()
        viewModelScope.launch { setTarget(repository.defaultTarget()) }
    }

    fun showHistory(exerciseId: String) { _historyExerciseId.value = exerciseId }
    fun hideHistory() { _historyExerciseId.value = null }

    fun startNewRecord(date: LocalDate) {
        if (date.isAfter(repository.today())) return showError("训练日期不能晚于今天")
        flushDrafts()
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

    // ---- exercises in this workout ----

    fun addExercise(exerciseId: String) {
        val target = _target.value ?: return
        viewModelScope.launch {
            try {
                val added = repository.addExercise(target, exerciseId)
                setTarget(WorkoutTarget.Existing(added.workoutId))
                _scrollTo.send(added.workoutExerciseId)
            } catch (e: WorkoutNotFoundException) {
                setTarget(WorkoutTarget.New(repository.today()))
                showError("${e.message}，已切换到新记录，请重新添加")
            } catch (e: Exception) {
                showError(e.userMessage())
            }
        }
    }

    fun createAndAddExercise(name: String, mode: WeightMode, onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                val created = exercises.create(name, mode)
                pickerError = null
                onDone()
                addExercise(created.id)
            } catch (e: Exception) {
                pickerError = e.userMessage()
            }
        }
    }

    fun renameExercise(exerciseId: String, name: String, onDone: () -> Unit) {
        viewModelScope.launch {
            runCatching { exercises.rename(exerciseId, name) }
                .onSuccess { pickerError = null; onDone() }
                .onFailure { pickerError = it.userMessage() }
        }
    }

    fun archiveExercise(exerciseId: String) {
        viewModelScope.launch {
            runCatching { exercises.archive(exerciseId) }.onFailure { pickerError = it.userMessage() }
        }
    }

    fun clearPickerError() { pickerError = null }

    fun removeExercise(workoutExerciseId: String) {
        viewModelScope.launch {
            runCatching { repository.removeExercise(workoutExerciseId) }
                .onSuccess { _deletions.send(it) }
                .onFailure { showError(it.userMessage()) }
        }
    }

    // ---- pending rows ----

    fun onDraftWeightChange(setId: String, value: String) = updateDraft(setId) { it.copy(weight = value, error = null) }
    fun onDraftRepsChange(setId: String, value: String) = updateDraft(setId) { it.copy(reps = value, error = null) }

    fun expandSlider(setId: String, field: DraftField) { expanded = setId to field }

    /** Writes every parseable pending value now instead of waiting for the debounce. */
    fun flushDrafts() {
        saveJobs.values.forEach { it.cancel() }
        saveJobs.clear()
        draftInputs.forEach { (id, input) -> parseDraft(input)?.let { (w, r) -> launchSave(id, w, r) } }
    }

    fun confirm(setId: String) {
        val input = draftInputs[setId] ?: return
        if (input.saving) return
        val repsValue = input.reps.trim().toIntOrNull()
        val grams = WeightFormat.parseKgToGrams(input.weight)
        val error = when {
            repsValue == null || repsValue <= 0 -> "次数需为正整数"
            input.weight.isNotBlank() && grams == null -> "重量格式不正确"
            else -> null
        }
        if (error != null) { draftInputs[setId] = input.copy(error = error); return }

        saveJobs.remove(setId)?.cancel()
        draftInputs[setId] = input.copy(saving = true, error = null)
        viewModelScope.launch {
            try {
                val nextId = repository.confirmDraft(setId, grams, repsValue)
                // Next row carries the same text, so confirming another identical set is one tap.
                draftInputs[nextId] = DraftInput(input.weight, input.reps)
                draftInputs.remove(setId)
                if (expanded?.first == setId) expanded = nextId to expanded!!.second
            } catch (e: Exception) {
                draftInputs[setId]?.let { draftInputs[setId] = it.copy(saving = false, error = e.userMessage()) }
            }
        }
    }

    private fun updateDraft(setId: String, change: (DraftInput) -> DraftInput) {
        val updated = change(draftInputs[setId] ?: return)
        draftInputs[setId] = updated
        saveJobs.remove(setId)?.cancel()
        val parsed = parseDraft(updated) ?: return
        saveJobs[setId] = viewModelScope.launch {
            delay(DRAFT_SAVE_DEBOUNCE_MS)
            saveJobs.remove(setId)
            saveDraft(setId, parsed.first, parsed.second)
        }
    }

    private fun launchSave(setId: String, weightGrams: Int?, reps: Int?) {
        viewModelScope.launch { saveDraft(setId, weightGrams, reps) }
    }

    /** A failed write keeps the typed text and marks the row; the next edit, flush or ✓ retries. */
    private suspend fun saveDraft(setId: String, weightGrams: Int?, reps: Int?) {
        try {
            repository.saveDraft(setId, weightGrams, reps)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            draftInputs[setId]?.let { draftInputs[setId] = it.copy(error = DRAFT_SAVE_FAILED) }
        }
    }

    /** Null if the text can't be stored yet (e.g. "4." or "0" reps); blanks are stored as null. */
    private fun parseDraft(input: DraftInput): Pair<Int?, Int?>? {
        val grams = if (input.weight.isBlank()) null else WeightFormat.parseKgToGrams(input.weight) ?: return null
        val reps = if (input.reps.isBlank()) null else input.reps.trim().toIntOrNull()?.takeIf { it > 0 } ?: return null
        return grams to reps
    }

    /** Adds text state for new pending rows; never overwrites a row the user may be typing in. */
    private fun syncDraftInputs(detail: WorkoutDetail) {
        val drafts = detail.items.mapNotNull { it.draft }
        val ids = drafts.map { it.id }.toSet()
        drafts.forEach { d ->
            if (d.id !in draftInputs) {
                draftInputs[d.id] = DraftInput(
                    weight = d.weightGrams?.let(WeightFormat::gramsToKgText).orEmpty(),
                    reps = d.reps?.toString().orEmpty(),
                )
            }
        }
        draftInputs.keys.filter { it !in ids && draftInputs[it]?.saving != true }.forEach { draftInputs.remove(it) }
    }

    // ---- logged sets ----

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
        const val KEY_TARGET_WORKOUT = "record.targetWorkoutId"
        const val KEY_TARGET_DATE = "record.targetNewDate"
        const val DRAFT_SAVE_DEBOUNCE_MS = 500L
        const val DRAFT_SAVE_FAILED = "未能保存，修改或点 ✓ 重试"
    }
}

/** Only our own validation messages (IllegalArgumentException) are shown verbatim; storage errors are not. */
internal fun Throwable.userMessage(): String = when (this) {
    is IllegalArgumentException -> message ?: "操作失败"
    else -> "保存失败，请重试"
}

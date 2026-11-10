package com.exerciseornot.app.ui.record

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.data.DeletedSnapshot
import com.exerciseornot.app.data.ExerciseRepository
import com.exerciseornot.app.data.TestClock
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.logSets
import com.exerciseornot.app.ui.RecordRequests
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.time.LocalDate

/**
 * Room runs queries on its own threads, so these tests use the real clock for waiting:
 * [awaitUntil] polls until a condition holds instead of advancing virtual time.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class RecordViewModelTest {

    private lateinit var db: AppDatabase
    private lateinit var repo: WorkoutRepository
    private lateinit var exercises: ExerciseRepository
    private val dao get() = db.workoutDao()
    // 2026-11-10 20:00 Shanghai
    private val clock = TestClock(Instant.parse("2026-11-10T12:00:00Z"))
    private val today = LocalDate.of(2026, 11, 10)
    private val yesterday = today.minusDays(1)
    private val collectors = CoroutineScope(Dispatchers.Unconfined)
    private val requests = RecordRequests()

    @Before
    fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        repo = WorkoutRepository(db, clock)
        exercises = ExerciseRepository(db, clock)
    }

    @After
    fun tearDown() {
        collectors.cancel()
        db.close()
        Dispatchers.resetMain()
    }

    private fun awaitUntil(message: String = "condition", condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 5_000
        while (!condition()) {
            check(System.currentTimeMillis() < deadline) { "timed out waiting for $message" }
            Thread.sleep(10)
        }
    }

    private fun newViewModel(state: SavedStateHandle = SavedStateHandle()): RecordViewModel =
        RecordViewModel(repo, exercises, requests, state).also { vm ->
            collectors.launch { vm.resumeCandidate.collect {} }
            collectors.launch { vm.detail.collect {} }
            collectors.launch { vm.previous.collect {} }
            awaitUntil("initial target") { vm.target.value != null }
        }

    private fun exercise(name: String, mode: WeightMode = WeightMode.TOTAL) =
        runBlocking { exercises.create(name, mode).id }

    private fun logged() = runBlocking { dao.allSets().filter { it.status == SetStatus.LOGGED } }

    /** Adds the exercise and waits for its pending row to show up; returns the row's set id. */
    private fun RecordViewModel.addAndAwaitDraft(exerciseId: String): String {
        addExercise(exerciseId)
        var id: String? = null
        awaitUntil("draft row") {
            id = detail.value?.items?.firstOrNull { it.workoutExercise.exerciseId == exerciseId }?.draft?.id
            id != null && draftInputs.containsKey(id)
        }
        return id!!
    }

    private fun RecordViewModel.confirmAndWait(setId: String, expectedLogged: Int): String {
        confirm(setId)
        awaitUntil("set logged") { logged().size == expectedLogged && draftInputs[setId] == null }
        return draftInputs.keys.single { runBlocking { dao.getSet(it) }?.status == SetStatus.DRAFT && it != setId }
    }

    @Test
    fun noWorkouts_targetsNewToday() {
        val vm = newViewModel()
        assertEquals(WorkoutTarget.New(today), vm.target.value)
        assertNull(vm.resumeCandidate.value)
    }

    @Test
    fun latestIsToday_continuesIt() {
        val wid = runBlocking { repo.logSets(db, WorkoutTarget.New(today), exercise("深蹲"), 60_000 to 5).workoutId }
        val vm = newViewModel()
        assertEquals(WorkoutTarget.Existing(wid), vm.target.value)
        assertNull(vm.resumeCandidate.value)
    }

    @Test
    fun oneTapFlow_addFillConfirmThenConfirmAgain() {
        val vm = newViewModel()
        val first = vm.addAndAwaitDraft(exercise("卧推"))
        assertEquals(DraftInput("", ""), vm.draftInputs[first])
        assert(vm.target.value is WorkoutTarget.Existing)

        vm.onDraftWeightChange(first, "40")
        vm.onDraftRepsChange(first, "10")
        val second = vm.confirmAndWait(first, 1)
        assertEquals(DraftInput("40", "10"), vm.draftInputs[second])

        vm.confirmAndWait(second, 2)
        assertEquals(listOf(40_000 to 10, 40_000 to 10), logged().sortedBy { it.position }.map { it.weightGrams to it.reps })
        assertEquals(1, runBlocking { dao.countWorkouts() })
    }

    @Test
    fun prefill_fromPreviousWorkout_andLastTimeColumn() {
        val bench = exercise("卧推")
        runBlocking { repo.logSets(db, WorkoutTarget.New(yesterday), bench, 40_000 to 10, 42_500 to 8) }
        val vm = newViewModel()
        assertEquals(WorkoutTarget.New(today), vm.target.value)

        val draft = vm.addAndAwaitDraft(bench)
        assertEquals(DraftInput("42.5", "8"), vm.draftInputs[draft])
        val weId = vm.detail.value!!.items.single().workoutExercise.id
        awaitUntil("previous sets") { vm.previous.value[weId]?.size == 2 }
    }

    @Test
    fun draftText_isSavedAfterDebounce_andRestoredByNewViewModel() {
        val vm = newViewModel()
        val draft = vm.addAndAwaitDraft(exercise("卧推"))
        vm.onDraftWeightChange(draft, "42.5")
        vm.onDraftRepsChange(draft, "8")
        awaitUntil("draft saved") { runBlocking { dao.getSet(draft) }?.let { it.weightGrams == 42_500 && it.reps == 8 } == true }

        val restored = newViewModel()
        awaitUntil("restored text") { restored.draftInputs[draft] == DraftInput("42.5", "8") }
        assertEquals(SetStatus.DRAFT, runBlocking { dao.getSet(draft)!!.status })
    }

    @Test
    fun flushDrafts_writesImmediately() {
        val vm = newViewModel()
        val draft = vm.addAndAwaitDraft(exercise("卧推"))
        vm.onDraftWeightChange(draft, "50")
        vm.flushDrafts()
        awaitUntil("flushed") { runBlocking { dao.getSet(draft)!!.weightGrams } == 50_000 }
    }

    @Test
    fun invalidText_isNotStored_andConfirmShowsError() {
        val vm = newViewModel()
        val draft = vm.addAndAwaitDraft(exercise("卧推"))
        vm.onDraftWeightChange(draft, "4..")
        vm.onDraftRepsChange(draft, "8")
        vm.flushDrafts()
        Thread.sleep(700)
        assertNull(runBlocking { dao.getSet(draft)!!.weightGrams })
        assertEquals("4..", vm.draftInputs[draft]!!.weight)

        vm.confirm(draft)
        assertEquals("重量格式不正确", vm.draftInputs[draft]!!.error)

        vm.onDraftWeightChange(draft, "")
        assertNull(vm.draftInputs[draft]!!.error)
        vm.confirm(draft)
        awaitUntil("mode error") { vm.draftInputs[draft]?.error != null }
        assertEquals("这个动作按重量记录，请填写重量", vm.draftInputs[draft]!!.error)
        assertEquals(0, logged().size)
    }

    @Test
    fun latestIsYesterday_defaultsToNewToday_withResumeOffer() {
        val squat = exercise("深蹲")
        val oldId = runBlocking { repo.logSets(db, WorkoutTarget.New(yesterday), squat, 60_000 to 5).workoutId }
        val vm = newViewModel()

        assertEquals(WorkoutTarget.New(today), vm.target.value)
        awaitUntil("resume candidate") { vm.resumeCandidate.value?.id == oldId }

        vm.continueWorkout(oldId)
        val draft = vm.addAndAwaitDraft(squat)
        vm.confirmAndWait(draft, 2)

        assertEquals(1, runBlocking { dao.countWorkouts() })
        assertEquals(WorkoutTarget.Existing(oldId), vm.target.value)
        awaitUntil("resume hidden") { vm.resumeCandidate.value == null }
    }

    @Test
    fun newRecordStartedBeforeMidnight_staysOnThatDate() {
        clock.set(Instant.parse("2026-11-10T15:50:00Z")) // 23:50 Shanghai
        val vm = newViewModel()
        assertEquals(WorkoutTarget.New(today), vm.target.value)

        clock.set(Instant.parse("2026-11-10T16:10:00Z")) // 00:10 next day
        vm.addAndAwaitDraft(exercise("深蹲"))
        assertEquals("2026-11-10", runBlocking { dao.allWorkouts().single().trainingDate })
    }

    @Test
    fun targetSurvivesProcessDeath() {
        val state = SavedStateHandle()
        val vm = newViewModel(state)
        vm.startNewRecord(LocalDate.of(2026, 11, 8))

        val restored = newViewModel(SavedStateHandle(state.keys().associateWith { state.get<Any>(it) }))
        assertEquals(WorkoutTarget.New(LocalDate.of(2026, 11, 8)), restored.target.value)

        restored.addAndAwaitDraft(exercise("深蹲"))
        assertEquals("2026-11-08", runBlocking { dao.allWorkouts().single().trainingDate })
    }

    @Test
    fun futureDate_isRejected() {
        val vm = newViewModel()
        vm.startNewRecord(today.plusDays(1))
        assertEquals(WorkoutTarget.New(today), vm.target.value)
        assertEquals("训练日期不能晚于今天", vm.ui.value.error)
    }

    @Test
    fun targetWorkoutDeletedElsewhere_fallsBackToNewToday() {
        val wid = runBlocking { repo.logSets(db, WorkoutTarget.New(today), exercise("深蹲"), 60_000 to 5).workoutId }
        val vm = newViewModel()
        assertEquals(WorkoutTarget.Existing(wid), vm.target.value)

        runBlocking { repo.deleteWorkout(wid) }
        awaitUntil("fallback") { vm.target.value == WorkoutTarget.New(today) }
    }

    @Test
    fun removeExercise_thenUndo() {
        val vm = newViewModel()
        val draft = vm.addAndAwaitDraft(exercise("深蹲"))
        vm.onDraftWeightChange(draft, "60"); vm.onDraftRepsChange(draft, "5")
        vm.confirmAndWait(draft, 1)
        val weId = vm.detail.value!!.items.single().workoutExercise.id
        val before = runBlocking { dao.allSets().sortedBy { it.id } }

        var snapshot: DeletedSnapshot? = null
        collectors.launch { snapshot = vm.deletions.first() }
        vm.removeExercise(weId)
        awaitUntil("removed") { snapshot != null && vm.detail.value?.items?.isEmpty() == true }

        vm.undo(snapshot!!)
        awaitUntil("restored") { runBlocking { dao.allSets().sortedBy { it.id } } == before }
        awaitUntil("row text back") { vm.detail.value?.items?.singleOrNull()?.draft?.id?.let(vm.draftInputs::containsKey) == true }
    }

    @Test
    fun editThenDeleteThenUndo() {
        val vm = newViewModel()
        val draft = vm.addAndAwaitDraft(exercise("深蹲"))
        vm.onDraftWeightChange(draft, "60"); vm.onDraftRepsChange(draft, "5")
        vm.confirmAndWait(draft, 1)
        val set = logged().single()

        vm.startEditing(set, WeightMode.TOTAL)
        vm.onEditWeightChange("62.5")
        vm.onEditRepsChange("4")
        vm.saveEditing()
        awaitUntil("edit saved") { vm.editing == null }
        val edited = runBlocking { dao.getSet(set.id)!! }
        assertEquals(62_500, edited.weightGrams)
        assertEquals(4, edited.reps)
        assertEquals(set.loggedAt, edited.loggedAt)

        var snapshot: DeletedSnapshot? = null
        collectors.launch { snapshot = vm.deletions.first() }
        vm.startEditing(edited, WeightMode.TOTAL)
        vm.deleteEditing()
        awaitUntil("deleted") { snapshot != null }
        assertEquals(0, logged().size)
        assertEquals(1, runBlocking { dao.countWorkouts() })

        vm.undo(snapshot!!)
        awaitUntil("restored") { logged() == listOf(edited) }
    }

    @Test
    fun invalidEdit_showsErrorAndKeepsDialog() {
        val vm = newViewModel()
        val draft = vm.addAndAwaitDraft(exercise("深蹲"))
        vm.onDraftWeightChange(draft, "60"); vm.onDraftRepsChange(draft, "5")
        vm.confirmAndWait(draft, 1)
        val set = logged().single()

        vm.startEditing(set, WeightMode.TOTAL)
        vm.onEditWeightChange("")
        vm.saveEditing()
        awaitUntil("error shown") { vm.editing?.error != null }
        assertEquals("这个动作按重量记录，请填写重量", vm.editing?.error)
        assertEquals(60_000, runBlocking { dao.getSet(set.id)!!.weightGrams })
    }

    @Test
    fun createAndAdd_fromPicker() {
        val vm = newViewModel()
        var closed = false
        vm.createAndAddExercise("引体向上", WeightMode.BODYWEIGHT) { closed = true }
        awaitUntil("added") { vm.detail.value?.items?.size == 1 }
        assert(closed)
        assertEquals(WeightMode.BODYWEIGHT, vm.detail.value!!.items.single().workoutExercise.weightModeSnapshot)

        vm.createAndAddExercise("引体向上", WeightMode.TOTAL) { error("should not close") }
        awaitUntil("duplicate error") { vm.pickerError != null }
    }

    @Test
    fun recordRequest_switchesToWorkout_flushesDraftsAndIsConsumed() {
        val old = runBlocking { repo.logSets(db, WorkoutTarget.New(yesterday), exercise("深蹲"), 60_000 to 5) }
        val vm = newViewModel()
        val draft = vm.addAndAwaitDraft(exercise("卧推"))
        vm.onDraftWeightChange(draft, "42.5")
        vm.onDraftRepsChange(draft, "8")

        var notice: String? = null
        collectors.launch { notice = vm.notices.first() }
        requests.open(old.workoutId, "hello")

        awaitUntil("switched") { vm.target.value == WorkoutTarget.Existing(old.workoutId) }
        awaitUntil("notice") { notice == "hello" }
        assertNull(requests.pending.value)
        awaitUntil("draft flushed") { runBlocking { dao.getSet(draft) }?.weightGrams == 42_500 }
    }

    @Test
    fun recordRequest_beforeViewModelExists_isApplied() {
        val old = runBlocking { repo.logSets(db, WorkoutTarget.New(yesterday), exercise("深蹲"), 60_000 to 5) }
        requests.open(old.workoutId)
        val vm = newViewModel()
        awaitUntil("switched") { vm.target.value == WorkoutTarget.Existing(old.workoutId) }
        Thread.sleep(100)
        assertEquals(WorkoutTarget.Existing(old.workoutId), vm.target.value)
    }

    @Test
    fun backToToday_fromOldWorkout() {
        val old = runBlocking { repo.logSets(db, WorkoutTarget.New(yesterday), exercise("深蹲"), 60_000 to 5) }
        val vm = newViewModel()
        requests.open(old.workoutId)
        awaitUntil("switched") { vm.target.value == WorkoutTarget.Existing(old.workoutId) }

        vm.backToToday()
        awaitUntil("back") { vm.target.value == WorkoutTarget.New(today) }
    }

    @Test
    fun showHistory_loadsLoggedSessions() {
        val squat = exercise("深蹲")
        runBlocking { repo.logSets(db, WorkoutTarget.New(yesterday), squat, 60_000 to 5, 62_500 to 5) }
        val vm = newViewModel()
        collectors.launch { vm.exerciseHistory.collect {} }

        vm.showHistory(squat)
        awaitUntil("history") { vm.exerciseHistory.value.size == 1 }
        assertEquals(listOf(60_000, 62_500), vm.exerciseHistory.value.single().sets.map { it.weightGrams })

        vm.hideHistory()
        awaitUntil("cleared") { vm.exerciseHistory.value.isEmpty() }
    }
}

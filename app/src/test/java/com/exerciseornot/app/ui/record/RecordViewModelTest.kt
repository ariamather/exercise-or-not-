package com.exerciseornot.app.ui.record

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.data.DeletedSnapshot
import com.exerciseornot.app.data.TestClock
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.WeightMode
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
    private val dao get() = db.workoutDao()
    // 2026-11-10 20:00 Shanghai
    private val clock = TestClock(Instant.parse("2026-11-10T12:00:00Z"))
    private val today = LocalDate.of(2026, 11, 10)
    private val yesterday = today.minusDays(1)
    private val collectors = CoroutineScope(Dispatchers.Unconfined)

    @Before
    fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        repo = WorkoutRepository(db, clock)
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
        RecordViewModel(repo, state).also { vm ->
            collectors.launch { vm.resumeCandidate.collect {} }
            collectors.launch { vm.detail.collect {} }
            awaitUntil("initial target") { vm.target.value != null }
        }

    private fun RecordViewModel.enter(name: String, weight: String, reps: String) {
        onExerciseNameChange(name); onWeightChange(weight); onRepsChange(reps)
    }

    private fun RecordViewModel.confirmAndWait(expectedSets: Int) {
        confirmSet()
        awaitUntil("set saved") { runBlocking { dao.allSets().size } == expectedSets && !ui.value.saving }
    }

    @Test
    fun noWorkouts_targetsNewToday() {
        val vm = newViewModel()
        assertEquals(WorkoutTarget.New(today), vm.target.value)
        assertNull(vm.resumeCandidate.value)
    }

    @Test
    fun latestIsToday_continuesIt() {
        val wid = runBlocking { repo.logSet(WorkoutTarget.New(today), "s1", "深蹲", 60_000, 5) }
        val vm = newViewModel()
        assertEquals(WorkoutTarget.Existing(wid), vm.target.value)
        assertNull(vm.resumeCandidate.value)
    }

    @Test
    fun latestIsYesterday_defaultsToNewToday_withResumeOffer() {
        val oldId = runBlocking { repo.logSet(WorkoutTarget.New(yesterday), "s1", "深蹲", 60_000, 5) }
        val vm = newViewModel()

        assertEquals(WorkoutTarget.New(today), vm.target.value)
        awaitUntil("resume candidate") { vm.resumeCandidate.value?.id == oldId }

        vm.continueWorkout(oldId)
        vm.enter("深蹲", "60", "5")
        vm.confirmAndWait(2)

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
        vm.enter("深蹲", "60", "5")
        vm.confirmAndWait(1)
        val first = runBlocking { dao.allWorkouts().single() }
        assertEquals("2026-11-10", first.trainingDate)

        vm.confirmAndWait(2)
        assertEquals(1, runBlocking { dao.countWorkouts() })
    }

    @Test
    fun targetSurvivesProcessDeath() {
        val state = SavedStateHandle()
        val vm = newViewModel(state)
        vm.startNewRecord(LocalDate.of(2026, 11, 8))

        val restored = newViewModel(SavedStateHandle(state.keys().associateWith { state.get<Any>(it) }))
        assertEquals(WorkoutTarget.New(LocalDate.of(2026, 11, 8)), restored.target.value)

        restored.enter("深蹲", "60", "5")
        restored.confirmAndWait(1)
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
        val wid = runBlocking { repo.logSet(WorkoutTarget.New(today), "s1", "深蹲", 60_000, 5) }
        val vm = newViewModel()
        assertEquals(WorkoutTarget.Existing(wid), vm.target.value)

        runBlocking { repo.deleteWorkout(wid) }
        awaitUntil("fallback") { vm.target.value == WorkoutTarget.New(today) }
    }

    @Test
    fun editThenDeleteThenUndo() {
        val vm = newViewModel()
        vm.enter("深蹲", "60", "5")
        vm.confirmAndWait(1)
        val set = runBlocking { dao.allSets().single() }

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
        assertEquals(0, runBlocking { dao.allSets().size })
        // The workout itself is kept, so the target stays put.
        assertEquals(1, runBlocking { dao.countWorkouts() })

        vm.undo(snapshot!!)
        awaitUntil("restored") { runBlocking { dao.allSets() } == listOf(edited) }
    }

    @Test
    fun invalidEdit_showsErrorAndKeepsDialog() {
        val vm = newViewModel()
        vm.enter("深蹲", "60", "5")
        vm.confirmAndWait(1)
        val set = runBlocking { dao.allSets().single() }

        vm.startEditing(set, WeightMode.TOTAL)
        vm.onEditWeightChange("")
        vm.saveEditing()
        awaitUntil("error shown") { vm.editing?.error != null }
        assertEquals("这个动作按重量记录，请填写重量", vm.editing?.error)
        assertEquals(60_000, runBlocking { dao.getSet(set.id)!!.weightGrams })
    }
}

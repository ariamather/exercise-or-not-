package com.exerciseornot.app.ui.history

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.data.ExerciseRepository
import com.exerciseornot.app.data.ReuseResult
import com.exerciseornot.app.data.TestClock
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.logSets
import com.exerciseornot.app.ui.RecordRequest
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

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class HistoryViewModelTest {

    private lateinit var db: AppDatabase
    private lateinit var repo: WorkoutRepository
    private lateinit var exercises: ExerciseRepository
    private val clock = TestClock(Instant.parse("2026-11-10T12:00:00Z"))
    private val yesterday = WorkoutTarget.New(LocalDate.of(2026, 11, 9))
    private val requests = RecordRequests()
    private val collectors = CoroutineScope(Dispatchers.Unconfined)

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

    private fun awaitUntil(message: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 5_000
        while (!condition()) {
            check(System.currentTimeMillis() < deadline) { "timed out waiting for $message" }
            Thread.sleep(10)
        }
    }

    private fun exercise(name: String) = runBlocking { exercises.create(name, WeightMode.TOTAL).id }

    @Test
    fun open_requestsWorkoutAndNavigates() {
        val vm = HistoryViewModel(repo, requests)
        var navigated = false
        collectors.launch { vm.openRecord.first(); navigated = true }
        vm.open("w1")
        assertEquals(RecordRequest("w1"), requests.pending.value)
        awaitUntil("navigated") { navigated }
    }

    @Test
    fun reuse_requestsTodaysWorkoutWithNotice() {
        val src = runBlocking { repo.logSets(db, yesterday, exercise("深蹲"), 60_000 to 5) }
        val vm = HistoryViewModel(repo, requests)
        var navigated = false
        collectors.launch { vm.openRecord.first(); navigated = true }

        vm.reuse(src.workoutId)

        awaitUntil("navigated") { navigated }
        val request = requests.pending.value!!
        val today = runBlocking { repo.defaultTarget() } as WorkoutTarget.Existing
        assertEquals(RecordRequest(today.workoutId, "已复用 1 个动作"), request)
    }

    @Test
    fun reuse_nothingAdded_staysWithMessage() {
        val squat = exercise("深蹲")
        val src = runBlocking { repo.logSets(db, yesterday, squat, 60_000 to 5) }
        runBlocking { repo.logSets(db, WorkoutTarget.New(LocalDate.of(2026, 11, 10)), squat, 60_000 to 5) }
        val vm = HistoryViewModel(repo, requests)
        var message: String? = null
        collectors.launch { message = vm.messages.first() }

        vm.reuse(src.workoutId)

        awaitUntil("message") { message != null }
        assertEquals("这些动作都已在今天的记录里", message)
        assertNull(requests.pending.value)
    }

    @Test
    fun reuseNotice_texts() {
        assertEquals("已复用 2 个动作（跳过：1 个已在今天的记录里，1 个已归档）", reuseNotice(ReuseResult("w", 2, 1, 1)))
        assertEquals("没有可复用的动作（1 个已归档）", reuseNotice(ReuseResult(null, 0, 0, 1)))
    }
}

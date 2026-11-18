package com.exerciseornot.app.ui.hints

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.data.ExerciseRepository
import com.exerciseornot.app.data.TestClock
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.logSets
import com.exerciseornot.app.chance.ChancePreferences
import com.exerciseornot.app.chance.ChanceResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import java.time.Instant
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class HintsViewModelTest {

    @get:Rule val tmp = TemporaryFolder()
    private val storeScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val collectors = CoroutineScope(Dispatchers.Unconfined)
    private val clock = TestClock(Instant.parse("2026-11-10T12:00:00Z"))
    private val lastExport = MutableStateFlow<Instant?>(null)
    private lateinit var db: AppDatabase
    private lateinit var repo: WorkoutRepository
    private lateinit var exercises: ExerciseRepository
    private lateinit var dice: ChancePreferences
    private lateinit var vm: HintsViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        repo = WorkoutRepository(db, clock)
        exercises = ExerciseRepository(db, clock)
        val store = PreferenceDataStoreFactory.create(scope = storeScope) { tmp.root.resolve("settings.preferences_pb") }
        dice = ChancePreferences(store)
        vm = HintsViewModel(HintPreferences(store), repo, dice, lastExport)
        listOf(vm.showDice, vm.showRecord, vm.showBackup).forEach { f -> collectors.launch { f.collect {} } }
    }

    @After
    fun tearDown() {
        collectors.cancel()
        db.close()
        storeScope.cancel()
        Dispatchers.resetMain()
    }

    private fun StateFlow<Boolean>.await(expected: Boolean) {
        val deadline = System.currentTimeMillis() + 5_000
        while (value != expected) {
            check(System.currentTimeMillis() < deadline) { "timed out waiting for $expected" }
            Thread.sleep(10)
        }
    }

    /** Stays [expected] for a short while, i.e. it was not just the initial value. */
    private fun StateFlow<Boolean>.holds(expected: Boolean) {
        repeat(20) { check(value == expected) { "expected $expected" }; Thread.sleep(10) }
    }

    @Test
    fun recordHint_untilFirstLoggedSet() {
        vm.showRecord.await(true)
        val bench = runBlocking { exercises.create("卧推", WeightMode.TOTAL).id }
        val target = WorkoutTarget.New(LocalDate.of(2026, 11, 10))
        runBlocking { repo.logSets(db, target, bench) }
        vm.showRecord.holds(true)
        runBlocking { repo.logSets(db, WorkoutTarget.New(LocalDate.of(2026, 11, 9)), bench, 40_000 to 10) }
        vm.showRecord.await(false)
    }

    @Test
    fun recordHint_dismissed() {
        vm.showRecord.await(true)
        vm.dismiss(Hint.Record)
        vm.showRecord.await(false)
        vm.showDice.holds(true)
    }

    @Test
    fun diceHint_hiddenAfterRoll() {
        vm.showDice.await(true)
        runBlocking { dice.saveResult(ChanceResult("dice", "d6", "3", false, LocalDate.of(2026, 11, 10))) }
        vm.showDice.await(false)
    }

    @Test
    fun backupHint_fiveWorkoutsWithoutExport() {
        val bench = runBlocking { exercises.create("卧推", WeightMode.TOTAL).id }
        vm.showRecord.await(true)
        repeat(4) { i -> runBlocking { repo.logSets(db, WorkoutTarget.New(LocalDate.of(2026, 11, 1 + i)), bench, 40_000 to 10) } }
        vm.showBackup.holds(false)
        runBlocking { repo.logSets(db, WorkoutTarget.New(LocalDate.of(2026, 11, 6)), bench, 40_000 to 10) }
        vm.showBackup.await(true)
        lastExport.value = Instant.parse("2026-11-10T13:00:00Z")
        vm.showBackup.await(false)
    }
}

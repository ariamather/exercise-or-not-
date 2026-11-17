package com.exerciseornot.app.ui.dice

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.data.TestClock
import com.exerciseornot.app.dice.DicePreferences
import com.exerciseornot.app.dice.DiceResult
import com.exerciseornot.app.dice.rollDie
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import java.time.Instant
import java.time.LocalDate
import kotlin.random.Random

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class DiceViewModelTest {

    @get:Rule val tmp = TemporaryFolder()
    private val storeScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val collectors = CoroutineScope(Dispatchers.Unconfined)
    // 2026-11-10 20:00 Shanghai
    private val clock = TestClock(Instant.parse("2026-11-10T12:00:00Z"))
    private val today = LocalDate.of(2026, 11, 10)
    private lateinit var prefs: DicePreferences

    @Before
    fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        prefs = DicePreferences(PreferenceDataStoreFactory.create(scope = storeScope) { tmp.root.resolve("s.preferences_pb") })
    }

    @After
    fun tearDown() {
        collectors.cancel()
        storeScope.cancel()
        Dispatchers.resetMain()
    }

    private fun awaitUntil(message: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 5_000
        while (!condition()) {
            check(System.currentTimeMillis() < deadline) { "timed out waiting for $message" }
            Thread.sleep(10)
        }
    }

    private fun newViewModel(seed: Int = 7, durationMs: Long = 0) =
        DiceViewModel(prefs, clock, Random(seed), durationMs).also { vm ->
            collectors.launch { vm.todayResult.collect {} }
        }

    @Test
    fun roll_savesTheFirstDrawAndMapsIt() {
        val expected = rollDie(Random(7))
        val vm = newViewModel(seed = 7)
        vm.roll()
        awaitUntil("result") { vm.todayResult.value != null && !vm.rolling.value }
        assertEquals(DiceResult(expected, expected in setOf(4, 5, 6), today), vm.todayResult.value)
        assertEquals(vm.todayResult.value, runBlocking { prefs.lastResult.first() })
    }

    @Test
    fun changingFacesAfterRoll_keepsTodaysAnswer() {
        val vm = newViewModel()
        vm.roll()
        awaitUntil("result") { vm.todayResult.value != null && !vm.rolling.value }
        val before = vm.todayResult.value!!
        vm.toggleFace(before.face)
        awaitUntil("faces changed") { (before.face in vm.trainFaces.value) != before.train }
        assertEquals(before, runBlocking { prefs.lastResult.first() })
        assertEquals(before, vm.todayResult.value)
    }

    @Test
    fun noFacesSelected_alwaysRest() {
        runBlocking { prefs.setTrainFaces(emptySet()) }
        val vm = newViewModel()
        awaitUntil("faces loaded") { vm.trainFaces.value.isEmpty() }
        vm.roll()
        awaitUntil("result") { vm.todayResult.value != null && !vm.rolling.value }
        assertEquals(false, vm.todayResult.value!!.train)
    }

    @Test
    fun yesterdaysResult_isNotShown() {
        runBlocking { prefs.saveResult(DiceResult(6, true, today.minusDays(1))) }
        val vm = newViewModel()
        val seen = mutableListOf<DiceResult?>()
        collectors.launch { vm.todayResult.collect { seen += it } }
        runBlocking { prefs.saveResult(DiceResult(2, false, today)) }
        awaitUntil("today's result") { vm.todayResult.value?.face == 2 }
        assertTrue("yesterday's result leaked: $seen", seen.none { it?.date == today.minusDays(1) })
    }

    @Test
    fun roll_whileRolling_drawsOnce() {
        val random = object : Random() {
            val inner = Random(1)
            var draws = 0
            override fun nextBits(bitCount: Int): Int = inner.nextBits(bitCount)
            override fun nextInt(from: Int, until: Int): Int { draws++; return inner.nextInt(from, until) }
        }
        val vm = DiceViewModel(prefs, clock, random, rollDurationMs = 60_000)
        vm.roll()
        vm.roll()
        vm.roll()
        assertTrue(vm.rolling.value)
        assertEquals(1, random.draws)
    }

    @Test
    fun animatedRoll_waitsForMatchingLanding() {
        val vm = newViewModel()
        vm.rollAnimated()
        awaitUntil("animation requested") { vm.animation.value != null }
        val request = vm.animation.value!!
        assertTrue(vm.rolling.value)
        vm.animationFinished(request.id + 1, request.result.face)
        assertTrue("a stale callback must not finish this throw", vm.rolling.value)
        vm.animationFinished(request.id, request.result.face)
        assertEquals(false, vm.rolling.value)
        assertEquals(null, vm.animation.value)
        assertEquals(request.result, runBlocking { prefs.lastResult.first() })
    }

    @Test
    fun closingScene_keepsSavedResultAndAllowsNextRoll() {
        val vm = newViewModel()
        vm.rollAnimated()
        awaitUntil("first animation") { vm.animation.value != null }
        val first = vm.animation.value!!
        vm.closeScene()
        assertEquals(false, vm.rolling.value)
        assertEquals(first.result, runBlocking { prefs.lastResult.first() })
        vm.rollAnimated()
        awaitUntil("second animation") { vm.animation.value != null }
        val second = vm.animation.value!!
        vm.animationFinished(first.id, first.result.face)
        assertEquals(second, vm.animation.value)
        vm.animationFinished(second.id, second.result.face)
        assertEquals(false, vm.rolling.value)
    }

    @Test
    fun failedAnimation_releasesControlsWithoutChangingResult() {
        val vm = newViewModel()
        vm.rollAnimated()
        awaitUntil("animation requested") { vm.animation.value != null }
        val request = vm.animation.value!!
        vm.animationFailed(request.id)
        assertEquals(false, vm.rolling.value)
        assertTrue(vm.error.value != null)
        assertEquals(request.result, runBlocking { prefs.lastResult.first() })
    }
}

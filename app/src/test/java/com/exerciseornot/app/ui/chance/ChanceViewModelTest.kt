package com.exerciseornot.app.ui.chance

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.chance.ChancePreferences
import com.exerciseornot.app.chance.ChanceResult
import com.exerciseornot.app.chance.D6
import com.exerciseornot.app.chance.RevealPace
import com.exerciseornot.app.chance.draw
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
import com.exerciseornot.app.data.TestClock
import java.time.Instant
import java.time.LocalDate
import kotlin.random.Random

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class ChanceViewModelTest {

    @get:Rule val tmp = TemporaryFolder()
    private val storeScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val collectors = CoroutineScope(Dispatchers.Unconfined)
    // 2026-11-10 20:00 Shanghai
    private val clock = TestClock(Instant.parse("2026-11-10T12:00:00Z"))
    private val today = LocalDate.of(2026, 11, 10)
    private lateinit var prefs: ChancePreferences

    @Before
    fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        prefs = ChancePreferences(PreferenceDataStoreFactory.create(scope = storeScope) { tmp.root.resolve("s.preferences_pb") })
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
        ChanceViewModel(prefs, clock, Random(seed), durationMs).also { vm ->
            collectors.launch { vm.todayResult.collect {} }
        }

    @Test
    fun draw_savesTheFirstDrawAndMapsIt() {
        val expected = D6.draw(D6.stops[3], Random(7))
        val vm = newViewModel(seed = 7)
        vm.draw()
        awaitUntil("result") { vm.todayResult.value != null && !vm.drawing.value }
        assertEquals(ChanceResult("dice", "d6", expected.outcomeId, expected.train, today), vm.todayResult.value)
        assertEquals(vm.todayResult.value, runBlocking { prefs.lastResult.first() })
    }

    @Test
    fun setup_snapsSavedTargetToTheGamesStops() {
        runBlocking { prefs.setTarget(0.2) }
        val vm = newViewModel()
        awaitUntil("setup loaded") { vm.setup.value.target == 0.2 }
        assertEquals("1/6", vm.setup.value.stop.key)
        assertEquals("掷出 6 就练", vm.setup.value.stop.rule)
    }

    @Test
    fun changingProbabilityAfterDraw_keepsTodaysAnswer() {
        val vm = newViewModel()
        vm.draw()
        awaitUntil("result") { vm.todayResult.value != null && !vm.drawing.value }
        val before = vm.todayResult.value!!
        val flipped = if (before.train) D6.stops.first() else D6.stops.last()
        vm.setStop(flipped)
        awaitUntil("stop changed") { vm.setup.value.stop == flipped }
        assertEquals(before, runBlocking { prefs.lastResult.first() })
        assertEquals(before, vm.todayResult.value)
    }

    @Test
    fun zeroPercent_alwaysRest_hundredPercent_alwaysTrain() {
        runBlocking { prefs.setTarget(0.0) }
        val vm = newViewModel()
        awaitUntil("0% loaded") { vm.setup.value.stop.numerator == 0 }
        repeat(5) {
            vm.draw()
            awaitUntil("result") { !vm.drawing.value && vm.todayResult.value != null }
            assertEquals(false, vm.todayResult.value!!.train)
        }
        vm.setStop(D6.stops.last())
        awaitUntil("100% loaded") { vm.setup.value.stop == D6.stops.last() }
        vm.draw()
        awaitUntil("result") { !vm.drawing.value && vm.todayResult.value?.train == true }
    }

    @Test
    fun yesterdaysResult_isNotShown() {
        runBlocking { prefs.saveResult(ChanceResult("dice", "d6", "6", true, today.minusDays(1))) }
        val vm = newViewModel()
        val seen = mutableListOf<ChanceResult?>()
        collectors.launch { vm.todayResult.collect { seen += it } }
        runBlocking { prefs.saveResult(ChanceResult("dice", "d6", "2", false, today)) }
        awaitUntil("today's result") { vm.todayResult.value?.outcomeId == "2" }
        assertTrue("yesterday's result leaked: $seen", seen.none { it?.date == today.minusDays(1) })
    }

    @Test
    fun draw_whileDrawing_drawsOnce() {
        val random = object : Random() {
            val inner = Random(1)
            var draws = 0
            override fun nextBits(bitCount: Int): Int = inner.nextBits(bitCount)
            override fun nextInt(from: Int, until: Int): Int { draws++; return inner.nextInt(from, until) }
        }
        val vm = ChanceViewModel(prefs, clock, random, revealDurationMs = 60_000)
        vm.draw()
        vm.draw()
        vm.draw()
        assertTrue(vm.drawing.value)
        assertEquals(1, random.draws)
    }

    @Test
    fun animatedDraw_waitsForMatchingLanding() {
        val vm = newViewModel()
        vm.drawAnimated()
        awaitUntil("animation requested") { vm.animation.value != null }
        val request = vm.animation.value!!
        assertTrue(vm.drawing.value)
        vm.animationFinished(request.id + 1, request.result.outcomeId)
        assertTrue("a stale callback must not finish this draw", vm.drawing.value)
        vm.animationFinished(request.id, request.result.outcomeId)
        assertEquals(false, vm.drawing.value)
        assertEquals(null, vm.animation.value)
        assertEquals(request.result, runBlocking { prefs.lastResult.first() })
    }

    @Test
    fun landingOnAnotherOutcome_isReportedAsFailure() {
        val vm = newViewModel()
        vm.drawAnimated()
        awaitUntil("animation requested") { vm.animation.value != null }
        val request = vm.animation.value!!
        val other = D6.outcomes.first { it.id != request.result.outcomeId }.id
        vm.animationFinished(request.id, other)
        assertEquals(false, vm.drawing.value)
        assertTrue(vm.error.value != null)
        // The saved answer is the drawn one, never what the scene happened to show.
        assertEquals(request.result, runBlocking { prefs.lastResult.first() })
    }

    @Test
    fun closingScene_keepsSavedResultAndAllowsNextDraw() {
        val vm = newViewModel()
        vm.drawAnimated()
        awaitUntil("first animation") { vm.animation.value != null }
        val first = vm.animation.value!!
        vm.closeScene()
        assertEquals(false, vm.drawing.value)
        assertEquals(first.result, runBlocking { prefs.lastResult.first() })
        vm.drawAnimated()
        awaitUntil("second animation") { vm.animation.value != null }
        val second = vm.animation.value!!
        vm.animationFinished(first.id, first.result.outcomeId)
        assertEquals(second, vm.animation.value)
        vm.animationFinished(second.id, second.result.outcomeId)
        assertEquals(false, vm.drawing.value)
    }

    @Test
    fun setGame_keepsTargetAndSnapsToTheNewGamesStops() {
        runBlocking { prefs.setTarget(0.5) }
        val vm = newViewModel()
        awaitUntil("setup loaded") { vm.setup.value.target == 0.5 }
        vm.setGame("cup")
        awaitUntil("cup selected") { vm.setup.value.game.id == "cup" }
        assertEquals(0.5, vm.setup.value.target, 0.0)
        assertEquals("3/6", vm.setup.value.stop.key)
        assertEquals("掷出 4、5、6 就练", vm.setup.value.stop.rule)
        assertEquals("cup", runBlocking { prefs.settings.first() }.gameId)
        assertEquals(0.5, runBlocking { prefs.settings.first() }.target, 0.0)
        assertEquals(null, runBlocking { prefs.lastResult.first() })
    }

    @Test
    fun setGame_keepsTodaysAnswerAndIgnoresUnknownGames() {
        val vm = newViewModel()
        vm.draw()
        awaitUntil("result") { vm.todayResult.value != null && !vm.drawing.value }
        val before = vm.todayResult.value!!
        vm.setGame("something-newer")
        assertEquals("dice", vm.setup.value.game.id)
        vm.setGame("cup")
        awaitUntil("cup selected") { vm.setup.value.game.id == "cup" }
        assertEquals(before, vm.todayResult.value)
        assertEquals(before, runBlocking { prefs.lastResult.first() })
    }

    @Test
    fun animatedDraw_carriesTheGamesPaceAndModel() {
        val vm = newViewModel()
        vm.setGame("cup")
        awaitUntil("cup selected") { vm.setup.value.game.id == "cup" }
        vm.drawAnimated()
        awaitUntil("animation requested") { vm.animation.value != null }
        val request = vm.animation.value!!
        assertEquals(RevealPace.TIMED, request.pace)
        assertEquals("cup", request.result.gameId)
        assertEquals("d6", request.result.modelId)
    }

    @Test
    fun failedAnimation_releasesControlsWithoutChangingResult() {
        val vm = newViewModel()
        vm.drawAnimated()
        awaitUntil("animation requested") { vm.animation.value != null }
        val request = vm.animation.value!!
        vm.animationFailed(request.id)
        assertEquals(false, vm.drawing.value)
        assertTrue(vm.error.value != null)
        assertEquals(request.result, runBlocking { prefs.lastResult.first() })
    }
}

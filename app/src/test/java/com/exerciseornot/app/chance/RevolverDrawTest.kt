package com.exerciseornot.app.chance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RevolverDrawTest {
    @Test fun preservesAllThirteenProbabilityPresets() {
        assertEquals("revolver", RevolverDraw.id)
        val keys = listOf(
            "0-1-any", "2-2-all", "1-1-any", "3-2-all", "2-1-any", "4-2-all",
            "3-1-any", "2-2-any", "4-1-any", "3-2-any", "5-1-any", "4-2-any", "6-1-any",
        )
        val priorStops = keys.map { requireNotNull(RevolverDraw.stopByKey(it)) }
        assertEquals(
            listOf(0, 7, 17, 20, 33, 40, 50, 60, 67, 80, 83, 93, 100),
            priorStops.map(Stop::percent),
        )
        assertEquals(
            listOf(0, 4, 10, 12, 20, 24, 30, 36, 40, 48, 50, 56, 60),
            priorStops.map { RevolverDraw.trainWeight(it).first },
        )
        for (stop in priorStops) assertEquals(stop, RevolverDraw.snap(stop.chance))
        assertNull(RevolverDraw.stopByKey("5-2-all"))
        assertNull(RevolverDraw.stopByKey("1-0-any"))
    }

    @Test fun directConfigurationsHaveExactProbabilitiesAndUniqueSliderPositions() {
        val chances = RevolverDraw.stops.map(Stop::chance)
        assertEquals(chances.distinct().sorted(), chances)
        for (loaded in 0..6) for (shots in 1..6) {
            val stop = RevolverDraw.stopFor(loaded, shots)
            assertEquals(RevolverDraw.Config(loaded, shots), RevolverDraw.configOf(stop))
            assertEquals(stop, RevolverDraw.stopByKey(stop.key))
            val misses = 60 * choose(6 - loaded, shots) / choose(6, shots)
            assertEquals(stop.key, (60 - misses) to 60, RevolverDraw.trainWeight(stop))
            assertTrue(stop.key, stop.chance in chances)
            assertEquals(stop.key, stop.chance, (60 - misses) / 60.0, 0.0)
        }
        assertEquals("1-3-any", RevolverDraw.stopFor(1, 3).key)
        assertEquals("3-1-any", RevolverDraw.snap(RevolverDraw.stopFor(1, 3).chance).key)
        assertEquals("3-3-any", RevolverDraw.nearestStop(0.95).key)
    }

    private fun choose(n: Int, k: Int): Int = (1..k).fold(1) { count, i -> count * (n - i + 1) / i }

    @Test fun everyValidLayoutOccursEquallyOftenIncludingAdjacentSlots() {
        for (stop in RevolverDraw.stops) {
            val marked = stop.key.first().digitToInt()
            val layouts = RevolverDraw.outcomes.map { requireNotNull(RevolverDraw.mask(stop, it.id)) }
            val expected = (0..63).filter { it.countOneBits() == marked }
            assertEquals(expected, layouts.distinct())
            assertTrue(layouts.groupingBy { it }.eachCount().values.all { it == 60 / expected.size })
        }
        val twoSlots = RevolverDraw.stops.first { it.key == "2-2-all" }
        assertEquals(0b000011, RevolverDraw.mask(twoSlots, "1"))
        assertEquals(0b000101, RevolverDraw.mask(twoSlots, "2"))
        assertEquals(0b000011, RevolverDraw.mask(twoSlots, "16"))
        assertNull(RevolverDraw.mask(twoSlots, "0"))
        assertNull(RevolverDraw.mask(twoSlots, "61"))
    }

    @Test fun onlyTheSelectedRoundsCountAndTheRuleChoosesAnyOrAll() {
        val any = RevolverDraw.stops.first { it.key == "2-2-any" }
        val all = RevolverDraw.stops.first { it.key == "2-2-all" }
        assertEquals(true, RevolverDraw.trains(any, "1"))
        assertEquals(true, RevolverDraw.trains(all, "1"))
        assertEquals(true, RevolverDraw.trains(any, "2"))
        assertEquals(false, RevolverDraw.trains(all, "2"))
        assertEquals(0b001100, RevolverDraw.mask(any, "6"))
        assertEquals(false, RevolverDraw.trains(any, "6"))
    }
}

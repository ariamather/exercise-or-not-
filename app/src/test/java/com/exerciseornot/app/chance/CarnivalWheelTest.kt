package com.exerciseornot.app.chance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class CarnivalWheelTest {
    @Test
    fun stopsFollowTheDialsExactClockwiseArcs() {
        val expectedCuts = linkedMapOf(
            "0/12" to 0,
            "1/10" to 6,
            "2/10" to 12,
            "3/12" to 15,
            "4/12" to 20,
            "6/12" to 30,
            "8/12" to 40,
            "9/12" to 45,
            "8/10" to 48,
            "9/10" to 54,
            "12/12" to 60,
        )
        assertEquals("wheel", CarnivalWheel.id)
        assertEquals(expectedCuts.keys.toList(), CarnivalWheel.stops.map { it.key })
        assertEquals((1..60).map(Int::toString), CarnivalWheel.outcomes.map(Outcome::id))
        assertEquals(List(60) { 1 }, CarnivalWheel.outcomes.map(Outcome::weight))
        for (stop in CarnivalWheel.stops) {
            val trained = CarnivalWheel.outcomes.filter { CarnivalWheel.trains(stop, it.id) }
            val cut = expectedCuts.getValue(stop.key)
            assertEquals("clockwise arc ${stop.key}", (1..cut).map(Int::toString), trained.map(Outcome::id))
        }
        assertEquals("4/12", CarnivalWheel.snap(1.0 / 3.0).key)
        assertEquals("8/12", CarnivalWheel.snap(2.0 / 3.0).key)
        for (invalid in listOf("0", "61", "bad")) {
            assertFalse(CarnivalWheel.trains(CarnivalWheel.stops.last(), invalid))
        }
    }
}

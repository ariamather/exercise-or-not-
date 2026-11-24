package com.exerciseornot.app.chance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SlotMachineTest {
    @Test
    fun presetsHaveThePrototypeProbabilities() {
        assertEquals(216, SlotMachine.outcomes.size)
        assertEquals(
            listOf(
                "0-majority" to 0, "1-majority" to 16, "3-all" to 27,
                "2-majority" to 56, "4-all" to 64, "1-any" to 91,
                "3-majority" to 108, "5-all" to 125, "2-any" to 152,
                "4-majority" to 160, "3-any" to 189, "5-majority" to 200,
                "6-majority" to 216,
            ),
            SlotMachine.stops.map { it.key to it.numerator },
        )
        assertTrue(SlotMachine.stops.all { it.denominator == 216 })
        assertEquals("3-majority", SlotMachine.snap(0.5).key)
    }

    @Test
    fun rulesUseTheSavedPhysicalReelPositions() {
        fun trains(key: String, outcome: String): Boolean =
            SlotMachine.trains(SlotMachine.stops.single { it.key == key }, outcome)

        assertTrue(trains("2-majority", "1,6,4"))
        assertFalse(trains("2-majority", "1,6,2"))
        assertTrue(trains("3-all", "1,3,5"))
        assertFalse(trains("3-all", "1,3,2"))
        assertTrue(trains("3-any", "2,4,5"))
        assertFalse(trains("3-any", "2,4,6"))
        assertFalse(trains("6-majority", "1,1,7"))
    }
}

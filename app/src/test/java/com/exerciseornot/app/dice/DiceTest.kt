package com.exerciseornot.app.dice

import com.exerciseornot.app.ui.dice.facesSummary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class DiceTest {

    @Test
    fun rollDie_staysInRangeAndHitsEveryFace() {
        val random = Random(42)
        val counts = IntArray(7)
        repeat(6000) {
            val f = rollDie(random)
            assertTrue("face $f out of range", f in 1..6)
            counts[f]++
        }
        (1..6).forEach { assertTrue("face $it never rolled", counts[it] > 0) }
    }

    @Test
    fun probabilityText() {
        assertEquals("0%", trainProbabilityText(emptySet()))
        assertEquals("17%", trainProbabilityText(setOf(6)))
        assertEquals("50%", trainProbabilityText(setOf(4, 5, 6)))
        assertEquals("100%", trainProbabilityText((1..6).toSet()))
    }

    @Test
    fun facesSummary_texts() {
        assertEquals("掷出 4、5、6 就练 · 50%", facesSummary(setOf(6, 4, 5)))
        assertEquals("没有选择“练”的点数 · 0%", facesSummary(emptySet()))
    }
}

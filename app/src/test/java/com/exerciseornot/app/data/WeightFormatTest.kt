package com.exerciseornot.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WeightFormatTest {
    @Test
    fun parse() {
        assertEquals(40_000, WeightFormat.parseKgToGrams("40"))
        assertEquals(42_500, WeightFormat.parseKgToGrams("42.5"))
        assertEquals(42_500, WeightFormat.parseKgToGrams(" 42,5 "))
        assertNull(WeightFormat.parseKgToGrams(""))
        assertNull(WeightFormat.parseKgToGrams("abc"))
        assertNull(WeightFormat.parseKgToGrams("-5"))
    }

    @Test
    fun format() {
        assertEquals("40", WeightFormat.gramsToKgText(40_000))
        assertEquals("42.5", WeightFormat.gramsToKgText(42_500))
        assertEquals("0", WeightFormat.gramsToKgText(0))
    }
}

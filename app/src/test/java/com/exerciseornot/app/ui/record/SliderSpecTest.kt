package com.exerciseornot.app.ui.record

import com.exerciseornot.app.data.db.WeightMode
import org.junit.Assert.assertEquals
import org.junit.Test

class SliderSpecTest {

    @Test
    fun total_usesFineSliderAroundFiveKgAnchor() {
        assertEquals(SliderSpec(20f, 60f, .5f), sliderSpec(42.5f, WeightMode.TOTAL, DraftField.Weight))
        // Both values share a 40 kg anchor; slider positions remain in 0.5 kg steps.
        assertEquals(SliderSpec(20f, 60f, .5f), sliderSpec(41f, WeightMode.TOTAL, DraftField.Weight))
        assertEquals(79, sliderSpec(40f, WeightMode.TOTAL, DraftField.Weight).steps)
    }

    @Test
    fun lowerBound_neverBelowZero_windowKeepsWidth() {
        assertEquals(SliderSpec(0f, 40f, .5f), sliderSpec(5f, WeightMode.TOTAL, DraftField.Weight))
        assertEquals(SliderSpec(0f, 40f, .5f), sliderSpec(3f, WeightMode.PER_SIDE, DraftField.Weight))
    }

    @Test
    fun defaultsWhenEmpty() {
        assertEquals(SliderSpec(0f, 40f, .5f), sliderSpec(null, WeightMode.TOTAL, DraftField.Weight))
        assertEquals(SliderSpec(0f, 40f, .5f), sliderSpec(null, WeightMode.PER_SIDE, DraftField.Weight))
        assertEquals(SliderSpec(0f, 40f, .5f), sliderSpec(10f, WeightMode.BODYWEIGHT, DraftField.Weight))
        assertEquals(SliderSpec(1f, 30f, 1f), sliderSpec(8f, WeightMode.TOTAL, DraftField.Reps))
        assertEquals(28, sliderSpec(8f, WeightMode.TOTAL, DraftField.Reps).steps)
    }

    @Test
    fun formatSliderValue_snapsToGrams() {
        assertEquals("42.5", formatSliderValue(42.49999f, 2.5f, DraftField.Weight))
        assertEquals("40", formatSliderValue(40.0001f, 2.5f, DraftField.Weight))
        assertEquals("12", formatSliderValue(11.6f, 1f, DraftField.Weight))
        assertEquals("8", formatSliderValue(7.6f, 1f, DraftField.Reps))
    }
}

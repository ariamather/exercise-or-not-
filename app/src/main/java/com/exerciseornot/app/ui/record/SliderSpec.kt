package com.exerciseornot.app.ui.record

import com.exerciseornot.app.data.db.WeightMode
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToInt

enum class DraftField { Weight, Reps }

/** A slider window in display units (kg or reps); [steps] is what Material's Slider expects. */
data class SliderSpec(val min: Float, val max: Float, val step: Float) {
    val steps: Int get() = ((max - min) / step).roundToInt() - 1
}

/** All weight modes use a fine 0.5 kg slider; the separate buttons choose their own increment. */
@Suppress("UNUSED_PARAMETER")
fun sliderSpec(value: Float?, mode: WeightMode, field: DraftField): SliderSpec = when (field) {
    DraftField.Reps -> SliderSpec(1f, maxOf(30f, ceil((value ?: 10f) / 10f) * 10f), 1f)
    DraftField.Weight -> {
        val current = value ?: 0f
        // Keep imported values above the normal limit adjustable without silently changing them.
        val limit = maxOf(1000f, ceil(current / 5f) * 5f)
        val min = (floor(current / 5f) * 5f - 20f).coerceIn(0f, limit - 40f)
        SliderSpec(min, min + 40f, .5f)
    }
}

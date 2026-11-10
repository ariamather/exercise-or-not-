package com.exerciseornot.app.ui.record

import com.exerciseornot.app.data.db.WeightMode
import kotlin.math.floor
import kotlin.math.roundToInt

enum class DraftField { Weight, Reps }

/** A slider window in display units (kg or reps); [steps] is what Material's Slider expects. */
data class SliderSpec(val min: Float, val max: Float, val step: Float) {
    val steps: Int get() = ((max - min) / step).roundToInt() - 1
}

/**
 * Window centred on [value] (snapped to the step grid) so small adjustments are easy;
 * recomputed after each drag so the user can keep moving in one direction.
 */
fun sliderSpec(value: Float?, mode: WeightMode, field: DraftField): SliderSpec = when (field) {
    DraftField.Reps -> SliderSpec(1f, 30f, 1f)
    DraftField.Weight -> when (mode) {
        WeightMode.BODYWEIGHT -> SliderSpec(0f, 40f, 2.5f)
        WeightMode.TOTAL -> centred(value ?: 20f, span = 20f, step = 2.5f)
        WeightMode.PER_SIDE -> centred(value ?: 10f, span = 10f, step = 1f)
    }
}

private fun centred(value: Float, span: Float, step: Float): SliderSpec {
    val centre = floor(value / step + 0.5f) * step
    val min = (centre - span).coerceAtLeast(0f)
    return SliderSpec(min, min + 2 * span, step)
}

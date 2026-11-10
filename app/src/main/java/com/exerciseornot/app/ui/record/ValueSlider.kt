package com.exerciseornot.app.ui.record

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.data.db.WeightMode
import kotlin.math.roundToInt

/** Slider for one pending-row field; its window re-centres on the value after each drag. */
@Composable
fun ValueSlider(
    text: String,
    mode: WeightMode,
    field: DraftField,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val current = text.trim().replace(',', '.').toFloatOrNull()
    val latest by rememberUpdatedState(current)
    var spec by remember(mode, field) { mutableStateOf(sliderSpec(current, mode, field)) }
    var dragging by remember { mutableStateOf(false) }

    LaunchedEffect(current) {
        if (!dragging && current != null && (current < spec.min || current > spec.max)) {
            spec = sliderSpec(current, mode, field)
        }
    }

    Column(modifier) {
        Slider(
            value = (current ?: spec.min).coerceIn(spec.min, spec.max),
            onValueChange = {
                dragging = true
                onValueChange(formatSliderValue(it, spec.step, field))
            },
            onValueChangeFinished = {
                dragging = false
                spec = sliderSpec(latest, mode, field)
            },
            valueRange = spec.min..spec.max,
            steps = spec.steps,
            modifier = Modifier.fillMaxWidth().semantics {
                contentDescription = if (field == DraftField.Weight) "调整重量" else "调整次数"
            },
        )
        Row(Modifier.fillMaxWidth()) {
            val style = MaterialTheme.typography.labelSmall
            Text(formatSliderValue(spec.min, spec.step, field), style = style)
            Spacer(Modifier.weight(1f))
            Text(formatSliderValue(spec.max, spec.step, field), style = style)
        }
    }
}

/** Snaps to the step grid in whole grams so float drift never shows up as "42.499". */
internal fun formatSliderValue(value: Float, step: Float, field: DraftField): String = when (field) {
    DraftField.Reps -> value.roundToInt().toString()
    DraftField.Weight -> {
        val stepGrams = (step * 1000).roundToInt()
        WeightFormat.gramsToKgText((value * 1000 / stepGrams).roundToInt() * stepGrams)
    }
}

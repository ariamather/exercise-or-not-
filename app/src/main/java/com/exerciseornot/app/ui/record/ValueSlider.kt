package com.exerciseornot.app.ui.record

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.data.db.WeightMode
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/** Slider for one pending-row field; its window re-centres on the value after each drag. */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ValueSlider(
    text: String,
    mode: WeightMode,
    field: DraftField,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onInteraction: (Boolean) -> Unit = {},
) {
    val current = text.trim().replace(',', '.').toFloatOrNull()
    val latest by rememberUpdatedState(current)
    var spec by remember(mode, field) { mutableStateOf(sliderSpec(current, mode, field)) }
    var dragging by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val dragged by interaction.collectIsDraggedAsState()
    val reportInteraction by rememberUpdatedState(onInteraction)
    val activeColor = MaterialTheme.colorScheme.primary.copy(alpha = if (enabled) 1f else .4f)
    val trackColor = MaterialTheme.colorScheme.primary.copy(alpha = .16f)
    val thumbColor = MaterialTheme.colorScheme.surfaceContainerLow
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl

    DisposableEffect(pressed, dragged) {
        reportInteraction(pressed || dragged)
        onDispose { reportInteraction(false) }
    }

    LaunchedEffect(current) {
        if (!dragging && current != null) {
            val next = sliderSpec(current, mode, field)
            spec = if (field == DraftField.Reps) next.copy(max = maxOf(spec.max, next.max)) else next
        }
    }

    Column(modifier) {
        Slider(
            enabled = enabled,
            interactionSource = interaction,
            value = (current ?: spec.min).coerceIn(spec.min, spec.max),
            onValueChange = {
                dragging = true
                onValueChange(formatSliderValue(it, spec.step, field))
            },
            onValueChangeFinished = {
                dragging = false
                val next = sliderSpec(latest, mode, field)
                spec = if (field == DraftField.Reps) next.copy(max = maxOf(spec.max, next.max)) else next
            },
            valueRange = spec.min..spec.max,
            steps = spec.steps,
            thumb = {
                Box(
                    Modifier.size(24.dp).shadow(2.dp, CircleShape)
                        .background(thumbColor, CircleShape).padding(5.dp)
                        .background(activeColor, CircleShape),
                )
            },
            track = { state ->
                Canvas(Modifier.fillMaxWidth().height(5.dp)) {
                    val fraction = ((state.value - state.valueRange.start) /
                        (state.valueRange.endInclusive - state.valueRange.start)).coerceIn(0f, 1f)
                    val radius = CornerRadius(size.height / 2)
                    drawRoundRect(trackColor, cornerRadius = radius)
                    val width = size.width * fraction
                    drawRoundRect(
                        activeColor,
                        topLeft = Offset(if (rtl) size.width - width else 0f, 0f),
                        size = Size(width, size.height),
                        cornerRadius = radius,
                    )
                }
            },
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

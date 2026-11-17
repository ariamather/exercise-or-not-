package com.exerciseornot.app.ui.record

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.ui.common.ErrorText
import kotlinx.coroutines.delay

/** Default recording never opens the keyboard. Drafts are still saved by RecordViewModel. */
@Composable
fun DraftSetRow(
    number: Int,
    input: DraftInput,
    mode: WeightMode,
    previous: String?,
    onWeightChange: (String) -> Unit,
    onRepsChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onSliderInteraction: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    var stepGrams by rememberSaveable(mode) { mutableIntStateOf(if (mode == WeightMode.PER_SIDE) 1000 else 2500) }
    var showSteps by remember { mutableStateOf(false) }
    var lastNumber by remember { mutableIntStateOf(number) }
    var justSaved by remember { mutableStateOf(false) }
    // Empty drafts get visible defaults, written only when the user adjusts or confirms them.
    val weightText = input.weight.ifBlank { "0" }
    val repsText = input.reps.ifBlank { "10" }
    val grams = WeightFormat.parseKgToGrams(weightText) ?: 0
    val reps = repsText.toIntOrNull() ?: 10
    val maxGrams = maxOf(1_000_000, grams)
    val maxReps = maxOf(100, reps)
    val enabled = !input.saving && !justSaved

    LaunchedEffect(number) {
        if (number > lastNumber) {
            lastNumber = number
            justSaved = true
            delay(500)
            justSaved = false
        } else lastNumber = number
    }

    Column(
        modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(17.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("第 $number 组", style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
            previous?.let { Text("上次 $it", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                when (mode) { WeightMode.PER_SIDE -> "单只重量"; WeightMode.BODYWEIGHT -> "附加重量"; WeightMode.TOTAL -> "重量" },
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            Box {
                OutlinedButton(onClick = { showSteps = true }, enabled = enabled, shape = RoundedCornerShape(9.dp)) {
                    Text("± ${WeightFormat.gramsToKgText(stepGrams)} kg ▾", fontSize = 11.sp)
                }
                DropdownMenu(expanded = showSteps, onDismissRequest = { showSteps = false }) {
                    listOf(500, 1000, 2500, 5000).forEach { step ->
                        DropdownMenuItem(
                            text = { Text("± ${WeightFormat.gramsToKgText(step)} kg") },
                            onClick = { stepGrams = step; showSteps = false },
                        )
                    }
                }
            }
        }
        MetricStepper(
            value = weightText, unit = "kg", label = "重量", enabled = enabled,
            canDecrease = grams > 0, canIncrease = grams < maxGrams,
            onDecrease = { onWeightChange(WeightFormat.gramsToKgText((grams - stepGrams).coerceAtLeast(0))) },
            onIncrease = { onWeightChange(WeightFormat.gramsToKgText((grams + stepGrams).coerceAtMost(maxGrams))) },
        )
        ValueSlider(weightText, mode, DraftField.Weight, onWeightChange, enabled = enabled, onInteraction = onSliderInteraction)
        HorizontalDivider(Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.outlineVariant)
        Text("次数", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        MetricStepper(
            value = repsText, unit = "次", label = "次数", enabled = enabled,
            canDecrease = reps > 1, canIncrease = reps < maxReps,
            onDecrease = { onRepsChange((reps - 1).coerceAtLeast(1).toString()) },
            onIncrease = { onRepsChange((reps + 1).coerceAtMost(maxReps).toString()) },
        )
        ValueSlider(repsText, mode, DraftField.Reps, onRepsChange, enabled = enabled, onInteraction = onSliderInteraction)
        input.error?.let { ErrorText(it, Modifier.padding(top = 4.dp)) }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = {
                onWeightChange(weightText)
                onRepsChange(repsText)
                onConfirm()
            },
            enabled = enabled,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(13.dp),
        ) {
            if (input.saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            else Icon(Icons.Filled.Check, null, Modifier.size(18.dp))
            Text(
                if (justSaved) "已记录" else if (input.saving) "正在记录" else "完成这一组",
                modifier = Modifier.padding(start = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}

@Composable
private fun MetricStepper(
    value: String,
    unit: String,
    label: String,
    enabled: Boolean,
    canDecrease: Boolean,
    canIncrease: Boolean,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
) {
    val colors = IconButtonDefaults.filledTonalIconButtonColors(
        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        contentColor = MaterialTheme.colorScheme.primary,
    )
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        FilledTonalIconButton(
            onClick = onDecrease, enabled = enabled && canDecrease, colors = colors,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.size(48.dp).semantics { contentDescription = "减少$label" },
        ) { Text("−", fontSize = 25.sp) }
        Row(
            Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = "$label $value $unit" },
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(value, fontSize = 32.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary)
            Text(unit, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 6.dp, top = 12.dp))
        }
        FilledTonalIconButton(
            onClick = onIncrease, enabled = enabled && canIncrease, colors = colors,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.size(48.dp).semantics { contentDescription = "增加$label" },
        ) { Icon(Icons.Filled.Add, null) }
    }
}

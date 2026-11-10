package com.exerciseornot.app.ui.record

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.exerciseornot.app.data.db.WeightMode

/** The pending set under an exercise's logged sets: edit, then ✓ to log it. */
@Composable
fun DraftSetRow(
    number: Int,
    input: DraftInput,
    mode: WeightMode,
    expandedField: DraftField?,
    onWeightChange: (String) -> Unit,
    onRepsChange: (String) -> Unit,
    onFieldFocused: (DraftField) -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("$number", style = MaterialTheme.typography.titleSmall, modifier = Modifier.width(24.dp))
            OutlinedTextField(
                value = input.weight,
                onValueChange = onWeightChange,
                label = { Text(weightLabel(mode)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f).onFocusChanged { if (it.isFocused) onFieldFocused(DraftField.Weight) },
            )
            OutlinedTextField(
                value = input.reps,
                onValueChange = onRepsChange,
                label = { Text("次数") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f).onFocusChanged { if (it.isFocused) onFieldFocused(DraftField.Reps) },
            )
            FilledIconButton(onClick = onConfirm, enabled = !input.saving, modifier = Modifier.size(48.dp)) {
                if (input.saving) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.Check, contentDescription = "确认第 $number 组")
                }
            }
        }
        input.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        expandedField?.let { field ->
            ValueSlider(
                text = if (field == DraftField.Weight) input.weight else input.reps,
                mode = mode,
                field = field,
                onValueChange = if (field == DraftField.Weight) onWeightChange else onRepsChange,
                modifier = Modifier.padding(start = 32.dp, top = 4.dp),
            )
        }
    }
}

private fun weightLabel(mode: WeightMode) = when (mode) {
    WeightMode.TOTAL -> "重量 kg"
    WeightMode.PER_SIDE -> "单只 kg"
    WeightMode.BODYWEIGHT -> "附加 kg"
}

package com.exerciseornot.app.ui.record

import kotlinx.coroutines.flow.collectLatest
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.runtime.snapshotFlow
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.text.KeyboardActions
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.ui.common.ErrorText
import kotlinx.coroutines.delay

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
    val bringIntoView = remember { BringIntoViewRequester() }
    val repsFocus = remember { FocusRequester() }
    val density = LocalDensity.current
    val imeBottom = WindowInsets.ime
    // Keep the whole row (fields, ✓ and slider) on screen; re-run once the keyboard animation settles.
    LaunchedEffect(expandedField, input.error) {
        if (expandedField != null) {
            snapshotFlow { imeBottom.getBottom(density) }.collectLatest {
                delay(120)
                bringIntoView.bringIntoView()
            }
        }
    }
    Column(modifier.fillMaxWidth().bringIntoViewRequester(bringIntoView)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("$number", style = MaterialTheme.typography.titleSmall, modifier = Modifier.widthIn(min = 24.dp))
            OutlinedTextField(
                value = input.weight,
                onValueChange = onWeightChange,
                label = { Text(weightLabel(mode)) },
                suffix = { Text("kg") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { repsFocus.requestFocus() }),
                // Wider than reps: it carries the kg suffix and decimals.
                modifier = Modifier.weight(1.4f).onFocusChanged { if (it.isFocused) onFieldFocused(DraftField.Weight) },
            )
            OutlinedTextField(
                value = input.reps,
                onValueChange = onRepsChange,
                label = { Text("次数") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onConfirm() }),
                modifier = Modifier.weight(1f).focusRequester(repsFocus).onFocusChanged { if (it.isFocused) onFieldFocused(DraftField.Reps) },
            )
            FilledIconButton(onClick = onConfirm, enabled = !input.saving, modifier = Modifier.size(48.dp)) {
                if (input.saving) {
                    CircularProgressIndicator(
                        Modifier.size(20.dp).semantics { contentDescription = "正在保存" },
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(Icons.Filled.Check, contentDescription = "确认第 $number 组")
                }
            }
        }
        input.error?.let {
            ErrorText(it, Modifier.padding(start = 32.dp, top = 4.dp))
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
    WeightMode.TOTAL -> "重量"
    WeightMode.PER_SIDE -> "单只"
    WeightMode.BODYWEIGHT -> "附加"
}

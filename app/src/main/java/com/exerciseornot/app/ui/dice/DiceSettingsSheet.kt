package com.exerciseornot.app.ui.dice

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.exerciseornot.app.dice.DICE_FACES
import com.exerciseornot.app.dice.trainProbabilityText

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiceSettingsSheet(faces: Set<Int>, onToggle: (Int) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 32.dp)) {
            Text("骰子点数", style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
            Text("选择掷出哪些点数时去练", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 12.dp))
            DICE_FACES.chunked(3).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { face ->
                        FilterChip(
                            selected = face in faces,
                            onClick = { onToggle(face) },
                            label = { Text("$face 点") },
                            leadingIcon = { DieFace(face, 20.dp) },
                            modifier = Modifier.weight(1f).padding(vertical = 4.dp),
                        )
                    }
                }
            }
            val count = faces.count { it in DICE_FACES }
            Text(
                "练的概率 $count/6 = ${trainProbabilityText(faces)}",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(top = 12.dp),
            )
            Text("改动只影响下一次掷骰，不改变今天已掷出的结果", style = MaterialTheme.typography.bodySmall)
        }
    }
}

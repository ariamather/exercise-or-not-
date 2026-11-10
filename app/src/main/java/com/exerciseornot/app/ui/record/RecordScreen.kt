package com.exerciseornot.app.ui.record

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WorkoutExerciseWithSets
import com.exerciseornot.app.ui.displayText

@Composable
fun RecordScreen(viewModel: RecordViewModel, modifier: Modifier = Modifier) {
    val workout by viewModel.todayWorkout.collectAsStateWithLifecycle()
    val name = viewModel.exerciseName
    val weight = viewModel.weightKg
    val reps = viewModel.reps
    val ui by viewModel.ui.collectAsStateWithLifecycle()

    Column(modifier.fillMaxSize().imePadding().padding(16.dp)) {
        OutlinedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("今天练不练？", style = MaterialTheme.typography.titleMedium)
                Text("骰子功能将在后续阶段提供", style = MaterialTheme.typography.bodySmall)
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("训练日期：${viewModel.today}", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))

        val exercises = workout?.exercises.orEmpty().sortedBy { it.workoutExercise.position }
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (exercises.isEmpty()) {
                item { Text("今天还没有记录。填写下方动作、重量和次数，点 ✓ 记录一组。") }
            }
            items(exercises, key = { it.workoutExercise.id }) { ExerciseCard(it) }
        }

        ui.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 4.dp))
        }

        OutlinedTextField(
            value = name,
            onValueChange = viewModel::onExerciseNameChange,
            label = { Text("动作") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) {
            OutlinedTextField(
                value = weight,
                onValueChange = viewModel::onWeightChange,
                label = { Text("重量 kg") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = reps,
                onValueChange = viewModel::onRepsChange,
                label = { Text("次数") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f),
            )
            FilledIconButton(
                onClick = viewModel::confirmSet,
                enabled = !ui.saving,
                modifier = Modifier.size(56.dp),
            ) {
                if (ui.saving) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.Check, contentDescription = "确认这一组")
                }
            }
        }
    }
}

@Composable
private fun ExerciseCard(item: WorkoutExerciseWithSets) {
    val sets = item.sets.filter { it.status == SetStatus.LOGGED }.sortedBy { it.position }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(item.workoutExercise.nameSnapshot, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            TableRow("组次", "上次", "本次", header = true)
            HorizontalDivider()
            sets.forEachIndexed { index, set ->
                TableRow("${index + 1}", "—", set.displayText())
            }
        }
    }
}

@Composable
private fun TableRow(a: String, b: String, c: String, header: Boolean = false) {
    val style = if (header) MaterialTheme.typography.labelMedium else MaterialTheme.typography.bodyMedium
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(a, style = style, modifier = Modifier.weight(0.6f))
        Text(b, style = style, modifier = Modifier.weight(1.5f))
        Text(c, style = style, modifier = Modifier.weight(1.5f))
    }
}

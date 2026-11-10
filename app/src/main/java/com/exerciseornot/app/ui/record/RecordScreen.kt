package com.exerciseornot.app.ui.record

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.collectLatest
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.model.ExerciseItem
import com.exerciseornot.app.ui.displayText
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val shortDate = DateTimeFormatter.ofPattern("MM-dd")

private enum class DateDialog { ChangeDate, NewRecord }

@Composable
fun RecordScreen(
    viewModel: RecordViewModel,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier,
) {
    val target by viewModel.target.collectAsStateWithLifecycle()
    val detail by viewModel.detail.collectAsStateWithLifecycle()
    val resume by viewModel.resumeCandidate.collectAsStateWithLifecycle()
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    var dateDialog by rememberSaveable { mutableStateOf<DateDialog?>(null) }

    LaunchedEffect(viewModel) {
        viewModel.deletions.collectLatest { snapshot ->
            val result = snackbarHostState.showSnackbar("已删除", actionLabel = "撤销", duration = SnackbarDuration.Long)
            if (result == SnackbarResult.ActionPerformed) viewModel.undo(snapshot)
        }
    }

    val trainingDate: LocalDate? = when (val t = target) {
        is WorkoutTarget.New -> t.date
        is WorkoutTarget.Existing -> detail?.trainingDate
        null -> null
    }

    Column(modifier.fillMaxSize().imePadding().padding(16.dp)) {
        OutlinedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("今天练不练？", style = MaterialTheme.typography.titleMedium)
                Text("骰子功能将在后续阶段提供", style = MaterialTheme.typography.bodySmall)
            }
        }

        resume?.let { w ->
            Card(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(start = 16.dp, end = 8.dp),
                ) {
                    Text(
                        "上次训练 ${LocalDate.parse(w.trainingDate).format(shortDate)}",
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { viewModel.continueWorkout(w.id) }) { Text("继续那次") }
                }
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) {
            Text(
                "训练日期：${trainingDate ?: ""}" + if (target is WorkoutTarget.New) "（新记录）" else "",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f).clickable(enabled = trainingDate != null) {
                    dateDialog = DateDialog.ChangeDate
                },
            )
            OutlinedButton(onClick = { dateDialog = DateDialog.NewRecord }) { Text("新建记录") }
        }
        Spacer(Modifier.height(8.dp))

        val items = detail?.loggedItems.orEmpty()
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (items.isEmpty()) {
                item { Text("这次还没有记录。填写下方动作、重量和次数，点 ✓ 记录一组。") }
            }
            items(items, key = { it.workoutExercise.id }) { item ->
                ExerciseCard(item, onSetClick = { viewModel.startEditing(it, item.workoutExercise.weightModeSnapshot) })
            }
        }

        ui.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 4.dp))
        }

        OutlinedTextField(
            value = viewModel.exerciseName,
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
                value = viewModel.weightKg,
                onValueChange = viewModel::onWeightChange,
                label = { Text("重量 kg") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = viewModel.reps,
                onValueChange = viewModel::onRepsChange,
                label = { Text("次数") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f),
            )
            FilledIconButton(
                onClick = viewModel::confirmSet,
                enabled = !ui.saving && target != null,
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

    viewModel.editing?.let { state ->
        EditSetDialog(
            state = state,
            onWeightChange = viewModel::onEditWeightChange,
            onRepsChange = viewModel::onEditRepsChange,
            onSave = viewModel::saveEditing,
            onDelete = viewModel::deleteEditing,
            onDismiss = viewModel::dismissEditing,
        )
    }

    dateDialog?.let { kind ->
        val today = viewModel.today()
        TrainingDatePickerDialog(
            initial = if (kind == DateDialog.ChangeDate) trainingDate ?: today else today,
            today = today,
            confirmText = if (kind == DateDialog.ChangeDate) "修改日期" else "新建",
            onConfirm = { date ->
                if (kind == DateDialog.ChangeDate) viewModel.changeDate(date) else viewModel.startNewRecord(date)
                dateDialog = null
            },
            onDismiss = { dateDialog = null },
        )
    }
}

@Composable
private fun ExerciseCard(item: ExerciseItem, onSetClick: (SetEntryEntity) -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            val suffix = if (item.workoutExercise.weightModeSnapshot == WeightMode.BODYWEIGHT) "（自重）" else ""
            Text(item.workoutExercise.nameSnapshot + suffix, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            TableRow("组次", "上次", "本次", header = true)
            HorizontalDivider()
            item.logged.forEachIndexed { index, set ->
                TableRow("${index + 1}", "—", set.displayText(), Modifier.clickable { onSetClick(set) })
            }
        }
    }
}

@Composable
private fun TableRow(a: String, b: String, c: String, modifier: Modifier = Modifier, header: Boolean = false) {
    val style = if (header) MaterialTheme.typography.labelMedium else MaterialTheme.typography.bodyMedium
    Row(modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(a, style = style, modifier = Modifier.weight(0.6f))
        Text(b, style = style, modifier = Modifier.weight(1.5f))
        Text(c, style = style, modifier = Modifier.weight(1.5f))
    }
}

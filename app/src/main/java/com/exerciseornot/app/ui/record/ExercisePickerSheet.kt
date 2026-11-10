package com.exerciseornot.app.ui.record

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.exerciseornot.app.data.db.ExerciseEntity
import com.exerciseornot.app.data.db.ExerciseWithLastUsed
import com.exerciseornot.app.data.db.WeightMode

/**
 * Pick an exercise for this workout, create one, or rename/archive existing ones.
 * [inWorkout] maps exercise id → workoutExerciseId for exercises already added.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExercisePickerSheet(
    exercises: List<ExerciseWithLastUsed>,
    inWorkout: Map<String, String>,
    error: String?,
    onPick: (ExerciseEntity) -> Unit,
    onCreate: (name: String, mode: WeightMode) -> Unit,
    onRename: (ExerciseEntity, String, onDone: () -> Unit) -> Unit,
    onArchive: (ExerciseEntity) -> Unit,
    onClearError: () -> Unit,
    onDismiss: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var creating by rememberSaveable { mutableStateOf<String?>(null) }
    var renaming by remember { mutableStateOf<ExerciseEntity?>(null) }

    val q = query.trim()
    val filtered = exercises.filter { q.isEmpty() || it.exercise.name.contains(q, ignoreCase = true) }
    val recent = filtered.filter { it.lastUsedAt != null }
    val others = filtered.filter { it.lastUsedAt == null }
    val exactMatch = exercises.any { it.exercise.name.equals(q, ignoreCase = true) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 16.dp).imePadding()) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it; onClearError() },
                label = { Text("搜索或新建动作") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (error != null && creating == null && renaming == null) {
                Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 4.dp))
            }
            LazyColumn(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 16.dp)) {
                if (exercises.isEmpty() && q.isEmpty()) {
                    item { Text("还没有动作，输入名称新建", modifier = Modifier.padding(vertical = 12.dp)) }
                }
                if (recent.isNotEmpty()) {
                    item { SectionLabel("最近使用") }
                    items(recent, key = { it.exercise.id }) { e ->
                        PickerRow(e.exercise, e.exercise.id in inWorkout, onPick, { renaming = it }, onArchive)
                    }
                }
                if (others.isNotEmpty()) {
                    item { SectionLabel(if (recent.isEmpty()) "全部动作" else "其他") }
                    items(others, key = { it.exercise.id }) { e ->
                        PickerRow(e.exercise, e.exercise.id in inWorkout, onPick, { renaming = it }, onArchive)
                    }
                }
                if (q.isNotEmpty() && !exactMatch) {
                    item {
                        TextButton(onClick = { creating = q; onClearError() }) { Text("新建「$q」") }
                    }
                }
            }
        }
    }

    creating?.let { name ->
        CreateExerciseDialog(
            name = name,
            error = error,
            onConfirm = { mode -> onCreate(name, mode) },
            onDismiss = { creating = null; onClearError() },
        )
    }

    renaming?.let { exercise ->
        RenameDialog(
            exercise = exercise,
            error = error,
            onConfirm = { newName -> onRename(exercise, newName) { renaming = null } },
            onDismiss = { renaming = null; onClearError() },
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
    )
}

@Composable
private fun PickerRow(
    exercise: ExerciseEntity,
    added: Boolean,
    onPick: (ExerciseEntity) -> Unit,
    onRename: (ExerciseEntity) -> Unit,
    onArchive: (ExerciseEntity) -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().clickable { onPick(exercise) }.padding(start = 4.dp),
    ) {
        Column(Modifier.weight(1f).padding(vertical = 10.dp)) {
            Text(exercise.name, style = MaterialTheme.typography.bodyLarge)
            Text(
                modeLabel(exercise.weightMode) + if (added) " · 已添加" else "",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Box {
            IconButton(onClick = { menu = true }) {
                Icon(Icons.Filled.MoreVert, contentDescription = "管理 ${exercise.name}")
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("改名") }, onClick = { menu = false; onRename(exercise) })
                DropdownMenuItem(text = { Text("归档") }, onClick = { menu = false; onArchive(exercise) })
            }
        }
    }
}

@Composable
private fun CreateExerciseDialog(name: String, error: String?, onConfirm: (WeightMode) -> Unit, onDismiss: () -> Unit) {
    var mode by rememberSaveable { mutableStateOf(WeightMode.TOTAL) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("新建「$name」") },
        text = {
            Column {
                Text("重量怎么记？之后有记录就不能再改。", style = MaterialTheme.typography.bodySmall)
                WeightMode.entries.forEach { m ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                            .selectable(selected = mode == m, role = Role.RadioButton, onClick = { mode = m }),
                    ) {
                        RadioButton(selected = mode == m, onClick = null)
                        Text(modeDescription(m), modifier = Modifier.padding(start = 8.dp, top = 12.dp, bottom = 12.dp))
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(mode) }) { Text("新建") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun RenameDialog(exercise: ExerciseEntity, error: String?, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var name by rememberSaveable(exercise.id) { mutableStateOf(exercise.name) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("改名") },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it }, singleLine = true, label = { Text("动作名称") })
                Text("历史记录里保留原来的名称。", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(name) }) { Text("保存") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

internal fun modeLabel(mode: WeightMode) = when (mode) {
    WeightMode.TOTAL -> "总重"
    WeightMode.PER_SIDE -> "单只"
    WeightMode.BODYWEIGHT -> "自重"
}

private fun modeDescription(mode: WeightMode) = when (mode) {
    WeightMode.TOTAL -> "总重（杠铃、器械）"
    WeightMode.PER_SIDE -> "单只（哑铃，记一只的重量）"
    WeightMode.BODYWEIGHT -> "自重（可填附加重量）"
}

package com.exerciseornot.app.ui.history

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exerciseornot.app.data.model.WorkoutDetail
import com.exerciseornot.app.ui.common.HintText
import com.exerciseornot.app.ui.common.ScreenHeader
import com.exerciseornot.app.ui.compactSetText
import com.exerciseornot.app.ui.hints.Hint
import com.exerciseornot.app.ui.hints.HintCard
import com.exerciseornot.app.ui.hints.HintsViewModel
import com.exerciseornot.app.ui.dayLabel
import kotlinx.coroutines.flow.collectLatest
import java.time.LocalDate

@Composable
fun HistoryScreen(
    viewModel: HistoryViewModel,
    hintsViewModel: HintsViewModel,
    snackbarHostState: SnackbarHostState,
    onOpenRecord: () -> Unit,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val workouts by viewModel.workouts.collectAsStateWithLifecycle()
    val showBackupHint by hintsViewModel.showBackup.collectAsStateWithLifecycle()

    LaunchedEffect(viewModel) {
        viewModel.deletions.collectLatest { snapshot ->
            val result = snackbarHostState.showSnackbar("已删除这次训练", actionLabel = "撤销", duration = SnackbarDuration.Long)
            if (result == SnackbarResult.ActionPerformed) viewModel.undo(snapshot)
        }
    }
    LaunchedEffect(viewModel) {
        viewModel.messages.collect { snackbarHostState.showSnackbar(it) }
    }
    LaunchedEffect(viewModel) {
        viewModel.openRecord.collect { onOpenRecord() }
    }

    // The header (and its settings entry) also shows with no history, so a fresh install can restore a backup.
    val today = viewModel.today
    Column(modifier.fillMaxSize()) {
        ScreenHeader("历史") {
            IconButton(onClick = onOpenSettings) { Icon(Icons.Filled.Settings, contentDescription = "设置与备份") }
        }
        if (workouts.isEmpty()) {
            Column(Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
                Text("还没有训练记录", style = MaterialTheme.typography.bodyLarge)
                HintText("换了手机？可以在右上角设置里从备份恢复。", Modifier.padding(top = 4.dp))
            }
            return@Column
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
        if (showBackupHint) {
            item(key = "hint.backup") {
                HintCard(
                    "记录只保存在这台手机上，建议到右上角设置里导出一份备份。",
                    onDismiss = { hintsViewModel.dismiss(Hint.Backup) },
                )
            }
        }
        item(key = "hint.open") { HintText("点一次训练可继续记录或修改") }
        items(workouts, key = { it.workout.id }) { w ->
            WorkoutCard(
                item = w,
                today = today,
                onOpen = { viewModel.open(w.workout.id) },
                onReuse = { viewModel.reuse(w.workout.id) },
                onDelete = { viewModel.deleteWorkout(w.workout.id) },
            )
        }
        }
    }
}

@Composable
private fun WorkoutCard(
    item: WorkoutDetail,
    today: LocalDate,
    onOpen: () -> Unit,
    onReuse: () -> Unit,
    onDelete: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    val dateLabel = item.trainingDate.dayLabel(today)

    Card(Modifier.fillMaxWidth().clickable(onClickLabel = "打开 $dateLabel 的训练", onClick = onOpen)) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, bottom = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).padding(top = 12.dp)) {
                    Text(dateLabel, style = MaterialTheme.typography.titleMedium)
                    if (item.hasLogged) {
                        HintText("${item.loggedItems.size} 个动作 · ${item.loggedSetCount} 组")
                    } else {
                        Text(
                            "未确认 · 只有待确认的组",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                    }
                }
                Box {
                    IconButton(onClick = { menu = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "$dateLabel 的更多操作")
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (item.hasLogged) {
                            DropdownMenuItem(text = { Text("复用到今天") }, onClick = { menu = false; onReuse() })
                        }
                        DropdownMenuItem(text = { Text("删除") }, onClick = { menu = false; onDelete() })
                    }
                }
            }
            item.loggedItems.forEach { e ->
                Text(
                    e.workoutExercise.nameSnapshot + "  " +
                        e.logged.joinToString("、") { compactSetText(it.weightGrams, it.reps) },
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 6.dp, end = 12.dp),
                )
            }
        }
    }
}

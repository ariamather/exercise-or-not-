package com.exerciseornot.app.ui.record

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.model.ExerciseItem
import com.exerciseornot.app.ui.dice.DiceCard
import com.exerciseornot.app.ui.dice.DiceViewModel
import com.exerciseornot.app.ui.common.ErrorText
import com.exerciseornot.app.ui.displayText
import com.exerciseornot.app.ui.hints.Hint
import com.exerciseornot.app.ui.hints.HintCard
import com.exerciseornot.app.ui.hints.HintsViewModel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val shortDate = DateTimeFormatter.ofPattern("MM-dd")

private enum class DateDialog { ChangeDate, NewRecord }

@Composable
fun RecordScreen(
    viewModel: RecordViewModel,
    diceViewModel: DiceViewModel,
    hintsViewModel: HintsViewModel,
    snackbarHostState: SnackbarHostState,
    onOpenHistory: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val target by viewModel.target.collectAsStateWithLifecycle()
    val detail by viewModel.detail.collectAsStateWithLifecycle()
    val previous by viewModel.previous.collectAsStateWithLifecycle()
    val resume by viewModel.resumeCandidate.collectAsStateWithLifecycle()
    val pickerList by viewModel.pickerList.collectAsStateWithLifecycle()
    val exerciseHistory by viewModel.exerciseHistory.collectAsStateWithLifecycle()
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val showDiceHint by hintsViewModel.showDice.collectAsStateWithLifecycle()
    val showRecordHint by hintsViewModel.showRecord.collectAsStateWithLifecycle()
    var dateDialog by rememberSaveable { mutableStateOf<DateDialog?>(null) }
    var showPicker by rememberSaveable { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { viewModel.flushDrafts() }

    LaunchedEffect(viewModel) {
        viewModel.deletions.collectLatest { snapshot ->
            val result = snackbarHostState.showSnackbar("已删除", actionLabel = "撤销", duration = SnackbarDuration.Long)
            if (result == SnackbarResult.ActionPerformed) viewModel.undo(snapshot)
        }
    }
    LaunchedEffect(viewModel) {
        viewModel.notices.collect { snackbarHostState.showSnackbar(it) }
    }

    val items = detail?.items.orEmpty()

    val trainingDate: LocalDate? = when (val t = target) {
        is WorkoutTarget.New -> t.date
        is WorkoutTarget.Existing -> detail?.trainingDate
        null -> null
    }
    val editingPast = target is WorkoutTarget.Existing && trainingDate != null && trainingDate != viewModel.today()
    // Must match the header items emitted above the exercise cards below.
    val headerCount = listOf(true, showDiceHint, resume != null, editingPast, true, ui.error != null, showRecordHint).count { it }
    val currentHeaderCount by rememberUpdatedState(headerCount)

    LaunchedEffect(viewModel) {
        viewModel.scrollTo.collect { weId ->
            // The event can beat the Room flow; wait until the card is actually in the list.
            val d = withTimeoutOrNull(2_000) {
                viewModel.detail.first { d -> d?.items?.any { it.workoutExercise.id == weId } == true }
            }
            val index = d?.items?.indexOfFirst { it.workoutExercise.id == weId } ?: return@collect
            listState.animateScrollToItem(currentHeaderCount + index)
        }
    }


    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().imePadding(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
            item(key = KEY_DICE) { DiceCard(diceViewModel) }
            if (showDiceHint) {
                item(key = KEY_DICE_HINT) {
                    HintCard(
                        "点齿轮选哪些点数算“练”，概率完全按你的设置。只是帮你拿主意，想练随时可以直接记录。",
                        onDismiss = { hintsViewModel.dismiss(Hint.Dice) },
                    )
                }
            }
            resume?.let { w ->
                item(key = KEY_RESUME) {
                    BannerCard(
                        text = "上次训练 ${LocalDate.parse(w.trainingDate).format(shortDate)}",
                        action = "继续那次",
                        onAction = { viewModel.continueWorkout(w.id) },
                    )
                }
            }
            if (editingPast && trainingDate != null) {
                item(key = KEY_EDITING_PAST) {
                    BannerCard(
                        text = "正在编辑 ${trainingDate.format(shortDate)} 的训练",
                        action = "回到今天",
                        onAction = viewModel::backToToday,
                    )
                }
            }
            item(key = KEY_DATE) {
                DateRow(
                    trainingDate = trainingDate,
                    isNew = target is WorkoutTarget.New,
                    onChangeDate = { dateDialog = DateDialog.ChangeDate },
                    onNewRecord = { dateDialog = DateDialog.NewRecord },
                )
            }
            ui.error?.let { message ->
                item(key = KEY_ERROR) { ErrorBanner(message, onDismiss = viewModel::dismissError) }
            }
            if (showRecordHint) {
                item(key = KEY_RECORD_HINT) {
                    HintCard(
                        "每组填好重量和次数，点 ✓ 才算完成；没点 ✓ 的是待确认，不算进训练。下次做同一个动作时，这里会显示上次的成绩。",
                        onDismiss = { hintsViewModel.dismiss(Hint.Record) },
                    )
                }
            }
            items(items, key = { it.workoutExercise.id }) { item ->
                ExerciseCard(
                    item = item,
                    previous = previous[item.workoutExercise.id].orEmpty(),
                    viewModel = viewModel,
                )
            }
            item(key = "add") {
                Column(Modifier.fillMaxWidth()) {
                    if (items.isEmpty()) {
                        Text("添加一个动作开始记录。", modifier = Modifier.padding(bottom = 8.dp))
                    }
                    Button(
                        onClick = { viewModel.flushDrafts(); showPicker = true },
                        enabled = target != null,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = null)
                        Text("添加动作", modifier = Modifier.padding(start = 4.dp))
                    }
                    if (items.isEmpty()) {
                        TextButton(onClick = onOpenHistory, modifier = Modifier.fillMaxWidth()) {
                            Text("从历史复用一次训练")
                        }
                    }
                }
            }
    }

    viewModel.historyExerciseId.collectAsStateWithLifecycle().value?.let { exerciseId ->
        val name = items.firstOrNull { it.workoutExercise.exerciseId == exerciseId }?.workoutExercise?.nameSnapshot.orEmpty()
        ExerciseHistorySheet(
            title = name,
            sessions = exerciseHistory,
            currentWorkoutId = detail?.workout?.id,
            today = viewModel.today(),
            onDismiss = viewModel::hideHistory,
        )
    }

    if (showPicker) {
        val inWorkout = items.associate { it.workoutExercise.exerciseId to it.workoutExercise.id }
        ExercisePickerSheet(
            exercises = pickerList,
            inWorkout = inWorkout,
            error = viewModel.pickerError,
            onPick = { exercise ->
                showPicker = false
                viewModel.addExercise(exercise.id)
            },
            onCreate = { name, mode -> viewModel.createAndAddExercise(name, mode) { showPicker = false } },
            onRename = { exercise, name, onDone -> viewModel.renameExercise(exercise.id, name, onDone) },
            onArchive = { viewModel.archiveExercise(it.id) },
            onClearError = viewModel::clearPickerError,
            onDismiss = { showPicker = false; viewModel.clearPickerError() },
        )
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
private fun ExerciseCard(item: ExerciseItem, previous: List<SetEntryEntity>, viewModel: RecordViewModel) {
    val we = item.workoutExercise
    val mode = we.weightModeSnapshot
    var menu by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, bottom = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val suffix = when (mode) {
                    WeightMode.BODYWEIGHT -> "（自重）"
                    WeightMode.PER_SIDE -> "（单只）"
                    WeightMode.TOTAL -> ""
                }
                Text(
                    we.nameSnapshot + suffix,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier
                        .weight(1f)
                        .clickable(onClickLabel = "查看 ${we.nameSnapshot} 的历史") { viewModel.showHistory(we.exerciseId) }
                        .padding(vertical = 12.dp),
                )
                Box {
                    IconButton(onClick = { menu = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "${we.nameSnapshot} 的更多操作")
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(
                            text = { Text("移除动作") },
                            onClick = { menu = false; viewModel.removeExercise(we.id) },
                        )
                    }
                }
            }
            val rows = maxOf(item.logged.size, previous.size)
            if (rows > 0) {
                TableRow("组次", "上次", "本次", header = true)
                HorizontalDivider()
            }
            for (i in 0 until rows) {
                val set = item.logged.getOrNull(i)
                TableRow(
                    "${i + 1}",
                    previous.getOrNull(i)?.displayText() ?: "—",
                    set?.displayText() ?: "",
                    if (set != null) {
                        Modifier.heightIn(min = 48.dp).clickable(onClickLabel = "修改第 ${i + 1} 组") { viewModel.startEditing(set, mode) }
                    } else Modifier,
                )
            }
            item.draft?.let { draft ->
                val input = viewModel.draftInputs[draft.id]
                if (input != null) {
                    Spacer(Modifier.height(8.dp))
                    DraftSetRow(
                        number = item.logged.size + 1,
                        input = input,
                        mode = mode,
                        expandedField = viewModel.expanded?.takeIf { it.first == draft.id }?.second,
                        onWeightChange = { viewModel.onDraftWeightChange(draft.id, it) },
                        onRepsChange = { viewModel.onDraftRepsChange(draft.id, it) },
                        onFieldFocused = { viewModel.expandSlider(draft.id, it) },
                        onConfirm = { viewModel.confirm(draft.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun BannerCard(text: String, action: String, onAction: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        FlowRow(
            verticalArrangement = Arrangement.Center,
            itemVerticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
        ) {
            Text(text, modifier = Modifier.weight(1f).padding(vertical = 8.dp))
            TextButton(onClick = onAction) { Text(action) }
        }
    }
}

@Composable
private fun DateRow(trainingDate: LocalDate?, isNew: Boolean, onChangeDate: () -> Unit, onNewRecord: () -> Unit) {
    FlowRow(
        itemVerticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 48.dp)
                .clickable(enabled = trainingDate != null, onClickLabel = "修改训练日期", onClick = onChangeDate),
        ) {
            Text(
                "训练日期：${trainingDate ?: ""}" + if (isNew) "（新记录）" else "",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f, fill = false),
            )
            Icon(
                Icons.Filled.DateRange,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(start = 6.dp).size(18.dp),
            )
        }
        OutlinedButton(onClick = onNewRecord) { Text("新建记录") }
    }
}

@Composable
private fun ErrorBanner(message: String, onDismiss: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().clickable(onClickLabel = "关闭提示", onClick = onDismiss),
    ) {
        ErrorText(message, Modifier.weight(1f).padding(vertical = 8.dp))
        Icon(
            Icons.Filled.Close,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(12.dp).size(20.dp),
        )
    }
}

private const val KEY_DICE = "header.dice"
private const val KEY_DICE_HINT = "header.diceHint"
private const val KEY_RESUME = "header.resume"
private const val KEY_EDITING_PAST = "header.editingPast"
private const val KEY_DATE = "header.date"
private const val KEY_ERROR = "header.error"
private const val KEY_RECORD_HINT = "header.recordHint"

@Composable
private fun TableRow(a: String, b: String, c: String, modifier: Modifier = Modifier, header: Boolean = false) {
    val style = if (header) MaterialTheme.typography.labelMedium else MaterialTheme.typography.bodyMedium
    Row(modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(a, style = style, modifier = Modifier.weight(0.6f))
        Text(b, style = style, modifier = Modifier.weight(1.5f))
        Text(c, style = style, modifier = Modifier.weight(1.5f))
    }
}

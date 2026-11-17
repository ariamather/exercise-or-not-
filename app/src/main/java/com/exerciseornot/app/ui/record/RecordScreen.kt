package com.exerciseornot.app.ui.record

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.model.ExerciseItem
import com.exerciseornot.app.ui.common.BrandHeader
import com.exerciseornot.app.ui.common.ErrorText
import com.exerciseornot.app.ui.displayText
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val shortDate = DateTimeFormatter.ofPattern("MM-dd")
private val recordDate = DateTimeFormatter.ofPattern("M 月 d 日 · E", Locale.CHINA)
private enum class DateDialog { ChangeDate, NewRecord }

@Composable
fun RecordScreen(
    viewModel: RecordViewModel,
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
    var dateDialog by rememberSaveable { mutableStateOf<DateDialog?>(null) }
    var showPicker by rememberSaveable { mutableStateOf(false) }
    var sliderActive by remember { mutableStateOf(false) }
    val scrollState = rememberScrollState()
    val items = detail?.items.orEmpty()
    val currentItems by rememberUpdatedState(items)
    val pager = rememberPagerState(pageCount = { items.size })
    val scope = rememberCoroutineScope()

    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { viewModel.flushDrafts() }
    DisposableEffect(viewModel) { onDispose { viewModel.flushDrafts() } }
    LaunchedEffect(viewModel) {
        viewModel.deletions.collectLatest { snapshot ->
            val result = snackbarHostState.showSnackbar("已删除", actionLabel = "撤销", duration = SnackbarDuration.Long)
            if (result == SnackbarResult.ActionPerformed) viewModel.undo(snapshot)
        }
    }
    LaunchedEffect(viewModel) {
        viewModel.notices.collect { snackbarHostState.showSnackbar(it) }
    }
    LaunchedEffect(viewModel) {
        viewModel.scrollTo.collect { weId ->
            // Wait for the Room result to reach Compose before selecting the added/existing card.
            val index = withTimeoutOrNull(2_000) {
                snapshotFlow { currentItems.indexOfFirst { it.workoutExercise.id == weId } }.first { it >= 0 }
            } ?: return@collect
            pager.scrollToPage(index)
            scrollState.animateScrollTo(0)
        }
    }
    val workoutId = detail?.workout?.id
    var shownWorkoutId by rememberSaveable { mutableStateOf(workoutId) }
    LaunchedEffect(workoutId) {
        if (workoutId != null) {
            if (shownWorkoutId != null && shownWorkoutId != workoutId && items.isNotEmpty()) pager.scrollToPage(0)
            shownWorkoutId = workoutId
        }
    }

    val trainingDate: LocalDate? = when (val t = target) {
        is WorkoutTarget.New -> t.date
        is WorkoutTarget.Existing -> detail?.trainingDate
        null -> null
    }
    val editingPast = target is WorkoutTarget.Existing && trainingDate != null && trainingDate != viewModel.today()

    Column(modifier.fillMaxSize().imePadding()) {
        BrandHeader()
        Column(
            Modifier.weight(1f).verticalScroll(scrollState).padding(start = 24.dp, end = 24.dp, top = 18.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (editingPast) "这次的记录." else "今天的记录.",
                    fontSize = 28.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                TextButton(onClick = onOpenHistory) { Text("历史 ↗", fontSize = 12.sp) }
            }
            DateRow(
                trainingDate = trainingDate,
                setCount = detail?.loggedSetCount ?: 0,
                onChangeDate = { dateDialog = DateDialog.ChangeDate },
                onNewRecord = { dateDialog = DateDialog.NewRecord },
            )
            resume?.let { w ->
                BannerCard(
                    text = "上次训练 ${LocalDate.parse(w.trainingDate).format(shortDate)}",
                    action = "继续那次", onAction = { viewModel.continueWorkout(w.id) },
                )
            }
            if (editingPast) {
                BannerCard("${trainingDate.format(shortDate)} 的训练", "回到今天", viewModel::backToToday)
            }
            ui.error?.let { ErrorBanner(it, onDismiss = viewModel::dismissError) }
            if (items.isNotEmpty()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = { scope.launch { pager.animateScrollToPage(pager.currentPage - 1) } },
                        enabled = pager.currentPage > 0 && !pager.isScrollInProgress,
                    ) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "上一个动作", Modifier.size(20.dp)) }
                    Text(
                        "${pager.currentPage + 1} / ${items.size}",
                        fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                    IconButton(
                        onClick = { scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
                        enabled = pager.currentPage < items.lastIndex && !pager.isScrollInProgress,
                    ) { Icon(Icons.AutoMirrored.Filled.ArrowForward, "下一个动作", Modifier.size(20.dp)) }
                }
                HorizontalPager(
                    state = pager,
                    key = { items[it].workoutExercise.id },
                    pageSpacing = 16.dp,
                    verticalAlignment = Alignment.Top,
                    userScrollEnabled = !sliderActive,
                    modifier = Modifier.fillMaxWidth(),
                ) { index ->
                    val item = items[index]
                    ExerciseCard(
                        item, previous[item.workoutExercise.id].orEmpty(), viewModel,
                        onSliderInteraction = { sliderActive = it },
                    )
                }
            }
            OutlinedButton(
                onClick = { viewModel.flushDrafts(); showPicker = true },
                enabled = target != null,
                modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp),
                shape = RoundedCornerShape(18.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Icon(Icons.Filled.Add, null, Modifier.size(20.dp))
                Text("添加动作", modifier = Modifier.padding(start = 8.dp))
            }
            if (items.isEmpty()) {
                TextButton(onClick = onOpenHistory, modifier = Modifier.fillMaxWidth()) { Text("从历史复用", fontSize = 12.sp) }
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
private fun ExerciseCard(
    item: ExerciseItem,
    previous: List<SetEntryEntity>,
    viewModel: RecordViewModel,
    onSliderInteraction: (Boolean) -> Unit,
) {
    val we = item.workoutExercise
    val mode = we.weightModeSnapshot
    var menu by remember { mutableStateOf(false) }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(21.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    we.nameSnapshot,
                    fontSize = 17.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f)
                        .clickable(onClickLabel = "查看 ${we.nameSnapshot} 的历史") { viewModel.showHistory(we.exerciseId) }
                        .padding(vertical = 12.dp),
                )
                Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(7.dp)) {
                    Text(
                        when (mode) { WeightMode.TOTAL -> "总重"; WeightMode.PER_SIDE -> "单只"; WeightMode.BODYWEIGHT -> "自重" },
                        fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                    )
                }
                Box {
                    IconButton(onClick = { menu = true }, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Filled.MoreVert, "${we.nameSnapshot} 的更多操作", Modifier.size(20.dp))
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("动作历史") }, onClick = { menu = false; viewModel.showHistory(we.exerciseId) })
                        DropdownMenuItem(text = { Text("移除动作") }, onClick = { menu = false; viewModel.removeExercise(we.id) })
                    }
                }
            }
            if (item.logged.isNotEmpty()) {
                TableRow("组", "上次", "本次", header = true)
                item.logged.forEachIndexed { index, set ->
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    TableRow(
                        "${index + 1}", previous.getOrNull(index)?.displayText() ?: "—", set.displayText(),
                        Modifier.heightIn(min = 44.dp).clickable(onClickLabel = "修改第 ${index + 1} 组") { viewModel.startEditing(set, mode) },
                    )
                }
                Spacer(Modifier.height(12.dp))
            }
            item.draft?.let { draft ->
                viewModel.draftInputs[draft.id]?.let { input ->
                    DraftSetRow(
                        number = item.logged.size + 1,
                        input = input,
                        mode = mode,
                        previous = (previous.getOrNull(item.logged.size) ?: previous.lastOrNull())?.displayText(),
                        onWeightChange = { viewModel.onDraftWeightChange(draft.id, it) },
                        onRepsChange = { viewModel.onDraftRepsChange(draft.id, it) },
                        onConfirm = { viewModel.confirm(draft.id) },
                        onSliderInteraction = onSliderInteraction,
                    )
                }
            }
        }
    }
}

@Composable
private fun BannerCard(text: String, action: String, onAction: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, fontSize = 12.sp, modifier = Modifier.weight(1f))
            TextButton(onClick = onAction) { Text(action, fontSize = 12.sp) }
        }
    }
}

@Composable
private fun DateRow(trainingDate: LocalDate?, setCount: Int, onChangeDate: () -> Unit, onNewRecord: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier.weight(1f).heightIn(min = 48.dp)
                .clickable(enabled = trainingDate != null, onClickLabel = "修改训练日期", onClick = onChangeDate),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(trainingDate?.format(recordDate) ?: "", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Icon(Icons.Filled.DateRange, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 6.dp).size(15.dp))
        }
        Text("$setCount 组完成", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "记录选项", Modifier.size(20.dp)) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("新建记录") }, onClick = { menu = false; onNewRecord() })
            }
        }
    }
}

@Composable
private fun ErrorBanner(message: String, onDismiss: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().clickable(onClickLabel = "关闭提示", onClick = onDismiss),
    ) {
        ErrorText(message, Modifier.weight(1f).padding(vertical = 8.dp))
        Icon(Icons.Filled.Close, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp).size(20.dp))
    }
}

@Composable
private fun TableRow(a: String, b: String, c: String, modifier: Modifier = Modifier, header: Boolean = false) {
    val color = MaterialTheme.colorScheme.onSurfaceVariant
    Row(modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(a, fontSize = 11.sp, color = color, modifier = Modifier.weight(.35f))
        Text(b, fontSize = 11.sp, color = color, modifier = Modifier.weight(1f))
        Text(c, fontSize = if (header) 11.sp else 13.sp, modifier = Modifier.weight(1f))
        if (header) Spacer(Modifier.size(18.dp))
        else Icon(Icons.Filled.Check, "已完成", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
    }
}

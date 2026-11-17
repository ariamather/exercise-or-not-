package com.exerciseornot.app.ui.stats

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.ui.common.BrandHeader
import com.exerciseornot.app.ui.common.HintText
import java.time.LocalDate
import java.time.format.TextStyle as DateTextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Calendar shades, empty → most sets. One hue, light → dark; checked with the dataviz ordinal
 * validator against surfaceContainerLow (#FBFCF7). Re-validate if the card colour changes.
 */
private val HeatColors = listOf(Color(0xFFEDF0E6), Color(0xFF9BBA8E), Color(0xFF6F9A6B), Color(0xFF4A7A56), Color(0xFF2C573D))
private val HeatRanges = listOf("没练", "1–5 组", "6–8 组", "9–11 组", "12 组以上")
private val Ink2 = Color(0xFF536052)
private val Faint = Color(0xFFA5AB9E)
private val Grid = Color(0xFFECEEE6)
private val Spark = Color(0xFFB7BDB0)
private val WeekdayInitials = listOf("一", "二", "三", "四", "五", "六", "日")

@Composable
fun StatsScreen(viewModel: StatsViewModel, onOpenRecord: () -> Unit, modifier: Modifier = Modifier) {
    val stats by viewModel.stats.collectAsStateWithLifecycle()
    Column(modifier.fillMaxSize()) {
        BrandHeader()
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, top = 18.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            Text("统计.", fontSize = 28.sp, fontWeight = FontWeight.Medium, modifier = Modifier.semantics { heading() })
            val s = stats
            when {
                s == null -> Unit
                s.isEmpty -> EmptyStats(onOpenRecord)
                else -> {
                    Hero(s)
                    TrainingCalendar(s, onOpenWorkout = { viewModel.open(it); onOpenRecord() })
                    ExerciseList(s)
                    HintText(
                        "数据只在这台手机上",
                        Modifier.fillMaxWidth().padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyStats(onOpenRecord: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("还没有可统计的训练", fontSize = 15.sp)
        HintText("记完第一组后，这里会出现训练日历和每个动作的变化。")
        TextButton(onClick = onOpenRecord, modifier = Modifier.padding(top = 4.dp)) { Text("去记录 ↗", fontSize = 12.sp) }
    }
}

// ---- hero ----

@Composable
private fun Hero(s: StatsSummary) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column {
        Column(Modifier.semantics(mergeDescendants = true) {}) {
            Text("本月", fontSize = 10.sp, letterSpacing = 2.5.sp, fontWeight = FontWeight.SemiBold, color = muted)
            Row(Modifier.padding(top = 4.dp)) {
                Text(
                    "${s.monthDays}", fontSize = 64.sp, lineHeight = 66.sp, fontWeight = FontWeight.SemiBold,
                    letterSpacing = (-2).sp, modifier = Modifier.alignByBaseline(),
                )
                Text("天练过", fontSize = 15.sp, color = Ink2, modifier = Modifier.padding(start = 8.dp).alignByBaseline())
            }
            Text(s.monthComparison(), fontSize = 12.sp, color = muted, modifier = Modifier.padding(top = 6.dp))
        }
        Spacer(Modifier.height(20.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            Kpi("${s.monthSets}", "组", "本月完成组数", Modifier.weight(1f), first = true)
            VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Kpi("${s.monthExercises}", "个", "本月练过的动作", Modifier.weight(1f))
            VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Kpi(formatAxis((s.weeklyAverage * 10).roundToInt() / 10.0), "天", "近 12 周每周", Modifier.weight(1f))
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

@Composable
private fun Kpi(value: String, unit: String, label: String, modifier: Modifier, first: Boolean = false) {
    Column(modifier.padding(start = if (first) 0.dp else 12.dp, top = 13.dp, bottom = 12.dp, end = 4.dp).semantics(mergeDescendants = true) {}) {
        Row {
            Text(value, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.alignByBaseline())
            Text(unit, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 2.dp).alignByBaseline())
        }
        Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ---- calendar ----

@Composable
private fun SectionHead(title: String, note: String) {
    Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.Bottom) {
        Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).semantics { heading() })
        Text(note, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun StatsCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(
        modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        content = content,
    )
}

@Composable
private fun TrainingCalendar(s: StatsSummary, onOpenWorkout: (String) -> Unit) {
    var selectedText by rememberSaveable { mutableStateOf((s.lastTrainedDay ?: s.today).toString()) }
    val selected = LocalDate.parse(selectedText).let { if (it < s.heatStart || it > s.today) s.lastTrainedDay ?: s.today else it }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    Column {
        SectionHead("训练日历", "近 $HEAT_WEEKS 周 · 每格一天")
        StatsCard {
            Column(Modifier.padding(start = 14.dp, end = 14.dp, top = 16.dp, bottom = 14.dp)) {
                Row(Modifier.fillMaxWidth().clearAndSetSemantics {}) {
                    Spacer(Modifier.width(18.dp))
                    val monthColumns = monthLabelColumns(s.heatStart)
                    for (c in 0 until HEAT_WEEKS) {
                        val monday = s.heatStart.plusWeeks(c.toLong())
                        val showMonth = c in monthColumns
                        Box(Modifier.weight(1f).height(16.dp)) {
                            if (showMonth) Text(
                                "${monday.monthValue}月", fontSize = 10.sp, color = muted,
                                maxLines = 1, softWrap = false, overflow = TextOverflow.Visible,
                            )
                        }
                    }
                }
                for (row in 0 until 7) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.width(18.dp).clearAndSetSemantics {}) {
                            if (row % 2 == 0) Text(WeekdayInitials[row], fontSize = 9.sp, color = Faint)
                        }
                        for (c in 0 until HEAT_WEEKS) {
                            val date = s.heatStart.plusDays(c * 7L + row)
                            Box(Modifier.weight(1f).aspectRatio(1f).padding(1.dp)) {
                                if (date <= s.today) HeatCell(
                                    date = date,
                                    day = s.days[date],
                                    selected = date == selected,
                                    isToday = date == s.today,
                                    onClick = { selectedText = date.toString() },
                                )
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("点一格查看那天", fontSize = 10.sp, color = muted, modifier = Modifier.weight(1f))
                    Row(
                        Modifier.clearAndSetSemantics { contentDescription = "颜色越深，当天组数越多：" + HeatRanges.drop(1).joinToString("、") },
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("少", fontSize = 10.sp, color = muted)
                        HeatColors.forEach { Box(Modifier.size(11.dp).background(it, RoundedCornerShape(3.dp))) }
                        Text("多", fontSize = 10.sp, color = muted)
                    }
                }
                HorizontalDivider(Modifier.padding(top = 14.dp), color = MaterialTheme.colorScheme.outlineVariant)
                DayDetail(selected, s.days[selected], s.today, onOpenWorkout)
            }
        }
    }
}

@Composable
private fun HeatCell(date: LocalDate, day: DayStats?, selected: Boolean, isToday: Boolean, onClick: () -> Unit) {
    val fill = HeatColors[heatBin(day?.totalSets ?: 0)]
    val ring = MaterialTheme.colorScheme.onSurface
    Box(
        Modifier.fillMaxSize()
            .selectable(selected = selected, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = "${date.longLabel(null)}，${day?.let { "${it.totalSets} 组" } ?: "没练"}" }
            .drawBehind {
                val r = 4.dp.toPx()
                if (selected) {
                    val w = 2.dp.toPx()
                    drawRoundRect(ring, Offset(w / 2, w / 2), Size(size.width - w, size.height - w), CornerRadius(r), Stroke(w))
                    val gap = w + 1.5.dp.toPx()
                    drawRoundRect(fill, Offset(gap, gap), Size(size.width - 2 * gap, size.height - 2 * gap), CornerRadius(r / 2))
                } else {
                    drawRoundRect(fill, cornerRadius = CornerRadius(r))
                    if (isToday) {
                        val inset = 3.dp.toPx()
                        drawRoundRect(
                            Faint, Offset(inset, inset), Size(size.width - 2 * inset, size.height - 2 * inset),
                            CornerRadius(r / 2), Stroke(1.5.dp.toPx()),
                        )
                    }
                }
            },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DayDetail(date: LocalDate, day: DayStats?, today: LocalDate, onOpenWorkout: (String) -> Unit) {
    Column(Modifier.padding(top = 14.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(date.longLabel(today), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            if (day != null) Text("共 ${day.totalSets} 组", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (day == null) {
            HintText(if (date == today) "今天还没有记录" else "这天没有训练记录", Modifier.padding(top = 8.dp))
            return@Column
        }
        FlowRow(
            Modifier.padding(top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            day.items.forEach { item ->
                Row(
                    Modifier.background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(8.dp))
                        .padding(horizontal = 9.dp, vertical = 4.dp),
                ) {
                    Text(item.name, fontSize = 12.sp, color = Ink2)
                    Text("${item.sets} 组", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 5.dp))
                }
            }
        }
        TextButton(onClick = { onOpenWorkout(day.workoutId) }, modifier = Modifier.padding(top = 4.dp)) {
            Text("打开这次训练 ↗", fontSize = 12.sp)
        }
    }
}

// ---- exercises ----

@Composable
private fun ExerciseList(s: StatsSummary) {
    var openId by rememberSaveable { mutableStateOf(s.exercises.firstOrNull()?.exerciseId) }
    Column {
        SectionHead("动作", "每次训练的最佳一组")
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            s.exercises.forEach { e ->
                key(e.exerciseId) {
                    ExerciseRow(
                        e, s.today, expanded = openId == e.exerciseId,
                        onToggle = { openId = if (openId == e.exerciseId) null else e.exerciseId },
                    )
                }
            }
        }
    }
}

@Composable
private fun ExerciseRow(e: ExerciseStats, today: LocalDate, expanded: Boolean, onToggle: () -> Unit) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val compact = LocalDensity.current.fontScale > 1.4f
    StatsCard(Modifier) {
        Column {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 64.dp)
                    .clickable(onClickLabel = if (expanded) "收起" else "展开趋势", onClick = onToggle)
                    .semantics { stateDescription = if (expanded) "已展开" else "已收起" }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(e.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${e.mode.label()} · ${e.sessionCount} 次训练", fontSize = 11.sp, color = muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (!compact && e.sessions.size >= 2) Sparkline(e, Modifier.width(56.dp).height(24.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Text(e.lastValueText(), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text(e.changeText(), fontSize = 11.sp, color = muted, maxLines = 1)
                }
                Icon(
                    Icons.Filled.KeyboardArrowDown, null, tint = Faint,
                    modifier = Modifier.size(18.dp).rotate(if (expanded) 180f else 0f),
                )
            }
            if (expanded) ExerciseDetail(e, today)
        }
    }
}

@Composable
private fun Sparkline(e: ExerciseStats, modifier: Modifier) {
    val accent = MaterialTheme.colorScheme.primary
    val ring = MaterialTheme.colorScheme.surfaceContainerLow
    val values = e.sessions.takeLast(8).map { it.value(e.metric) }
    Canvas(modifier.clearAndSetSemantics {}) {
        val p = 4.dp.toPx()
        val lo = values.min()
        val span = (values.max() - lo).takeIf { it > 0 } ?: 1.0
        fun pt(i: Int) = Offset(
            p + i * (size.width - 2 * p) / (values.size - 1),
            (size.height - p - (values[i] - lo) / span * (size.height - 2 * p)).toFloat(),
        )
        val path = Path().apply { values.indices.forEach { if (it == 0) moveTo(pt(0).x, pt(0).y) else lineTo(pt(it).x, pt(it).y) } }
        drawPath(path, Spark, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        val end = pt(values.lastIndex)
        drawCircle(ring, 4.5.dp.toPx(), end)
        drawCircle(accent, 3.dp.toPx(), end)
    }
}

@Composable
private fun ExerciseDetail(e: ExerciseStats, today: LocalDate) {
    var active by remember(e.exerciseId, e.sessions.size) { mutableIntStateOf(e.sessions.lastIndex) }
    var showTable by rememberSaveable(e.exerciseId) { mutableStateOf(false) }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val index = active.coerceIn(0, e.sessions.lastIndex)
    val session = e.sessions[index]

    Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Column(Modifier.padding(top = 14.dp).semantics(mergeDescendants = true) {}) {
            val (big, unit) = e.bestParts(session)
            Row {
                Text(big, fontSize = 30.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.8).sp, modifier = Modifier.alignByBaseline())
                Text(unit, fontSize = 13.sp, color = Ink2, modifier = Modifier.padding(start = 6.dp).alignByBaseline())
            }
            Text(
                "${session.date.longLabel(today)} · 最佳一组${if (index == e.sessions.lastIndex) "（最近一次）" else ""} · 共 ${session.sets.size} 组",
                fontSize = 11.sp, color = muted, modifier = Modifier.padding(top = 2.dp),
            )
            Text(session.sets.joinToString(" · ") { it.shortText(e.metric) }, fontSize = 11.sp, color = Ink2)
        }
        if (e.sessions.size >= 2) {
            TrendChart(e, index, onActive = { active = it }, Modifier.padding(top = 8.dp))
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            val first = formatAxis(e.sessions.first().value(e.metric))
            val last = formatAxis(e.sessions.last().value(e.metric))
            Text(
                if (e.sessions.size >= 2) "最近 ${e.sessions.size} 次：$first → $last ${e.metric.unit()}" else "再练一次就能看到变化",
                fontSize = 11.sp, color = muted, modifier = Modifier.weight(1f),
            )
            TextButton(onClick = { showTable = !showTable }) { Text(if (showTable) "收起表格" else "以表格查看", fontSize = 11.sp) }
        }
        if (showTable) SessionTable(e, today)
    }
}

@Composable
private fun SessionTable(e: ExerciseStats, today: LocalDate) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val line = MaterialTheme.colorScheme.outlineVariant
    Column {
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
            Text("日期", fontSize = 10.sp, color = muted, modifier = Modifier.weight(0.8f))
            Text("最佳一组", fontSize = 10.sp, color = muted, modifier = Modifier.weight(1f))
            Text(if (e.metric == Metric.REPS) "全部组（次）" else "全部组（kg × 次）", fontSize = 10.sp, color = muted, modifier = Modifier.weight(1.8f))
        }
        e.sessions.asReversed().forEach { s ->
            HorizontalDivider(color = line)
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp).semantics(mergeDescendants = true) {}) {
                Text(s.date.shortLabel(today), fontSize = 12.sp, color = Ink2, modifier = Modifier.weight(0.8f))
                val (big, unit) = e.bestParts(s)
                Text("$big $unit", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text(s.sets.joinToString(" · ") { it.shortText(e.metric) }, fontSize = 12.sp, color = Ink2, modifier = Modifier.weight(1.8f))
            }
        }
    }
}

/** Geometry shared by drawing and hit-testing, so a touch always lands on the point that is drawn. */
private class TrendGeometry(e: ExerciseStats, density: Density, width: Float, height: Float) {
    val padL = with(density) { 34.dp.toPx() }
    val padR = with(density) { 18.dp.toPx() }
    val padT = with(density) { 26.dp.toPx() }
    val baseY = height - with(density) { 22.dp.toPx() }
    val values = e.sessions.map { it.value(e.metric) }
    val step: Double
    val lo: Double
    val hi: Double
    private val t0 = e.sessions.first().date
    private val days = max(1L, ChronoUnit.DAYS.between(t0, e.sessions.last().date))
    private val plotW = width - padL - padR

    init {
        val minRange = if (e.metric == Metric.REPS) 3.0 else 5.0
        val vMin = values.min()
        val vMax = values.max()
        step = niceStep(max(vMax - vMin, minRange), 3)
        lo = max(0.0, floor((vMin - step * 0.25) / step) * step)
        hi = ceil((vMax + step * 0.25) / step) * step
    }

    fun x(date: LocalDate): Float = padL + ChronoUnit.DAYS.between(t0, date).toFloat() / days * plotW
    fun y(v: Double): Float = (padT + (1 - (v - lo) / (hi - lo)) * (baseY - padT)).toFloat()
    val points = e.sessions.mapIndexed { i, s -> Offset(x(s.date), y(values[i])) }
    fun nearest(px: Float): Int = points.indices.minBy { abs(points[it].x - px) }
}

@Composable
private fun TrendChart(e: ExerciseStats, active: Int, onActive: (Int) -> Unit, modifier: Modifier) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val accent = MaterialTheme.colorScheme.primary
    val card = MaterialTheme.colorScheme.surfaceContainerLow
    val ink = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val axisLine = MaterialTheme.colorScheme.outlineVariant
    val axisStyle = TextStyle(fontSize = 10.sp, color = muted)
    val endStyle = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = ink)
    val unit = e.metric.unit()
    val description = "${e.name}每次训练最佳一组，最近 ${e.sessions.size} 次从 " +
        "${formatAxis(e.sessions.first().value(e.metric))} 到 ${formatAxis(e.sessions.last().value(e.metric))} $unit。完整数值见表格。"

    Canvas(
        modifier.fillMaxWidth().height(176.dp)
            .semantics { contentDescription = description }
            .pointerInput(e.exerciseId, e.sessions) {
                detectTapGestures { pos ->
                    onActive(TrendGeometry(e, this, size.width.toFloat(), size.height.toFloat()).nearest(pos.x))
                }
            }
            .pointerInput(e.exerciseId, e.sessions) {
                val g = { TrendGeometry(e, this, size.width.toFloat(), size.height.toFloat()) }
                detectHorizontalDragGestures(
                    onDragStart = { onActive(g().nearest(it.x)) },
                    onHorizontalDrag = { change, _ -> onActive(g().nearest(change.position.x)) },
                )
            },
    ) {
        val g = TrendGeometry(e, density, size.width, size.height)
        // Recessive grid with clean round ticks.
        var v = g.lo
        while (v <= g.hi + 1e-9) {
            val y = g.y(v)
            drawLine(Grid, Offset(g.padL, y), Offset(size.width - g.padR, y), 1.dp.toPx())
            val label = measurer.measure(formatAxis(v), axisStyle)
            drawText(label, topLeft = Offset(g.padL - 8.dp.toPx() - label.size.width, y - label.size.height / 2f))
            v += g.step
        }
        drawLine(axisLine, Offset(g.padL, g.baseY), Offset(size.width - g.padR, g.baseY), 1.dp.toPx())

        // X labels: the first date, then each month start, skipping any that would collide.
        val first = e.sessions.first().date
        val labels = buildList {
            add(first to "${first.monthValue}/${first.dayOfMonth}")
            var m = first.withDayOfMonth(1).plusMonths(1)
            while (m <= e.sessions.last().date) { add(m to "${m.monthValue}月"); m = m.plusMonths(1) }
        }
        var lastRight = -Float.MAX_VALUE
        labels.forEachIndexed { i, (date, text) ->
            val layout = measurer.measure(text, axisStyle)
            val x = g.x(date)
            val left = (if (i == 0) x else x - layout.size.width / 2f).coerceAtMost(size.width - layout.size.width)
            if (left < lastRight + 6.dp.toPx()) return@forEachIndexed
            if (i > 0) drawLine(axisLine, Offset(x, g.baseY), Offset(x, g.baseY + 4.dp.toPx()), 1.dp.toPx())
            drawText(layout, topLeft = Offset(left, size.height - layout.size.height))
            lastRight = left + layout.size.width
        }

        val pts = g.points
        val line = Path().apply { pts.forEachIndexed { i, p -> if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
        val area = Path().apply {
            addPath(line)
            lineTo(pts.last().x, g.baseY)
            lineTo(pts.first().x, g.baseY)
            close()
        }
        drawPath(area, accent.copy(alpha = 0.10f))
        drawPath(line, accent, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))

        val end = pts.last()
        if (active != pts.lastIndex) {
            val p = pts[active]
            drawLine(Faint, Offset(p.x, g.padT - 6.dp.toPx()), Offset(p.x, g.baseY), 1.dp.toPx())
        }
        drawCircle(card, 6.5.dp.toPx(), end)
        drawCircle(accent, 4.5.dp.toPx(), end)
        if (active != pts.lastIndex) {
            val p = pts[active]
            drawCircle(card, 5.dp.toPx(), p)
            drawCircle(accent, 5.dp.toPx(), p, style = Stroke(2.5.dp.toPx()))
        }
        // Direct label on the endpoint only; sit it above both the last point and the one before.
        val endLabel = measurer.measure("${formatAxis(g.values.last())} $unit", endStyle)
        val above = minOf(end.y, pts.getOrNull(pts.size - 2)?.y ?: end.y)
        drawText(
            endLabel,
            topLeft = Offset(
                (end.x - endLabel.size.width).coerceAtLeast(g.padL),
                (above - 10.dp.toPx() - endLabel.size.height).coerceAtLeast(0f),
            ),
        )
    }
}

// ---- formatting ----

private fun SetValue.shortText(metric: Metric): String {
    val kg = weightGrams?.takeIf { it > 0 }?.let(WeightFormat::gramsToKgText)
    return when {
        metric == Metric.REPS && kg != null -> "$reps(+$kg)"
        metric == Metric.REPS -> "$reps"
        else -> "${kg ?: "0"}×$reps"
    }
}

/** "11 月 16 日 · 周一", with the year when it isn't [today]'s year (pass null to always omit it). */
private fun LocalDate.longLabel(today: LocalDate?): String {
    val weekday = dayOfWeek.getDisplayName(DateTextStyle.SHORT, Locale.CHINA)
    val year = if (today != null && year != today.year) "$year 年 " else ""
    return "$year$monthValue 月 $dayOfMonth 日 · $weekday"
}

private fun LocalDate.shortLabel(today: LocalDate): String =
    (if (year != today.year) "$year/" else "") + "$monthValue/$dayOfMonth"

package com.exerciseornot.app.ui.stats

import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.model.ExerciseItem
import com.exerciseornot.app.data.model.WorkoutDetail
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Columns in the training calendar; the last one is the current week. */
const val HEAT_WEEKS = 12

/** At most this many recent workouts are plotted per exercise (matches the exercise history sheet). */
const val TREND_SESSIONS = 20

data class StatsSummary(
    val today: LocalDate,
    val monthDays: Int,
    /** Training days from the 1st of last month up to the same day of month as [today]. */
    val lastMonthSameDays: Int,
    val monthSets: Int,
    val monthExercises: Int,
    /** Training days per week over the calendar window (start Monday through [today]). */
    val weeklyAverage: Double,
    /** Monday of the first calendar column. */
    val heatStart: LocalDate,
    /** Every day with at least one logged set, across all history. */
    val days: Map<LocalDate, DayStats>,
    /** Most recently trained first. */
    val exercises: List<ExerciseStats>,
) {
    val isEmpty: Boolean get() = days.isEmpty()
    val lastTrainedDay: LocalDate? get() = days.keys.maxOrNull()
}

data class DayStats(
    val date: LocalDate,
    val totalSets: Int,
    /** The workout to open from the calendar; the latest one when a day has several. */
    val workoutId: String,
    val items: List<DayItem>,
)

data class DayItem(val name: String, val sets: Int)

/** What the trend line plots: the best set's weight, or its reps for plain bodyweight exercises. */
enum class Metric { WEIGHT, REPS }

data class SetValue(val weightGrams: Int?, val reps: Int)

data class ExerciseSession(
    val workoutId: String,
    val date: LocalDate,
    val best: SetValue,
    val sets: List<SetValue>,
)

data class ExerciseStats(
    val exerciseId: String,
    val name: String,
    val mode: WeightMode,
    val metric: Metric,
    /** All workouts with a logged set of this exercise. */
    val sessionCount: Int,
    /** Oldest first, the latest [TREND_SESSIONS] only. */
    val sessions: List<ExerciseSession>,
) {
    val last: ExerciseSession get() = sessions.last()
    val previous: ExerciseSession? get() = sessions.getOrNull(sessions.size - 2)
}

fun ExerciseSession.value(metric: Metric): Double =
    if (metric == Metric.REPS) best.reps.toDouble() else (best.weightGrams ?: 0) / 1000.0

fun computeStats(workouts: List<WorkoutDetail>, today: LocalDate): StatsSummary {
    val logged = workouts.filter { it.hasLogged }
        .sortedWith(compareBy({ it.workout.trainingDate }, { it.workout.performedAt }))

    val days = logged.groupBy { it.trainingDate }.mapValues { (date, sameDay) ->
        val items = sameDay.flatMap { it.loggedItems }
            .groupBy { it.workoutExercise.exerciseId }
            .values.map { group -> DayItem(group.last().workoutExercise.nameSnapshot, group.sumOf { it.logged.size }) }
        DayStats(date, sameDay.sumOf { it.loggedSetCount }, sameDay.last().workout.id, items)
    }

    val monthStart = today.withDayOfMonth(1)
    val lastMonthStart = monthStart.minusMonths(1)
    val lastMonthEnd = lastMonthStart.withDayOfMonth(minOf(today.dayOfMonth, lastMonthStart.lengthOfMonth()))
    val thisMonth = days.values.filter { it.date in monthStart..today }
    val monthExercises = logged.filter { it.trainingDate in monthStart..today }
        .flatMap { w -> w.loggedItems.map { it.workoutExercise.exerciseId } }
        .toSet().size

    val heatStart = today.with(DayOfWeek.MONDAY).minusWeeks((HEAT_WEEKS - 1).toLong())
    val windowDays = ChronoUnit.DAYS.between(heatStart, today) + 1
    val windowTrained = days.keys.count { it in heatStart..today }

    val byExercise = LinkedHashMap<String, MutableList<Pair<WorkoutDetail, ExerciseItem>>>()
    logged.forEach { w ->
        w.loggedItems.forEach { byExercise.getOrPut(it.workoutExercise.exerciseId) { mutableListOf() }.add(w to it) }
    }
    val exercises = byExercise.map { (id, list) -> exerciseStats(id, list) }
        .sortedByDescending { it.last.date }

    return StatsSummary(
        today = today,
        monthDays = thisMonth.size,
        lastMonthSameDays = days.keys.count { it in lastMonthStart..lastMonthEnd },
        monthSets = thisMonth.sumOf { it.totalSets },
        monthExercises = monthExercises,
        weeklyAverage = windowTrained * 7.0 / windowDays,
        heatStart = heatStart,
        days = days,
        exercises = exercises,
    )
}

private fun exerciseStats(id: String, list: List<Pair<WorkoutDetail, ExerciseItem>>): ExerciseStats {
    val latest = list.last().second.workoutExercise
    val raw = list.map { (w, item) -> Triple(w, item, item.logged.mapNotNull { s -> s.reps?.let { SetValue(s.weightGrams, it) } }) }
        .filter { it.third.isNotEmpty() }
    // Bodyweight lines plot reps unless every workout carried added weight; mixing the two would draw zeros.
    val metric = if (latest.weightModeSnapshot == WeightMode.BODYWEIGHT &&
        raw.any { (_, _, sets) -> sets.all { (it.weightGrams ?: 0) == 0 } }
    ) Metric.REPS else Metric.WEIGHT
    val order = if (metric == Metric.REPS) compareBy<SetValue>({ it.reps }, { it.weightGrams ?: 0 })
    else compareBy({ it.weightGrams ?: 0 }, { it.reps })
    val sessions = raw.map { (w, _, sets) -> ExerciseSession(w.workout.id, w.trainingDate, sets.maxWith(order), sets) }
    return ExerciseStats(
        exerciseId = id,
        name = latest.nameSnapshot,
        mode = latest.weightModeSnapshot,
        metric = metric,
        sessionCount = sessions.size,
        sessions = sessions.takeLast(TREND_SESSIONS),
    )
}

// ---- text ----

fun WeightMode.label(): String = when (this) {
    WeightMode.TOTAL -> "总重"
    WeightMode.PER_SIDE -> "单只"
    WeightMode.BODYWEIGHT -> "自重"
}

private fun kg(grams: Int): String = WeightFormat.gramsToKgText(grams)

/** Headline value for the list row, e.g. "85 kg" or "12 次". */
fun ExerciseStats.lastValueText(): String =
    if (metric == Metric.REPS) "${last.best.reps} 次" else "${kg(last.best.weightGrams ?: 0)} kg"

/** Big number and its trailing unit for one session's best set, e.g. ("85", "kg × 8"). */
fun ExerciseStats.bestParts(session: ExerciseSession): Pair<String, String> {
    val b = session.best
    val added = b.weightGrams?.takeIf { it > 0 }
    return when {
        metric == Metric.REPS && added != null -> "${b.reps}" to "次 · 自重 +${kg(added)} kg"
        metric == Metric.REPS -> "${b.reps}" to "次 · 自重"
        mode == WeightMode.BODYWEIGHT -> kg(b.weightGrams ?: 0) to "kg 附加 × ${b.reps}"
        else -> kg(b.weightGrams ?: 0) to "kg × ${b.reps}"
    }
}

/** Latest best set against the one before, e.g. "↑ 2.5 kg", "↑ 1 次", "和上次持平". */
fun ExerciseStats.changeText(): String {
    val a = previous?.best ?: return "第一次"
    val b = last.best
    val dw = (b.weightGrams ?: 0) - (a.weightGrams ?: 0)
    val dr = b.reps - a.reps
    fun arrow(d: Int) = if (d > 0) "↑" else "↓"
    return when {
        metric == Metric.REPS && dr != 0 -> "${arrow(dr)} ${kotlin.math.abs(dr)} 次"
        metric == Metric.WEIGHT && dw != 0 -> "${arrow(dw)} ${kg(kotlin.math.abs(dw))} kg"
        metric == Metric.WEIGHT && dr != 0 -> "${arrow(dr)} ${kotlin.math.abs(dr)} 次"
        else -> "和上次持平"
    }
}

fun Metric.unit(): String = if (this == Metric.REPS) "次" else "kg"

fun formatAxis(value: Double): String =
    if (value == Math.floor(value)) value.toLong().toString() else "%.1f".format(value).trimEnd('0').trimEnd('.')

/** "上月同期 5 天，这个月多练了 2 天". */
fun StatsSummary.monthComparison(): String {
    val diff = monthDays - lastMonthSameDays
    val base = "上月同期 $lastMonthSameDays 天"
    return when {
        diff > 0 -> "$base，这个月多练了 $diff 天"
        diff < 0 -> "$base，这个月少 ${-diff} 天"
        monthDays == 0 -> "$base，这个月还没开始"
        else -> "$base，和这个月一样"
    }
}

/**
 * Calendar columns that get a month label: each column whose week starts a new month, plus the
 * first column when the next label is at least 3 columns away (a label is about 2 columns wide).
 */
fun monthLabelColumns(heatStart: LocalDate, weeks: Int = HEAT_WEEKS): Set<Int> {
    val starts = (1 until weeks).filter { c ->
        heatStart.plusWeeks(c.toLong()).month != heatStart.plusWeeks(c - 1L).month
    }
    return if (starts.firstOrNull()?.let { it >= 3 } != false) setOf(0) + starts else starts.toSet()
}

/** Calendar shade: 0 = no training, 1–4 = more sets. Fixed bins so the legend never changes meaning. */
fun heatBin(totalSets: Int): Int = when {
    totalSets <= 0 -> 0
    totalSets <= 5 -> 1
    totalSets <= 8 -> 2
    totalSets <= 11 -> 3
    else -> 4
}

/** A round axis step that gives about [target] intervals over [range]. */
fun niceStep(range: Double, target: Int): Double {
    val raw = range / target
    val mag = Math.pow(10.0, Math.floor(Math.log10(raw)))
    return listOf(1.0, 2.0, 2.5, 5.0, 10.0).first { it * mag >= raw - 1e-9 } * mag
}

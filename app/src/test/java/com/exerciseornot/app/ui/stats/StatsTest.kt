package com.exerciseornot.app.ui.stats

import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.db.WorkoutEntity
import com.exerciseornot.app.data.db.WorkoutExerciseEntity
import com.exerciseornot.app.data.model.ExerciseItem
import com.exerciseornot.app.data.model.WorkoutDetail
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class StatsTest {
    private val today = LocalDate.of(2026, 11, 17) // Tuesday
    private var seq = 0

    private fun set(grams: Int?, reps: Int?, status: SetStatus = SetStatus.LOGGED) =
        SetEntryEntity("s${seq++}", "we", seq, grams, reps, status, if (status == SetStatus.LOGGED) 1L else null, 1L, 1L)

    private fun item(exId: String, name: String, mode: WeightMode, vararg sets: SetEntryEntity) = ExerciseItem(
        WorkoutExerciseEntity("we${seq++}", "w", exId, 0, name, mode, 1L, 1L),
        logged = sets.filter { it.status == SetStatus.LOGGED },
        drafts = sets.filter { it.status == SetStatus.DRAFT },
    )

    private fun workout(date: String, vararg items: ExerciseItem, at: Long = 0L) =
        WorkoutDetail(WorkoutEntity("w-$date-$at", at, date, "Asia/Shanghai", 1L, 1L), items.toList())

    private fun bench(vararg sets: Pair<Int, Int>) =
        item("bench", "卧推", WeightMode.TOTAL, *sets.map { set(it.first, it.second) }.toTypedArray())

    @Test
    fun monthTotalsCountOnlyLoggedDays() {
        val s = computeStats(
            listOf(
                workout("2026-11-02", bench(40_000 to 10, 40_000 to 8)),
                workout("2026-11-16", bench(42_500 to 8), item("pull", "引体", WeightMode.BODYWEIGHT, set(null, 6))),
                // Only a pending row: not training done.
                workout("2026-11-17", item("bench", "卧推", WeightMode.TOTAL, set(40_000, 10, SetStatus.DRAFT))),
                workout("2026-10-05", bench(37_500 to 10)),
                workout("2026-10-20", bench(37_500 to 10)), // after Oct 17: outside "last month to date"
            ),
            today,
        )
        assertEquals(2, s.monthDays)
        assertEquals(1, s.lastMonthSameDays)
        assertEquals(4, s.monthSets)
        assertEquals(2, s.monthExercises)
        assertTrue(LocalDate.of(2026, 11, 17) !in s.days)
        assertEquals("上月同期 1 天，这个月多练了 1 天", s.monthComparison())
    }

    @Test
    fun sameDayWorkoutsMergeIntoOneCalendarDay() {
        val s = computeStats(
            listOf(
                workout("2026-11-16", bench(40_000 to 10), at = 1),
                workout("2026-11-16", bench(40_000 to 8, 40_000 to 8), at = 2),
            ),
            today,
        )
        val day = s.days.getValue(LocalDate.of(2026, 11, 16))
        assertEquals(3, day.totalSets)
        assertEquals(listOf(DayItem("卧推", 3)), day.items)
        assertEquals("w-2026-11-16-2", day.workoutId)
        // One training day, even though there are two workouts.
        assertEquals(1, s.monthDays)
    }

    @Test
    fun calendarStartsOnMondayElevenWeeksBeforeThisWeek() {
        val s = computeStats(listOf(workout("2026-11-16", bench(40_000 to 10))), today)
        assertEquals(LocalDate.of(2026, 8, 31), s.heatStart)
        // 1 training day over 79 days (Aug 31 – Nov 17).
        assertEquals(7.0 / 79, s.weeklyAverage, 1e-9)
    }

    @Test
    fun bestSetIsHeaviestThenMostReps() {
        val s = computeStats(
            listOf(
                workout("2026-11-10", bench(40_000 to 10, 42_500 to 6, 42_500 to 8, 40_000 to 12)),
                workout("2026-11-16", bench(42_500 to 8, 42_500 to 8)),
            ),
            today,
        )
        val e = s.exercises.single()
        assertEquals(Metric.WEIGHT, e.metric)
        assertEquals(SetValue(42_500, 8), e.sessions.first().best)
        assertEquals("42.5 kg", e.lastValueText())
        assertEquals("和上次持平", e.changeText())
        assertEquals("42.5" to "kg × 8", e.bestParts(e.last))
    }

    @Test
    fun changeTextFallsBackToRepsWhenWeightIsUnchanged() {
        val s = computeStats(
            listOf(workout("2026-11-10", bench(40_000 to 8)), workout("2026-11-16", bench(40_000 to 10))),
            today,
        )
        assertEquals("↑ 2 次", s.exercises.single().changeText())
        val down = computeStats(
            listOf(workout("2026-11-10", bench(42_500 to 8)), workout("2026-11-16", bench(40_000 to 10))),
            today,
        )
        assertEquals("↓ 2.5 kg", down.exercises.single().changeText())
    }

    @Test
    fun plainBodyweightPlotsReps() {
        fun pull(vararg reps: Int) = item("pull", "引体", WeightMode.BODYWEIGHT, *reps.map { set(null, it) }.toTypedArray())
        val s = computeStats(listOf(workout("2026-11-10", pull(5, 4)), workout("2026-11-16", pull(6, 5))), today)
        val e = s.exercises.single()
        assertEquals(Metric.REPS, e.metric)
        assertEquals(6.0, e.last.value(e.metric), 0.0)
        assertEquals("6 次", e.lastValueText())
        assertEquals("↑ 1 次", e.changeText())
        assertEquals("6" to "次 · 自重", e.bestParts(e.last))
    }

    @Test
    fun weightedBodyweightEveryTimePlotsAddedWeight() {
        fun dip(grams: Int, reps: Int) = item("dip", "双杠", WeightMode.BODYWEIGHT, set(grams, reps))
        val s = computeStats(listOf(workout("2026-11-10", dip(5_000, 8)), workout("2026-11-16", dip(10_000, 6))), today)
        val e = s.exercises.single()
        assertEquals(Metric.WEIGHT, e.metric)
        assertEquals("10" to "kg 附加 × 6", e.bestParts(e.last))
    }

    @Test
    fun exercisesAreOrderedByMostRecentTraining() {
        val s = computeStats(
            listOf(
                workout("2026-11-10", item("squat", "深蹲", WeightMode.TOTAL, set(60_000, 8))),
                workout("2026-11-16", bench(40_000 to 10)),
            ),
            today,
        )
        assertEquals(listOf("bench", "squat"), s.exercises.map { it.exerciseId })
        assertEquals("第一次", s.exercises[0].changeText())
    }

    @Test
    fun trendKeepsLatestSessionsButCountsAll() {
        val workouts = (1..25).map { workout("2026-10-%02d".format(it), bench(40_000 + it * 500 to 10)) }
        val e = computeStats(workouts, today).exercises.single()
        assertEquals(25, e.sessionCount)
        assertEquals(TREND_SESSIONS, e.sessions.size)
        assertEquals(LocalDate.of(2026, 10, 25), e.last.date)
    }

    @Test
    fun setsWithoutRepsAreIgnored() {
        val s = computeStats(
            listOf(workout("2026-11-16", item("bench", "卧推", WeightMode.TOTAL, set(40_000, null), set(40_000, 9)))),
            today,
        )
        assertEquals(listOf(SetValue(40_000, 9)), s.exercises.single().last.sets)
    }

    @Test
    fun emptyHistory() {
        val s = computeStats(emptyList(), today)
        assertTrue(s.isEmpty)
        assertTrue(s.exercises.isEmpty())
        assertEquals("上月同期 0 天，这个月还没开始", s.monthComparison())
    }

    @Test
    fun monthLabelsDoNotCollide() {
        // Aug 24 column is followed by Aug 31 then Sep 7: "9月" at column 2 crowds out "8月" at 0.
        assertEquals(setOf(2, 6, 10), monthLabelColumns(LocalDate.of(2026, 8, 24)))
        // Aug 31 start: September begins at column 1, so the first column stays unlabelled.
        assertEquals(setOf(1, 5, 9), monthLabelColumns(LocalDate.of(2026, 8, 31)))
        // Plenty of room before the first month change.
        assertEquals(setOf(0, 4, 8), monthLabelColumns(LocalDate.of(2026, 9, 7)))
    }

    @Test
    fun heatBinsAndAxisHelpers() {
        assertEquals(listOf(0, 1, 1, 2, 2, 3, 3, 4), listOf(0, 1, 5, 6, 8, 9, 11, 12).map(::heatBin))
        assertEquals(10.0, niceStep(25.0, 3), 1e-9)
        assertEquals(2.0, niceStep(6.0, 3), 1e-9)
        assertEquals(2.5, niceStep(7.0, 3), 1e-9)
        assertEquals("42.5", formatAxis(42.5))
        assertEquals("40", formatAxis(40.0))
    }
}

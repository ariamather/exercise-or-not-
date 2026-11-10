package com.exerciseornot.app.data

import android.content.Context
import android.database.sqlite.SQLiteConstraintException
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WeightMode
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@RunWith(AndroidJUnit4::class)
class WorkoutRepositoryTest {

    private lateinit var db: AppDatabase
    private lateinit var repo: WorkoutRepository
    private lateinit var exercises: ExerciseRepository
    private val dao get() = db.workoutDao()

    private val zone = ZoneId.of("Asia/Shanghai")
    // 2026-11-10 20:00 in Shanghai
    private val clock = TestClock(Instant.parse("2026-11-10T12:00:00Z"), zone)
    private val today = LocalDate.of(2026, 11, 10)
    private val todayTarget = WorkoutTarget.New(today)

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repo = WorkoutRepository(db, clock)
        exercises = ExerciseRepository(db, clock)
    }

    @After
    fun tearDown() = db.close()

    private suspend fun detail(workoutId: String) = repo.observeWorkout(workoutId).first()!!
    private suspend fun exercise(name: String, mode: WeightMode = WeightMode.TOTAL) = exercises.create(name, mode).id
    private suspend fun draftOf(added: AddedExercise) = dao.draftsOf(added.workoutExerciseId).single()
    private suspend fun log(target: WorkoutTarget, exerciseId: String, vararg sets: Pair<Int?, Int?>) =
        repo.logSets(db, target, exerciseId, *sets)
    private fun on(month: Int, day: Int) = WorkoutTarget.New(LocalDate.of(2026, month, day))

    // ---- adding exercises & targets ----

    @Test
    fun addExercise_newTarget_createsWorkoutItemAndEmptyDraft() = runTest {
        val bench = exercise("杠铃卧推")
        val added = repo.addExercise(todayTarget, bench)

        val workout = dao.getWorkout(added.workoutId)!!
        assertEquals("2026-11-10", workout.trainingDate)
        assertEquals("Asia/Shanghai", workout.zoneId)
        val item = detail(added.workoutId).items.single()
        assertEquals(added.workoutExerciseId, item.workoutExercise.id)
        assertEquals("杠铃卧推", item.workoutExercise.nameSnapshot)
        assertTrue(item.logged.isEmpty())
        // Never done before: the pending row starts empty.
        val draft = item.draft!!
        assertNull(draft.weightGrams)
        assertNull(draft.reps)
    }

    @Test
    fun addExercise_sameExerciseTwice_returnsSameItemWithOneDraft() = runTest {
        val bench = exercise("杠铃卧推")
        val a = repo.addExercise(todayTarget, bench)
        val b = repo.addExercise(WorkoutTarget.Existing(a.workoutId), bench)

        assertEquals(a, b)
        assertEquals(1, dao.countWorkoutExercises())
        assertEquals(1, dao.allSets().size)
    }

    @Test
    fun addExercise_secondExercise_goesAfterFirst() = runTest {
        val a = repo.addExercise(todayTarget, exercise("深蹲"))
        repo.addExercise(WorkoutTarget.Existing(a.workoutId), exercise("卧推"))
        assertEquals(listOf("深蹲", "卧推"), detail(a.workoutId).items.map { it.workoutExercise.nameSnapshot })
    }

    @Test
    fun addExercise_newTargetTwice_createsTwoWorkoutsSameDay() = runTest {
        val squat = exercise("深蹲")
        val a = repo.addExercise(todayTarget, squat)
        val b = repo.addExercise(todayTarget, squat)
        assertNotEquals(a.workoutId, b.workoutId)
        assertEquals(2, dao.countWorkouts())
    }

    @Test
    fun addExercise_pastDate_usesNoonOfThatDay() = runTest {
        val added = repo.addExercise(on(11, 8), exercise("深蹲"))
        val w = dao.getWorkout(added.workoutId)!!
        assertEquals("2026-11-08", w.trainingDate)
        assertEquals(Instant.parse("2026-11-08T04:00:00Z").toEpochMilli(), w.performedAt)
    }

    @Test
    fun addExercise_futureDate_isRejected() = runTest {
        val squat = exercise("深蹲")
        val e = runCatching { repo.addExercise(WorkoutTarget.New(today.plusDays(1)), squat) }.exceptionOrNull()
        assertTrue(e is IllegalArgumentException)
        assertEquals(0, dao.countWorkouts())
    }

    @Test
    fun addExercise_deletedExistingTarget_throwsNotFoundAndWritesNothing() = runTest {
        val squat = exercise("深蹲")
        val added = repo.addExercise(todayTarget, squat)
        repo.deleteWorkout(added.workoutId)
        val e = runCatching { repo.addExercise(WorkoutTarget.Existing(added.workoutId), squat) }.exceptionOrNull()
        assertTrue(e is WorkoutNotFoundException)
        assertEquals(0, dao.countWorkoutExercises())
        assertEquals(0, dao.allSets().size)
    }

    @Test
    fun latestWorkout_followsMostRecentlyAddedSet_notTrainingDate() = runTest {
        val squat = exercise("深蹲")
        val todayAdded = log(todayTarget, squat, 60_000 to 5)
        clock.advance(Duration.ofMinutes(5))
        val backfill = log(on(11, 3), squat, 50_000 to 5)
        assertEquals(backfill.workoutId, repo.latestWorkout()!!.id)

        clock.advance(Duration.ofMinutes(5))
        repo.confirmDraft(draftOf(todayAdded).id, 60_000, 5)
        assertEquals(todayAdded.workoutId, repo.latestWorkout()!!.id)

        val history = repo.observeHistory().first().map { it.workout.trainingDate }
        assertEquals(listOf("2026-11-10", "2026-11-03"), history)
    }

    @Test
    fun changeWorkoutDate_keepsTimeOfDay() = runTest {
        val wid = log(todayTarget, exercise("深蹲"), 60_000 to 5).workoutId
        repo.changeWorkoutDate(wid, LocalDate.of(2026, 11, 7))
        val w = dao.getWorkout(wid)!!
        assertEquals("2026-11-07", w.trainingDate)
        val t = Instant.ofEpochMilli(w.performedAt).atZone(zone)
        assertEquals(LocalDate.of(2026, 11, 7), t.toLocalDate())
        assertEquals(20, t.hour)

        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { repo.changeWorkoutDate(wid, today.plusDays(1)) }
        }
    }

    // ---- prefill & "last time" ----

    @Test
    fun prefill_usesLastSetOfPreviousWorkout() = runTest {
        val bench = exercise("卧推")
        log(on(11, 7), bench, 40_000 to 10, 42_500 to 8)

        val added = repo.addExercise(todayTarget, bench)
        val draft = draftOf(added)
        assertEquals(42_500, draft.weightGrams)
        assertEquals(8, draft.reps)
        assertEquals(listOf(40_000, 42_500), repo.previousSets(added.workoutExerciseId).map { it.weightGrams })
    }

    @Test
    fun prefill_ignoresDraftsAndLaterWorkouts_whenBackfilling() = runTest {
        val bench = exercise("卧推")
        log(on(11, 3), bench, 30_000 to 10)
        // 11-08 only has an unconfirmed row: it isn't training done.
        val draftOnly = repo.addExercise(on(11, 8), bench)
        repo.saveDraft(draftOf(draftOnly).id, 99_000, 1)
        log(todayTarget, bench, 50_000 to 5)

        val backfill = repo.addExercise(on(11, 5), bench)
        assertEquals(30_000, draftOf(backfill).weightGrams)
        assertEquals(listOf(30_000), repo.previousSets(backfill.workoutExerciseId).map { it.weightGrams })

        val afterDraftOnly = repo.addExercise(on(11, 9), bench)
        assertEquals(30_000, draftOf(afterDraftOnly).weightGrams)
    }

    @Test
    fun previousSets_sameDayTwoWorkouts_usesEarlierOne() = runTest {
        val squat = exercise("深蹲")
        val first = log(todayTarget, squat, 60_000 to 5, 65_000 to 3)
        clock.advance(Duration.ofHours(1))
        val second = repo.addExercise(todayTarget, squat)

        assertEquals(listOf(60_000, 65_000), repo.previousSets(second.workoutExerciseId).map { it.weightGrams })
        assertTrue(repo.previousSets(first.workoutExerciseId).isEmpty())
    }

    @Test
    fun previousSets_otherExercise_isNotUsed() = runTest {
        log(on(11, 7), exercise("深蹲"), 60_000 to 5)
        val bench = repo.addExercise(todayTarget, exercise("卧推"))
        assertTrue(repo.previousSets(bench.workoutExerciseId).isEmpty())
        assertNull(draftOf(bench).weightGrams)
    }

    // ---- confirming pending rows ----

    @Test
    fun confirmDraft_logsAndCreatesNextRowWithSameValues() = runTest {
        val added = repo.addExercise(todayTarget, exercise("卧推"))
        val first = draftOf(added)

        val nextId = repo.confirmDraft(first.id, 40_000, 10)
        val logged = dao.getSet(first.id)!!
        assertEquals(SetStatus.LOGGED, logged.status)
        assertNotNull(logged.loggedAt)
        val next = dao.getSet(nextId)!!
        assertEquals(SetStatus.DRAFT, next.status)
        assertEquals(40_000, next.weightGrams)
        assertEquals(10, next.reps)
        assertEquals(1, next.position)

        // A repeated tap on the already-logged row changes nothing.
        assertEquals(nextId, repo.confirmDraft(first.id, 40_000, 10))
        assertEquals(logged, dao.getSet(first.id))
        assertEquals(2, dao.allSets().size)

        // One tap per extra identical set.
        repo.confirmDraft(nextId, 40_000, 10)
        val item = detail(added.workoutId).items.single()
        assertEquals(2, item.logged.size)
        assertEquals(listOf(0, 1, 2), dao.allSets().sortedBy { it.position }.map { it.position })
    }

    @Test
    fun confirmDraft_validatesAgainstWeightMode() = runTest {
        val bench = repo.addExercise(todayTarget, exercise("卧推"))
        val pullUp = repo.addExercise(WorkoutTarget.Existing(bench.workoutId), exercise("引体向上", WeightMode.BODYWEIGHT))
        val benchDraft = draftOf(bench).id

        listOf<Pair<Int?, Int?>>(null to 8, 40_000 to null, 40_000 to 0).forEach { (g, r) ->
            val e = runCatching { repo.confirmDraft(benchDraft, g, r) }.exceptionOrNull()
            assertTrue("$g/$r", e is IllegalArgumentException)
        }
        assertEquals(SetStatus.DRAFT, dao.getSet(benchDraft)!!.status)

        val next = repo.confirmDraft(draftOf(pullUp).id, null, 8)
        repo.confirmDraft(next, 10_000, 6)
        assertEquals(2, detail(bench.workoutId).loggedSetCount)
    }

    @Test
    fun saveDraft_updatesPendingRowOnly() = runTest {
        val added = log(todayTarget, exercise("深蹲"), 60_000 to 5)
        val loggedId = dao.loggedOf(added.workoutExerciseId).single().id
        val before = dao.getSet(loggedId)

        repo.saveDraft(loggedId, 10_000, 1)
        assertEquals(before, dao.getSet(loggedId))

        val draftId = draftOf(added).id
        repo.saveDraft(draftId, 62_500, null)
        assertEquals(62_500, dao.getSet(draftId)!!.weightGrams)
        assertNull(dao.getSet(draftId)!!.reps)
        assertThrows(IllegalArgumentException::class.java) { runBlocking { repo.saveDraft(draftId, 62_500, 0) } }

        // Gone rows are ignored rather than recreated.
        repo.saveDraft("missing", 1_000, 1)
        assertNull(dao.getSet("missing"))
    }

    @Test
    fun historyCounts_ignoreDrafts() = runTest {
        val added = repo.addExercise(todayTarget, exercise("深蹲"))
        var h = repo.observeHistory().first().single()
        assertEquals(0, h.loggedSetCount)
        assertFalse(h.hasLogged)

        repo.confirmDraft(draftOf(added).id, 60_000, 5)
        h = repo.observeHistory().first().single()
        assertEquals(1, h.loggedSetCount)
        assertTrue(h.hasLogged)
    }

    // ---- edit ----

    @Test
    fun updateLoggedSet_keepsStatusAndLoggedAt() = runTest {
        val added = log(todayTarget, exercise("深蹲"), 60_000 to 5)
        val id = dao.loggedOf(added.workoutExerciseId).single().id
        val before = dao.getSet(id)!!
        clock.advance(Duration.ofMinutes(10))

        repo.updateLoggedSet(id, 65_000, 3)
        val after = dao.getSet(id)!!
        assertEquals(SetStatus.LOGGED, after.status)
        assertEquals(before.loggedAt, after.loggedAt)
        assertEquals(65_000, after.weightGrams)
        assertEquals(3, after.reps)
        assertTrue(after.updatedAt > before.updatedAt)

        assertThrows(IllegalArgumentException::class.java) { runBlocking { repo.updateLoggedSet(id, null, 3) } }
        assertThrows(IllegalArgumentException::class.java) { runBlocking { repo.updateLoggedSet(id, 65_000, 0) } }
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { repo.updateLoggedSet(draftOf(added).id, 65_000, 3) }
        }
    }

    // ---- delete & undo ----

    @Test
    fun deleteSet_thenRestore_isExact() = runTest {
        val added = log(todayTarget, exercise("深蹲"), 60_000 to 5, 60_000 to 4)
        val first = dao.loggedOf(added.workoutExerciseId).first().id
        val before = dao.allSets().sortedBy { it.id }

        val snapshot = repo.deleteSet(first)
        assertEquals(1, dao.loggedOf(added.workoutExerciseId).size)
        assertTrue(snapshot.workoutExercises.isEmpty())

        repo.restore(snapshot)
        assertEquals(before, dao.allSets().sortedBy { it.id })
    }

    @Test
    fun deleteOnlyLoggedSet_keepsItemWithItsPendingRow() = runTest {
        val added = log(todayTarget, exercise("深蹲"), 60_000 to 5)
        val snapshot = repo.deleteSet(dao.loggedOf(added.workoutExerciseId).single().id)
        assertTrue(snapshot.workoutExercises.isEmpty())
        val item = detail(added.workoutId).items.single()
        assertTrue(item.logged.isEmpty())
        assertNotNull(item.draft)
    }

    @Test
    fun removeExercise_thenRestore_isExact() = runTest {
        val squat = log(todayTarget, exercise("深蹲"), 60_000 to 5, 60_000 to 5)
        log(WorkoutTarget.Existing(squat.workoutId), exercise("卧推"), 40_000 to 8)
        val items = dao.allWorkoutExercises().sortedBy { it.id }
        val sets = dao.allSets().sortedBy { it.id }

        val snapshot = repo.removeExercise(squat.workoutExerciseId)
        assertEquals(listOf("卧推"), detail(squat.workoutId).items.map { it.workoutExercise.nameSnapshot })
        assertEquals(3, snapshot.sets.size)
        assertEquals(2, dao.countExercises())

        repo.restore(snapshot)
        assertEquals(items, dao.allWorkoutExercises().sortedBy { it.id })
        assertEquals(sets, dao.allSets().sortedBy { it.id })
    }

    @Test
    fun deleteWorkout_thenRestore_isExact() = runTest {
        val squat = log(todayTarget, exercise("深蹲"), 60_000 to 5)
        log(WorkoutTarget.Existing(squat.workoutId), exercise("卧推"), 40_000 to 8)
        val w = dao.allWorkouts()
        val items = dao.allWorkoutExercises().sortedBy { it.id }
        val sets = dao.allSets().sortedBy { it.id }

        val snapshot = repo.deleteWorkout(squat.workoutId)
        assertEquals(0, dao.countWorkouts())
        assertEquals(0, dao.countWorkoutExercises())
        assertEquals(0, dao.allSets().size)
        assertEquals(2, dao.countExercises())

        repo.restore(snapshot)
        assertEquals(w, dao.allWorkouts())
        assertEquals(items, dao.allWorkoutExercises().sortedBy { it.id })
        assertEquals(sets, dao.allSets().sortedBy { it.id })
    }

    @Test
    fun restoreSet_afterWorkoutDeleted_failsCleanly() = runTest {
        val added = log(todayTarget, exercise("深蹲"), 60_000 to 5, 60_000 to 5)
        val setSnapshot = repo.deleteSet(dao.loggedOf(added.workoutExerciseId).first().id)
        repo.deleteWorkout(added.workoutId)

        assertTrue(runCatching { repo.restore(setSnapshot) }.exceptionOrNull() is IllegalStateException)
        assertEquals(0, dao.allSets().size)
    }

    @Test
    fun deleteExercise_withHistory_isRejectedByForeignKey() = runTest {
        val bench = exercise("杠铃卧推")
        log(todayTarget, bench, 40_000 to 10)
        assertThrows(SQLiteConstraintException::class.java) {
            runBlocking { dao.deleteExercise(dao.getExercise(bench)!!) }
        }
        assertEquals(2, dao.allSets().size)
    }

    // ---- default target ----

    @Test
    fun defaultTarget_noWorkouts_isNewToday() = runTest {
        assertEquals(todayTarget, repo.defaultTarget())
    }

    @Test
    fun defaultTarget_todayExists_continuesIt() = runTest {
        val wid = log(todayTarget, exercise("深蹲"), 60_000 to 5).workoutId
        assertEquals(WorkoutTarget.Existing(wid), repo.defaultTarget())
    }

    @Test
    fun defaultTarget_latestIsBackfill_isNewToday() = runTest {
        val squat = exercise("深蹲")
        log(on(11, 9), squat, 60_000 to 5)
        clock.advance(Duration.ofMinutes(5))
        log(on(11, 3), squat, 50_000 to 5)
        assertEquals(todayTarget, repo.defaultTarget())
    }

    // ---- reuse ----

    @Test
    fun reuseWorkout_copiesOrderAsPendingRowsOnly() = runTest {
        val squat = exercise("深蹲")
        val bench = exercise("卧推")
        val row = exercise("划船")
        val src = log(on(11, 8), squat, 60_000 to 5, 60_000 to 5)
        val srcTarget = WorkoutTarget.Existing(src.workoutId)
        log(srcTarget, bench, 40_000 to 10)
        repo.addExercise(srcTarget, row) // only a pending row: not reused
        val before = dao.allSets().sortedBy { it.id }

        val result = repo.reuseWorkout(src.workoutId, todayTarget)

        assertEquals(ReuseResult(result.workoutId, 2, 0, 0), result)
        val d = detail(result.workoutId!!)
        assertEquals("2026-11-10", d.workout.trainingDate)
        assertEquals(listOf("深蹲", "卧推"), d.items.map { it.workoutExercise.nameSnapshot })
        assertEquals(0, d.loggedSetCount)
        assertTrue(d.items.all { it.drafts.size == 1 })
        assertEquals(listOf(60_000 to 5, 40_000 to 10), d.items.map { it.draft!!.weightGrams to it.draft!!.reps })
        // Source untouched.
        assertEquals(before, dao.allSets().filter { s -> d.items.none { it.workoutExercise.id == s.workoutExerciseId } }.sortedBy { it.id })
    }

    @Test
    fun reuseWorkout_prefillsFromMostRecentTime_notSource() = runTest {
        val bench = exercise("卧推")
        val src = log(on(10, 27), bench, 40_000 to 10)
        log(on(11, 5), bench, 45_000 to 8)

        val result = repo.reuseWorkout(src.workoutId, todayTarget)

        val draft = detail(result.workoutId!!).items.single().draft!!
        assertEquals(45_000 to 8, draft.weightGrams to draft.reps)
    }

    @Test
    fun reuseWorkout_intoExisting_skipsExercisesAlreadyThere() = runTest {
        val squat = exercise("深蹲")
        val bench = exercise("卧推")
        val src = log(on(11, 8), squat, 60_000 to 5)
        log(WorkoutTarget.Existing(src.workoutId), bench, 40_000 to 10)
        val today = log(todayTarget, squat, 65_000 to 5)

        val result = repo.reuseWorkout(src.workoutId, WorkoutTarget.Existing(today.workoutId))

        assertEquals(ReuseResult(today.workoutId, 1, 1, 0), result)
        val d = detail(today.workoutId)
        assertEquals(listOf("深蹲", "卧推"), d.items.map { it.workoutExercise.nameSnapshot })
        assertEquals(1, d.loggedSetCount)
        assertTrue(d.items.all { it.drafts.size == 1 })
    }

    @Test
    fun reuseWorkout_skipsArchived() = runTest {
        val squat = exercise("深蹲")
        val bench = exercise("卧推")
        val src = log(on(11, 8), squat, 60_000 to 5)
        log(WorkoutTarget.Existing(src.workoutId), bench, 40_000 to 10)
        exercises.archive(bench)

        val result = repo.reuseWorkout(src.workoutId, todayTarget)

        assertEquals(1, result.added)
        assertEquals(1, result.skippedArchived)
        assertEquals(listOf("深蹲"), detail(result.workoutId!!).items.map { it.workoutExercise.nameSnapshot })
    }

    @Test
    fun reuseWorkout_nothingToAdd_doesNotCreateWorkout() = runTest {
        val bench = exercise("卧推")
        val src = log(on(11, 8), bench, 40_000 to 10)
        exercises.archive(bench)

        val result = repo.reuseWorkout(src.workoutId, todayTarget)

        assertEquals(ReuseResult(null, 0, 0, 1), result)
        assertEquals(1, dao.countWorkouts())
    }

    @Test
    fun reuseWorkout_deletedSource_throwsNotFound() = runTest {
        val src = log(on(11, 8), exercise("卧推"), 40_000 to 10)
        repo.deleteWorkout(src.workoutId)
        assertTrue(runCatching { repo.reuseWorkout(src.workoutId, todayTarget) }.exceptionOrNull() is WorkoutNotFoundException)
        assertEquals(0, dao.countWorkouts())
    }

    // ---- exercise history ----

    @Test
    fun exerciseHistory_byTrainingDate_loggedOnly_thisExerciseOnly() = runTest {
        val bench = exercise("卧推")
        val squat = exercise("深蹲")
        val a = log(on(11, 9), bench, 40_000 to 10, 40_000 to 9)
        log(WorkoutTarget.Existing(a.workoutId), squat, 60_000 to 5)
        clock.advance(Duration.ofMinutes(5))
        val b = log(on(11, 2), bench, 37_500 to 10) // backfilled later, older date
        repo.addExercise(todayTarget, bench) // today: pending row only

        val history = repo.observeExerciseHistory(bench).first()

        assertEquals(listOf(a.workoutId, b.workoutId), history.map { it.workoutId })
        assertEquals(listOf(LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 2)), history.map { it.trainingDate })
        assertEquals(listOf(40_000 to 10, 40_000 to 9), history[0].sets.map { it.weightGrams to it.reps })
        assertEquals(listOf(37_500 to 10), history[1].sets.map { it.weightGrams to it.reps })
    }

    @Test
    fun exerciseHistory_limitsWorkouts() = runTest {
        val bench = exercise("卧推")
        for (day in 1..5) log(on(11, day), bench, 40_000 to 10, 40_000 to 8)
        val history = repo.observeExerciseHistory(bench, limit = 3).first()
        assertEquals(listOf("2026-11-05", "2026-11-04", "2026-11-03"), history.map { it.trainingDate.toString() })
        assertTrue(history.all { it.sets.size == 2 })
    }
}

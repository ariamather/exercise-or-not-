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
    }

    @After
    fun tearDown() = db.close()

    private suspend fun detail(workoutId: String) = repo.observeWorkout(workoutId).first()!!

    // ---- logging & targets ----

    @Test
    fun logSet_newTarget_createsWorkoutExerciseAndLoggedSet() = runTest {
        val workoutId = repo.logSet(todayTarget, "set-1", "杠铃卧推", 40_000, 10)

        assertEquals(1, dao.countWorkouts())
        assertEquals(1, dao.countExercises())
        val set = dao.allSets().single()
        assertEquals(SetStatus.LOGGED, set.status)
        assertEquals(40_000, set.weightGrams)
        assertEquals(10, set.reps)
        assertNotNull(set.loggedAt)

        val workout = dao.getWorkout(workoutId)!!
        assertEquals("2026-11-10", workout.trainingDate)
        assertEquals("Asia/Shanghai", workout.zoneId)
    }

    @Test
    fun logSet_sameSetIdTwice_keepsSingleRow() = runTest {
        val id1 = repo.logSet(todayTarget, "set-1", "杠铃卧推", 40_000, 10)
        // A retry after the target already switched still lands on the same row.
        val id2 = repo.logSet(WorkoutTarget.Existing(id1), "set-1", "杠铃卧推", 40_000, 10)

        assertEquals(id1, id2)
        assertEquals(1, dao.countWorkouts())
        assertEquals(0, dao.allSets().single().position)
    }

    @Test
    fun logSet_existingTarget_reusesWorkoutAndExercise() = runTest {
        val wid = repo.logSet(todayTarget, "set-1", "杠铃卧推", 40_000, 10)
        repo.logSet(WorkoutTarget.Existing(wid), "set-2", " 杠铃卧推 ", 40_000, 9)
        repo.logSet(WorkoutTarget.Existing(wid), "set-3", "引体向上", null, 8)

        assertEquals(1, dao.countWorkouts())
        assertEquals(2, dao.countExercises())
        val items = detail(wid).items
        assertEquals(listOf("杠铃卧推", "引体向上"), items.map { it.workoutExercise.nameSnapshot })
        assertEquals(listOf(0, 1), items[0].logged.map { it.position })
        assertNull(items[1].logged.single().weightGrams)
    }

    @Test
    fun logSet_newTargetTwice_createsTwoWorkoutsSameDay() = runTest {
        val a = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        val b = repo.logSet(todayTarget, "s2", "深蹲", 60_000, 5)
        assertNotEquals(a, b)
        assertEquals(2, dao.countWorkouts())
    }

    @Test
    fun logSet_pastDate_usesNoonOfThatDay() = runTest {
        val wid = repo.logSet(WorkoutTarget.New(LocalDate.of(2026, 11, 8)), "s1", "深蹲", 60_000, 5)
        val w = dao.getWorkout(wid)!!
        assertEquals("2026-11-08", w.trainingDate)
        assertEquals(Instant.parse("2026-11-08T04:00:00Z").toEpochMilli(), w.performedAt)
    }

    @Test
    fun logSet_futureDate_isRejected() = runTest {
        val e = runCatching {
            repo.logSet(WorkoutTarget.New(today.plusDays(1)), "s1", "深蹲", 60_000, 5)
        }.exceptionOrNull()
        assertTrue(e is IllegalArgumentException)
        assertEquals(0, dao.countWorkouts())
    }

    @Test
    fun logSet_deletedExistingTarget_throwsNotFoundAndWritesNothing() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        repo.deleteWorkout(wid)
        val e = runCatching { repo.logSet(WorkoutTarget.Existing(wid), "s2", "深蹲", 60_000, 5) }.exceptionOrNull()
        assertTrue(e is WorkoutNotFoundException)
        assertEquals(0, dao.allSets().size)
    }

    @Test
    fun latestWorkout_followsMostRecentlyAddedSet_notTrainingDate() = runTest {
        val todayId = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        clock.advance(Duration.ofMinutes(5))
        val backfillId = repo.logSet(WorkoutTarget.New(LocalDate.of(2026, 11, 3)), "s2", "深蹲", 50_000, 5)
        assertEquals(backfillId, repo.latestWorkout()!!.id)

        clock.advance(Duration.ofMinutes(5))
        repo.logSet(WorkoutTarget.Existing(todayId), "s3", "深蹲", 60_000, 5)
        assertEquals(todayId, repo.latestWorkout()!!.id)

        val history = repo.observeHistory().first().map { it.workout.trainingDate }
        assertEquals(listOf("2026-11-10", "2026-11-03"), history)
    }

    @Test
    fun changeWorkoutDate_keepsTimeOfDay() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
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

    // ---- weight rules ----

    @Test
    fun weightRules_autoModeFromFirstEntry() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "引体向上", null, 8)
        repo.logSet(WorkoutTarget.Existing(wid), "s2", "卧推", 40_000, 8)
        assertEquals(WeightMode.BODYWEIGHT, dao.findActiveExerciseByName("引体向上")!!.weightMode)
        assertEquals(WeightMode.TOTAL, dao.findActiveExerciseByName("卧推")!!.weightMode)

        // Bodyweight exercise accepts added weight.
        repo.logSet(WorkoutTarget.Existing(wid), "s3", "引体向上", 10_000, 6)
        // Weighted exercise rejects missing weight.
        val e = runCatching { repo.logSet(WorkoutTarget.Existing(wid), "s4", "卧推", null, 8) }.exceptionOrNull()
        assertTrue(e is IllegalArgumentException)
        assertNull(dao.getSet("s4"))
    }

    @Test
    fun logSet_missingOrZeroReps_isRejected() = runTest {
        listOf(null, 0, -1).forEach { reps ->
            val e = runCatching { repo.logSet(todayTarget, "s-$reps", "深蹲", 60_000, reps) }.exceptionOrNull()
            assertTrue(e is IllegalArgumentException)
        }
        assertEquals(0, dao.countWorkouts())
    }

    @Test
    fun logSet_archivedExerciseWithSameName_isUnarchivedAndReused() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        val squat = dao.findActiveExerciseByName("深蹲")!!
        ExerciseRepository(db, clock).archive(squat.id)
        assertNull(dao.findActiveExerciseByName("深蹲"))

        repo.logSet(WorkoutTarget.Existing(wid), "s2", "深蹲", 60_000, 5)
        assertEquals(1, dao.countExercises())
        assertEquals(false, dao.getExercise(squat.id)!!.archived)
        assertEquals(1, dao.countWorkoutExercises())
    }

    // ---- drafts ----

    @Test
    fun drafts_areSeparateFromLoggedSets() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        val weId = detail(wid).items.single().workoutExercise.id

        repo.saveDraft("d1", weId, 60_000, null)
        var item = detail(wid).items.single()
        assertEquals(listOf("s1"), item.logged.map { it.id })
        assertEquals(listOf("d1"), item.drafts.map { it.id })
        assertEquals(1, detail(wid).loggedSetCount)

        // Incomplete draft cannot be confirmed.
        assertThrows(IllegalArgumentException::class.java) { runBlocking { repo.confirmSet("d1") } }
        assertEquals(SetStatus.DRAFT, dao.getSet("d1")!!.status)

        repo.saveDraft("d1", weId, 60_000, 5)
        repo.confirmSet("d1")
        val confirmed = dao.getSet("d1")!!
        assertEquals(SetStatus.LOGGED, confirmed.status)
        assertNotNull(confirmed.loggedAt)

        // Confirming again is a no-op.
        repo.confirmSet("d1")
        assertEquals(confirmed, dao.getSet("d1"))

        item = detail(wid).items.single()
        assertEquals(listOf("s1", "d1"), item.logged.map { it.id })
        assertTrue(item.drafts.isEmpty())
    }

    @Test
    fun saveDraft_neverDemotesLoggedSet() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        val weId = detail(wid).items.single().workoutExercise.id
        val before = dao.getSet("s1")

        repo.saveDraft("s1", weId, 10_000, 1)
        assertEquals(before, dao.getSet("s1"))
    }

    @Test
    fun historyCounts_ignoreDrafts() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        val weId = detail(wid).items.single().workoutExercise.id
        repo.saveDraft("d1", weId, 60_000, 5)
        repo.saveDraft("d2", weId, 60_000, 5)

        val h = repo.observeHistory().first().single()
        assertEquals(1, h.loggedSetCount)
    }

    // ---- edit ----

    @Test
    fun updateLoggedSet_keepsStatusAndLoggedAt() = runTest {
        repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        val before = dao.getSet("s1")!!
        clock.advance(Duration.ofMinutes(10))

        repo.updateLoggedSet("s1", 65_000, 3)
        val after = dao.getSet("s1")!!
        assertEquals(SetStatus.LOGGED, after.status)
        assertEquals(before.loggedAt, after.loggedAt)
        assertEquals(65_000, after.weightGrams)
        assertEquals(3, after.reps)
        assertTrue(after.updatedAt > before.updatedAt)

        assertThrows(IllegalArgumentException::class.java) { runBlocking { repo.updateLoggedSet("s1", null, 3) } }
        assertThrows(IllegalArgumentException::class.java) { runBlocking { repo.updateLoggedSet("s1", 65_000, 0) } }
    }

    // ---- delete & undo ----

    @Test
    fun deleteSet_thenRestore_isExact() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        repo.logSet(WorkoutTarget.Existing(wid), "s2", "深蹲", 60_000, 4)
        val before = dao.allSets().sortedBy { it.id }

        val snapshot = repo.deleteSet("s1")
        assertEquals(listOf("s2"), dao.allSets().map { it.id })
        assertTrue(snapshot.workoutExercises.isEmpty())

        repo.restore(snapshot)
        assertEquals(before, dao.allSets().sortedBy { it.id })
    }

    @Test
    fun deleteLastSet_removesEmptyItem_andRestoreBringsItBack() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        repo.logSet(WorkoutTarget.Existing(wid), "s2", "卧推", 40_000, 8)
        val itemsBefore = dao.allWorkoutExercises().sortedBy { it.id }
        val setsBefore = dao.allSets().sortedBy { it.id }

        val snapshot = repo.deleteSet("s2")
        assertEquals(listOf("深蹲"), detail(wid).items.map { it.workoutExercise.nameSnapshot })
        assertEquals(1, snapshot.workoutExercises.size)
        assertEquals(1, dao.countWorkouts())

        repo.restore(snapshot)
        assertEquals(itemsBefore, dao.allWorkoutExercises().sortedBy { it.id })
        assertEquals(setsBefore, dao.allSets().sortedBy { it.id })
    }

    @Test
    fun deleteWorkout_thenRestore_isExact() = runTest {
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        repo.logSet(WorkoutTarget.Existing(wid), "s2", "卧推", 40_000, 8)
        val weId = detail(wid).items.first().workoutExercise.id
        repo.saveDraft("d1", weId, 60_000, null)
        val w = dao.allWorkouts()
        val items = dao.allWorkoutExercises().sortedBy { it.id }
        val sets = dao.allSets().sortedBy { it.id }

        val snapshot = repo.deleteWorkout(wid)
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
        val wid = repo.logSet(todayTarget, "s1", "深蹲", 60_000, 5)
        repo.logSet(WorkoutTarget.Existing(wid), "s2", "深蹲", 60_000, 5)
        val setSnapshot = repo.deleteSet("s1")
        repo.deleteWorkout(wid)

        assertTrue(runCatching { repo.restore(setSnapshot) }.exceptionOrNull() is IllegalStateException)
        assertEquals(0, dao.allSets().size)
    }

    @Test
    fun deleteExercise_withHistory_isRejectedByForeignKey() = runTest {
        repo.logSet(todayTarget, "set-1", "杠铃卧推", 40_000, 10)
        val exercise = dao.findActiveExerciseByName("杠铃卧推")!!
        assertThrows(SQLiteConstraintException::class.java) {
            runBlocking { dao.deleteExercise(exercise) }
        }
        assertEquals(1, dao.allSets().size)
    }
}

package com.exerciseornot.app.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.ExerciseEntity
import com.exerciseornot.app.data.db.WeightMode
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Duration
import java.time.LocalDate

@RunWith(AndroidJUnit4::class)
class ExerciseRepositoryTest {

    private lateinit var db: AppDatabase
    private lateinit var workouts: WorkoutRepository
    private lateinit var exercises: ExerciseRepository
    private val dao get() = db.workoutDao()
    private val clock = TestClock()
    private val today = WorkoutTarget.New(LocalDate.of(2026, 11, 10))

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        workouts = WorkoutRepository(db, clock)
        exercises = ExerciseRepository(db, clock)
    }

    @After
    fun tearDown() = db.close()

    private suspend fun failure(block: suspend () -> Unit) = runCatching { block() }.exceptionOrNull()

    @Test
    fun create_trimsAndRejectsBlankOrDuplicate() = runTest {
        val e = exercises.create("  卧推 ", WeightMode.PER_SIDE)
        assertEquals("卧推", e.name)
        assertEquals(WeightMode.PER_SIDE, e.weightMode)

        assertTrue(failure { exercises.create(" ", WeightMode.TOTAL) } is IllegalArgumentException)
        assertTrue(failure { exercises.create("卧推", WeightMode.TOTAL) } is IllegalArgumentException)
        assertTrue(failure { exercises.create("bench", WeightMode.TOTAL); exercises.create("Bench", WeightMode.TOTAL) } is IllegalArgumentException)
        assertEquals(2, dao.countExercises())
    }

    @Test
    fun create_sameNameAsArchived_unarchivesAndKeepsMode() = runTest {
        val squat = exercises.create("深蹲", WeightMode.TOTAL)
        workouts.logSets(db, today, squat.id, 60_000 to 5)
        exercises.archive(squat.id)

        val again = exercises.create("深蹲", WeightMode.BODYWEIGHT)
        assertEquals(squat.id, again.id)
        assertFalse(again.archived)
        assertEquals(WeightMode.TOTAL, again.weightMode)
        assertEquals(1, dao.countExercises())
    }

    @Test
    fun pickerList_recentFirst_thenUnusedByName_archivedHidden() = runTest {
        val squat = exercises.create("深蹲", WeightMode.TOTAL)
        val bench = exercises.create("卧推", WeightMode.TOTAL)
        exercises.create("b-row", WeightMode.TOTAL)
        exercises.create("A-curl", WeightMode.PER_SIDE)
        val archived = exercises.create("硬拉", WeightMode.TOTAL)
        exercises.archive(archived.id)

        val w = workouts.logSets(db, today, squat.id, 60_000 to 5)
        clock.advance(Duration.ofMinutes(10))
        workouts.logSets(db, WorkoutTarget.Existing(w.workoutId), bench.id, 40_000 to 8)
        // A pending row alone doesn't make an exercise "recent".
        workouts.addExercise(WorkoutTarget.Existing(w.workoutId), dao.findActiveExerciseByName("b-row")!!.id)

        val list = exercises.observePickerList().first()
        assertEquals(listOf("卧推", "深蹲", "A-curl", "b-row"), list.map { it.exercise.name })
        assertEquals(listOf(true, true, false, false), list.map { it.lastUsedAt != null })
    }

    @Test
    fun rename_keepsHistorySnapshot() = runTest {
        val bench = exercises.create("卧推", WeightMode.TOTAL)
        val added = workouts.logSets(db, today, bench.id, 40_000 to 8)
        exercises.rename(bench.id, "杠铃卧推")

        assertEquals("杠铃卧推", dao.getExercise(bench.id)!!.name)
        val item = workouts.observeWorkout(added.workoutId).first()!!.items.single()
        assertEquals("卧推", item.workoutExercise.nameSnapshot)

        // Adding it again in the same workout joins the existing item.
        assertEquals(added, workouts.addExercise(WorkoutTarget.Existing(added.workoutId), bench.id))
    }

    @Test
    fun rename_toNameOfAnotherActiveExercise_isRejected() = runTest {
        val bench = exercises.create("卧推", WeightMode.TOTAL)
        val squat = exercises.create("深蹲", WeightMode.TOTAL)

        assertTrue(failure { exercises.rename(bench.id, " 深蹲 ") } is IllegalArgumentException)
        assertTrue(failure { exercises.rename(bench.id, "  ") } is IllegalArgumentException)
        // Renaming to its own name is not a clash.
        exercises.rename(squat.id, "深蹲")
    }

    @Test
    fun archive_hidesFromActiveLookup_unarchiveBringsBack() = runTest {
        val bench = exercises.create("卧推", WeightMode.TOTAL)
        workouts.logSets(db, today, bench.id, 40_000 to 8)
        exercises.archive(bench.id)
        assertNull(dao.findActiveExerciseByName("卧推"))
        assertTrue(exercises.observePickerList().first().isEmpty())
        assertEquals(1, dao.loggedOf(dao.allWorkoutExercises().single().id).size)

        exercises.unarchive(bench.id)
        assertEquals(bench.id, dao.findActiveExerciseByName("卧推")!!.id)
    }

    @Test
    fun unarchive_whenActiveNameTaken_isRejected() = runTest {
        val old = ExerciseEntity("old", "卧推", WeightMode.TOTAL, archived = true, createdAt = 0, updatedAt = 0)
        dao.upsertExercise(old)
        dao.upsertExercise(old.copy(id = "new", archived = false))
        assertTrue(failure { exercises.unarchive("old") } is IllegalArgumentException)
    }

    @Test
    fun setWeightMode_onlyBeforeAnyHistory() = runTest {
        val e = exercises.create("哑铃卧推", WeightMode.TOTAL)
        exercises.setWeightMode(e.id, WeightMode.PER_SIDE)
        assertEquals(WeightMode.PER_SIDE, dao.getExercise(e.id)!!.weightMode)

        workouts.logSets(db, today, e.id, 20_000 to 10)
        assertTrue(failure { exercises.setWeightMode(e.id, WeightMode.TOTAL) } is IllegalArgumentException)
        assertEquals(WeightMode.PER_SIDE, dao.getExercise(e.id)!!.weightMode)
        assertEquals(WeightMode.PER_SIDE, dao.allWorkoutExercises().single().weightModeSnapshot)
    }
}

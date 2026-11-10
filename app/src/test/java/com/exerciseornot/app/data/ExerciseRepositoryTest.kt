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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
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

    private suspend fun idOf(name: String) = dao.findActiveExerciseByName(name)!!.id

    private suspend fun failure(block: suspend () -> Unit) = runCatching { block() }.exceptionOrNull()

    @Test
    fun rename_keepsHistorySnapshot() = runTest {
        val wid = workouts.logSet(today, "s1", "卧推", 40_000, 8)
        exercises.rename(idOf("卧推"), "杠铃卧推")

        assertEquals("杠铃卧推", dao.getExercise(idOf("杠铃卧推"))!!.name)
        val item = workouts.observeWorkout(wid).first()!!.items.single()
        assertEquals("卧推", item.workoutExercise.nameSnapshot)

        // New sets under the new name join the same exercise item.
        workouts.logSet(WorkoutTarget.Existing(wid), "s2", "杠铃卧推", 40_000, 8)
        assertEquals(1, dao.countWorkoutExercises())
    }

    @Test
    fun rename_toNameOfAnotherActiveExercise_isRejected() = runTest {
        val wid = workouts.logSet(today, "s1", "卧推", 40_000, 8)
        workouts.logSet(WorkoutTarget.Existing(wid), "s2", "深蹲", 60_000, 5)

        assertTrue(failure { exercises.rename(idOf("卧推"), " 深蹲 ") } is IllegalArgumentException)
        assertTrue(failure { exercises.rename(idOf("卧推"), "  ") } is IllegalArgumentException)
        // Renaming to its own name is not a clash.
        exercises.rename(idOf("深蹲"), "深蹲")
    }

    @Test
    fun archive_hidesFromActiveLookup_unarchiveBringsBack() = runTest {
        workouts.logSet(today, "s1", "卧推", 40_000, 8)
        val id = idOf("卧推")
        exercises.archive(id)
        assertEquals(null, dao.findActiveExerciseByName("卧推"))
        assertEquals(1, dao.allSets().size)

        exercises.unarchive(id)
        assertEquals(id, idOf("卧推"))
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
        dao.upsertExercise(ExerciseEntity("e1", "哑铃卧推", WeightMode.TOTAL, createdAt = 0, updatedAt = 0))
        exercises.setWeightMode("e1", WeightMode.PER_SIDE)
        assertEquals(WeightMode.PER_SIDE, dao.getExercise("e1")!!.weightMode)

        workouts.logSet(today, "s1", "哑铃卧推", 20_000, 10)
        assertTrue(failure { exercises.setWeightMode("e1", WeightMode.TOTAL) } is IllegalArgumentException)
        assertEquals(WeightMode.PER_SIDE, dao.getExercise("e1")!!.weightMode)
        assertEquals(WeightMode.PER_SIDE, dao.allWorkoutExercises().single().weightModeSnapshot)
    }
}

package com.exerciseornot.app.data

import android.content.Context
import android.database.sqlite.SQLiteConstraintException
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.SetStatus
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

@RunWith(AndroidJUnit4::class)
class WorkoutRepositoryTest {

    private lateinit var db: AppDatabase
    private lateinit var repo: WorkoutRepository

    private val zone = ZoneId.of("Asia/Shanghai")
    private val clock = Clock.fixed(Instant.parse("2026-11-10T12:00:00Z"), zone)

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

    @Test
    fun logSet_createsWorkoutExerciseAndLoggedSet() = runTest {
        repo.logSet("set-1", "杠铃卧推", 40_000, 10)

        val dao = db.workoutDao()
        assertEquals(1, dao.countWorkouts())
        assertEquals(1, dao.countExercises())
        assertEquals(1, dao.countWorkoutExercises())
        val set = dao.allSets().single()
        assertEquals(SetStatus.LOGGED, set.status)
        assertEquals(40_000, set.weightGrams)
        assertEquals(10, set.reps)

        val workout = repo.observeWorkouts().first().single().workout
        assertEquals("2026-11-10", workout.trainingDate)
        assertEquals("Asia/Shanghai", workout.zoneId)
    }

    @Test
    fun logSet_sameSetIdTwice_keepsSingleRow() = runTest {
        repo.logSet("set-1", "杠铃卧推", 40_000, 10)
        repo.logSet("set-1", "杠铃卧推", 40_000, 10)

        val sets = db.workoutDao().allSets()
        assertEquals(1, sets.size)
        assertEquals(0, sets.single().position)
    }

    @Test
    fun logSet_subsequentSets_reuseWorkoutAndExercise() = runTest {
        repo.logSet("set-1", "杠铃卧推", 40_000, 10)
        repo.logSet("set-2", " 杠铃卧推 ", 40_000, 9)
        repo.logSet("set-3", "深蹲", null, 12)

        val dao = db.workoutDao()
        assertEquals(1, dao.countWorkouts())
        assertEquals(2, dao.countExercises())
        assertEquals(2, dao.countWorkoutExercises())
        val bench = repo.observeWorkouts().first().single().exercises
            .single { it.workoutExercise.nameSnapshot == "杠铃卧推" }
        assertEquals(listOf(0, 1), bench.sets.map { it.position }.sorted())
        assertNull(dao.allSets().single { it.id == "set-3" }.weightGrams)
    }

    @Test
    fun deleteExercise_withHistory_isRejected() = runTest {
        repo.logSet("set-1", "杠铃卧推", 40_000, 10)
        val dao = db.workoutDao()
        val exercise = dao.findActiveExerciseByName("杠铃卧推")!!

        assertThrows(SQLiteConstraintException::class.java) {
            kotlinx.coroutines.runBlocking { dao.deleteExercise(exercise) }
        }
        assertEquals(1, dao.allSets().size)
    }

    @Test
    fun deleteWorkout_cascadesToExercisesAndSets() = runTest {
        repo.logSet("set-1", "杠铃卧推", 40_000, 10)
        val dao = db.workoutDao()
        val workout = repo.observeWorkouts().first().single().workout

        dao.deleteWorkout(workout)

        assertEquals(0, dao.countWorkoutExercises())
        assertEquals(0, dao.allSets().size)
        assertEquals(1, dao.countExercises())
    }
}

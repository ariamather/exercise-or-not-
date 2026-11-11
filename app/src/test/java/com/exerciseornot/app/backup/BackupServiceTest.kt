package com.exerciseornot.app.backup

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.data.ExerciseRepository
import com.exerciseornot.app.data.TestClock
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.logSets
import com.exerciseornot.app.dice.DicePreferences
import com.exerciseornot.app.dice.DiceResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.Instant
import java.time.LocalDate

@RunWith(AndroidJUnit4::class)
class BackupServiceTest {

    @get:Rule val tmp = TemporaryFolder()
    private val storeScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val clock = TestClock(Instant.parse("2026-11-10T12:00:00Z"))
    private val today = LocalDate.of(2026, 11, 10)

    private lateinit var db: AppDatabase
    private lateinit var repo: WorkoutRepository
    private lateinit var exercises: ExerciseRepository
    private lateinit var dice: DicePreferences
    private lateinit var service: BackupService
    private lateinit var dir: File
    private var replacedCount = 0
    private val dao get() = db.workoutDao()

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        repo = WorkoutRepository(db, clock)
        exercises = ExerciseRepository(db, clock)
        val store = PreferenceDataStoreFactory.create(scope = storeScope) { tmp.root.resolve("settings.preferences_pb") }
        dice = DicePreferences(store)
        dir = tmp.newFolder("backup")
        service = BackupService(db, dice, store, dir, "test", clock) { replacedCount++ }
    }

    @After
    fun tearDown() {
        db.close()
        storeScope.cancel()
    }

    private data class Tables(val e: Any, val w: Any, val we: Any, val s: Any)

    private suspend fun tables() = Tables(
        dao.allExercises().sortedBy { it.id },
        dao.allWorkouts().sortedBy { it.id },
        dao.allWorkoutExercises().sortedBy { it.id },
        dao.allSets().sortedBy { it.id },
    )

    private suspend fun seed() {
        val bench = exercises.create("卧推", WeightMode.TOTAL).id
        val pullUp = exercises.create("引体", WeightMode.BODYWEIGHT).id
        repo.logSets(db, WorkoutTarget.New(today.minusDays(2)), bench, 40_000 to 10, 40_000 to 8)
        repo.logSets(db, WorkoutTarget.New(today), pullUp, null to 8)
        exercises.create("旧动作", WeightMode.PER_SIDE).id.also { exercises.archive(it) }
        dice.setTrainFaces(setOf(6))
        dice.saveResult(DiceResult(6, true, today))
    }

    private suspend fun exportBytes(): ByteArray = ByteArrayOutputStream().also { service.exportTo(it) }.toByteArray()

    private suspend fun clearAll() {
        dao.deleteAllSets(); dao.deleteAllWorkoutExercises(); dao.deleteAllWorkouts(); dao.deleteAllExercises()
        dice.setTrainFaces(setOf(4, 5, 6))
    }

    @Test
    fun exportThenRestore_reproducesAllTablesAndDiceFaces() = runBlocking {
        seed()
        val before = tables()
        val bytes = exportBytes()
        assertNotNull(service.lastExportAt.first())

        clearAll()
        service.restore(service.preview(ByteArrayInputStream(bytes)))

        assertEquals(before, tables())
        assertEquals(setOf(6), dice.trainFaces.first())
        assertEquals(1, replacedCount)
    }

    @Test
    fun export_includesDraftsButNotTodaysRoll() = runBlocking {
        seed()
        val text = exportBytes().toString(Charsets.UTF_8)
        assertTrue(text.contains("\"DRAFT\""))
        assertFalse(text.contains("dice.last"))
        assertEquals(2, service.preview(ByteArrayInputStream(text.toByteArray())).summary.workouts)
    }

    @Test
    fun preview_writesNothing() = runBlocking {
        seed()
        val bytes = exportBytes()
        clearAll()
        service.preview(ByteArrayInputStream(bytes))
        assertEquals(0, dao.countWorkouts())
        assertNull(service.restoreBackupAt.value)
    }

    @Test
    fun invalidFile_leavesDataUntouched() = runBlocking {
        seed()
        val before = tables()
        assertThrows(InvalidBackupException::class.java) {
            runBlocking { service.preview(ByteArrayInputStream("not a backup".toByteArray())) }
        }
        assertEquals(before, tables())
    }

    @Test
    fun oversizedFile_rejectedWithoutReadingItAll() = runBlocking {
        val huge = object : java.io.InputStream() {
            var served = 0L
            override fun read(): Int = if (served++ < MAX_BACKUP_BYTES + 10L) ' '.code else -1
        }
        val e = assertThrows(InvalidBackupException::class.java) { runBlocking { service.preview(huge) } }
        assertTrue(e.message!!.contains("过大"))
    }

    @Test
    fun restore_keepsCopyOfPreviousData_andUndoBringsItBack() = runBlocking {
        seed()
        val original = tables()
        val backup = service.preview(ByteArrayInputStream(exportBytes()))

        // Change data after exporting, then restore the older backup over it.
        val squat = exercises.create("深蹲", WeightMode.TOTAL).id
        repo.logSets(db, WorkoutTarget.New(today), squat, 60_000 to 5)
        val changed = tables()
        service.restore(backup)
        assertEquals(original, tables())
        assertNotNull(service.restoreBackupAt.value)
        assertTrue(File(dir, "before-restore.json").exists())

        service.undoLastRestore()
        assertEquals(changed, tables())
        assertNull(service.restoreBackupAt.value)
        assertFalse(File(dir, "before-restore.json").exists())
        assertEquals(2, replacedCount)
    }

    @Test
    fun undoWithoutRestore_fails() {
        assertThrows(IllegalArgumentException::class.java) { runBlocking { service.undoLastRestore() } }
    }

    @Test
    fun restoreOntoEmptyInstall_thenUndo_returnsToEmpty() = runBlocking {
        seed()
        val bytes = exportBytes()
        clearAll()
        service.restore(service.preview(ByteArrayInputStream(bytes)))
        assertEquals(2, dao.countWorkouts())
        service.undoLastRestore()
        assertEquals(0, dao.countWorkouts())
        assertEquals(0, dao.countExercises())
    }
}

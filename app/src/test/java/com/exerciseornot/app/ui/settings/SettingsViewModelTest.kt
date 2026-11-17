package com.exerciseornot.app.ui.settings

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exerciseornot.app.backup.BackupService
import com.exerciseornot.app.data.ExerciseRepository
import com.exerciseornot.app.data.TestClock
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.WorkoutTarget
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.logSets
import com.exerciseornot.app.chance.ChancePreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import java.time.Instant
import java.time.LocalDate
import java.util.Collections

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class SettingsViewModelTest {

    @get:Rule val tmp = TemporaryFolder()
    private val storeScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val collectors = CoroutineScope(Dispatchers.Unconfined)
    private val clock = TestClock(Instant.parse("2026-11-10T12:00:00Z"))
    private lateinit var db: AppDatabase
    private lateinit var repo: WorkoutRepository
    private lateinit var exercises: ExerciseRepository
    private lateinit var vm: SettingsViewModel
    private val messages = Collections.synchronizedList(mutableListOf<String>())

    @Before
    fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).allowMainThreadQueries().build()
        repo = WorkoutRepository(db, clock)
        exercises = ExerciseRepository(db, clock)
        val store = PreferenceDataStoreFactory.create(scope = storeScope) { tmp.root.resolve("settings.preferences_pb") }
        val service = BackupService(db, ChancePreferences(store), store, tmp.newFolder("backup"), "test", clock)
        vm = SettingsViewModel(service)
        collectors.launch { vm.messages.collect { messages += it } }
        collectors.launch { vm.lastExportAt.collect {} }
    }

    @After
    fun tearDown() {
        collectors.cancel()
        db.close()
        storeScope.cancel()
        Dispatchers.resetMain()
    }

    private fun awaitUntil(message: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 5_000
        while (!condition()) {
            check(System.currentTimeMillis() < deadline) { "timed out waiting for $message" }
            Thread.sleep(10)
        }
    }

    private fun exportToBytes(): ByteArray {
        val out = ByteArrayOutputStream()
        vm.export { out }
        awaitUntil("export message") { messages.isNotEmpty() }
        assertEquals("已导出备份", messages.removeAt(0))
        return out.toByteArray()
    }

    @Test
    fun export_setsLastExportTime() {
        assertNull(vm.lastExportAt.value)
        exportToBytes()
        awaitUntil("last export time") { vm.lastExportAt.value != null }
    }

    @Test
    fun exportFailure_showsMessage() {
        vm.export { object : OutputStream() { override fun write(b: Int) = throw IOException("disk full") } }
        awaitUntil("message") { messages.isNotEmpty() }
        assertEquals("导出失败，请换个位置重试", messages.single())
    }

    @Test
    fun badFile_showsReason_andNoPendingRestore() {
        vm.preview { ByteArrayInputStream("garbage".toByteArray()) }
        awaitUntil("message") { messages.isNotEmpty() }
        assertEquals("不是有效的备份文件", messages.single())
        assertNull(vm.pending.value)
        assertEquals(false, vm.busy.value)
    }

    @Test
    fun previewConfirmRestore_thenUndo() {
        val bench = runBlocking { exercises.create("卧推", WeightMode.TOTAL).id }
        runBlocking { repo.logSets(db, WorkoutTarget.New(LocalDate.of(2026, 11, 8)), bench, 40_000 to 10) }
        val bytes = exportToBytes()
        runBlocking { db.workoutDao().run { deleteAllSets(); deleteAllWorkoutExercises(); deleteAllWorkouts() } }

        vm.preview { ByteArrayInputStream(bytes) }
        awaitUntil("pending restore") { vm.pending.value != null }
        assertEquals(1, vm.pending.value!!.summary.workouts)
        assertEquals(0, runBlocking { db.workoutDao().countWorkouts() })
        assertNull(vm.restoreBackupAt.value)

        vm.confirmRestore()
        awaitUntil("restore message") { messages.isNotEmpty() }
        assertEquals("已恢复备份", messages.removeAt(0))
        assertEquals(1, runBlocking { db.workoutDao().countWorkouts() })
        assertNotNull(vm.restoreBackupAt.value)

        vm.undoLastRestore()
        awaitUntil("undo message") { messages.isNotEmpty() }
        assertEquals("已撤销上次恢复", messages.single())
        assertEquals(0, runBlocking { db.workoutDao().countWorkouts() })
        assertNull(vm.restoreBackupAt.value)
    }

    @Test
    fun cancelRestore_clearsPending() {
        val bytes = exportToBytes()
        vm.preview { ByteArrayInputStream(bytes) }
        awaitUntil("pending restore") { vm.pending.value != null }
        vm.cancelRestore()
        assertNull(vm.pending.value)
    }
}

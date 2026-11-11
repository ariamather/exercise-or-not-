package com.exerciseornot.app.backup

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.room.withTransaction
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.DB_SCHEMA_VERSION
import com.exerciseornot.app.dice.DicePreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.time.Clock
import java.time.Instant

const val MAX_BACKUP_BYTES = 20 * 1024 * 1024

/**
 * Full export and full replace-restore. Restoring first saves the current data to [dir] so the
 * last restore can be undone; the replace itself is one transaction, so a failure leaves the
 * existing data untouched.
 */
class BackupService(
    private val db: AppDatabase,
    private val dice: DicePreferences,
    private val settings: DataStore<Preferences>,
    private val dir: File,
    private val appVersion: String,
    private val clock: Clock = Clock.systemDefaultZone(),
    private val onDataReplaced: () -> Unit = {},
) {
    private val dao = db.workoutDao()
    private val protectionFile get() = File(dir, "before-restore.json")

    private val _restoreBackupAt = MutableStateFlow(protectionTime())
    /** When the pre-restore copy was taken; null if there is no restore to undo. */
    val restoreBackupAt: StateFlow<Instant?> = _restoreBackupAt.asStateFlow()

    val lastExportAt: Flow<Instant?> = settings.data.map { p -> p[KEY_LAST_EXPORT]?.let(Instant::ofEpochMilli) }

    suspend fun exportTo(out: OutputStream) {
        val text = BackupCodec.encode(snapshot())
        withContext(Dispatchers.IO) {
            out.bufferedWriter(Charsets.UTF_8).let { it.write(text); it.flush() }
        }
        settings.edit { it[KEY_LAST_EXPORT] = clock.millis() }
    }

    /** Reads and validates a backup without writing anything. */
    suspend fun preview(input: InputStream): BackupContent = BackupCodec.decode(readLimited(input))

    suspend fun restore(content: BackupContent) {
        val copy = BackupCodec.encode(snapshot())
        withContext(Dispatchers.IO) {
            dir.mkdirs()
            val tmp = File(dir, "before-restore.json.tmp")
            tmp.writeText(copy, Charsets.UTF_8)
            if (!tmp.renameTo(protectionFile)) {
                tmp.delete()
                throw IllegalStateException("cannot keep a copy of the current data")
            }
        }
        _restoreBackupAt.value = protectionTime()
        replaceAll(content)
    }

    suspend fun undoLastRestore() {
        val file = protectionFile
        val text = withContext(Dispatchers.IO) { if (file.exists()) file.readText(Charsets.UTF_8) else null }
            ?: throw IllegalArgumentException("没有可撤销的恢复")
        replaceAll(BackupCodec.decode(text))
        withContext(Dispatchers.IO) { file.delete() }
        _restoreBackupAt.value = null
    }

    private suspend fun snapshot(): BackupFile {
        val file = db.withTransaction {
            BackupFile(
                formatVersion = BACKUP_FORMAT_VERSION,
                schemaVersion = DB_SCHEMA_VERSION,
                appVersion = appVersion,
                exportedAt = clock.millis(),
                exercises = dao.allExercises().map { it.toBackup() },
                workouts = dao.allWorkouts().map { it.toBackup() },
                workoutExercises = dao.allWorkoutExercises().map { it.toBackup() },
                sets = dao.allSets().map { it.toBackup() },
                settings = BackupSettings(emptyList()),
            )
        }
        return file.copy(settings = BackupSettings(dice.trainFaces.first().sorted()))
    }

    private suspend fun replaceAll(content: BackupContent) {
        db.withTransaction {
            dao.deleteAllSets()
            dao.deleteAllWorkoutExercises()
            dao.deleteAllWorkouts()
            dao.deleteAllExercises()
            dao.upsertExercises(content.exercises)
            dao.upsertWorkouts(content.workouts)
            dao.upsertWorkoutExercises(content.workoutExercises)
            dao.upsertSets(content.sets)
        }
        onDataReplaced()
        try {
            dice.setTrainFaces(content.diceTrainFaces)
        } catch (e: Exception) {
            throw IllegalArgumentException("训练数据已恢复，但骰子设置未能恢复，请在骰子设置里重新选择")
        }
    }

    private suspend fun readLimited(input: InputStream): String = withContext(Dispatchers.IO) {
        val out = ByteArrayOutputStream()
        val buf = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            if (out.size() > MAX_BACKUP_BYTES) throw InvalidBackupException("文件过大，不是本应用的备份")
        }
        out.toString(Charsets.UTF_8.name())
    }

    private fun protectionTime(): Instant? =
        protectionFile.takeIf { it.exists() }?.let { Instant.ofEpochMilli(it.lastModified()) }

    private companion object {
        val KEY_LAST_EXPORT = longPreferencesKey("backup.lastExportAt")
    }
}

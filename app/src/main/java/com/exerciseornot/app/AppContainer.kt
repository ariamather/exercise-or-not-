package com.exerciseornot.app

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore
import com.exerciseornot.app.backup.BackupService
import com.exerciseornot.app.data.ExerciseRepository
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.dice.DicePreferences
import com.exerciseornot.app.ui.RecordRequests
import java.io.File
import java.time.Clock

private val Context.settingsStore by preferencesDataStore(name = "settings")

class AppContainer(context: Context) {
    private val database = AppDatabase.create(context)
    private val settingsStore = context.applicationContext.settingsStore
    val clock: Clock = Clock.systemDefaultZone()
    val workoutRepository = WorkoutRepository(database, clock)
    val exerciseRepository = ExerciseRepository(database, clock)
    val recordRequests = RecordRequests()
    val dicePreferences = DicePreferences(settingsStore)
    val backupService = BackupService(
        database,
        dicePreferences,
        settingsStore,
        File(context.filesDir, "backup"),
        appVersion = BuildConfig.VERSION_NAME,
        clock = clock,
        onDataReplaced = recordRequests::notifyDataReplaced,
    )
}

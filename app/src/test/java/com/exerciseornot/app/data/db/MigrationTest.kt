package com.exerciseornot.app.data.db

import android.content.Context
import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Guards the exported schema files. When adding version N+1: add MIGRATION_N_(N+1) to
 * [AppDatabase.ALL_MIGRATIONS], then add a test that creates version N here, inserts rows with raw
 * SQL, calls `helper.runMigrationsAndValidate(DB, N + 1, true, MIGRATION_N_(N+1))` and checks them.
 */
@RunWith(AndroidJUnit4::class)
class MigrationTest {

    private val db = "migration-test.db"

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), AppDatabase::class.java)

    @Test
    fun schemaFile_matchesEntities_andDataIsReadable() {
        helper.createDatabase(db, 1).apply {
            execSQL("INSERT INTO exercise (id, name, weightMode, archived, createdAt, updatedAt) VALUES ('e1', '卧推', 'TOTAL', 0, 1, 1)")
            execSQL(
                "INSERT INTO workout (id, performedAt, trainingDate, zoneId, createdAt, updatedAt) " +
                    "VALUES ('w1', 100, '2026-11-08', 'Asia/Shanghai', 1, 1)"
            )
            execSQL(
                "INSERT INTO workout_exercise (id, workoutId, exerciseId, position, nameSnapshot, weightModeSnapshot, createdAt, updatedAt) " +
                    "VALUES ('we1', 'w1', 'e1', 0, '卧推', 'TOTAL', 1, 1)"
            )
            execSQL(
                "INSERT INTO set_entry (id, workoutExerciseId, position, weightGrams, reps, status, loggedAt, createdAt, updatedAt) " +
                    "VALUES ('s1', 'we1', 0, 40000, 10, 'LOGGED', 5, 1, 1)"
            )
            close()
        }

        // Opening through Room validates the on-disk schema against the current entities.
        val context = ApplicationProvider.getApplicationContext<Context>()
        val room = Room.databaseBuilder(context, AppDatabase::class.java, db)
            .addMigrations(*AppDatabase.ALL_MIGRATIONS)
            .allowMainThreadQueries()
            .build()
        try {
            val set = runBlocking { room.workoutDao().allSets() }.single()
            assertEquals(40_000, set.weightGrams)
            assertEquals(SetStatus.LOGGED, set.status)
            assertEquals("2026-11-08", runBlocking { room.workoutDao().getWorkout("w1") }!!.trainingDate)
        } finally {
            room.close()
        }
    }

    @Test
    fun latestSchemaVersion_isExported() {
        helper.createDatabase("latest-$db", DB_SCHEMA_VERSION).close()
    }
}

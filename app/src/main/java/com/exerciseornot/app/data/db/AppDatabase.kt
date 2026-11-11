package com.exerciseornot.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration

const val DB_SCHEMA_VERSION = 1

@Database(
    entities = [
        ExerciseEntity::class,
        WorkoutEntity::class,
        WorkoutExerciseEntity::class,
        SetEntryEntity::class,
    ],
    version = DB_SCHEMA_VERSION,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun workoutDao(): WorkoutDao

    companion object {
        const val NAME = "exerciseornot.db"

        /** Every schema change bumps the version and adds its Migration (plus a test) here. */
        val ALL_MIGRATIONS: Array<Migration> = arrayOf()

        // Never add fallbackToDestructiveMigration: every schema change ships with a Migration.
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, NAME)
                .addMigrations(*ALL_MIGRATIONS)
                .build()
    }
}

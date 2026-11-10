package com.exerciseornot.app.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

enum class WeightMode { TOTAL, PER_SIDE, BODYWEIGHT }

enum class SetStatus { DRAFT, LOGGED }

@Entity(
    tableName = "exercise",
    indices = [Index("name")],
)
data class ExerciseEntity(
    @PrimaryKey val id: String,
    val name: String,
    val weightMode: WeightMode,
    val archived: Boolean = false,
    val createdAt: Long,
    val updatedAt: Long,
)

@Entity(
    tableName = "workout",
    indices = [Index("trainingDate", "performedAt")],
)
data class WorkoutEntity(
    @PrimaryKey val id: String,
    val performedAt: Long,
    /** ISO yyyy-MM-dd in [zoneId]; stored so edits to device zone never shift past workouts. */
    val trainingDate: String,
    val zoneId: String,
    val createdAt: Long,
    val updatedAt: Long,
)

@Entity(
    tableName = "workout_exercise",
    foreignKeys = [
        ForeignKey(
            entity = WorkoutEntity::class,
            parentColumns = ["id"],
            childColumns = ["workoutId"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = ExerciseEntity::class,
            parentColumns = ["id"],
            childColumns = ["exerciseId"],
            onDelete = ForeignKey.RESTRICT,
        ),
    ],
    indices = [Index("workoutId"), Index("exerciseId")],
)
data class WorkoutExerciseEntity(
    @PrimaryKey val id: String,
    val workoutId: String,
    val exerciseId: String,
    val position: Int,
    val nameSnapshot: String,
    val weightModeSnapshot: WeightMode,
    val createdAt: Long,
    val updatedAt: Long,
)

@Entity(
    tableName = "set_entry",
    foreignKeys = [
        ForeignKey(
            entity = WorkoutExerciseEntity::class,
            parentColumns = ["id"],
            childColumns = ["workoutExerciseId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("workoutExerciseId")],
)
data class SetEntryEntity(
    @PrimaryKey val id: String,
    val workoutExerciseId: String,
    val position: Int,
    val weightGrams: Int?,
    val reps: Int?,
    val status: SetStatus,
    val loggedAt: Long?,
    val createdAt: Long,
    val updatedAt: Long,
)

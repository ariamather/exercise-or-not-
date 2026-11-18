package com.exerciseornot.app.backup

import com.exerciseornot.app.chance.ChanceSettings
import com.exerciseornot.app.data.db.ExerciseEntity
import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WeightMode
import com.exerciseornot.app.data.db.WorkoutEntity
import com.exerciseornot.app.data.db.WorkoutExerciseEntity
import kotlinx.serialization.Serializable

const val BACKUP_FORMAT_VERSION = 1

/** Upper bound for one model's draw memory in a backup; a pot of a few hundred slips fits easily. */
const val MAX_MEMORY_CHARS = 16_384

/**
 * On-disk backup shape. Kept separate from the Room entities so schema and file format can
 * evolve independently; enums are names, weights are grams, times are epoch millis.
 */
@Serializable
data class BackupFile(
    val formatVersion: Int,
    val schemaVersion: Int,
    val appVersion: String,
    val exportedAt: Long,
    val exercises: List<BackupExercise>,
    val workouts: List<BackupWorkout>,
    val workoutExercises: List<BackupWorkoutExercise>,
    val sets: List<BackupSet>,
    val settings: BackupSettings,
)

/**
 * [diceTrainFaces] is what 0.2.0 reads (it requires the field and ignores unknown ones), so it
 * is still written, from the current probability, and a newer backup restores on 0.2.0 too.
 * [chanceTarget] wins when present. [chanceMemory] is each model's draw memory (e.g. what is
 * left in a pot), keyed by model id; older versions ignore it.
 */
@Serializable
data class BackupSettings(
    val diceTrainFaces: List<Int>,
    val chanceGame: String? = null,
    val chanceTarget: Double? = null,
    val chanceMemory: Map<String, String>? = null,
)

@Serializable
data class BackupExercise(
    val id: String,
    val name: String,
    val weightMode: String,
    val archived: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
)

@Serializable
data class BackupWorkout(
    val id: String,
    val performedAt: Long,
    val trainingDate: String,
    val zoneId: String,
    val createdAt: Long,
    val updatedAt: Long,
)

@Serializable
data class BackupWorkoutExercise(
    val id: String,
    val workoutId: String,
    val exerciseId: String,
    val position: Int,
    val nameSnapshot: String,
    val weightModeSnapshot: String,
    val createdAt: Long,
    val updatedAt: Long,
)

@Serializable
data class BackupSet(
    val id: String,
    val workoutExerciseId: String,
    val position: Int,
    val weightGrams: Int? = null,
    val reps: Int? = null,
    val status: String,
    val loggedAt: Long? = null,
    val createdAt: Long,
    val updatedAt: Long,
)

/** A validated backup, already converted to entities and ready to write. */
data class BackupContent(
    val exportedAt: Long,
    val exercises: List<ExerciseEntity>,
    val workouts: List<WorkoutEntity>,
    val workoutExercises: List<WorkoutExerciseEntity>,
    val sets: List<SetEntryEntity>,
    val chance: ChanceSettings,
    val chanceMemory: Map<String, String> = emptyMap(),
) {
    val summary: BackupSummary
        get() = BackupSummary(
            exportedAt = exportedAt,
            exercises = exercises.size,
            workouts = workouts.size,
            loggedSets = sets.count { it.status == SetStatus.LOGGED },
            firstDate = workouts.minOfOrNull { it.trainingDate },
            lastDate = workouts.maxOfOrNull { it.trainingDate },
        )
}

data class BackupSummary(
    val exportedAt: Long,
    val exercises: Int,
    val workouts: Int,
    val loggedSets: Int,
    val firstDate: String?,
    val lastDate: String?,
)

class InvalidBackupException(message: String) : IllegalArgumentException(message)

internal fun ExerciseEntity.toBackup() = BackupExercise(id, name, weightMode.name, archived, createdAt, updatedAt)
internal fun WorkoutEntity.toBackup() = BackupWorkout(id, performedAt, trainingDate, zoneId, createdAt, updatedAt)
internal fun WorkoutExerciseEntity.toBackup() =
    BackupWorkoutExercise(id, workoutId, exerciseId, position, nameSnapshot, weightModeSnapshot.name, createdAt, updatedAt)
internal fun SetEntryEntity.toBackup() =
    BackupSet(id, workoutExerciseId, position, weightGrams, reps, status.name, loggedAt, createdAt, updatedAt)

internal fun weightModeOf(name: String): WeightMode? = WeightMode.entries.firstOrNull { it.name == name }
internal fun setStatusOf(name: String): SetStatus? = SetStatus.entries.firstOrNull { it.name == name }

package com.exerciseornot.app.data

import androidx.room.withTransaction
import com.exerciseornot.app.data.db.AppDatabase
import com.exerciseornot.app.data.db.ExerciseEntity
import com.exerciseornot.app.data.db.WeightMode
import java.time.Clock

/**
 * Exercise definitions. Exercises are archived, never deleted, so history keeps its references;
 * renames only touch the definition while past workouts keep their name snapshot.
 */
class ExerciseRepository(
    private val db: AppDatabase,
    private val clock: Clock = Clock.systemDefaultZone(),
) {
    private val dao = db.workoutDao()

    suspend fun get(id: String): ExerciseEntity? = dao.getExercise(id)

    suspend fun rename(id: String, newName: String) = db.withTransaction {
        val name = newName.trim()
        require(name.isNotEmpty()) { "请填写动作名称" }
        val exercise = requireNotNull(dao.getExercise(id)) { "动作不存在" }
        val clash = dao.findActiveExerciseByName(name)
        require(clash == null || clash.id == id) { "已有同名动作「${clash!!.name}」" }
        dao.upsertExercise(exercise.copy(name = name, updatedAt = clock.millis()))
    }

    suspend fun archive(id: String) = setArchived(id, true)

    suspend fun unarchive(id: String) = db.withTransaction {
        val exercise = requireNotNull(dao.getExercise(id)) { "动作不存在" }
        val clash = dao.findActiveExerciseByName(exercise.name)
        require(clash == null || clash.id == id) { "已有同名动作「${clash!!.name}」，无法恢复" }
        setArchived(id, false)
    }

    /** Only allowed before the exercise has any history; otherwise old weights would be reinterpreted. */
    suspend fun setWeightMode(id: String, mode: WeightMode) = db.withTransaction {
        val exercise = requireNotNull(dao.getExercise(id)) { "动作不存在" }
        if (exercise.weightMode == mode) return@withTransaction
        require(!dao.isExerciseUsed(id)) { "这个动作已有记录，不能修改重量口径；请新建一个动作变体" }
        dao.upsertExercise(exercise.copy(weightMode = mode, updatedAt = clock.millis()))
    }

    private suspend fun setArchived(id: String, archived: Boolean) {
        val exercise = requireNotNull(dao.getExercise(id)) { "动作不存在" }
        if (exercise.archived != archived) {
            dao.upsertExercise(exercise.copy(archived = archived, updatedAt = clock.millis()))
        }
    }
}

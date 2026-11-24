package com.exerciseornot.app.backup

import com.exerciseornot.app.data.db.ExerciseEntity
import com.exerciseornot.app.data.db.SetEntryEntity
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WorkoutEntity
import com.exerciseornot.app.data.db.WorkoutExerciseEntity
import com.exerciseornot.app.chance.ChanceGames
import com.exerciseornot.app.chance.ChanceSettings
import com.exerciseornot.app.chance.RevolverDraw
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.ZoneId

object BackupCodec {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    fun encode(file: BackupFile): String = json.encodeToString(BackupFile.serializer(), file)

    /** Parses and fully validates [text]; throws [InvalidBackupException] with a user-facing reason. */
    fun decode(text: String): BackupContent {
        val root = try {
            json.parseToJsonElement(text).jsonObject
        } catch (e: Exception) {
            throw InvalidBackupException("不是有效的备份文件")
        }
        val version = runCatching { root["formatVersion"]!!.jsonPrimitive.int }.getOrNull()
            ?: throw InvalidBackupException("不是有效的备份文件（缺少版本号）")
        if (version > BACKUP_FORMAT_VERSION) throw InvalidBackupException("备份来自更新版本的应用，请先升级")
        if (version < 1) throw InvalidBackupException("备份版本不受支持")
        // Older format versions get converted here once there are any.
        val file = try {
            json.decodeFromJsonElement(BackupFile.serializer(), root)
        } catch (e: SerializationException) {
            throw InvalidBackupException("备份文件内容不完整或已损坏")
        } catch (e: IllegalArgumentException) {
            throw InvalidBackupException("备份文件内容不完整或已损坏")
        }
        return validate(file)
    }

    private fun validate(f: BackupFile): BackupContent {
        fun fail(reason: String): Nothing = throw InvalidBackupException("备份文件有误：$reason")

        fun <T> requireUniqueIds(items: List<T>, id: (T) -> String, what: String) {
            if (items.map(id).toSet().size != items.size) fail("${what}ID 重复")
        }
        requireUniqueIds(f.exercises, { it.id }, "动作")
        requireUniqueIds(f.workouts, { it.id }, "训练")
        requireUniqueIds(f.workoutExercises, { it.id }, "训练动作")
        requireUniqueIds(f.sets, { it.id }, "组")

        val exercises = f.exercises.map {
            if (it.name.isBlank()) fail("动作名称为空")
            ExerciseEntity(
                it.id, it.name, weightModeOf(it.weightMode) ?: fail("未知的重量口径 ${it.weightMode}"),
                it.archived, it.createdAt, it.updatedAt,
            )
        }
        val activeNames = exercises.filter { !it.archived }.map { it.name.lowercase() }
        if (activeNames.toSet().size != activeNames.size) fail("有重名的动作")

        val workouts = f.workouts.map {
            runCatching { LocalDate.parse(it.trainingDate) }.getOrNull() ?: fail("训练日期格式不正确 ${it.trainingDate}")
            runCatching { ZoneId.of(it.zoneId) }.getOrNull() ?: fail("时区不正确 ${it.zoneId}")
            WorkoutEntity(it.id, it.performedAt, it.trainingDate, it.zoneId, it.createdAt, it.updatedAt)
        }

        val exerciseIds = exercises.map { it.id }.toSet()
        val workoutIds = workouts.map { it.id }.toSet()
        val items = f.workoutExercises.map {
            if (it.workoutId !in workoutIds) fail("训练动作引用了不存在的训练")
            if (it.exerciseId !in exerciseIds) fail("训练动作引用了不存在的动作")
            WorkoutExerciseEntity(
                it.id, it.workoutId, it.exerciseId, it.position, it.nameSnapshot,
                weightModeOf(it.weightModeSnapshot) ?: fail("未知的重量口径 ${it.weightModeSnapshot}"),
                it.createdAt, it.updatedAt,
            )
        }

        val itemIds = items.map { it.id }.toSet()
        val sets = f.sets.map {
            if (it.workoutExerciseId !in itemIds) fail("组引用了不存在的训练动作")
            val status = setStatusOf(it.status) ?: fail("未知的组状态 ${it.status}")
            if (it.reps != null && it.reps <= 0) fail("次数必须为正数")
            if (it.weightGrams != null && it.weightGrams < 0) fail("重量不能为负数")
            if (status == SetStatus.LOGGED && it.loggedAt == null) fail("已记录的组缺少记录时间")
            SetEntryEntity(
                it.id, it.workoutExerciseId, it.position, it.weightGrams, it.reps, status, it.loggedAt,
                it.createdAt, it.updatedAt,
            )
        }

        val faces = f.settings.diceTrainFaces.toSet()
        if (faces.any { it !in 1..6 }) fail("骰子点数超出 1–6")
        // 0.2.0 backups only have the faces; their count is the probability.
        val target = f.settings.chanceTarget ?: (faces.size / 6.0)
        if (target.isNaN() || target !in 0.0..1.0) fail("练的概率超出 0–100%")
        // A game this version doesn't know (from a newer app) falls back to the default one.
        val revolverStop = RevolverDraw.stopForTarget(f.settings.chanceRevolverStopKey, target)
        val chance = ChanceSettings(ChanceGames.resolve(f.settings.chanceGame).id, target, revolverStop?.key)

        // Memory belongs to models, not games; it is kept as is, even for a model this version
        // doesn't know, and each model starts afresh from anything it can't read.
        val memory = f.settings.chanceMemory.orEmpty()
        if (memory.keys.any { !Regex("[a-z0-9_-]+").matches(it) } || memory.values.any { it.length > MAX_MEMORY_CHARS }) {
            fail("玩法记录格式不正确")
        }

        return BackupContent(f.exportedAt, exercises, workouts, items, sets, chance, memory)
    }
}

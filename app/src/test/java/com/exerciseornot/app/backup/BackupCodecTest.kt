package com.exerciseornot.app.backup

import com.exerciseornot.app.chance.ChanceSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class BackupCodecTest {

    private fun file(
        exercises: List<BackupExercise> = listOf(BackupExercise("e1", "卧推", "TOTAL", false, 1, 1)),
        workouts: List<BackupWorkout> = listOf(BackupWorkout("w1", 100, "2026-11-08", "Asia/Shanghai", 1, 1)),
        items: List<BackupWorkoutExercise> = listOf(BackupWorkoutExercise("we1", "w1", "e1", 0, "卧推", "TOTAL", 1, 1)),
        sets: List<BackupSet> = listOf(
            BackupSet("s1", "we1", 0, 40_000, 10, "LOGGED", 5, 1, 1),
            BackupSet("s2", "we1", 1, 40_000, 10, "DRAFT", null, 1, 1),
        ),
        faces: List<Int> = listOf(6),
        game: String? = null,
        target: Double? = null,
        formatVersion: Int = BACKUP_FORMAT_VERSION,
    ) = BackupFile(formatVersion, 1, "0.1.0", 42, exercises, workouts, items, sets, BackupSettings(faces, game, target))

    private fun rejects(f: BackupFile, reasonPart: String) = rejectsText(BackupCodec.encode(f), reasonPart)

    private fun rejectsText(text: String, reasonPart: String) {
        val e = assertThrows(InvalidBackupException::class.java) { BackupCodec.decode(text) }
        assertTrue("「${e.message}」应包含「$reasonPart」", e.message!!.contains(reasonPart))
    }

    @Test
    fun roundTrip_keepsEverything() {
        val content = BackupCodec.decode(BackupCodec.encode(file()))
        assertEquals(listOf("e1"), content.exercises.map { it.id })
        assertEquals("2026-11-08", content.workouts.single().trainingDate)
        assertEquals(listOf(40_000, 40_000), content.sets.map { it.weightGrams })
        // A 0.2.0 backup has faces only: one face means a 1 in 6 chance.
        assertEquals(ChanceSettings("dice", 1.0 / 6), content.chance)
        val summary = content.summary
        assertEquals(1, summary.exercises)
        assertEquals(1, summary.workouts)
        assertEquals(1, summary.loggedSets)
        assertEquals("2026-11-08", summary.firstDate)
    }

    @Test
    fun chanceTarget_winsOverLegacyFaces() {
        val content = BackupCodec.decode(BackupCodec.encode(file(faces = listOf(4, 5, 6), game = "dice", target = 0.25)))
        assertEquals(ChanceSettings("dice", 0.25), content.chance)
    }

    @Test
    fun unknownGame_fallsBackToDefault() {
        val content = BackupCodec.decode(BackupCodec.encode(file(game = "spinner-from-the-future", target = 0.5)))
        assertEquals(ChanceSettings("dice", 0.5), content.chance)
    }

    @Test
    fun chanceTargetOutOfRange_rejected() {
        rejects(file(target = 1.5), "概率")
        rejects(file(target = -0.1), "概率")
    }

    @Test
    fun unknownFields_areIgnored() {
        val text = BackupCodec.encode(file()).replaceFirst("{", "{\"futureField\": [1, 2],")
        assertEquals(1, BackupCodec.decode(text).exercises.size)
    }

    @Test
    fun notJson_rejected() = rejectsText("hello, this is a text file", "不是有效的备份文件")

    @Test
    fun missingVersion_rejected() = rejectsText("{\"exercises\": []}", "缺少版本号")

    @Test
    fun newerFormat_rejected() = rejects(file(formatVersion = 99), "请先升级")

    @Test
    fun missingFields_rejected() = rejectsText("{\"formatVersion\": 1, \"exercises\": []}", "不完整")

    @Test
    fun duplicateIds_rejected() = rejects(
        file(sets = listOf(BackupSet("s1", "we1", 0, 1, 1, "LOGGED", 1, 1, 1), BackupSet("s1", "we1", 1, 1, 1, "LOGGED", 1, 1, 1))),
        "组ID 重复",
    )

    @Test
    fun danglingReferences_rejected() {
        rejects(file(items = listOf(BackupWorkoutExercise("we1", "w-missing", "e1", 0, "卧推", "TOTAL", 1, 1))), "不存在的训练")
        rejects(file(items = listOf(BackupWorkoutExercise("we1", "w1", "e-missing", 0, "卧推", "TOTAL", 1, 1))), "不存在的动作")
        rejects(file(sets = listOf(BackupSet("s1", "we-missing", 0, 1, 1, "LOGGED", 1, 1, 1))), "不存在的训练动作")
    }

    @Test
    fun badValues_rejected() {
        rejects(file(exercises = listOf(BackupExercise("e1", "卧推", "HEAVY", false, 1, 1))), "重量口径")
        rejects(file(sets = listOf(BackupSet("s1", "we1", 0, 1, 1, "DONE", 1, 1, 1))), "组状态")
        rejects(file(sets = listOf(BackupSet("s1", "we1", 0, 1, 0, "LOGGED", 1, 1, 1))), "次数")
        rejects(file(sets = listOf(BackupSet("s1", "we1", 0, -1, 1, "LOGGED", 1, 1, 1))), "重量")
        rejects(file(sets = listOf(BackupSet("s1", "we1", 0, 1, 1, "LOGGED", null, 1, 1))), "记录时间")
        rejects(file(workouts = listOf(BackupWorkout("w1", 100, "11/08/2026", "Asia/Shanghai", 1, 1))), "训练日期")
        rejects(file(workouts = listOf(BackupWorkout("w1", 100, "2026-11-08", "Mars/Base", 1, 1))), "时区")
        rejects(file(faces = listOf(7)), "骰子")
    }

    @Test
    fun duplicateActiveNames_rejected_butArchivedTwinAllowed() {
        val twins = listOf(BackupExercise("e1", "卧推", "TOTAL", false, 1, 1), BackupExercise("e2", "卧推", "TOTAL", false, 1, 1))
        rejects(file(exercises = twins), "重名")
        val archivedTwin = listOf(twins[0], twins[1].copy(archived = true))
        assertEquals(2, BackupCodec.decode(BackupCodec.encode(file(exercises = archivedTwin))).exercises.size)
    }
}

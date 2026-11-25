package com.exerciseornot.app.backup

import com.exerciseornot.app.chance.ChanceSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeNoException
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.util.concurrent.TimeUnit

class BackupInteropTest {
    @get:Rule val temporary = TemporaryFolder()

    private val time = Instant.parse("2026-11-08T12:00:00Z").toEpochMilli()
    private val memory = mapOf("draw_pot" to "3,7,11", "revolver" to "{\"round\":3}")

    @Test
    fun roundTripsAndroidV1RowsAndExactChanceSettingsThroughWeChat() {
        val settings = BackupSettings(listOf(5, 6), "revolver", 0.4, memory, "4-2-all")
        val restored = roundTrip(fixture("0.4.0", settings))
        assertEquals(ChanceSettings("revolver", 0.4, "4-2-all"), restored.chance)
        assertEquals(memory, restored.chanceMemory)
    }

    @Test
    fun roundTripsTheAndroidV1BackupWithOnlyLegacyDiceFaces() {
        val restored = roundTrip(fixture("0.2.0", BackupSettings(listOf(6))))
        assertEquals(ChanceSettings("dice", 1.0 / 6), restored.chance)
    }

    private fun fixture(appVersion: String, settings: BackupSettings) = BackupFile(
        formatVersion = 1,
        schemaVersion = 1,
        appVersion = appVersion,
        exportedAt = time,
        exercises = listOf(BackupExercise("e1", "哑铃肩推", "PER_SIDE", false, time, time)),
        workouts = listOf(BackupWorkout("w1", time, "2026-11-08", "Asia/Shanghai", time, time)),
        workoutExercises = listOf(BackupWorkoutExercise("i1", "w1", "e1", 3, "哑铃推举", "PER_SIDE", time, time)),
        sets = listOf(
            BackupSet("s1", "i1", 2, 17_563, 12, "LOGGED", time + 10, time, time + 10),
            BackupSet("s2", "i1", 3, 18_000, null, "DRAFT", null, time + 10, time + 11),
        ),
        settings = settings,
    )

    private fun roundTrip(file: BackupFile): BackupContent {
        val script = generateSequence(Path.of("").toAbsolutePath()) { it.parent }
            .map { it.resolve("tools/backup/roundtrip.js") }
            .firstOrNull(Files::isRegularFile)
            ?: error("Cannot locate tools/backup/roundtrip.js from the test working directory")
        val directory = temporary.root.toPath()
        val input = directory.resolve("android-v1.json")
        val output = directory.resolve("wechat-v1.json")
        val log = directory.resolve("node.log")
        val encoded = BackupCodec.encode(file)
        Files.writeString(input, encoded)
        val process = try {
            ProcessBuilder("node", script.toString(), input.toString(), output.toString())
                .redirectErrorStream(true)
                .redirectOutput(log.toFile())
                .start()
        } catch (error: IOException) {
            assumeNoException("Node.js is required for the WeChat backup interoperability test", error)
            throw error
        }
        val finished = process.waitFor(30, TimeUnit.SECONDS)
        if (!finished) process.destroyForcibly()
        assertTrue("The WeChat backup conversion timed out", finished)
        assertEquals(Files.readString(log), 0, process.exitValue())

        val restored = BackupCodec.decode(Files.readString(output))
        assertEquals(BackupCodec.decode(encoded), restored)
        return restored
    }
}

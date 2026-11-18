package com.exerciseornot.app.ui.chance

import com.exerciseornot.app.chance.ChanceGames
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Checks the packaged scene files with the same rules the WebView applies at runtime. */
class ChanceAssetsTest {

    // Gradle runs unit tests from the module directory.
    private val root = File("src/main/assets/${ChanceAssets.ROOT}")

    private fun files(dir: File) = dir.walkTopDown().filter { it.isFile && it.name != ".DS_Store" }

    @Test
    fun everyGameHasItsScene() {
        for (game in ChanceGames.all) {
            val scene = File(root, "scenes/${game.sceneId}/scene.js")
            assertTrue("${game.id}: missing ${scene.path}", scene.isFile)
            assertTrue("${game.id}: scene must declare api: 1", scene.readText().contains(Regex("""\bapi\s*:\s*1\b""")))
        }
    }

    @Test
    fun everyPackagedFileWouldBeServed() {
        val refused = files(root).map { it.relativeTo(root).invariantSeparatorsPath }.filterNot(ChanceAssets::allowed).toList()
        assertEquals("these files would be refused at runtime", emptyList<String>(), refused)
    }

    @Test
    fun scenesStayWithinTheirBudget() {
        for (dir in File(root, "scenes").listFiles().orEmpty().filter { it.isDirectory }) {
            val bytes = files(dir).sumOf { it.length() }
            assertTrue("${dir.name}: $bytes bytes > ${ChanceAssets.SCENE_BUDGET_BYTES}", bytes <= ChanceAssets.SCENE_BUDGET_BYTES)
        }
    }

    @Test
    fun pathRules() {
        assertTrue(ChanceAssets.allowed("scenes/coin/coin.glb"))
        assertTrue(ChanceAssets.allowed("lib/gl.js"))
        assertTrue(ChanceAssets.allowed("scenes/cards/back_01.webp"))
        assertFalse(ChanceAssets.allowed("scenes/../secret.js"))
        assertFalse(ChanceAssets.allowed("scenes/Coin/coin.png"))
        assertFalse(ChanceAssets.allowed("scenes/coin/coin.exe"))
        assertFalse(ChanceAssets.allowed("/abs.js"))
        assertFalse(ChanceAssets.allowed("scenes/coin/"))
        assertEquals("model/gltf-binary", ChanceAssets.mimeOf("a.glb"))
        assertEquals("UTF-8", ChanceAssets.encodingOf("a.json"))
        assertEquals(null, ChanceAssets.encodingOf("a.png"))
    }
}

package com.exerciseornot.app.chance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class ChanceGameTest {

    /** "Probability is transparent": every stop's shown chance is exactly what its rule draws. */
    @Test
    fun everyGame_stopChanceMatchesItsOutcomes() {
        for (game in ChanceGames.all) {
            assertTrue("${game.id}: weights must be positive", game.outcomes.all { it.weight > 0 })
            assertEquals("${game.id}: outcome ids must be unique", game.outcomes.size, game.outcomes.map { it.id }.toSet().size)
            assertEquals("${game.id}: first stop is 0%", 0, game.stops.first().numerator)
            assertEquals("${game.id}: last stop is 100%", game.stops.last().denominator, game.stops.last().numerator)
            assertEquals("${game.id}: stops are ordered", game.stops.sortedBy { it.chance }, game.stops)
            assertEquals("${game.id}: stop keys are unique", game.stops.size, game.stops.map { it.key }.toSet().size)
            for (stop in game.stops) {
                val (train, total) = game.trainWeight(stop)
                assertEquals("${game.id} ${stop.key}", stop.numerator.toLong() * total, train.toLong() * stop.denominator)
            }
        }
    }

    @Test
    fun everyGame_drawFollowsItsRule() {
        for (game in ChanceGames.all) for (stop in game.stops) {
            val random = Random(stop.key.hashCode())
            repeat(200) {
                val d = game.draw(stop, random)
                assertTrue(game.outcomes.any { it.id == d.outcomeId })
                assertEquals(game.trains(stop, d.outcomeId), d.train)
            }
        }
    }

    @Test
    fun dice_drawHitsEveryFaceAboutEvenly() {
        val stop = DiceGame.stops[3]
        val counts = mutableMapOf<String, Int>()
        val random = Random(42)
        repeat(6000) { counts.merge(DiceGame.draw(stop, random).outcomeId, 1, Int::plus) }
        assertEquals((1..6).map { "$it" }.toSet(), counts.keys)
        counts.values.forEach { assertTrue("uneven: $counts", it in 850..1150) }
    }

    @Test
    fun dice_stopsTrainOnTheHighestFaces() {
        assertEquals(listOf("0%", "17%", "33%", "50%", "67%", "83%", "100%"), DiceGame.stops.map { it.percentText })
        assertEquals("怎么掷都休息", DiceGame.stops[0].rule)
        assertEquals("掷出 6 就练", DiceGame.stops[1].rule)
        assertEquals("掷出 4、5、6 就练", DiceGame.stops[3].rule)
        assertEquals("怎么掷都练", DiceGame.stops[6].rule)
        assertEquals(listOf(4, 5, 6), DiceGame.trainFaces(DiceGame.stops[3]))
        assertTrue(DiceGame.trains(DiceGame.stops[3], "4"))
        assertEquals(false, DiceGame.trains(DiceGame.stops[3], "3"))
    }

    @Test
    fun snap_exactStops() {
        assertEquals("3/6", DiceGame.snap(0.5).key)
        assertEquals("1/6", DiceGame.snap(1.0 / 6).key)
        assertEquals("0/6", DiceGame.snap(0.0).key)
        assertEquals("6/6", DiceGame.snap(1.0).key)
    }

    @Test
    fun snap_neverQuietlyReachesNeverOrAlways() {
        assertEquals("1/6", DiceGame.snap(0.01).key)
        assertEquals("5/6", DiceGame.snap(0.99).key)
    }

    @Test
    fun snap_nearestStopAndBadInputIsSafe() {
        assertEquals("2/6", DiceGame.snap(0.4).key)
        assertEquals("4/6", DiceGame.snap(0.6).key)
        assertEquals("3/6", DiceGame.snap(Double.NaN).key)
        assertEquals("6/6", DiceGame.snap(7.0).key)
        assertEquals("0/6", DiceGame.snap(-1.0).key)
    }

    @Test
    fun nearestStop_canReachTheEnds() {
        assertEquals("0/6", DiceGame.nearestStop(0.02).key)
        assertEquals("6/6", DiceGame.nearestStop(0.97).key)
        assertEquals("2/6", DiceGame.nearestStop(0.30).key)
    }

    @Test
    fun registry() {
        assertEquals(DiceGame, ChanceGames.resolve("dice"))
        assertEquals(ChanceGames.default, ChanceGames.resolve("something-newer"))
        assertEquals(ChanceGames.default, ChanceGames.resolve(null))
        assertEquals(ChanceGames.all.size, ChanceGames.all.map { it.id }.toSet().size)
    }
}

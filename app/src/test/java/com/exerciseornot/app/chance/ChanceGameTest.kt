package com.exerciseornot.app.chance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class ChanceGameTest {

    /** "Probability is transparent": every stop's shown chance is exactly what its rule draws. */
    @Test
    fun everyModel_stopChanceMatchesItsOutcomes() {
        for (model in ChanceGames.models) {
            assertTrue("${model.id}: weights must be positive", model.outcomes.all { it.weight > 0 })
            assertEquals("${model.id}: outcome ids must be unique", model.outcomes.size, model.outcomes.map { it.id }.toSet().size)
            assertEquals("${model.id}: first stop is 0%", 0, model.stops.first().numerator)
            assertEquals("${model.id}: last stop is 100%", model.stops.last().denominator, model.stops.last().numerator)
            assertEquals("${model.id}: stops are ordered", model.stops.sortedBy { it.chance }, model.stops)
            assertEquals("${model.id}: stop keys are unique", model.stops.size, model.stops.map { it.key }.toSet().size)
            for (stop in model.stops) {
                val (train, total) = model.trainWeight(stop)
                assertEquals("${model.id} ${stop.key}", stop.numerator.toLong() * total, train.toLong() * stop.denominator)
            }
        }
    }

    @Test
    fun everyModel_drawFollowsItsRule() {
        for (model in ChanceGames.models) for (stop in model.stops) {
            val random = Random(stop.key.hashCode())
            repeat(200) {
                val d = model.draw(stop, random)
                assertTrue(model.outcomes.any { it.id == d.outcomeId })
                assertEquals(model.trains(stop, d.outcomeId), d.train)
            }
        }
    }

    @Test
    fun d6_drawHitsEveryFaceAboutEvenly() {
        val stop = D6.stops[3]
        val counts = mutableMapOf<String, Int>()
        val random = Random(42)
        repeat(6000) { counts.merge(D6.draw(stop, random).outcomeId, 1, Int::plus) }
        assertEquals((1..6).map { "$it" }.toSet(), counts.keys)
        counts.values.forEach { assertTrue("uneven: $counts", it in 850..1150) }
    }

    @Test
    fun d6_stopsTrainOnTheHighestFaces() {
        assertEquals(listOf("0%", "17%", "33%", "50%", "67%", "83%", "100%"), D6.stops.map { it.percentText })
        assertEquals("怎么掷都休息", D6.stops[0].rule)
        assertEquals("掷出 6 就练", D6.stops[1].rule)
        assertEquals("掷出 4、5、6 就练", D6.stops[3].rule)
        assertEquals("怎么掷都练", D6.stops[6].rule)
        assertEquals(listOf(4, 5, 6), D6.trainFaces(D6.stops[3]))
        assertTrue(D6.trains(D6.stops[3], "4"))
        assertEquals(false, D6.trains(D6.stops[3], "3"))
    }

    @Test
    fun snap_exactStops() {
        assertEquals("3/6", D6.snap(0.5).key)
        assertEquals("1/6", D6.snap(1.0 / 6).key)
        assertEquals("0/6", D6.snap(0.0).key)
        assertEquals("6/6", D6.snap(1.0).key)
    }

    @Test
    fun snap_neverQuietlyReachesNeverOrAlways() {
        assertEquals("1/6", D6.snap(0.01).key)
        assertEquals("5/6", D6.snap(0.99).key)
    }

    @Test
    fun snap_nearestStopAndBadInputIsSafe() {
        assertEquals("2/6", D6.snap(0.4).key)
        assertEquals("4/6", D6.snap(0.6).key)
        assertEquals("3/6", D6.snap(Double.NaN).key)
        assertEquals("6/6", D6.snap(7.0).key)
        assertEquals("0/6", D6.snap(-1.0).key)
    }

    @Test
    fun nearestStop_canReachTheEnds() {
        assertEquals("0/6", D6.nearestStop(0.02).key)
        assertEquals("6/6", D6.nearestStop(0.97).key)
        assertEquals("2/6", D6.nearestStop(0.30).key)
    }

    @Test
    fun diceAndCup_shareTheD6Model() {
        assertEquals(D6, ChanceGames.Dice.model)
        assertEquals(D6, ChanceGames.Cup.model)
        assertEquals(Lots10, ChanceGames.Lots.model)
        assertEquals("dice", ChanceGames.Dice.sceneId)
        assertEquals("cup", ChanceGames.Cup.sceneId)
        assertEquals("lots", ChanceGames.Lots.sceneId)
        assertEquals(listOf(D6, Lots10, ScratchTicket, RevolverDraw, SlotMachine, CarnivalWheel), ChanceGames.models)
    }

    @Test
    fun lots10_hasElevenStopsAndEvenDraw() {
        assertEquals(
            listOf("0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%"),
            Lots10.stops.map { it.percentText },
        )
        assertEquals("怎么抽都休息", Lots10.stops[0].rule)
        assertEquals("10 支签里放 5 支「练」签", Lots10.stops[5].rule)
        assertEquals("怎么抽都练", Lots10.stops[10].rule)
        assertTrue(Lots10.trains(Lots10.stops[5], "6"))
        assertEquals(false, Lots10.trains(Lots10.stops[5], "5"))
        assertEquals("5/10", Lots10.snap(0.5).key)
        assertEquals("1/10", Lots10.snap(0.01).key)
        assertEquals("9/10", Lots10.snap(0.99).key)
        assertEquals("0/10", Lots10.snap(0.0).key)
        assertEquals("10/10", Lots10.snap(1.0).key)

        val counts = mutableMapOf<String, Int>()
        val random = Random(99)
        repeat(10_000) { counts.merge(Lots10.draw(Lots10.stops[5], random).outcomeId, 1, Int::plus) }
        assertEquals((1..10).map { "$it" }.toSet(), counts.keys)
        counts.values.forEach { assertTrue("uneven: $counts", it in 850..1150) }
    }

    /** Shipped ids are stored in preferences and backups; they must never change. */
    @Test
    fun shippedIdsAreStable() {
        assertEquals(listOf("dice", "cup", "lots", "scratch", "revolver", "slot", "wheel"), ChanceGames.all.map { it.id })
        assertEquals("d6", D6.id)
        assertEquals("lots", Lots10.id)
    }

    @Test
    fun registry() {
        assertEquals(ChanceGames.Cup, ChanceGames.byId("cup"))
        assertEquals(ChanceGames.Lots, ChanceGames.byId("lots"))
        assertEquals(ChanceGames.Dice, ChanceGames.resolve("dice"))
        assertEquals(ChanceGames.default, ChanceGames.resolve("something-newer"))
        assertEquals(ChanceGames.default, ChanceGames.resolve(null))
        assertEquals(ChanceGames.all.size, ChanceGames.all.map { it.id }.toSet().size)
        assertEquals(ChanceGames.models.size, ChanceGames.models.map { it.id }.toSet().size)
    }
}

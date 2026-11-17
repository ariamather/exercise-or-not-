package com.exerciseornot.app.chance

import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.random.Random

/**
 * One way of deciding "today, train or not" (a die, a dice cup, a coin…).
 *
 * The app keeps one probability the user asked for; each game offers its own [stops] on the
 * slider and turns the chosen stop into a concrete rule. Drawing always happens here, in Kotlin,
 * before any animation: a scene only reveals [Draw.outcome].
 */
interface ChanceGame {
    /** Stored in preferences and backups; never change it once shipped. */
    val id: String
    val name: String
    /** Folder under assets/chance/scenes/ that reveals this game's outcomes. */
    val sceneId: String
    /** Every possible outcome with its weight; [draw] picks one with exactly these weights. */
    val outcomes: List<Outcome>
    /** Slider positions, ordered by chance; the first is 0% and the last is 100%. */
    val stops: List<Stop>
    fun trains(stop: Stop, outcomeId: String): Boolean
}

data class Outcome(val id: String, val label: String, val weight: Int = 1)

/** A slider position: training happens with probability [numerator]/[denominator], by [rule]. */
data class Stop(val key: String, val numerator: Int, val denominator: Int, val rule: String) {
    val chance: Double get() = numerator.toDouble() / denominator
    val percent: Int get() = (numerator * 100.0 / denominator).roundToInt()
    val percentText: String get() = "$percent%"
}

data class Draw(val outcomeId: String, val train: Boolean)

fun ChanceGame.draw(stop: Stop, random: Random): Draw {
    var pick = random.nextInt(outcomes.sumOf { it.weight })
    for (o in outcomes) {
        if (pick < o.weight) return Draw(o.id, trains(stop, o.id))
        pick -= o.weight
    }
    error("weights must be positive")
}

/**
 * The stop closest to [target]. Unless the user asked for exactly 0% or 100%, a game never
 * snaps there: switching to a coarser game must not quietly turn 17% into "never train".
 * Ties go to the lower chance.
 */
fun ChanceGame.snap(target: Double): Stop {
    val t = if (target.isNaN()) DEFAULT_TARGET else target.coerceIn(0.0, 1.0)
    val candidates = if (t <= 0.0 || t >= 1.0) stops
    else stops.filter { it.numerator != 0 && it.numerator != it.denominator }.ifEmpty { stops }
    return candidates.minBy { abs(it.chance - t) }
}

/** The stop the slider lands on for a raw drag position; reaching 0% or 100% is allowed here. */
fun ChanceGame.nearestStop(position: Double): Stop = stops.minBy { abs(it.chance - position) }

/** The exact training probability of [stop] as a fraction, worked out from [ChanceGame.outcomes]. */
fun ChanceGame.trainWeight(stop: Stop): Pair<Int, Int> =
    outcomes.filter { trains(stop, it.id) }.sumOf { it.weight } to outcomes.sumOf { it.weight }

const val DEFAULT_TARGET = 0.5

object ChanceGames {
    val all: List<ChanceGame> = listOf(DiceGame)
    val default: ChanceGame = DiceGame

    fun byId(id: String?): ChanceGame? = all.firstOrNull { it.id == id }

    /** An unknown id (e.g. from a newer app's backup) falls back to the default game. */
    fun resolve(id: String?): ChanceGame = byId(id) ?: default
}

package com.exerciseornot.app.chance

import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.random.Random

/**
 * What can come out of a draw and how a probability becomes a rule (a d6, a coin, a 12-slot
 * wheel…). Several games may share one model; their outcomes are then interchangeable, so
 * today's result drawn with one can be shown by another.
 *
 * Several things drawn together (two dice) are one model whose outcomes come from [combine]:
 * the id lists each part ("3,5"), and the rule may look at all of them (the sum).
 */
interface OutcomeModel {
    /** Saved with every result; never change it once shipped. */
    val id: String
    /**
     * Every possible outcome with its weight. A stateless model draws exactly these weights; a
     * model with [memory][draw] uses them as the long-run share over one full cycle.
     */
    val outcomes: List<Outcome>
    /** One slider position per probability, ordered by chance from 0% to 100%. */
    val stops: List<Stop>

    /** Resolves a saved rule key, including rules that share a slider position. */
    fun stopByKey(key: String?): Stop? = stops.firstOrNull { it.key == key }

    fun trains(stop: Stop, outcomeId: String): Boolean

    /**
     * Draws one outcome. [memory] is what this model returned in [Draw.memory] last time (null at
     * first, after a reinstall, or when a backup had none). Models that remember across days, like
     * a pot drawn without replacement, override this. Any string must be accepted: one that can't
     * be read (an older format, a damaged backup) starts afresh instead of failing.
     */
    fun draw(stop: Stop, random: Random, memory: String?): Draw = drawWeighted(stop, random)
}

/** Who ends a reveal. */
enum class RevealPace(val wire: String) {
    /** The scene plays by itself; a reveal that never reports back fails after a timeout. */
    TIMED("timed"),
    /** The user drives it (scratching, turning a wheel): no timeout, and the page offers a skip. */
    USER("user"),
}

/**
 * One way of deciding "today, train or not": an [OutcomeModel] plus the scene that reveals it.
 * Drawing always happens here, in Kotlin, before any animation; a scene only reveals the outcome.
 */
data class ChanceGame(
    /** Stored in preferences and backups; never change or remove it once shipped. */
    val id: String,
    val name: String,
    val model: OutcomeModel,
    /** Folder under assets/chance/scenes/. */
    val sceneId: String = id,
    val pace: RevealPace = RevealPace.TIMED,
)

/** [id] is letters, digits, "-" and "_"; outcomes from [combine] join their parts with ",". */
data class Outcome(val id: String, val label: String, val weight: Int = 1)

/** A rule with training probability [numerator]/[denominator]. */
data class Stop(val key: String, val numerator: Int, val denominator: Int, val rule: String) {
    val chance: Double get() = numerator.toDouble() / denominator
    val percent: Int get() = (numerator * 100.0 / denominator).roundToInt()
    val percentText: String get() = "$percent%"
}

/** [memory] replaces the model's saved memory; null keeps nothing (stateless models). */
data class Draw(val outcomeId: String, val train: Boolean, val memory: String? = null)

/** A draw with no memory: what stateless models always do, and stateful ones on their first draw. */
fun OutcomeModel.draw(stop: Stop, random: Random): Draw = draw(stop, random, null)

/** Picks one of [OutcomeModel.outcomes] with exactly their weights. */
fun OutcomeModel.drawWeighted(stop: Stop, random: Random): Draw {
    var pick = random.nextInt(outcomes.sumOf { it.weight })
    for (o in outcomes) {
        if (pick < o.weight) return Draw(o.id, trains(stop, o.id))
        pick -= o.weight
    }
    error("weights must be positive")
}

/**
 * The stop closest to [target]. Unless the user asked for exactly 0% or 100%, a model never
 * snaps there: switching to a coarser game must not quietly turn 17% into "never train".
 * Ties go to the lower chance.
 */
fun OutcomeModel.snap(target: Double): Stop {
    val t = if (target.isNaN()) DEFAULT_TARGET else target.coerceIn(0.0, 1.0)
    val candidates = if (t <= 0.0 || t >= 1.0) stops
    else stops.filter { it.numerator != 0 && it.numerator != it.denominator }.ifEmpty { stops }
    return candidates.minBy { abs(it.chance - t) }
}

/** The stop the slider lands on for a raw drag position; reaching 0% or 100% is allowed here. */
fun OutcomeModel.nearestStop(position: Double): Stop = stops.minBy { abs(it.chance - position) }

/** The exact training probability of [stop] as a fraction, worked out from [OutcomeModel.outcomes]. */
fun OutcomeModel.trainWeight(stop: Stop): Pair<Int, Int> =
    outcomes.filter { trains(stop, it.id) }.sumOf { it.weight } to outcomes.sumOf { it.weight }

const val DEFAULT_TARGET = 0.5

/** What a single outcome id may look like; a combined one is several of these joined by ",". */
val OUTCOME_ID = Regex("[A-Za-z0-9_-]+(,[A-Za-z0-9_-]+)*")

/**
 * All combinations of independent parts drawn together: ids are joined by ",", weights multiply
 * and labels are joined by "、". Two dice are `combine(D6.outcomes, D6.outcomes)`: 36 outcomes
 * from "1,1" to "6,6", each with weight 1.
 */
fun combine(vararg parts: List<Outcome>): List<Outcome> =
    parts.fold(listOf(Outcome("", "", 1))) { acc, next ->
        acc.flatMap { a ->
            next.map { b ->
                if (a.id.isEmpty()) b
                else Outcome("${a.id},${b.id}", "${a.label}、${b.label}", a.weight * b.weight)
            }
        }
    }

/** The parts of an outcome made by [combine]; a plain outcome is one part. */
fun partsOf(outcomeId: String): List<String> = outcomeId.split(',')

/**
 * Every game the app offers. Adding one is a line here plus a folder under assets/chance/scenes/;
 * tests check that the folder exists and that its stops are honest.
 */
object ChanceGames {
    val Dice = ChanceGame("dice", "骰子", D6)
    /** A die hidden under a dice cup: the die's outcomes and rules, revealed by opening the cup. */
    val Cup = ChanceGame("cup", "骰盅", D6)
    /** Ten bamboo slips in a lacquered tube: 0%–100% in 10% steps, drawn with replacement. */
    val Lots = ChanceGame("lots", "签筒", Lots10)
    val Scratch = ChanceGame("scratch", "刮刮乐", ScratchTicket, pace = RevealPace.USER)
    val Revolver = ChanceGame("revolver", "左轮", RevolverDraw, pace = RevealPace.USER)
    val Slot = ChanceGame("slot", "老虎机", SlotMachine)
    val Wheel = ChanceGame("wheel", "转盘", CarnivalWheel, pace = RevealPace.USER)

    val all: List<ChanceGame> = listOf(Dice, Cup, Lots, Scratch, Revolver, Slot, Wheel)
    val default: ChanceGame = Dice
    val models: List<OutcomeModel> get() = all.map { it.model }.distinct()

    fun byId(id: String?): ChanceGame? = all.firstOrNull { it.id == id }

    /** An unknown id (e.g. from a newer app's backup) falls back to the default game. */
    fun resolve(id: String?): ChanceGame = byId(id) ?: default
}

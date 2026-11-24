package com.exerciseornot.app.chance

/** Six virtual slots. The low bits of a layout represent the rounds in order. */
object RevolverDraw : OutcomeModel {
    private const val SLOT_COUNT = 6

    // 60 is divisible by every C(6, k), so each layout for a load has the same weight.
    private const val OUTCOME_COUNT = 60
    private val layouts = (0 until (1 shl SLOT_COUNT)).groupBy { it.countOneBits() }
    private val legacyConfigs = listOf(
        Config(0, 1), Config(2, 2, all = true), Config(1, 1), Config(3, 2, all = true),
        Config(2, 1), Config(4, 2, all = true), Config(3, 1), Config(2, 2),
        Config(4, 1), Config(3, 2), Config(5, 1), Config(4, 2), Config(6, 1),
    )
    private val configs = (legacyConfigs + (0..SLOT_COUNT).flatMap { loaded ->
        (1..SLOT_COUNT).map { shots -> Config(loaded, shots) }
    }).distinct()
    private val configsByKey = configs.associateBy(Config::key)
    private val stopsByKey = configs.associate { config ->
        val masks = layouts.getValue(config.loaded)
        config.key to Stop(config.key, masks.count(config::trains), masks.size, config.rule)
    }

    override val id = "revolver"
    override val outcomes = (1..OUTCOME_COUNT).map { Outcome("$it", "第 $it 种结果") }

    // The original slider rules keep their probabilities' positions, even where a direct
    // configuration has the same probability. Use the common outcome count to compare fractions.
    override val stops = stopsByKey.values
        .distinctBy { it.numerator * (OUTCOME_COUNT / it.denominator) }
        .sortedBy(Stop::chance)

    override fun stopByKey(key: String?): Stop? = stopsByKey[key]

    /** Direct configuration trains if any of the selected rounds hits a loaded chamber. */
    fun stopFor(loaded: Int, shots: Int): Stop = stopsByKey.getValue("$loaded-$shots-any")

    fun configOf(stop: Stop): Config = configsByKey.getValue(stop.key)

    internal fun stopForTarget(key: String?, target: Double): Stop? =
        stopByKey(key)?.takeIf { it.chance == target }

    /** Ascending six-bit layouts are also used by the scene and preview to replay the saved draw. */
    fun mask(stop: Stop, outcomeId: String): Int? {
        val config = configsByKey[stop.key] ?: return null
        val number = outcomeId.toIntOrNull()?.takeIf { it in 1..OUTCOME_COUNT } ?: return null
        val masks = layouts.getValue(config.loaded)
        return masks[(number - 1) % masks.size]
    }

    override fun trains(stop: Stop, outcomeId: String): Boolean =
        mask(stop, outcomeId)?.let(configOf(stop)::trains) ?: false

    data class Config(val loaded: Int, val shots: Int, val all: Boolean = false) {
        internal val key = "$loaded-$shots-${if (all) "all" else "any"}"
        private val roundMask = (1 shl shots) - 1

        internal val rule = when {
            loaded == 0 -> "6 格都空，必定休息"
            loaded == SLOT_COUNT -> "6 格都能翻牌，必定训练"
            shots == 1 -> "6 格中有 $loaded 格能翻牌，翻到就练"
            all -> "6 格中有 $loaded 格能翻牌，两回合都翻牌才练"
            shots == 2 -> "6 格中有 $loaded 格能翻牌，两回合至少翻牌一次就练"
            else -> "6 格中有 $loaded 格能翻牌，$shots 回合至少翻牌一次就练"
        }

        internal fun trains(mask: Int): Boolean {
            val hits = mask and roundMask
            return if (all) hits == roundMask else hits != 0
        }
    }
}

package com.exerciseornot.app.chance

/** Three independent six-stop reels. Each outcome stores the physical stop on each reel. */
object SlotMachine : OutcomeModel {
    override val id = "slot"

    private val reel = (1..6).map { Outcome("$it", "第 $it 格") }
    override val outcomes = combine(reel, reel, reel)

    // The order matches the artwork on each six-cell reel strip.
    private val trainCells = listOf(
        emptySet(),
        setOf(1),
        setOf(1, 4),
        setOf(1, 3, 5),
        setOf(1, 2, 4, 5),
        setOf(1, 2, 3, 4, 5),
        setOf(1, 2, 3, 4, 5, 6),
    )

    private enum class Rule(val key: String, val minimum: Int, val text: String) {
        Any("any", 1, "任一轮出「练」就练"),
        Majority("majority", 2, "至少两轮出「练」就练"),
        All("all", 3, "三轮全出「练」才练"),
    }

    private data class Preset(val k: Int, val rule: Rule) {
        val key = "$k-${rule.key}"
        val cells = trainCells[k]
        val description = when (k) {
            0 -> "每轮 0 格「练」，怎么拉都歇"
            6 -> "每轮 6 格「练」，怎么拉都练"
            else -> "每轮 $k 格「练」，${rule.text}"
        }

        fun trains(outcomeId: String): Boolean {
            val positions = partsOf(outcomeId)
            return positions.size == 3 &&
                positions.all { it.length == 1 && it[0] in '1'..'6' } &&
                positions.count { it.toInt() in cells } >= rule.minimum
        }
    }

    private val presets = listOf(
        Preset(0, Rule.Majority),
        Preset(1, Rule.Majority),
        Preset(3, Rule.All),
        Preset(2, Rule.Majority),
        Preset(4, Rule.All),
        Preset(1, Rule.Any),
        Preset(3, Rule.Majority),
        Preset(5, Rule.All),
        Preset(2, Rule.Any),
        Preset(4, Rule.Majority),
        Preset(3, Rule.Any),
        Preset(5, Rule.Majority),
        Preset(6, Rule.Majority),
    ).associateBy { it.key }

    override val stops = presets.values.map { preset ->
        Stop(preset.key, outcomes.count { preset.trains(it.id) }, outcomes.size, preset.description)
    }

    override fun trains(stop: Stop, outcomeId: String): Boolean =
        presets[stop.key]?.trains(outcomeId) == true
}

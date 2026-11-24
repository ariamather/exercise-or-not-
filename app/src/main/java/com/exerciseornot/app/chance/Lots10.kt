package com.exerciseornot.app.chance

/** Ten bamboo slips drawn with replacement: k of 10 train on the k highest slip numbers. */
object Lots10 : OutcomeModel {
    override val id = "lots"
    override val outcomes = (1..10).map { Outcome("$it", "第 $it 签") }
    override val stops = (0..10).map { k -> Stop("$k/10", k, 10, rule(k)) }

    override fun trains(stop: Stop, outcomeId: String): Boolean {
        require(stop.denominator == 10) { "not a lots stop: ${stop.key}" }
        return outcomeId.toIntOrNull()?.let { it in (11 - stop.numerator)..10 } ?: false
    }

    private fun rule(k: Int): String = when (k) {
        0 -> "怎么抽都休息"
        10 -> "怎么抽都练"
        else -> "10 支签里放 ${k} 支「练」签"
    }
}

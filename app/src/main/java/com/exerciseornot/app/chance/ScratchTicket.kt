package com.exerciseornot.app.chance

/** One ticket drawn independently. The top k of ten equally likely tickets print 「练」. */
object ScratchTicket : OutcomeModel {
    override val id = "scratch"
    override val outcomes = (1..10).map { Outcome("$it", "$it 号票") }
    override val stops = (0..10).map { k -> Stop("$k/10", k, 10, rule(k)) }

    override fun trains(stop: Stop, outcomeId: String): Boolean {
        require(stop.denominator == 10) { "not a scratch stop: ${stop.key}" }
        val number = outcomeId.toIntOrNull() ?: return false
        return number in (11 - stop.numerator)..10
    }

    private fun rule(k: Int): String = when (k) {
        0 -> "刮开必得「歇」"
        10 -> "刮开必得「练」"
        else -> "每 10 种等可能的票中，$k 种刮出「练」"
    }
}

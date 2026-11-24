package com.exerciseornot.app.chance

/** Clockwise draws from 60 equal subdivisions, a common multiple of both dial peg counts. */
object CarnivalWheel : OutcomeModel {
    override val id = "wheel"
    private const val SUBDIVISIONS = 60

    override val outcomes = (1..SUBDIVISIONS).map { Outcome("$it", "第 $it 位") }
    override val stops = listOf(
        stop(0, 12),
        stop(1, 10),
        stop(2, 10),
        stop(3, 12),
        stop(4, 12),
        stop(6, 12),
        stop(8, 12),
        stop(9, 12),
        stop(8, 10),
        stop(9, 10),
        stop(12, 12),
    )

    override fun trains(stop: Stop, outcomeId: String): Boolean {
        val position = outcomeId.toIntOrNull() ?: return false
        return position in 1..(SUBDIVISIONS * stop.numerator / stop.denominator)
    }

    private fun stop(numerator: Int, denominator: Int): Stop {
        val rule = when (numerator) {
            0 -> "整圈都是「歇」"
            denominator -> "整圈都是「练」"
            else -> "「练」占盘面 $numerator/$denominator（${360 * numerator / denominator}°）"
        }
        return Stop("$numerator/$denominator", numerator, denominator, rule)
    }
}

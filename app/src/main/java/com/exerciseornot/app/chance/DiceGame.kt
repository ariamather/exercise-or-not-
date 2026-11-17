package com.exerciseornot.app.chance

/** One six-sided die. "k of 6" trains on the k highest faces, so 50% is 4、5、6 as before. */
object DiceGame : ChanceGame {
    override val id = "dice"
    override val name = "骰子"
    override val sceneId = "dice"
    override val outcomes = (1..6).map { Outcome("$it", "$it 点") }
    override val stops = (0..6).map { k -> Stop("$k/6", k, 6, rule(trainFaces(k))) }

    fun trainFaces(stop: Stop): List<Int> {
        require(stop.denominator == 6) { "not a dice stop: ${stop.key}" }
        return trainFaces(stop.numerator)
    }

    override fun trains(stop: Stop, outcomeId: String): Boolean =
        outcomeId.toIntOrNull()?.let { it in trainFaces(stop) } ?: false

    private fun trainFaces(k: Int): List<Int> = (7 - k..6).toList()

    private fun rule(faces: List<Int>): String = when (faces.size) {
        0 -> "怎么掷都休息"
        6 -> "怎么掷都练"
        else -> "掷出 ${faces.joinToString("、")} 就练"
    }
}

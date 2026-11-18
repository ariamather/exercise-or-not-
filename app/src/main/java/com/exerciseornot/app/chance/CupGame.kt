package com.exerciseornot.app.chance

/**
 * A single die hidden under a dice cup. The stops, the rules and the outcome are the die's:
 * only the way the face is revealed differs. It shares [DiceGame.outcomeModel], so today's face
 * survives switching between the two games.
 */
object CupGame : ChanceGame {
    override val id = "cup"
    override val name = "骰盅"
    override val sceneId = "cup"
    override val outcomeModel = DiceGame.outcomeModel
    override val outcomes = DiceGame.outcomes
    override val stops = DiceGame.stops

    override fun trains(stop: Stop, outcomeId: String): Boolean = DiceGame.trains(stop, outcomeId)
}

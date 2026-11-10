package com.exerciseornot.app.dice

import java.time.LocalDate
import kotlin.math.roundToInt
import kotlin.random.Random

val DICE_FACES = 1..6
val DEFAULT_TRAIN_FACES: Set<Int> = setOf(4, 5, 6)

/** [train] is decided when rolled, so later changes to the faces don't rewrite today's answer. */
data class DiceResult(val face: Int, val train: Boolean, val date: LocalDate)

fun rollDie(random: Random): Int = random.nextInt(1, 7)

fun trainPercent(faces: Set<Int>): Int = (faces.count { it in DICE_FACES } * 100.0 / 6).roundToInt()

fun trainProbabilityText(faces: Set<Int>): String = "${trainPercent(faces)}%"

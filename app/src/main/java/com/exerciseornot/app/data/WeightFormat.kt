package com.exerciseornot.app.data

import java.math.BigDecimal
import java.math.RoundingMode

object WeightFormat {
    /** Parses a kg string like "40" or "42.5" into grams; null if blank or invalid. */
    fun parseKgToGrams(input: String): Int? {
        val text = input.trim().replace(',', '.')
        if (text.isEmpty()) return null
        val kg = text.toBigDecimalOrNull() ?: return null
        if (kg.signum() < 0) return null
        return kg.multiply(BigDecimal(1000)).setScale(0, RoundingMode.HALF_UP).toInt()
    }

    fun gramsToKgText(grams: Int): String =
        BigDecimal(grams).divide(BigDecimal(1000)).stripTrailingZeros().toPlainString()
}

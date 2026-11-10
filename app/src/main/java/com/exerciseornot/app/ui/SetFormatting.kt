package com.exerciseornot.app.ui

import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.data.db.SetEntryEntity
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

fun SetEntryEntity.displayText(): String = setText(weightGrams, reps)

fun setText(weightGrams: Int?, reps: Int?): String {
    val repsText = "${reps ?: "?"} 次"
    return weightGrams?.let { "${WeightFormat.gramsToKgText(it)} kg × $repsText" } ?: "自重 × $repsText"
}

/** Short form for lists, e.g. "40×10" or "自重×12". */
fun compactSetText(weightGrams: Int?, reps: Int?): String =
    (weightGrams?.let(WeightFormat::gramsToKgText) ?: "自重") + "×${reps ?: "?"}"

/** "11-08 周六", or with the year when it isn't [today]'s year. */
fun LocalDate.dayLabel(today: LocalDate): String {
    val pattern = if (year == today.year) "MM-dd" else "yyyy-MM-dd"
    return format(DateTimeFormatter.ofPattern(pattern)) + " " + dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.CHINA)
}

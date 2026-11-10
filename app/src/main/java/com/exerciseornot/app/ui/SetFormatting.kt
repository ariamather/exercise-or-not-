package com.exerciseornot.app.ui

import com.exerciseornot.app.data.WeightFormat
import com.exerciseornot.app.data.db.SetEntryEntity

fun SetEntryEntity.displayText(): String {
    val repsText = "${reps ?: "?"} 次"
    return weightGrams?.let { "${WeightFormat.gramsToKgText(it)} kg × $repsText" } ?: "自重 × $repsText"
}

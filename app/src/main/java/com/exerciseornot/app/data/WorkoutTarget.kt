package com.exerciseornot.app.data

import java.time.LocalDate

/** Where the next confirmed set goes. [New] creates the workout only when its first set is logged. */
sealed interface WorkoutTarget {
    data class Existing(val workoutId: String) : WorkoutTarget
    data class New(val date: LocalDate) : WorkoutTarget
}

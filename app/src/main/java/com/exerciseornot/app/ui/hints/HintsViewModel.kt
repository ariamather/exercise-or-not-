package com.exerciseornot.app.ui.hints

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.data.WorkoutRepository
import com.exerciseornot.app.chance.ChancePreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant

/** Each hint shows until dismissed or until the user has done the thing it explains. Starts hidden so nothing flashes. */
class HintsViewModel(
    private val hints: HintPreferences,
    workouts: WorkoutRepository,
    chance: ChancePreferences,
    lastExportAt: Flow<Instant?>,
) : ViewModel() {

    val showDice: StateFlow<Boolean> = combine(hints.isDismissed(Hint.Dice), chance.lastResult) { dismissed, last ->
        !dismissed && last == null
    }.asState()

    val showRecord: StateFlow<Boolean> = combine(hints.isDismissed(Hint.Record), workouts.observeHasLoggedSet()) { dismissed, logged ->
        !dismissed && !logged
    }.asState()

    val showBackup: StateFlow<Boolean> = combine(
        hints.isDismissed(Hint.Backup), workouts.observeWorkoutCount(), lastExportAt,
    ) { dismissed, count, exported -> !dismissed && count >= BACKUP_HINT_MIN_WORKOUTS && exported == null }.asState()

    fun dismiss(hint: Hint) {
        viewModelScope.launch { runCatching { hints.dismiss(hint) } }
    }

    private fun Flow<Boolean>.asState() = stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    companion object {
        const val BACKUP_HINT_MIN_WORKOUTS = 5
    }
}

package com.exerciseornot.app.ui.dice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.dice.DEFAULT_TRAIN_FACES
import com.exerciseornot.app.dice.DicePreferences
import com.exerciseornot.app.dice.DiceResult
import com.exerciseornot.app.dice.rollDie
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.LocalDate
import kotlin.random.Random

/** Knows nothing about workouts: a roll never creates or changes training data. */
class DiceViewModel(
    private val prefs: DicePreferences,
    private val clock: Clock,
    private val random: Random = Random.Default,
    private val rollDurationMs: Long = ROLL_DURATION_MS,
) : ViewModel() {

    val trainFaces: StateFlow<Set<Int>> = prefs.trainFaces
        .stateIn(viewModelScope, SharingStarted.Eagerly, DEFAULT_TRAIN_FACES)

    /** Today's roll; a result from an earlier day is treated as not rolled yet. */
    val todayResult: StateFlow<DiceResult?> = prefs.lastResult
        .map { r -> r?.takeIf { it.date == LocalDate.now(clock) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _rolling = MutableStateFlow(false)
    /** True while the animation plays; the result is already drawn and saved by then. */
    val rolling: StateFlow<Boolean> = _rolling.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun roll() {
        if (_rolling.value) return
        _rolling.value = true
        _error.value = null
        // Draw exactly once, before any animation; the animation only reveals this value.
        val face = rollDie(random)
        val result = DiceResult(face, face in trainFaces.value, LocalDate.now(clock))
        viewModelScope.launch {
            try {
                prefs.saveResult(result)
                delay(rollDurationMs)
            } catch (e: Exception) {
                _error.value = "保存结果失败，请重试"
            } finally {
                _rolling.value = false
            }
        }
    }

    fun toggleFace(face: Int) {
        val current = trainFaces.value
        viewModelScope.launch {
            runCatching { prefs.setTrainFaces(if (face in current) current - face else current + face) }
                .onFailure { _error.value = "保存设置失败，请重试" }
        }
    }

    companion object {
        const val ROLL_DURATION_MS = 700L
    }
}

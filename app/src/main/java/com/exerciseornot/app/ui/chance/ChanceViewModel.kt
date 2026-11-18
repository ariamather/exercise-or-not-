package com.exerciseornot.app.ui.chance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.chance.ChanceGame
import com.exerciseornot.app.chance.ChanceGames
import com.exerciseornot.app.chance.ChancePreferences
import com.exerciseornot.app.chance.ChanceResult
import com.exerciseornot.app.chance.ChanceSettings
import com.exerciseornot.app.chance.RevealPace
import com.exerciseornot.app.chance.Stop
import com.exerciseornot.app.chance.draw
import com.exerciseornot.app.chance.snap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
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

/** The game in use and the slider stop the user's probability snaps to in that game. */
data class ChanceSetup(val game: ChanceGame, val target: Double, val stop: Stop)

data class ChanceAnimation(val id: Long, val result: ChanceResult, val pace: RevealPace = RevealPace.TIMED)

/** Knows nothing about workouts: a draw never creates or changes training data. */
class ChanceViewModel(
    private val prefs: ChancePreferences,
    private val clock: Clock,
    private val random: Random = Random.Default,
    private val revealDurationMs: Long = REVEAL_DURATION_MS,
) : ViewModel() {

    val setup: StateFlow<ChanceSetup> = prefs.settings
        .map(::setupOf)
        .stateIn(viewModelScope, SharingStarted.Eagerly, setupOf(ChanceSettings.DEFAULT))

    /** Today's draw; a result from an earlier day is treated as not drawn yet. */
    val todayResult: StateFlow<ChanceResult?> = prefs.lastResult
        .map { r -> r?.takeIf { it.date == LocalDate.now(clock) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _drawing = MutableStateFlow(false)
    /** True while the scene reveals; the result is already drawn and saved by then. */
    val drawing: StateFlow<Boolean> = _drawing.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _animation = MutableStateFlow<ChanceAnimation?>(null)
    val animation: StateFlow<ChanceAnimation?> = _animation.asStateFlow()
    private var nextDrawId = 0L
    private var activeDrawId: Long? = null
    private var animationTimeout: Job? = null

    /** Draw without a scene (tests, and any caller without a renderer). */
    fun draw() = startDraw(animated = false)

    /** Draw, then ask the scene to reveal it; the scene reports back via [animationFinished]. */
    fun drawAnimated() = startDraw(animated = true)

    private fun startDraw(animated: Boolean) {
        if (_drawing.value) return
        _drawing.value = true
        _error.value = null
        val id = ++nextDrawId
        activeDrawId = id
        val (game, _, stop) = setup.value
        viewModelScope.launch {
            try {
                // Draw exactly once, before any animation; the scene only reveals this value.
                // Memory and result are read and written around one draw, so they stay in step.
                val drawn = game.model.draw(stop, random, prefs.memory(game.model.id))
                val result = ChanceResult(game.id, game.model.id, drawn.outcomeId, drawn.train, LocalDate.now(clock))
                prefs.saveResult(result, drawn.memory)
                if (activeDrawId != id) return@launch
                if (animated) {
                    _animation.value = ChanceAnimation(id, result, game.pace)
                    // The scene acknowledges the actual landing; this only recovers a lost scene.
                    // A user-paced reveal has no deadline: leaving the page ends it instead.
                    if (game.pace == RevealPace.TIMED) {
                        animationTimeout = viewModelScope.launch {
                            delay(ANIMATION_TIMEOUT_MS)
                            animationFailed(id)
                        }
                    }
                } else {
                    delay(revealDurationMs)
                    finishDraw(id)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (activeDrawId == id) {
                    _error.value = "保存结果失败，请重试"
                    finishDraw(id)
                }
            }
        }
    }

    fun animationFinished(id: Long, outcomeId: String) {
        val pending = _animation.value ?: return
        if (pending.id != id) return
        if (pending.result.outcomeId != outcomeId) animationFailed(id) else finishDraw(id)
    }

    fun animationFailed(id: Long) {
        if (activeDrawId != id) return
        _error.value = "动画未能完成，请重试"
        finishDraw(id)
    }

    /** Leaving the page reveals the already saved result when it is opened again. */
    fun closeScene() {
        activeDrawId?.let(::finishDraw)
    }

    private fun finishDraw(id: Long) {
        if (activeDrawId != id) return
        animationTimeout?.cancel()
        animationTimeout = null
        activeDrawId = null
        _animation.value = null
        _drawing.value = false
    }

    /** Saves the slider position. Today's answer is kept: it was decided when drawn. */
    fun setStop(stop: Stop) {
        viewModelScope.launch {
            runCatching { prefs.setTarget(stop.chance) }.onFailure { _error.value = "保存设置失败，请重试" }
        }
    }

    /** Switches the game, keeping the probability the user asked for; the new game snaps it. */
    fun setGame(id: String) {
        val game = ChanceGames.byId(id) ?: return
        viewModelScope.launch {
            runCatching { prefs.setGame(game.id) }.onFailure { _error.value = "保存设置失败，请重试" }
        }
    }

    private fun setupOf(s: ChanceSettings): ChanceSetup {
        val game = ChanceGames.resolve(s.gameId)
        return ChanceSetup(game, s.target, game.model.snap(s.target))
    }

    companion object {
        const val REVEAL_DURATION_MS = 700L
        const val ANIMATION_TIMEOUT_MS = 30_000L
    }
}

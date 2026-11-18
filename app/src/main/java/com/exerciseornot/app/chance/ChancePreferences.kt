package com.exerciseornot.app.chance

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import java.time.LocalDate

/** The game in use and the probability the user asked for; each game snaps [target] to its own stops. */
data class ChanceSettings(val gameId: String, val target: Double) {
    companion object {
        val DEFAULT = ChanceSettings(ChanceGames.default.id, DEFAULT_TARGET)
    }
}

/** [train] is decided when drawn, so later changes to the probability don't rewrite today's answer. */
data class ChanceResult(val gameId: String, val outcomeId: String, val train: Boolean, val date: LocalDate)

/**
 * Chance settings and the last draw; kept apart from workout data on purpose.
 * Values written by 0.2.0 (`dice.*`) are read as a fallback and removed on the next write.
 */
class ChancePreferences(private val store: DataStore<Preferences>) {

    val settings: Flow<ChanceSettings> = store.data
        .map { p ->
            ChanceSettings(
                gameId = p[KEY_GAME] ?: ChanceGames.default.id,
                target = p[KEY_TARGET]?.takeIf { it in 0.0..1.0 }
                    ?: p[LEGACY_FACES]?.let(::legacyTarget)
                    ?: DEFAULT_TARGET,
            )
        }
        .distinctUntilChanged()

    suspend fun setTarget(target: Double) {
        store.edit { it.putTarget(target) }
    }

    /** Switches games without touching the target, so a just-moved slider is never overwritten. */
    suspend fun setGame(gameId: String) {
        store.edit { it[KEY_GAME] = gameId }
    }

    suspend fun setSettings(settings: ChanceSettings) {
        store.edit {
            it[KEY_GAME] = settings.gameId
            it.putTarget(settings.target)
        }
    }

    val lastResult: Flow<ChanceResult?> = store.data
        .map { p -> current(p) ?: legacy(p) }
        .distinctUntilChanged()

    suspend fun saveResult(result: ChanceResult) {
        store.edit {
            it[KEY_LAST_GAME] = result.gameId
            it[KEY_LAST_OUTCOME] = result.outcomeId
            it[KEY_LAST_TRAIN] = result.train
            it[KEY_LAST_DATE] = result.date.toString()
            it.remove(LEGACY_FACE)
            it.remove(LEGACY_TRAIN)
            it.remove(LEGACY_DATE)
        }
    }

    private fun MutablePreferences.putTarget(target: Double) {
        this[KEY_TARGET] = if (target.isNaN()) DEFAULT_TARGET else target.coerceIn(0.0, 1.0)
        remove(LEGACY_FACES)
    }

    private fun current(p: Preferences): ChanceResult? {
        val game = p[KEY_LAST_GAME] ?: return null
        val outcome = p[KEY_LAST_OUTCOME] ?: return null
        val train = p[KEY_LAST_TRAIN] ?: return null
        val date = p[KEY_LAST_DATE]?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
        return ChanceResult(game, outcome, train, date)
    }

    private fun legacy(p: Preferences): ChanceResult? {
        val face = p[LEGACY_FACE]?.takeIf { it in 1..6 } ?: return null
        val train = p[LEGACY_TRAIN] ?: return null
        val date = p[LEGACY_DATE]?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
        return ChanceResult(DiceGame.id, face.toString(), train, date)
    }

    private companion object {
        val KEY_GAME = stringPreferencesKey("chance.game")
        val KEY_TARGET = doublePreferencesKey("chance.target")
        val KEY_LAST_GAME = stringPreferencesKey("chance.last.game")
        val KEY_LAST_OUTCOME = stringPreferencesKey("chance.last.outcome")
        val KEY_LAST_TRAIN = booleanPreferencesKey("chance.last.train")
        val KEY_LAST_DATE = stringPreferencesKey("chance.last.date")

        // Written by 0.2.0: the faces that meant "train", and the last roll.
        val LEGACY_FACES = stringSetPreferencesKey("dice.trainFaces")
        val LEGACY_FACE = intPreferencesKey("dice.last.face")
        val LEGACY_TRAIN = booleanPreferencesKey("dice.last.train")
        val LEGACY_DATE = stringPreferencesKey("dice.last.date")
    }
}

/** 0.2.0 stored which faces meant "train"; only how many of them matters now. */
internal fun legacyTarget(faces: Set<String>): Double =
    faces.mapNotNull { it.toIntOrNull()?.takeIf { f -> f in 1..6 } }.toSet().size / 6.0

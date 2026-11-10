package com.exerciseornot.app.dice

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import java.time.LocalDate

/** Dice settings and the last roll; kept apart from workout data on purpose. */
class DicePreferences(private val store: DataStore<Preferences>) {

    val trainFaces: Flow<Set<Int>> = store.data
        .map { prefs ->
            prefs[KEY_FACES]?.mapNotNull { it.toIntOrNull()?.takeIf { f -> f in DICE_FACES } }?.toSet()
                ?: DEFAULT_TRAIN_FACES
        }
        .distinctUntilChanged()

    suspend fun setTrainFaces(faces: Set<Int>) {
        store.edit { it[KEY_FACES] = faces.filter { f -> f in DICE_FACES }.map(Int::toString).toSet() }
    }

    val lastResult: Flow<DiceResult?> = store.data
        .map { prefs ->
            val face = prefs[KEY_FACE]?.takeIf { it in DICE_FACES }
            val train = prefs[KEY_TRAIN]
            val date = prefs[KEY_DATE]?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            if (face == null || train == null || date == null) null else DiceResult(face, train, date)
        }
        .distinctUntilChanged()

    suspend fun saveResult(result: DiceResult) {
        store.edit {
            it[KEY_FACE] = result.face
            it[KEY_TRAIN] = result.train
            it[KEY_DATE] = result.date.toString()
        }
    }

    private companion object {
        val KEY_FACES = stringSetPreferencesKey("dice.trainFaces")
        val KEY_FACE = intPreferencesKey("dice.last.face")
        val KEY_TRAIN = booleanPreferencesKey("dice.last.train")
        val KEY_DATE = stringPreferencesKey("dice.last.date")
    }
}

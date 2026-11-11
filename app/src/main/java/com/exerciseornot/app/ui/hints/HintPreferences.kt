package com.exerciseornot.app.ui.hints

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

enum class Hint { Dice, Record, Backup }

/** Which first-use hints were dismissed; device-local, never part of a backup. */
class HintPreferences(private val store: DataStore<Preferences>) {

    fun isDismissed(hint: Hint): Flow<Boolean> = store.data
        .map { hint.name in it[KEY].orEmpty() }
        .distinctUntilChanged()

    suspend fun dismiss(hint: Hint) {
        store.edit { it[KEY] = it[KEY].orEmpty() + hint.name }
    }

    private companion object {
        val KEY = stringSetPreferencesKey("hints.dismissed")
    }
}

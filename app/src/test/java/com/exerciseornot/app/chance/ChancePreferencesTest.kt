package com.exerciseornot.app.chance

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.LocalDate

class ChancePreferencesTest {

    @get:Rule val tmp = TemporaryFolder()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val store by lazy {
        PreferenceDataStoreFactory.create(scope = scope) { tmp.root.resolve("settings.preferences_pb") }
    }
    private val prefs by lazy { ChancePreferences(store) }

    @After
    fun tearDown() = scope.cancel()

    @Test
    fun settings_defaultToDiceAtHalf() = runBlocking {
        assertEquals(ChanceSettings("dice", 0.5), prefs.settings.first())
    }

    @Test
    fun target_isKeptAndClamped() = runBlocking {
        prefs.setTarget(1.0 / 6)
        assertEquals(1.0 / 6, prefs.settings.first().target, 0.0)
        prefs.setTarget(0.0)
        assertEquals(0.0, prefs.settings.first().target, 0.0)
        prefs.setTarget(3.0)
        assertEquals(1.0, prefs.settings.first().target, 0.0)
    }

    @Test
    fun lastResult_roundTrips() = runBlocking {
        assertNull(prefs.lastResult.first())
        val r = ChanceResult("dice", "5", true, LocalDate.of(2026, 11, 11))
        prefs.saveResult(r)
        assertEquals(r, prefs.lastResult.first())
    }

    /** 0.2.0 stored the chosen faces and the last roll under dice.*; an upgrade keeps both. */
    @Test
    fun upgradeFrom020_keepsProbabilityAndTodaysRoll() = runBlocking {
        store.edit {
            it[stringSetPreferencesKey("dice.trainFaces")] = setOf("1", "6")
            it[intPreferencesKey("dice.last.face")] = 1
            it[booleanPreferencesKey("dice.last.train")] = true
            it[stringPreferencesKey("dice.last.date")] = "2026-11-17"
        }
        assertEquals(ChanceSettings("dice", 2.0 / 6), prefs.settings.first())
        // The answer was decided when rolled; face 1 trained under the old rule and still does today.
        assertEquals(ChanceResult("dice", "1", true, LocalDate.of(2026, 11, 17)), prefs.lastResult.first())
        assertEquals("2/6", DiceGame.snap(prefs.settings.first().target).key)
    }

    @Test
    fun upgradeFrom020_emptyFacesMeansNeverTrain() = runBlocking {
        store.edit { it[stringSetPreferencesKey("dice.trainFaces")] = emptySet() }
        assertEquals(0.0, prefs.settings.first().target, 0.0)
        assertEquals("0/6", DiceGame.snap(0.0).key)
    }

    @Test
    fun newWritesReplaceLegacyKeys() = runBlocking {
        store.edit {
            it[stringSetPreferencesKey("dice.trainFaces")] = setOf("6")
            it[intPreferencesKey("dice.last.face")] = 6
            it[booleanPreferencesKey("dice.last.train")] = true
            it[stringPreferencesKey("dice.last.date")] = "2026-11-16"
        }
        prefs.setTarget(0.5)
        prefs.saveResult(ChanceResult("dice", "2", false, LocalDate.of(2026, 11, 17)))
        val raw = store.data.first().asMap().keys.map { it.name }
        assertFalse(raw.toString(), raw.any { it.startsWith("dice.") })
        assertEquals(0.5, prefs.settings.first().target, 0.0)
        assertEquals("2", prefs.lastResult.first()?.outcomeId)
    }
}

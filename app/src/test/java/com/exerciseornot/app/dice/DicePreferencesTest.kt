package com.exerciseornot.app.dice

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.LocalDate

class DicePreferencesTest {

    @get:Rule val tmp = TemporaryFolder()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val prefs by lazy {
        DicePreferences(PreferenceDataStoreFactory.create(scope = scope) { tmp.root.resolve("settings.preferences_pb") })
    }

    @After
    fun tearDown() = scope.cancel()

    @Test
    fun trainFaces_defaultsTo456() = runBlocking {
        assertEquals(setOf(4, 5, 6), prefs.trainFaces.first())
    }

    @Test
    fun trainFaces_savedSetIsKept_includingEmpty() = runBlocking {
        prefs.setTrainFaces(setOf(1, 6))
        assertEquals(setOf(1, 6), prefs.trainFaces.first())
        prefs.setTrainFaces(emptySet())
        assertEquals(emptySet<Int>(), prefs.trainFaces.first())
    }

    @Test
    fun lastResult_roundTrips() = runBlocking {
        assertNull(prefs.lastResult.first())
        val r = DiceResult(5, true, LocalDate.of(2026, 11, 11))
        prefs.saveResult(r)
        assertEquals(r, prefs.lastResult.first())
    }
}

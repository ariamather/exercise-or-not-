package com.exerciseornot.app.ui.hints

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class HintPreferencesTest {

    @get:Rule val tmp = TemporaryFolder()
    private val scopes = mutableListOf<CoroutineScope>()

    private fun open(): HintPreferences {
        val scope = CoroutineScope(Dispatchers.IO + SupervisorJob()).also { scopes += it }
        return HintPreferences(PreferenceDataStoreFactory.create(scope = scope) { tmp.root.resolve("settings.preferences_pb") })
    }

    @After
    fun tearDown() = scopes.forEach { it.cancel() }

    @Test
    fun nothingDismissedByDefault() = runBlocking {
        val prefs = open()
        Hint.entries.forEach { assertFalse(prefs.isDismissed(it).first()) }
    }

    @Test
    fun dismiss_isIndependentPerHint() = runBlocking {
        val prefs = open()
        prefs.dismiss(Hint.Record)
        assertTrue(prefs.isDismissed(Hint.Record).first())
        assertFalse(prefs.isDismissed(Hint.Dice).first())
        assertFalse(prefs.isDismissed(Hint.Backup).first())
        prefs.dismiss(Hint.Dice)
        assertTrue(prefs.isDismissed(Hint.Record).first())
        assertTrue(prefs.isDismissed(Hint.Dice).first())
    }

    @Test
    fun dismiss_survivesReopen() = runBlocking {
        open().dismiss(Hint.Backup)
        scopes.forEach { it.cancel() }
        assertTrue(open().isDismissed(Hint.Backup).first())
    }
}

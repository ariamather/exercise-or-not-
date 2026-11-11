package com.exerciseornot.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exerciseornot.app.backup.BackupContent
import com.exerciseornot.app.backup.BackupService
import com.exerciseornot.app.backup.BackupSummary
import com.exerciseornot.app.backup.InvalidBackupException
import com.exerciseornot.app.ui.record.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.io.OutputStream
import java.time.Instant

/** A validated backup waiting for the user to confirm the replace. */
data class PendingRestore(val content: BackupContent) {
    val summary: BackupSummary get() = content.summary
}

class SettingsViewModel(private val backup: BackupService) : ViewModel() {

    val lastExportAt: StateFlow<Instant?> = backup.lastExportAt
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val restoreBackupAt: StateFlow<Instant?> = backup.restoreBackupAt

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _pending = MutableStateFlow<PendingRestore?>(null)
    val pending: StateFlow<PendingRestore?> = _pending.asStateFlow()

    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages: Flow<String> = _messages.receiveAsFlow()

    /** [open] is called on a background thread; it returns null if the destination can't be opened. */
    fun export(open: () -> OutputStream?) = run("导出失败，请换个位置重试") {
        val out = withContext(Dispatchers.IO) { open() } ?: throw IllegalArgumentException("无法写入所选位置")
        out.use { backup.exportTo(it) }
        "已导出备份"
    }

    fun preview(open: () -> InputStream?) = run("无法读取所选文件") {
        val input = withContext(Dispatchers.IO) { open() } ?: throw IllegalArgumentException("无法读取所选文件")
        _pending.value = PendingRestore(input.use { backup.preview(it) })
        null
    }

    fun cancelRestore() { _pending.value = null }

    fun confirmRestore() {
        val p = _pending.value ?: return
        _pending.value = null
        run("恢复失败，原有数据未改动") {
            backup.restore(p.content)
            "已恢复备份"
        }
    }

    fun undoLastRestore() = run("撤销失败，请重试") {
        backup.undoLastRestore()
        "已撤销上次恢复"
    }

    private fun run(fallback: String, block: suspend () -> String?) {
        if (_busy.value) return
        _busy.value = true
        viewModelScope.launch {
            try {
                block()?.let { _messages.send(it) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: InvalidBackupException) {
                _messages.send(e.message ?: fallback)
            } catch (e: IllegalArgumentException) {
                _messages.send(e.userMessage())
            } catch (e: Exception) {
                _messages.send(fallback)
            } finally {
                _busy.value = false
            }
        }
    }
}

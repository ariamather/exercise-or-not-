package com.exerciseornot.app.ui.settings

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exerciseornot.app.BuildConfig
import com.exerciseornot.app.backup.BACKUP_FORMAT_VERSION
import com.exerciseornot.app.backup.BackupSummary
import com.exerciseornot.app.data.db.DB_SCHEMA_VERSION
import com.exerciseornot.app.ui.common.HintText
import com.exerciseornot.app.ui.common.ScreenHeader
import com.exerciseornot.app.ui.common.SectionTitle
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    snackbarHostState: SnackbarHostState,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val resolver = context.contentResolver
    val lastExport by viewModel.lastExportAt.collectAsStateWithLifecycle()
    val restoreBackupAt by viewModel.restoreBackupAt.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val pending by viewModel.pending.collectAsStateWithLifecycle()
    var confirmUndo by rememberSaveable { mutableStateOf(false) }
    var showPrivacy by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(viewModel) {
        viewModel.messages.collect { snackbarHostState.showSnackbar(it) }
    }

    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
        if (uri != null) viewModel.export { resolver.openOutputStream(uri, "wt") }
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) viewModel.preview { resolver.openInputStream(uri) }
    }

    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        ScreenHeader("设置", onBack = onBack)
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionTitle("备份与恢复")
            Text(
                "训练数据只保存在这台手机上，没有云同步。换机或重装前，请先导出备份，存到网盘或发给自己。",
                style = MaterialTheme.typography.bodyMedium,
            )
            HintText("上次导出：" + (lastExport?.let(::timeText) ?: "从未导出"))
            Button(
                onClick = { exportLauncher.launch("exerciseornot-backup-${LocalDate.now()}.json") },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("导出备份") }
            OutlinedButton(
                onClick = { importLauncher.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("从备份恢复") }
            restoreBackupAt?.let { at ->
                OutlinedButton(onClick = { confirmUndo = true }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    Text("撤销上次恢复")
                }
                HintText("恢复前的数据已于 ${timeText(at)} 自动保留")
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            SectionTitle("隐私")
            Text("不联网，数据只在这台手机上。", style = MaterialTheme.typography.bodyMedium)
            OutlinedButton(onClick = { showPrivacy = true }, modifier = Modifier.fillMaxWidth()) { Text("查看隐私说明") }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            HintText(
                "版本 ${BuildConfig.VERSION_NAME} · 数据库 v$DB_SCHEMA_VERSION · 备份格式 v$BACKUP_FORMAT_VERSION",
                Modifier.padding(bottom = 16.dp),
            )
        }
    }

    pending?.let { p ->
        AlertDialog(
            onDismissRequest = viewModel::cancelRestore,
            title = { Text("恢复这份备份？") },
            text = { Text(summaryText(p.summary) + "\n\n将替换当前全部数据。当前数据会自动保留一份，恢复后可以撤销。") },
            confirmButton = { TextButton(onClick = viewModel::confirmRestore) { Text("恢复") } },
            dismissButton = { TextButton(onClick = viewModel::cancelRestore) { Text("取消") } },
        )
    }
    if (showPrivacy) {
        AlertDialog(
            onDismissRequest = { showPrivacy = false },
            title = { Text("隐私说明") },
            text = { Text(PRIVACY_TEXT) },
            confirmButton = { TextButton(onClick = { showPrivacy = false }) { Text("知道了") } },
        )
    }
    if (confirmUndo) {
        AlertDialog(
            onDismissRequest = { confirmUndo = false },
            title = { Text("撤销上次恢复？") },
            text = { Text("数据会回到恢复备份之前的样子，恢复之后新记录的内容会丢失。") },
            confirmButton = { TextButton(onClick = { confirmUndo = false; viewModel.undoLastRestore() }) { Text("撤销恢复") } },
            dismissButton = { TextButton(onClick = { confirmUndo = false }) { Text("取消") } },
        )
    }
}

private const val PRIVACY_TEXT =
    "不联网（应用没有网络权限），不收集、不上传任何信息，没有广告和统计。训练记录和玩法设置只保存在这台手机上；导出的备份文件保存在你自己选择的位置。"

private val timeFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

private fun timeText(instant: Instant): String = timeFormat.format(instant.atZone(ZoneId.systemDefault()))

private fun summaryText(s: BackupSummary): String = buildString {
    append("导出于 ${timeText(Instant.ofEpochMilli(s.exportedAt))}\n")
    append("${s.exercises} 个动作，${s.workouts} 次训练，${s.loggedSets} 组已记录")
    if (s.firstDate != null && s.lastDate != null) append("\n训练日期 ${s.firstDate} 至 ${s.lastDate}")
}

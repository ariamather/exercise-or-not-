package com.exerciseornot.app.ui.chance

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.exerciseornot.app.chance.ChanceGames
import com.exerciseornot.app.chance.OutcomeModel
import com.exerciseornot.app.chance.RevolverDraw
import com.exerciseornot.app.chance.Stop
import com.exerciseornot.app.chance.nearestStop

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ChanceGameSheet(
    gameId: String,
    onGame: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        modifier = Modifier.semantics { paneTitle = "选择玩法" },
    ) {
        FlowRow(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, bottom = 32.dp).selectableGroup(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            ChanceGames.all.forEach { option ->
                FilterChip(
                    selected = option.id == gameId,
                    onClick = {
                        if (option.id != gameId) onGame(option.id)
                        onDismiss()
                    },
                    label = { Text(option.name, fontSize = 13.sp) },
                )
            }
        }
    }
}

/** Every game has a probability slider, and the revolver also has two count controls. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChanceProbabilitySheet(
    setup: ChanceSetup,
    onStop: (Stop) -> Unit,
    onDismiss: () -> Unit,
) {
    val model = setup.game.model
    // Show the new stop immediately while the saved value flows back from preferences.
    var pending by remember(setup.game.id) { mutableStateOf<Stop?>(null) }
    LaunchedEffect(setup.stop) { if (pending?.key == setup.stop.key) pending = null }
    val shown = pending ?: setup.stop
    val choose: (Stop) -> Unit = { stop ->
        if (stop.key != (pending ?: setup.stop).key) {
            pending = stop
            onStop(stop)
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, bottom = 32.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "练的概率", fontSize = 19.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                Text(shown.percentText, fontSize = 28.sp)
                IconButton(onClick = onDismiss, modifier = Modifier.padding(start = 8.dp)) {
                    Icon(Icons.Filled.Close, contentDescription = "关闭概率设置")
                }
            }
            StopSlider(
                model = model,
                shown = shown,
                onStop = choose,
            )
            if (model == RevolverDraw) RevolverControls(shown, onStop = choose)
        }
    }
}

@Composable
private fun RevolverControls(shown: Stop, onStop: (Stop) -> Unit) {
    val config = RevolverDraw.configOf(shown)
    Column(
        Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        RevolverStepper(
            label = "装 ${config.loaded} 发",
            count = config.loaded,
            range = 0..6,
            decreaseLabel = "少装一发",
            increaseLabel = "多装一发",
            onChange = { onStop(RevolverDraw.stopFor(it, config.shots)) },
        )
        RevolverStepper(
            label = "打 ${config.shots} 下",
            count = config.shots,
            range = 1..6,
            decreaseLabel = "少打一下",
            increaseLabel = "多打一下",
            onChange = { onStop(RevolverDraw.stopFor(config.loaded, it)) },
        )
        Text(
            if (config.all) "全部命中才练" else "至少中一次就练",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun RevolverStepper(
    label: String,
    count: Int,
    range: IntRange,
    decreaseLabel: String,
    increaseLabel: String,
    onChange: (Int) -> Unit,
) {
    Row(
        Modifier.widthIn(max = 224.dp).fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedIconButton(
            onClick = { onChange(count - 1) },
            enabled = count > range.first,
            modifier = Modifier.size(48.dp).semantics { contentDescription = decreaseLabel },
        ) {
            Text("−", Modifier.clearAndSetSemantics {}, style = MaterialTheme.typography.titleLarge)
        }
        Text(
            label,
            modifier = Modifier.weight(1f).padding(horizontal = 4.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        OutlinedIconButton(
            onClick = { onChange(count + 1) },
            enabled = count < range.last,
            modifier = Modifier.size(48.dp).semantics { contentDescription = increaseLabel },
        ) {
            Text("+", Modifier.clearAndSetSemantics {}, style = MaterialTheme.typography.titleLarge)
        }
    }
}

/**
 * A continuous slider whose thumb jumps to the game's stops. Ticks sit at each stop's real
 * probability, so uneven stops (e.g. two dice) are drawn honestly rather than evenly spaced.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StopSlider(
    model: OutcomeModel,
    shown: Stop,
    onStop: (Stop) -> Unit,
) {
    val current by rememberUpdatedState(shown)
    val active = MaterialTheme.colorScheme.primary
    val track = active.copy(alpha = .16f)
    val tickOn = MaterialTheme.colorScheme.onPrimary.copy(alpha = .8f)
    val tickOff = active.copy(alpha = .45f)
    val thumbColor = MaterialTheme.colorScheme.surfaceContainerLow
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl

    Slider(
        value = shown.chance.toFloat(),
        onValueChange = {
            val next = model.nearestStop(it.toDouble())
            // Different configurations can share a probability.
            if (next.chance != shown.chance) onStop(next)
        },
        valueRange = 0f..1f,
        thumb = {
            Box(
                Modifier.size(26.dp).shadow(2.dp, CircleShape)
                    .background(thumbColor, CircleShape).padding(5.dp)
                    .background(active, CircleShape),
            )
        },
        track = { state ->
            Canvas(Modifier.fillMaxWidth().height(6.dp)) {
                val radius = CornerRadius(size.height / 2)
                val fraction = state.value.coerceIn(0f, 1f)
                val width = size.width * fraction
                drawRoundRect(track, cornerRadius = radius)
                drawRoundRect(
                    active,
                    topLeft = Offset(if (rtl) size.width - width else 0f, 0f),
                    size = Size(width, size.height),
                    cornerRadius = radius,
                )
                model.stops.forEach { s ->
                    val f = s.chance.toFloat()
                    val x = (if (rtl) 1f - f else f) * size.width
                    val inset = size.height / 2
                    drawCircle(
                        if (f <= fraction) tickOn else tickOff,
                        radius = 1.5.dp.toPx(),
                        center = Offset(x.coerceIn(inset, size.width - inset), size.height / 2),
                    )
                }
            }
        },
        // Screen readers step stop by stop instead of in 5% increments that would snap back.
        modifier = Modifier.fillMaxWidth().clearAndSetSemantics {
            contentDescription = "练的概率"
            stateDescription = shown.percentText
            progressBarRangeInfo = ProgressBarRangeInfo(shown.chance.toFloat(), 0f..1f)
            setProgress { target ->
                val now = current
                val next = when {
                    target > now.chance + 1e-6 -> model.stops.firstOrNull { it.chance > now.chance + 1e-9 }
                    target < now.chance - 1e-6 -> model.stops.lastOrNull { it.chance < now.chance - 1e-9 }
                    else -> null
                }
                next?.let(onStop)
                next != null
            }
        },
    )
}

package com.exerciseornot.app.ui.chance

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.exerciseornot.app.chance.ChanceGame
import com.exerciseornot.app.chance.ChanceGames
import com.exerciseornot.app.chance.Stop
import com.exerciseornot.app.chance.nearestStop

/** One slider for every game; the game decides where it can stop and what each stop means. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChanceSettingsSheet(
    setup: ChanceSetup,
    onStop: (Stop) -> Unit,
    onGame: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val game = setup.game
    // While dragging, show the stop under the finger; after release, hold it until the saved value arrives.
    var dragValue by remember(game.id) { mutableStateOf<Float?>(null) }
    var pending by remember(game.id) { mutableStateOf<Stop?>(null) }
    LaunchedEffect(setup.stop) { if (pending?.key == setup.stop.key) pending = null }
    val shown = dragValue?.let { game.nearestStop(it.toDouble()) } ?: pending ?: setup.stop
    val choose: (Stop) -> Unit = { s ->
        if (s.key != shown.key) {
            pending = s
            onStop(s)
        }
    }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(start = 24.dp, end = 24.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("把一点偏爱，交给概率。", fontSize = 19.sp, fontWeight = FontWeight.Medium, modifier = Modifier.semantics { heading() })
            Text("选一个玩法，再拖动滑条决定练的概率", fontSize = 12.sp, color = muted)
            Row(
                Modifier.fillMaxWidth().padding(top = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ChanceGames.all.forEach { option ->
                    FilterChip(
                        selected = option.id == game.id,
                        onClick = { if (option.id != game.id) onGame(option.id) },
                        label = { Text(option.name, fontSize = 13.sp) },
                    )
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("练的概率", fontSize = 12.sp, modifier = Modifier.weight(1f))
                Text(shown.percentText, fontSize = 28.sp)
            }
            Column {
                StopSlider(
                    game = game,
                    shown = shown,
                    onDrag = { v ->
                        dragValue = v
                        choose(game.nearestStop(v.toDouble()))
                    },
                    onDragEnd = { dragValue = null },
                    onStep = choose,
                )
                Row(Modifier.fillMaxWidth()) {
                    Text("0%", fontSize = 11.sp, color = muted)
                    Spacer(Modifier.weight(1f))
                    Text("100%", fontSize = 11.sp, color = muted)
                }
            }
            Text(
                shown.rule, fontSize = 14.sp,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text("结果只是一个小建议，决定权一直在你。", fontSize = 11.sp, color = muted)
            Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp), shape = RoundedCornerShape(18.dp)) { Text("就这样") }
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
    game: ChanceGame,
    shown: Stop,
    onDrag: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onStep: (Stop) -> Unit,
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
        onValueChange = onDrag,
        onValueChangeFinished = onDragEnd,
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
                game.stops.forEach { s ->
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
            stateDescription = "${shown.percentText}，${shown.rule}"
            progressBarRangeInfo = ProgressBarRangeInfo(shown.chance.toFloat(), 0f..1f)
            setProgress { target ->
                val now = current
                val next = when {
                    target > now.chance + 1e-6 -> game.stops.firstOrNull { it.chance > now.chance + 1e-9 }
                    target < now.chance - 1e-6 -> game.stops.lastOrNull { it.chance < now.chance - 1e-9 }
                    else -> null
                }
                next?.let(onStep)
                next != null
            }
        },
    )
}

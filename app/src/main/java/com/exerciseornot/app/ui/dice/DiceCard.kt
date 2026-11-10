package com.exerciseornot.app.ui.dice

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exerciseornot.app.dice.DICE_FACES
import com.exerciseornot.app.dice.trainProbabilityText
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.random.Random

@Composable
fun DiceCard(viewModel: DiceViewModel, modifier: Modifier = Modifier) {
    val faces by viewModel.trainFaces.collectAsStateWithLifecycle()
    val result by viewModel.todayResult.collectAsStateWithLifecycle()
    val rolling by viewModel.rolling.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    var showSettings by rememberSaveable { mutableStateOf(false) }

    // Decorative faces during the animation only; the real result is already saved.
    var shownFace by remember { mutableIntStateOf(0) }
    val rotation = remember { Animatable(0f) }
    LaunchedEffect(rolling) {
        if (!rolling) { rotation.snapTo(0f); shownFace = 0; return@LaunchedEffect }
        launch { rotation.animateTo(720f, tween(DiceViewModel.ROLL_DURATION_MS.toInt(), easing = LinearEasing)) }
        while (isActive) {
            shownFace = Random.nextInt(1, 7)
            delay(80)
        }
    }

    val face = if (rolling) shownFace else result?.face ?: 0

    OutlinedCard(modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = 16.dp, top = 4.dp, end = 4.dp, bottom = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("今天练不练？", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    IconButton(onClick = { showSettings = true }) {
                        Icon(Icons.Filled.Settings, contentDescription = "设置骰子点数")
                    }
                }
                Text(facesSummary(faces), style = MaterialTheme.typography.bodySmall)
                val r = result
                when {
                    rolling -> Text("…", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                    r != null -> Text(
                        "掷出 ${r.face} · ${if (r.train) "练" else "休息"}",
                        style = MaterialTheme.typography.titleMedium,
                        color = if (r.train) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Spacer(Modifier.padding(top = 8.dp))
                if (result == null && !rolling) {
                    Button(onClick = viewModel::roll) { Text("掷骰子") }
                } else {
                    OutlinedButton(onClick = viewModel::roll, enabled = !rolling) { Text("再掷一次") }
                }
            }
            Spacer(Modifier.width(12.dp))
            DieFace(
                face = face,
                size = 72.dp,
                modifier = Modifier
                    .padding(end = 12.dp, top = 12.dp)
                    .graphicsLayer {
                        rotationZ = rotation.value
                        val s = if (rolling) 0.9f else 1f
                        scaleX = s; scaleY = s
                    },
            )
        }
    }

    if (showSettings) {
        DiceSettingsSheet(faces = faces, onToggle = viewModel::toggleFace, onDismiss = { showSettings = false })
    }
}

internal fun facesSummary(faces: Set<Int>): String {
    val sorted = faces.filter { it in DICE_FACES }.sorted()
    return if (sorted.isEmpty()) "没有选择“练”的点数 · 0%"
    else "掷出 ${sorted.joinToString("、")} 就练 · ${trainProbabilityText(faces)}"
}

/** Pips drawn on a rounded square; face 0 draws an empty die (not rolled yet). */
@Composable
fun DieFace(face: Int, size: Dp, modifier: Modifier = Modifier, pipColor: Color = MaterialTheme.colorScheme.onSurface) {
    val border = MaterialTheme.colorScheme.outline
    val fill = MaterialTheme.colorScheme.surfaceVariant
    Canvas(
        modifier
            .size(size)
            .semantics { contentDescription = if (face in DICE_FACES) "骰子 $face 点" else "骰子" },
    ) {
        val corner = CornerRadius(this.size.minDimension * 0.18f)
        drawRoundRect(fill, cornerRadius = corner)
        drawRoundRect(border, cornerRadius = corner, style = Stroke(width = 2.dp.toPx()))
        val r = this.size.minDimension * 0.09f
        pips(face).forEach { (x, y) ->
            drawCircle(pipColor, radius = r, center = Offset(this.size.width * x, this.size.height * y))
        }
    }
}

private const val L = 0.27f
private const val M = 0.5f
private const val H = 0.73f

private fun pips(face: Int): List<Pair<Float, Float>> = when (face) {
    1 -> listOf(M to M)
    2 -> listOf(L to L, H to H)
    3 -> listOf(L to L, M to M, H to H)
    4 -> listOf(L to L, H to L, L to H, H to H)
    5 -> listOf(L to L, H to L, M to M, L to H, H to H)
    6 -> listOf(L to L, H to L, L to M, H to M, L to H, H to H)
    else -> emptyList()
}

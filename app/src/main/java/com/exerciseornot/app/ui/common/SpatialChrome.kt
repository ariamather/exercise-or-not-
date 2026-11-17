package com.exerciseornot.app.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun BrandHeader(modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().height(70.dp).padding(horizontal = 26.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        DiceIcon(
            color = MaterialTheme.colorScheme.background,
            modifier = Modifier.size(27.dp).rotate(-8f)
                .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(8.dp)).padding(4.dp),
            outlined = false,
        )
        Text("练不练.", fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Three rising rounded bars, matching the 6-spatial nav icon. */
@Composable
fun StatsIcon(modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    Canvas(modifier.size(21.dp)) {
        val u = size.width / 24f
        val stroke = Stroke(1.6f * u)
        listOf(Triple(4f, 13f, 7f), Triple(10.5f, 8f, 12f), Triple(17f, 4f, 16f)).forEach { (x, y, h) ->
            drawRoundRect(color, Offset(x * u, y * u), Size(3f * u, h * u), CornerRadius(1f * u), style = stroke)
        }
    }
}

@Composable
fun DiceIcon(modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary, outlined: Boolean = true) {
    Canvas(modifier.size(22.dp)) {
        if (outlined) drawRoundRect(
            color = color,
            topLeft = Offset(1.dp.toPx(), 1.dp.toPx()),
            size = Size(size.width - 2.dp.toPx(), size.height - 2.dp.toPx()),
            cornerRadius = CornerRadius(5.dp.toPx()),
            style = Stroke(1.5.dp.toPx()),
        )
        listOf(.28f, .5f, .72f).forEach { fraction ->
            drawCircle(color, size.minDimension * .065f, Offset(size.width * fraction, size.height * fraction))
        }
    }
}

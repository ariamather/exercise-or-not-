package com.exerciseornot.app.ui.record

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.exerciseornot.app.data.EXERCISE_HISTORY_LIMIT
import com.exerciseornot.app.data.ExerciseSession
import com.exerciseornot.app.ui.dayLabel
import com.exerciseornot.app.ui.setText
import java.time.LocalDate

/** Logged sets of one exercise across its recent workouts; [currentWorkoutId] is marked "本次". */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExerciseHistorySheet(
    title: String,
    sessions: List<ExerciseSession>,
    currentWorkoutId: String?,
    today: LocalDate,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(
                if (sessions.isEmpty()) "还没有已记录的组" else "最近 ${sessions.size} 次（最多 $EXERCISE_HISTORY_LIMIT 次）",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            LazyColumn(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
                items(sessions, key = { it.workoutId }) { s ->
                    Column(Modifier.padding(vertical = 8.dp)) {
                        Row {
                            Text(s.trainingDate.dayLabel(today), style = MaterialTheme.typography.titleSmall)
                            if (s.workoutId == currentWorkoutId) {
                                Text(
                                    "  本次",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                        s.sets.forEachIndexed { i, set ->
                            Text("${i + 1}. ${setText(set.weightGrams, set.reps)}", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

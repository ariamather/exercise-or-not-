package com.exerciseornot.app.ui.history

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exerciseornot.app.data.db.SetStatus
import com.exerciseornot.app.data.db.WorkoutWithExercises
import com.exerciseornot.app.ui.displayText

@Composable
fun HistoryScreen(viewModel: HistoryViewModel, modifier: Modifier = Modifier) {
    val workouts by viewModel.workouts.collectAsStateWithLifecycle()

    if (workouts.isEmpty()) {
        Text("还没有训练记录", modifier = modifier.padding(16.dp))
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(workouts, key = { it.workout.id }) { WorkoutCard(it) }
    }
}

@Composable
private fun WorkoutCard(item: WorkoutWithExercises) {
    var expanded by rememberSaveable(item.workout.id) { mutableStateOf(true) }
    val exercises = item.exercises.sortedBy { it.workoutExercise.position }
    val loggedCount = exercises.sumOf { e -> e.sets.count { it.status == SetStatus.LOGGED } }

    Card(Modifier.fillMaxWidth().clickable { expanded = !expanded }) {
        Column(Modifier.padding(16.dp)) {
            Text(item.workout.trainingDate, style = MaterialTheme.typography.titleMedium)
            Text("${exercises.size} 个动作 · $loggedCount 组", style = MaterialTheme.typography.bodySmall)
            if (expanded) {
                exercises.forEach { e ->
                    Text(
                        e.workoutExercise.nameSnapshot,
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    e.sets.filter { it.status == SetStatus.LOGGED }.sortedBy { it.position }
                        .forEachIndexed { i, set -> Text("${i + 1}. ${set.displayText()}") }
                }
            }
        }
    }
}

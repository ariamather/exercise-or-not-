package com.exerciseornot.app.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.exerciseornot.app.ui.AppViewModelFactory
import com.exerciseornot.app.ui.common.DiceIcon
import com.exerciseornot.app.ui.common.StatsIcon
import com.exerciseornot.app.ui.stats.StatsScreen
import com.exerciseornot.app.ui.dice.DiceScreen
import com.exerciseornot.app.ui.history.HistoryScreen
import com.exerciseornot.app.ui.record.RecordScreen
import com.exerciseornot.app.ui.settings.SettingsScreen

private const val HISTORY_ROUTE = "history"
private const val SETTINGS_ROUTE = "settings"
private enum class Tab(val route: String, val label: String) {
    Dice("dice", "掷骰子"), Record("record", "记录"), Stats("stats", "统计"),
}

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val currentRoute = backStack?.destination?.route
    val selectedTab = when (currentRoute) {
        Tab.Dice.route, null -> Tab.Dice
        Tab.Stats.route -> Tab.Stats
        else -> Tab.Record
    }
    val navigateToTab: (Tab) -> Unit = { tab ->
        // History and backup are secondary screens of Record; don't restore them as a tab.
        if (currentRoute == HISTORY_ROUTE || currentRoute == SETTINGS_ROUTE) {
            navController.popBackStack(Tab.Record.route, false)
        }
        navController.navigate(tab.route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp)) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Row(
                    Modifier.fillMaxWidth().selectableGroup().padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    Tab.entries.forEach { tab ->
                        val selected = selectedTab == tab
                        val tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        Row(
                            Modifier.clip(RoundedCornerShape(12.dp))
                                .background(if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                                .selectable(selected, role = Role.Tab, onClick = { navigateToTab(tab) })
                                .heightIn(min = 48.dp).padding(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(9.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            when (tab) {
                                Tab.Dice -> DiceIcon(color = tint)
                                Tab.Record -> Icon(Icons.Filled.Edit, null, tint = tint, modifier = Modifier.size(21.dp))
                                Tab.Stats -> StatsIcon(color = tint)
                            }
                            Text(tab.label, color = tint, fontSize = 12.sp)
                        }
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController,
            startDestination = Tab.Dice.route,
            modifier = Modifier.padding(padding).consumeWindowInsets(padding),
        ) {
            composable(Tab.Dice.route) {
                DiceScreen(
                    viewModel(factory = AppViewModelFactory.Factory),
                    onOpenRecord = { navigateToTab(Tab.Record) },
                )
            }
            composable(Tab.Record.route) {
                RecordScreen(
                    viewModel(factory = AppViewModelFactory.Factory),
                    snackbarHostState,
                    onOpenHistory = { navController.navigate(HISTORY_ROUTE) { launchSingleTop = true } },
                )
            }
            composable(Tab.Stats.route) {
                StatsScreen(
                    viewModel(factory = AppViewModelFactory.Factory),
                    onOpenRecord = { navigateToTab(Tab.Record) },
                )
            }
            composable(HISTORY_ROUTE) {
                HistoryScreen(
                    viewModel(factory = AppViewModelFactory.Factory),
                    viewModel(factory = AppViewModelFactory.Factory),
                    snackbarHostState,
                    onOpenRecord = { navController.popBackStack(Tab.Record.route, false) },
                    onOpenSettings = { navController.navigate(SETTINGS_ROUTE) { launchSingleTop = true } },
                )
            }
            composable(SETTINGS_ROUTE) {
                SettingsScreen(
                    viewModel(factory = AppViewModelFactory.Factory),
                    snackbarHostState,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}

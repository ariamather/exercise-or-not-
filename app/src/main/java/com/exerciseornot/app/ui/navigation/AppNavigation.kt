package com.exerciseornot.app.ui.navigation

import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.exerciseornot.app.ui.AppViewModelFactory
import com.exerciseornot.app.ui.history.HistoryScreen
import com.exerciseornot.app.ui.record.RecordScreen
import com.exerciseornot.app.ui.settings.SettingsScreen

private const val SETTINGS_ROUTE = "settings"

private enum class Tab(val route: String, val label: String, val icon: ImageVector) {
    Record("record", "记录", Icons.Filled.Edit),
    History("history", "历史", Icons.AutoMirrored.Filled.List),
}

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val currentRoute = backStack?.destination?.hierarchy?.firstOrNull()?.route
    // Settings is opened from history, so the history tab stays selected while it is shown.
    val selectedTab = if (currentRoute == SETTINGS_ROUTE) Tab.History else Tab.entries.firstOrNull { it.route == currentRoute }
    val navigateToTab: (Tab) -> Unit = { tab ->
        // Close settings first so the saved History stack doesn't bring it back later.
        if (currentRoute == SETTINGS_ROUTE) navController.popBackStack()
        if (tab != Tab.History || currentRoute != SETTINGS_ROUTE) {
            navController.navigate(tab.route) {
                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = tab == selectedTab,
                        onClick = { navigateToTab(tab) },
                        icon = { Icon(tab.icon, contentDescription = null) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController,
            startDestination = Tab.Record.route,
            // Consume the bottom bar inset so screens' imePadding() doesn't double-count it.
            modifier = Modifier.padding(padding).consumeWindowInsets(padding),
        ) {
            composable(Tab.Record.route) {
                RecordScreen(
                    viewModel(factory = AppViewModelFactory.Factory),
                    viewModel(factory = AppViewModelFactory.Factory),
                    snackbarHostState,
                    onOpenHistory = { navigateToTab(Tab.History) },
                )
            }
            composable(Tab.History.route) {
                HistoryScreen(
                    viewModel(factory = AppViewModelFactory.Factory),
                    snackbarHostState,
                    onOpenRecord = { navigateToTab(Tab.Record) },
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

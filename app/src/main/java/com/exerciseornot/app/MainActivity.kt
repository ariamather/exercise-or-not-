package com.exerciseornot.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.exerciseornot.app.ui.navigation.AppNavigation
import com.exerciseornot.app.ui.theme.ExerciseOrNotTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            ExerciseOrNotTheme { AppNavigation() }
        }
    }
}

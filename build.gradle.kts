plugins {
    alias(libs.plugins.android.application) apply false
    // Not applied (AGP 9 has built-in Kotlin); declared to raise KGP above AGP's bundled 2.2.10.
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.room) apply false
}

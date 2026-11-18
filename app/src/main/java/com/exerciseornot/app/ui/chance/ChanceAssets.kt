package com.exerciseornot.app.ui.chance

/**
 * What the chance WebView may load: packaged files under assets/chance/ only, served from a
 * fixed https origin. Tests walk the packaged assets with the same rules, so a file that would
 * be refused at runtime (wrong case, unknown type) fails the build instead.
 */
internal object ChanceAssets {
    const val HOST = "appassets.androidplatform.net"
    const val ROOT = "chance"

    /** Bytes per scene folder, shared libraries excluded; keeps the APK from growing by accident. */
    const val SCENE_BUDGET_BYTES = 3L * 1024 * 1024

    private val MIME = mapOf(
        "html" to "text/html",
        "js" to "application/javascript",
        "css" to "text/css",
        "json" to "application/json",
        "png" to "image/png",
        "webp" to "image/webp",
        "jpg" to "image/jpeg",
        "svg" to "image/svg+xml",
        "glb" to "model/gltf-binary",
        "bin" to "application/octet-stream",
        "ogg" to "audio/ogg",
        "mp3" to "audio/mpeg",
        "woff2" to "font/woff2",
    )
    private val TEXT = setOf("html", "js", "css", "json", "svg")

    /** Lowercase ASCII names, no "..", one known extension. */
    private val PATH = Regex("[a-z0-9_-]+(/[a-z0-9_-]+)*\\.(${MIME.keys.joinToString("|")})")

    fun allowed(path: String): Boolean = PATH.matches(path)

    fun mimeOf(path: String): String = MIME.getValue(path.substringAfterLast('.'))

    /** Text types are decoded as UTF-8; binary ones are passed through untouched. */
    fun encodingOf(path: String): String? = if (path.substringAfterLast('.') in TEXT) "UTF-8" else null
}

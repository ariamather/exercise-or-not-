package com.exerciseornot.app.ui.dice

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.json.JSONObject
import java.io.ByteArrayInputStream

private const val SCENE_HOST = "appassets.androidplatform.net"
private const val SCENE_URL = "https://$SCENE_HOST/dice/index.html"

/** Only the dice page uses the packaged WebGL scene. Records and settings remain Compose UI. */
@Composable
fun DiceScreen(viewModel: DiceViewModel, onOpenRecord: () -> Unit, modifier: Modifier = Modifier) {
    val faces by viewModel.trainFaces.collectAsStateWithLifecycle()
    val result by viewModel.todayResult.collectAsStateWithLifecycle()
    val rolling by viewModel.rolling.collectAsStateWithLifecycle()
    val animation by viewModel.animation.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    var showSettings by rememberSaveable { mutableStateOf(false) }
    val openRecord by rememberUpdatedState(onOpenRecord)
    var scene by remember { mutableStateOf<DiceWebView?>(null) }
    val lifecycleOwner = LocalLifecycleOwner.current

    val answer = animation?.result ?: result
    val state = JSONObject().apply {
        put("face", answer?.face ?: 1)
        put("hasResult", answer != null)
        put("train", answer?.train ?: false)
        put("rolling", rolling)
        put("requestId", animation?.id ?: 0L)
        put("error", error ?: "")
    }.toString()

    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { context ->
            DiceWebView(
                context,
                onRoll = viewModel::rollAnimated,
                onSettings = { showSettings = true },
                onRecord = { openRecord() },
                onFinished = viewModel::animationFinished,
                onFailed = viewModel::animationFailed,
            ).also { scene = it }
        },
        update = { it.render(state) },
        onRelease = {
            it.release()
            viewModel.closeScene()
        },
    )

    DisposableEffect(lifecycleOwner, scene) {
        val webView = scene
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> webView?.onResume()
                Lifecycle.Event.ON_PAUSE -> {
                    viewModel.closeScene()
                    webView?.onPause()
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    if (showSettings) {
        DiceSettingsSheet(faces, viewModel::toggleFace, onDismiss = { showSettings = false })
    }
}

@SuppressLint("SetJavaScriptEnabled")
private class DiceWebView(
    context: Context,
    onRoll: () -> Unit,
    onSettings: () -> Unit,
    onRecord: () -> Unit,
    onFinished: (Long, Int) -> Unit,
    onFailed: (Long) -> Unit,
) : WebView(context) {
    private var released = false
    private var ready = false
    private var state = "{}"
    private var deliveredState: String? = null

    init {
        setBackgroundColor(Color.rgb(246, 245, 240))
        isVerticalScrollBarEnabled = false
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = false
            allowFileAccess = false
            allowContentAccess = false
            blockNetworkLoads = true
            setSupportZoom(false)
        }
        // No external document, remote resource, or file URL is allowed into the bridged WebView.
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val uri = request.url
                val file = uri.path?.removePrefix("/dice/").orEmpty()
                val allowed = setOf("index.html", "scene.css", "scene.js", "dice-3d.js", "dice-physics.js")
                if (uri.scheme != "https" || uri.host != SCENE_HOST || uri.path?.startsWith("/dice/") != true || file !in allowed) {
                    return WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(byteArrayOf()))
                }
                val mime = when {
                    file.endsWith(".js") -> "application/javascript"
                    file.endsWith(".css") -> "text/css"
                    else -> "text/html"
                }
                return WebResourceResponse(mime, "UTF-8", context.assets.open("dice/$file"))
            }
        }
        addJavascriptInterface(object {
            @JavascriptInterface fun ready() = onMain {
                ready = true
                deliveredState = null
                deliver()
            }
            @JavascriptInterface fun roll() = onMain(onRoll)
            @JavascriptInterface fun settings() = onMain(onSettings)
            @JavascriptInterface fun record() = onMain(onRecord)
            @JavascriptInterface fun finished(id: Long, face: Int) = onMain { onFinished(id, face) }
            @JavascriptInterface fun failed(id: Long) = onMain { onFailed(id) }
        }, "AndroidDice")
        loadUrl(SCENE_URL)
    }

    private fun onMain(action: () -> Unit) {
        post { if (!released) action() }
    }

    fun render(json: String) {
        state = json
        deliver()
    }

    private fun deliver() {
        if (released || !ready || deliveredState == state) return
        deliveredState = state
        evaluateJavascript("window.NativeDice.render($state)", null)
    }

    fun release() {
        released = true
        ready = false
        stopLoading()
        removeJavascriptInterface("AndroidDice")
        destroy()
    }
}

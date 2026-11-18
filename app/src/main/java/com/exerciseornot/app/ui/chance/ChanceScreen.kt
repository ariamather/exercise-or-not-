package com.exerciseornot.app.ui.chance

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.view.HapticFeedbackConstants
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
import com.exerciseornot.app.chance.ChanceGames
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.IOException

private const val SCENE_HOST = "appassets.androidplatform.net"
private const val ASSET_ROOT = "chance"

/** Packaged files only: lowercase names, no "..", nothing outside assets/chance/. */
private val ASSET_PATH = Regex("[a-z0-9-]+(/[a-z0-9-]+)*\\.(html|js|css)")

/**
 * The home page: a packaged web scene reveals what [ChanceViewModel] already drew and saved.
 * Records and settings remain Compose UI.
 */
@Composable
fun ChanceScreen(viewModel: ChanceViewModel, onOpenRecord: () -> Unit, modifier: Modifier = Modifier) {
    val setup by viewModel.setup.collectAsStateWithLifecycle()
    val result by viewModel.todayResult.collectAsStateWithLifecycle()
    val drawing by viewModel.drawing.collectAsStateWithLifecycle()
    val animation by viewModel.animation.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    var showSettings by rememberSaveable { mutableStateOf(false) }
    val openRecord by rememberUpdatedState(onOpenRecord)
    var scene by remember { mutableStateOf<ChanceWebView?>(null) }
    val lifecycleOwner = LocalLifecycleOwner.current

    val answer = animation?.result ?: result
    // A result drawn with another game still answers today; it can be shown here when both
    // games reveal the same kind of outcome (the die and the cup are both d6).
    val outcome = answer
        ?.takeIf { ChanceGames.resolve(it.gameId).outcomeModel == setup.game.outcomeModel }
        ?.outcomeId
    val sceneId = setup.game.sceneId
    val state = JSONObject().apply {
        put("outcome", outcome ?: JSONObject.NULL)
        put("hasResult", answer != null)
        put("train", answer?.train ?: false)
        put("drawing", drawing)
        put("requestId", animation?.id ?: 0L)
        put("error", error ?: "")
    }.toString()

    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { context ->
            ChanceWebView(
                context,
                onDraw = viewModel::drawAnimated,
                onSettings = { showSettings = true },
                onRecord = { openRecord() },
                onFinished = viewModel::animationFinished,
                onFailed = viewModel::animationFailed,
            ).also { scene = it }
        },
        update = {
            if (it.sceneId != sceneId) {
                viewModel.closeScene()
                it.load(sceneId)
            }
            it.render(state)
        },
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
        ChanceSettingsSheet(
            setup,
            onStop = viewModel::setStop,
            onGame = viewModel::setGame,
            onDismiss = { showSettings = false },
        )
    }
}

@SuppressLint("SetJavaScriptEnabled")
private class ChanceWebView(
    context: Context,
    onDraw: () -> Unit,
    onSettings: () -> Unit,
    onRecord: () -> Unit,
    onFinished: (Long, String) -> Unit,
    onFailed: (Long) -> Unit,
) : WebView(context) {
    private var released = false
    private var ready = false
    private var state = "{}"
    private var deliveredState: String? = null
    var sceneId: String? = null
        private set

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
                val path = uri.path.orEmpty().removePrefix("/$ASSET_ROOT/")
                if (uri.scheme != "https" || uri.host != SCENE_HOST || uri.path?.startsWith("/$ASSET_ROOT/") != true ||
                    !ASSET_PATH.matches(path)
                ) return status(403, "Forbidden")
                val mime = when {
                    path.endsWith(".js") -> "application/javascript"
                    path.endsWith(".css") -> "text/css"
                    else -> "text/html"
                }
                return try {
                    WebResourceResponse(mime, "UTF-8", context.assets.open("$ASSET_ROOT/$path"))
                } catch (e: IOException) {
                    status(404, "Not Found")
                }
            }
        }
        addJavascriptInterface(object {
            @JavascriptInterface fun ready() = onMain {
                ready = true
                deliveredState = null
                deliver()
            }
            @JavascriptInterface fun draw() = onMain(onDraw)
            @JavascriptInterface fun settings() = onMain(onSettings)
            @JavascriptInterface fun record() = onMain(onRecord)
            @JavascriptInterface fun finished(id: Long, outcome: String) = onMain { onFinished(id, outcome) }
            @JavascriptInterface fun failed(id: Long) = onMain { onFailed(id) }
            /** Short scene feedback: only "tick" (rattles, landing) and "thud" (opening). */
            @JavascriptInterface fun haptic(kind: String) = onMain {
                when (kind) {
                    "tick" -> performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                    "thud" -> performHapticFeedback(
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM
                        else HapticFeedbackConstants.KEYBOARD_TAP,
                    )
                }
            }
        }, "AndroidChance")
    }

    fun load(sceneId: String) {
        this.sceneId = sceneId
        ready = false
        deliveredState = null
        loadUrl("https://$SCENE_HOST/$ASSET_ROOT/index.html?scene=$sceneId")
    }

    private fun status(code: Int, reason: String) =
        WebResourceResponse("text/plain", "UTF-8", code, reason, emptyMap(), ByteArrayInputStream(byteArrayOf()))

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
        evaluateJavascript("window.EonChance.render($state)", null)
    }

    fun release() {
        released = true
        ready = false
        stopLoading()
        removeJavascriptInterface("AndroidChance")
        destroy()
    }
}

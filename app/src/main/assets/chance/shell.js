/*
 * Shared page for every game. Android owns the random result and its persistence;
 * a scene only reveals it.
 *
 * A scene lives in scenes/<id>/scene.js and calls EonChance.register({
 *   api: 1,                             // the contract below; the shell refuses newer ones
 *   libs: ['anim.js', 'gl.js', ...],    // shared helpers from lib/, loaded first, in order
 *   requires: ['helper.js', ...],       // this scene's own scripts, relative to its folder
 *   styles: ['scene.css', ...],         // optional stylesheets, relative to its folder
 *   tapToDraw: false,                   // optional; the stage then belongs to the scene (e.g. dragging)
 *   labels: { ... },                    // see DEFAULT_LABELS
 *   create(stage, host) -> {
 *     reveal(outcome) -> Promise<outcome | null>,  // play until `outcome` shows; resolve with what shows
 *     show(outcome | null),                        // stop anything running and display `outcome` (null = idle)
 *     revealing() -> boolean,
 *     primaryState(), primaryAction()             // optional manual step button during a reveal
 *   }
 * }).
 *
 * `host` gives a scene:
 *   fail(message)        it can no longer run (e.g. a lost WebGL context)
 *   haptic('tick'|'thud') a short vibration; a no-op where unsupported
 *   draw()               asks Android to draw, as the main button does (e.g. tapping a card)
 *   asset(path)          URL of a file in this scene's folder (textures, models, sounds)
 *   parts(outcome)       a combined outcome's parts: "3,5" -> ["3", "5"]
 *   pace()               'timed' or 'user' for the reveal in progress (or the game's default)
 *   train()              whether the current outcome means train (true) or rest (false)
 *   refreshControls()      redraw button state when a manual step becomes available
 *   stopKey()            the saved outcome's probability stop, or the selected stop when idle
 *
 * Outcomes are strings. A 'user' reveal waits for the user (scratching, turning a wheel) with no
 * deadline; the main button then offers to skip, which calls show(outcome). Whatever a scene
 * does before `reveal` (shaking, spinning) is decoration: it never picks the outcome.
 */
(function () {
  'use strict';
  const API = 1;
  const DEFAULT_LABELS = {
    action: '开始', again: '再来一次', busy: '正在揭晓…', skip: '直接看结果',
    idle: '让运气先开个头。', waiting: '答案正在路上。',
    stageIdle: '点击开始', stageBusy: '正在揭晓',
    stageResult: () => '点击再来一次',
    loadError: '无法加载动画，请重新打开这一页。',
  };
  const $ = id => document.getElementById(id);
  const stage = $('stage'), button = $('draw'), label = $('draw-label');
  const result = $('result'), error = $('error'), record = $('record');
  const skipButton = document.createElement('button');
  skipButton.className = 'shortcut';
  skipButton.id = 'skip';
  skipButton.hidden = true;
  button.after(skipButton);

  const sceneId = new URLSearchParams(location.search).get('scene') || 'dice';
  const base = 'scenes/' + sceneId + '/';
  let definition = null, scene = null, labels = DEFAULT_LABELS, sceneError = '';
  let state = {}, request = 0, busy = false, skipped = 0;

  const userPaced = () => busy && state.pace === 'user' && !!state.requestId;

  const stepping = () => busy && !!state.requestId && !!scene?.primaryAction;

  function controls() {
    busy = !!state.drawing;
    const skip = userPaced() && skipped !== state.requestId;
    const manual = stepping() && skipped !== state.requestId;
    const step = manual ? scene.primaryState() : null;
    skipButton.hidden = !(manual && skip);
    skipButton.textContent = labels.skip;
    if (manual) {
      button.disabled = !step?.enabled || !!sceneError;
      label.textContent = step?.label || labels.busy;
    } else {
      button.disabled = !skip && (busy || !scene || !!sceneError);
      label.textContent = skip ? labels.skip : busy ? labels.busy : state.hasResult ? labels.again : labels.action;
    }
    stage.disabled = busy && !userPaced() && !manual || !scene || !!sceneError;
    result.className = 'result' + (!busy && state.hasResult ? ' answer' + (state.train ? '' : ' rest') : '');
    result.textContent = busy ? labels.waiting : !state.hasResult ? labels.idle : state.train ? '走吧，练一点。' : '今天，歇一歇。';
    stage.setAttribute('aria-label', busy ? labels.stageBusy
      : state.hasResult && state.outcome != null ? labels.stageResult(state.outcome)
      : state.hasResult ? '今天已经决定了，点击再来一次' : labels.stageIdle);
    record.textContent = !state.hasResult || busy ? '已经决定了，直接记录 ↗' : state.train ? '去记录今天的训练 ↗' : '想练也可以，直接记录 ↗';
    error.textContent = state.error || sceneError;
    error.hidden = !error.textContent;
  }

  function fail(message) {
    sceneError = message;
    if (request) AndroidChance.failed(request);
    controls();
  }

  function haptic(kind) {
    try { if (typeof AndroidChance.haptic === 'function') AndroidChance.haptic(String(kind)); } catch (_) { /* optional */ }
  }

  function show(outcome) {
    try {
      scene.show(outcome);
      return true;
    } catch (error) {
      console.error('Cannot show ' + sceneId + ' outcome', error);
      sceneError = labels.loadError;
      controls();
      return false;
    }
  }

  /* Paths stay inside the scene folder: lowercase names, no "..", like the native whitelist. */
  function asset(path) {
    if (!/^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.[a-z0-9]+$/.test(String(path))) throw new Error('bad asset path ' + path);
    return base + path;
  }

  window.EonChance = {
    register(def) { definition = def; },
    render(next) {
      const previous = state;
      state = next;
      controls();
      if (next.requestId && next.requestId !== request) {
        request = next.requestId;
        const id = request;
        if (!scene || sceneError) { AndroidChance.failed(id); return; }
        Promise.resolve().then(() => scene.reveal(next.outcome)).then(shown => {
          if (request !== id || skipped === id) return;
          if (shown === next.outcome) AndroidChance.finished(id, shown);
          else { show(next.outcome); AndroidChance.failed(id); }
        }).catch(() => {
          if (request === id && skipped !== id) { show(next.outcome); AndroidChance.failed(id); }
        });
      } else if (!next.requestId && !next.drawing) {
        // Keep the resting pose a reveal ended on; only redraw when something actually changed.
        if (scene && (scene.revealing() || previous.outcome !== next.outcome ||
          previous.train !== next.train || previous.stopKey !== next.stopKey)) show(next.outcome);
        request = 0;
      }
    },
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('cannot load ' + src));
      document.head.append(s);
    });
  }

  function loadStyle(href) {
    return new Promise((resolve, reject) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = resolve;
      l.onerror = () => reject(new Error('cannot load ' + href));
      document.head.append(l);
    });
  }

  async function start() {
    if (!/^[a-z0-9-]+$/.test(sceneId)) throw new Error('bad scene id');
    await loadScript(base + 'scene.js');
    if (!definition) throw new Error('scene did not register');
    if (definition.api !== API) throw new Error('scene needs api ' + definition.api);
    labels = Object.assign({}, DEFAULT_LABELS, definition.labels);
    for (const file of definition.styles || []) await loadStyle(asset(file));
    for (const file of definition.libs || []) await loadScript('lib/' + file);
    for (const file of definition.requires || []) await loadScript(asset(file));
    scene = definition.create(stage, {
      fail, haptic, draw, asset, refreshControls: controls,
      parts: outcome => String(outcome).split(','),
      pace: () => state.pace || 'timed',
      train: () => !!state.train,
      stopKey: () => state.stopKey,
    });
  }

  function draw() {
    if (busy || !scene || sceneError) return;
    busy = true;
    button.disabled = stage.disabled = true;
    AndroidChance.draw();
  }

  /* A user-paced reveal can always be skipped: show the saved outcome and report it shown. */
  function skip() {
    const id = state.requestId;
    if (!userPaced() || skipped === id) return;
    skipped = id;
    const shown = show(state.outcome);
    controls();
    if (shown) AndroidChance.finished(id, state.outcome);
    else AndroidChance.failed(id);
  }

  stage.addEventListener('click', () => { if (!definition || definition.tapToDraw !== false) draw(); });
  button.addEventListener('click', () => {
    if (stepping()) scene.primaryAction();
    else if (userPaced()) skip();
    else draw();
  });
  skipButton.addEventListener('click', skip);
  $('game').addEventListener('click', () => AndroidChance.game());
  $('probability').addEventListener('click', () => AndroidChance.probability());
  record.addEventListener('click', () => AndroidChance.record());

  controls();
  start().catch(error => {
    console.error('Cannot start ' + sceneId + ' scene', error);
    scene = null;
    sceneError = labels.loadError;
  }).finally(() => {
    controls();
    AndroidChance.ready();
  });
})();

/*
 * Shared page for every game. Android owns the random result and its persistence;
 * a scene only reveals it.
 *
 * A scene lives in scenes/<id>/scene.js and calls EonChance.register({
 *   requires: ['helper.js', ...],      // loaded first, relative to the scene folder
 *   labels: { ... },                    // see DEFAULT_LABELS
 *   create(stage, host) -> {
 *     reveal(outcome) -> Promise<outcome | null>,  // play until `outcome` shows; resolve with what shows
 *     show(outcome | null),                        // stop anything running and display `outcome` (null = idle)
 *     revealing() -> boolean,
 *   }
 * }). `host.fail(message)` reports a scene that can no longer run (e.g. a lost WebGL context).
 */
(function () {
  'use strict';
  const DEFAULT_LABELS = {
    action: '开始', again: '再来一次', busy: '正在揭晓…',
    idle: '让运气先开个头。', waiting: '答案正在路上。',
    stageIdle: '点击开始', stageBusy: '正在揭晓',
    stageResult: () => '点击再来一次',
    loadError: '无法加载动画，请重新打开这一页。',
  };
  const $ = id => document.getElementById(id);
  const stage = $('stage'), button = $('draw'), label = $('draw-label');
  const result = $('result'), error = $('error'), record = $('record');
  const sceneId = new URLSearchParams(location.search).get('scene') || 'dice';
  let definition = null, scene = null, labels = DEFAULT_LABELS, sceneError = '';
  let state = {}, request = 0, busy = false;

  function controls() {
    busy = !!state.drawing;
    button.disabled = stage.disabled = busy || !scene || !!sceneError;
    label.textContent = busy ? labels.busy : state.hasResult ? labels.again : labels.action;
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

  function show(outcome) {
    try { scene && scene.show(outcome); } catch (_) { /* the native error line already explains it */ }
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
          if (request !== id) return;
          if (shown === next.outcome) AndroidChance.finished(id, shown);
          else { show(next.outcome); AndroidChance.failed(id); }
        }).catch(() => {
          if (request === id) { show(next.outcome); AndroidChance.failed(id); }
        });
      } else if (!next.requestId && !next.drawing) {
        // Keep the resting pose a reveal ended on; only redraw when something actually changed.
        if (scene && (scene.revealing() || !previous.hasResult || previous.outcome !== next.outcome)) show(next.outcome);
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

  async function start() {
    if (!/^[a-z0-9-]+$/.test(sceneId)) throw new Error('bad scene id');
    const base = 'scenes/' + sceneId + '/';
    await loadScript(base + 'scene.js');
    if (!definition) throw new Error('scene did not register');
    labels = Object.assign({}, DEFAULT_LABELS, definition.labels);
    for (const file of definition.requires || []) await loadScript(base + file);
    scene = definition.create(stage, { fail });
  }

  function draw() {
    if (busy || !scene || sceneError) return;
    busy = true;
    button.disabled = stage.disabled = true;
    AndroidChance.draw();
  }
  stage.addEventListener('click', draw);
  button.addEventListener('click', draw);
  $('settings').addEventListener('click', () => AndroidChance.settings());
  record.addEventListener('click', () => AndroidChance.record());

  controls();
  start().catch(() => { scene = null; sceneError = labels.loadError; }).finally(() => {
    controls();
    AndroidChance.ready();
  });
})();

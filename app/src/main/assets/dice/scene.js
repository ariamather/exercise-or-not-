/* Android owns the random result and its persistence. This page only reveals it. */
(function () {
  'use strict';
  const stage = document.getElementById('stage');
  const button = document.getElementById('roll');
  const label = document.getElementById('roll-label');
  const result = document.getElementById('result');
  const error = document.getElementById('error');
  const record = document.getElementById('record');
  let scene = null, state = {}, request = 0, busy = false, sceneError = '';
  try {
    scene = new EonDice.DiceScene(document.getElementById('die'), document.getElementById('shadow'));
  } catch (_) {
    sceneError = '无法加载立体骰子，请重新打开掷骰子页面。';
  }
  function controls() {
    busy = !!state.rolling;
    button.disabled = stage.disabled = busy || !scene || !!sceneError;
    label.textContent = busy ? '正在掷…' : state.hasResult ? '再掷一次' : '掷一下';
    result.className = 'result' + (!busy && state.hasResult ? ' answer' + (state.train ? '' : ' rest') : '');
    result.textContent = busy ? '答案正在路上。' : !state.hasResult ? '让骰子先开个头。' : state.train ? '走吧，练一点。' : '今天，歇一歇。';
    stage.setAttribute('aria-label', busy ? '正在掷骰子' : (state.hasResult ? '骰子 ' + state.face + ' 点，点击再掷一次' : '点击立体骰子，掷一下'));
    record.textContent = !state.hasResult || busy ? '已经决定了，直接记录 ↗' : state.train ? '去记录今天的训练 ↗' : '想练也可以，直接记录 ↗';
    error.textContent = state.error || sceneError;
    error.hidden = !error.textContent;
  }
  function restoreFace(face) {
    if (!scene) return;
    scene.cancel();
    scene.q = EonDice.faceRotation(face, -.3);
    scene.position[1] = EonDicePhysics.HALF;
    scene.air = 0;
    scene.draw();
  }
  window.NativeDice = {
    render(next) {
      const previous = state;
      state = next;
      controls();
      if (next.requestId && next.requestId !== request) {
        request = next.requestId;
        const id = request;
        if (!scene || sceneError) { AndroidDice.failed(id); return; }
        scene.roll(next.face).then(face => {
          if (request !== id) return;
          if (face === next.face) AndroidDice.finished(id, face);
          else { restoreFace(next.face); AndroidDice.failed(id); }
        }).catch(() => {
          if (request === id) { restoreFace(next.face); AndroidDice.failed(id); }
        });
      } else if (!next.requestId && !next.rolling) {
        if (scene && (scene.rolling || !previous.hasResult || previous.face !== next.face)) restoreFace(next.face || 1);
        // Preserve the actual resting pose and position after a successful landing.
        request = 0;
      }
    },
  };
  function roll() {
    if (busy || !scene || sceneError) return;
    busy = true;
    button.disabled = stage.disabled = true;
    AndroidDice.roll();
  }
  stage.addEventListener('click', roll);
  button.addEventListener('click', roll);
  document.getElementById('settings').addEventListener('click', () => AndroidDice.settings());
  record.addEventListener('click', () => AndroidDice.record());
  document.getElementById('die').addEventListener('webglcontextlost', () => {
    sceneError = '立体骰子已暂停，请重新打开掷骰子页面。';
    if (request) AndroidDice.failed(request);
    controls();
  });
  controls();
  AndroidDice.ready();
})();

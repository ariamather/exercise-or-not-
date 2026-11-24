/*
 * Scene contract checks, run inside design/chance-preview/index.html?scene=<id>&check.
 * Uses the preview's stand-in bridge (window.__preview) and writes a report into
 * <pre id="check-result" data-status="pass|fail">. tools/scene-check/run.py drives it headlessly.
 *
 * For every outcome of the scene's model:
 *   - a reveal finishes, in time, reporting exactly the drawn outcome;
 *   - show(outcome) and show(null) put the scene at rest without errors.
 * Then: leaving mid-reveal and drawing again still finishes, and no script error or unhandled
 * rejection happened at any point. With &pace=user nobody is there to scratch or turn, so every
 * reveal is ended by the skip button, which must be enabled and must report the drawn outcome.
 */
(function () {
  'use strict';
  const REVEAL_LIMIT_MS = 20000;
  const lines = [];
  let failed = false;
  const ok = (cond, what) => { lines.push((cond ? 'ok   ' : 'FAIL ') + what); if (!cond) failed = true; return cond; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = () => window.__preview;
  const timeout = (promise, ms) => Promise.race([promise, sleep(ms).then(() => ({ type: 'timeout' }))]);

  function report() {
    const pre = document.createElement('pre');
    pre.id = 'check-result';
    pre.dataset.status = failed ? 'fail' : 'pass';
    pre.textContent = (failed ? 'FAIL' : 'PASS') + ' scene=' + new URLSearchParams(location.search).get('scene') + '\n' + lines.join('\n');
    document.body.append(pre);
  }

  // The revolver waits for an explicit tap for every round, including the first.
  async function playRounds() {
    const rounds = Number(P().state().stopKey.split('-')[1]);
    const button = document.getElementById('draw');
    for (let i = 0; i < rounds; i++) {
      const limit = performance.now() + REVEAL_LIMIT_MS;
      while (button.disabled && performance.now() < limit) await sleep(50);
      if (!ok(P().state().drawing && !button.disabled, 'round ' + (i + 1) + ' awaits input')) return;
      button.click();
      await sleep(80);
    }
  }

  async function reveal(outcome, label) {
    const next = P().next();
    const started = performance.now();
    P().draw(outcome);
    const manual = new URLSearchParams(location.search).get('scene') === 'revolver';
    if (manual && (P().pace !== 'user' || label === 'after interrupt')) {
      await sleep(50);
      await playRounds();
    } else if (P().pace === 'user') {
      await sleep(300);
      // Reduced motion and short reveals may already have finished. The button then draws again.
      if (P().state().drawing) {
        const skip = document.getElementById('skip');
        const button = skip && !skip.hidden ? skip : document.getElementById('draw');
        ok(!button.disabled, `${label}: skip button enabled during a user-paced reveal`);
        button.click();
      }
    }
    const e = await timeout(next, P().pace === 'user' && !manual ? 2000 : REVEAL_LIMIT_MS);
    const ms = Math.round(performance.now() - started);
    ok(e.type === 'finished' && e.outcome === outcome, `${label}: reveal ${outcome} -> ${e.type} ${e.outcome ?? ''} (${ms} ms)`);
    await sleep(50);
  }

  async function run() {
    // The shell calls ready() once the scene has loaded (or failed to).
    for (let i = 0; i < 200 && !document.body.dataset.log; i++) await sleep(50);
    await sleep(200);
    const errorLine = document.getElementById('error');
    if (!ok(errorLine.hidden, 'scene loaded' + (errorLine.hidden ? '' : ': ' + errorLine.textContent))) return;

    const outcomes = P().outcomes;
    for (const o of outcomes) await reveal(o, 'outcome');

    // show() with every outcome, then idle; shell.render only calls show on a change.
    try {
      for (const o of outcomes) {
        Object.assign(P().state(), { outcome: o, hasResult: true, drawing: false, requestId: 0 });
        P().push();
        await sleep(30);
      }
      Object.assign(P().state(), { outcome: null, hasResult: false, drawing: false, requestId: 0 });
      P().push();
      await sleep(30);
      ok(errorLine.hidden, 'show(outcome) and show(null)' + (errorLine.hidden ? '' : ': ' + errorLine.textContent));
    } catch (e) { ok(false, 'show threw ' + e.message); }

    // Leaving the page mid-reveal: Android drops the request and shows the saved outcome.
    P().draw(outcomes[0]);
    await sleep(120);
    Object.assign(P().state(), { drawing: false, requestId: 0 });
    P().push();
    await sleep(100);
    await reveal(outcomes[outcomes.length - 1], 'after interrupt');

    ok(window.__errors.length === 0, 'no script errors' + (window.__errors.length ? ': ' + window.__errors.join('; ') : ''));
  }

  run().catch(e => ok(false, 'check crashed: ' + e.message)).finally(report);
})();

// Synced from Android chance/scenes/wheel/scene.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window
  const { EonChance } = window

;
/* Carnival wheel. The outcome and the stop it was drawn at both come from Android. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const SUBDIVISIONS = 60;
  const CLAPPER_ENGAGEMENT = 0.145;
  const POCKET_INSET = 0.24;
  const STOP_KEYS = new Set([
    '0/12', '1/10', '2/10', '3/12', '4/12', '6/12',
    '8/12', '9/12', '8/10', '9/10', '12/12',
  ]);
  const Z_AXIS = [0, 0, 1];
  const normAngle = angle => ((angle % TAU) + TAU) % TAU;

  function outcomePosition(outcome) {
    const position = Number(outcome);
    return String(position) === outcome && Number.isInteger(position) && position >= 1 && position <= SUBDIVISIONS
      ? position : null;
  }

  // Both peg counts divide 60 evenly. Place each subdivision safely between pegs while
  // keeping it in the exact painted arc and giving the saved ID its own repeatable angle.
  function angleFor(position, spec) {
    const pocket = (position - 1) / spec.perPeg;
    const fraction = (pocket % 1) + 0.5 / spec.perPeg;
    return (Math.floor(pocket) + POCKET_INSET + fraction * (1 - 2 * POCKET_INSET)) * spec.step;
  }

  function readPointer(wheelAngle, spec) {
    const angle = normAngle(-wheelAngle);
    const pocket = angle / spec.step;
    const peg = Math.floor(pocket);
    const fraction = (pocket - peg - POCKET_INSET) / (1 - 2 * POCKET_INSET);
    const position = peg * spec.perPeg + Math.floor(fraction * spec.perPeg) + 1;
    return { position, train: angle < spec.trainCount * spec.step };
  }

  EonChance.register({
    api: 1,
    libs: ['anim.js'],
    requires: ['carnival.js'],
    styles: ['scene.css'],
    tapToDraw: false,
    labels: {
      action: '拨动转盘', again: '再拨一次', busy: '转盘旋转中…',
      idle: '让运气先开个头。', waiting: '转盘旋转中…',
      stageIdle: '沿盘面画弧，松手转动转盘', stageBusy: '转盘旋转中',
      stageResult: () => '沿盘面画弧，再拨一次',
    },
    create(stage, host) {
      const { CarnivalStage, createMeshes, paintDial, WHEEL_R } = window.EonCarnival;
      const { Timeline, Velocity, clamp, qAxis } = window.EonAnim;
      const canvas = document.createElement('canvas');
      const shadow = document.createElement('canvas');
      const tip = document.createElement('span');
      const dial = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      shadow.setAttribute('aria-hidden', 'true');
      tip.className = 'wheel-tip';
      tip.textContent = '手拨盘面';
      tip.setAttribute('aria-hidden', 'true');
      stage.classList.add('wheel-stage');
      stage.append(shadow, canvas, tip);

      const scene = new CarnivalStage(stage, canvas, shadow);
      const meshes = createMeshes(scene);
      const timeline = new Timeline(() => scene.lost);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      let spec;
      let wheelAngle = 0;
      let parkedAngle = 0;
      let clapperAngle = 0;
      let clapperVelocity = 0;
      let lastTick = -Infinity;
      let animating = false;
      let drag = null;
      let flick = null;

      function setDial() {
        const stop = host.stopKey();
        const key = STOP_KEYS.has(stop) ? stop : '6/12';
        if (spec?.key === key) return;
        const [trainCount, pegCount] = key.split('/').map(Number);
        spec = { key, trainCount, pegCount, step: TAU / pegCount, perPeg: SUBDIVISIONS / pegCount };
        paintDial(spec, dial);
        meshes.face.texture = scene.canvasTexture(dial, meshes.face.texture);
        meshes.pegs10.visible = pegCount === 10;
        meshes.pegs12.visible = pegCount === 12;
      }

      function pose() {
        const spin = qAxis(Z_AXIS, -normAngle(wheelAngle));
        for (const mesh of meshes.spinning) mesh.q = spin;
        meshes.clapper.q = qAxis(Z_AXIS, clapperAngle);
        scene.draw();
      }

      function park(angle) {
        wheelAngle = parkedAngle = normAngle(angle);
        clapperAngle = clapperVelocity = 0;
        pose();
      }

      function turn(angle, dt, now) {
        const previous = wheelAngle;
        const omega = (angle - previous) / dt;
        wheelAngle = angle;
        const phase = normAngle(-wheelAngle) % spec.step;
        const atPeg = phase > spec.step / 2 ? phase - spec.step : phase;
        let target = 0;
        if (Math.abs(atPeg) < CLAPPER_ENGAGEMENT) {
          const proximity = 1 - Math.abs(atPeg) / CLAPPER_ENGAGEMENT;
          const direction = Math.sign(Math.abs(omega) > 0.05 ? omega : atPeg);
          const speedGain = clamp(0.45 + Math.abs(omega) * 0.06, 0.45, 1);
          target = direction * Math.pow(proximity, 0.72) * 0.56 * speedGain;
        }

        // The clapper follows its prototype spring in three stable substeps per frame.
        const h = Math.min(dt, 0.04) / 3;
        for (let i = 0; i < 3; i++) {
          const acceleration = (target - clapperAngle) * 320 - clapperVelocity * 19;
          clapperVelocity += acceleration * h;
          clapperAngle += clapperVelocity * h;
        }
        clapperAngle = clamp(clapperAngle, -0.68, 0.68);
        if (Math.floor(previous / spec.step) !== Math.floor(wheelAngle / spec.step) && now - lastTick >= 45) {
          lastTick = now;
          host.haptic('tick');
        }
        pose();
      }

      function takeDrag() {
        const previous = drag;
        drag = null;
        stage.classList.remove('is-dragging');
        if (previous && stage.hasPointerCapture(previous.id)) stage.releasePointerCapture(previous.id);
        return previous;
      }

      function show(outcome) {
        timeline.cancel();
        animating = false;
        flick = null;
        takeDrag();
        if (scene.lost) return;
        setDial();
        const position = outcomePosition(outcome);
        park(position === null ? -spec.step / 2 : -angleFor(position, spec));
      }

      async function reveal(outcome) {
        const position = outcomePosition(outcome);
        if (position === null || scene.lost) return null;
        const generation = timeline.cancel();
        const momentum = flick || { direction: 1, speed: 1 };
        flick = null;
        takeDrag();
        setDial();
        const target = -angleFor(position, spec);
        animating = true;

        if (!reduced.matches) {
          const start = wheelAngle;
          const { direction, speed } = momentum;
          const extraTurns = clamp(Math.round(4 + speed * 1.6), 4, 7);
          const remainder = normAngle((target - start) * direction);
          const delta = direction * ((extraTurns + (remainder < 0.4 ? 1 : 0)) * TAU + remainder);
          const duration = clamp(2100 + Math.abs(delta) * 14, 2150, 2650);
          let previousTime = performance.now();
          const completed = await timeline.run(duration, (t, now) => {
            const dt = clamp((now - previousTime) / 1000, 0.004, 0.05);
            previousTime = now;
            const settle = Math.max(0, (t - 0.92) / 0.08);
            const rebound = Math.sin(settle * Math.PI * 1.5) * (1 - settle) * 0.012 * direction;
            turn(start + delta * (1 - Math.pow(1 - t, 3.8)) + rebound, dt, now);
          }, generation);
          if (!completed) return null;
        }

        park(target);
        animating = false;
        const shown = readPointer(wheelAngle, spec);
        if (shown.position !== position || shown.train !== host.train()) return null;
        host.haptic('thud');
        return String(shown.position);
      }

      stage.addEventListener('pointerdown', event => {
        if (animating || flick || drag || scene.lost || event.button !== 0) return;
        const point = scene.dialPoint(event.clientX, event.clientY);
        if (!point) return;
        const radius = Math.hypot(...point);
        if (radius < 0.18 || radius > WHEEL_R) return;
        stage.setPointerCapture(event.pointerId);
        drag = {
          id: event.pointerId,
          angle: Math.atan2(point[0], point[1]),
          time: performance.now(),
          travel: 0,
          velocity: new Velocity({ smoothMs: 45 }),
        };
        stage.classList.add('is-dragging');
      });

      stage.addEventListener('pointermove', event => {
        if (drag?.id !== event.pointerId) return;
        const point = scene.dialPoint(event.clientX, event.clientY);
        if (!point || Math.hypot(...point) < 0.18) {
          drag.angle = null;
          return;
        }
        const angle = Math.atan2(point[0], point[1]);
        const now = performance.now();
        const dt = Math.max(4, now - drag.time);
        if (drag.angle !== null) {
          const delta = normAngle(angle - drag.angle + Math.PI) - Math.PI;
          drag.travel += Math.abs(delta);
          drag.velocity.add(delta, 0, dt);
          turn(wheelAngle + delta, dt / 1000, now);
        }
        drag.angle = angle;
        drag.time = now;
      });

      stage.addEventListener('pointerup', event => {
        if (drag?.id !== event.pointerId) return;
        const finished = takeDrag();
        finished.velocity.decay(performance.now() - finished.time);
        const omega = finished.velocity.x;
        if (finished.travel < 0.07 || (finished.travel < 0.22 && Math.abs(omega) < 1.4)) {
          park(parkedAngle);
          return;
        }
        flick = { direction: Math.sign(omega) || 1, speed: clamp(Math.abs(omega) / 6, 0.6, 2.2) };
        host.draw();
      });

      function cancelDrag(event) {
        if (drag?.id !== event.pointerId) return;
        takeDrag();
        park(parkedAngle);
      }
      stage.addEventListener('pointercancel', cancelDrag);
      stage.addEventListener('lostpointercapture', cancelDrag);
      // Under keyboard and assistive technology the stage itself can also trigger a spin.
      stage.addEventListener('click', event => {
        if (event.detail === 0 && !animating && !flick) host.draw();
      });
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        scene.lost = true;
        show(null);
        host.fail('转盘画面已中断，请重新打开这一页。');
      });

      show(null);
      return { show, reveal, revealing: () => animating || flick !== null };
    },
  });
})();

}

/*
 * Retro three-reel machine. The lever asks the host to draw, and the three reels
 * land on the exact saved positions for that draw's probability preset.
 */
EonChance.register({
  api: 1,
  tapToDraw: false,
  libs: ['anim.js', 'studio.js'],
  requires: ['model.js'],
  styles: ['scene.css'],
  labels: {
    action: '拉下拉杆',
    again: '再拉一次',
    busy: '转动中…',
    idle: '转一转，看看今天练不练。',
    waiting: '等三轮停下。',
    stageIdle: '老虎机。下拉右侧球头，或点下方按钮开始',
    stageBusy: '三个滚筒正在转动',
    stageResult: () => '三个滚筒已停。下拉右侧球头，或点下方按钮再拉一次',
    loadError: '无法加载老虎机，请重新打开这一页。',
  },
  create(stage, host) {
    const TAU = Math.PI * 2;
    const MODEL_SCALE = 1.125;
    const PULL_RANGE = 84;
    const PULL_THRESHOLD = 0.35;
    const PULL_ANGLE = 1.34;
    const HINT = '下拉右侧拉杆';
    const AXIS_X = [1, 0, 0];
    const { Timeline, clamp, ease, easeInOut, qAxis } = EonAnim;
    const { buildMeshes, makeReelStripTexture, REEL_PATTERNS, reelXs, reelY, reelZ, leverPivot, faceAngle } = EonSlotModel;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const LEDs = {
      idle:  { color: [0.88, 0.85, 0.72], emissive: 0.08 },
      spin:  { color: [0.95, 0.76, 0.38], emissive: 0.40 },
      train: { color: [0.40, 0.78, 0.48], emissive: 0.46 },
      rest:  { color: [0.54, 0.68, 0.80], emissive: 0.28 },
    };

    const shadow = document.createElement('canvas');
    const canvas = document.createElement('canvas');
    const hint = document.createElement('span');
    shadow.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('aria-hidden', 'true');
    hint.setAttribute('aria-hidden', 'true');
    hint.className = 'slot-hint';
    stage.classList.add('slot-stage');
    stage.append(shadow, canvas, hint);

    const studio = new EonStudio(stage, canvas, shadow, {
      eye: [2.1, 5.4, 9.5],
      target: [0.12, 1.03, 0.02],
      tray: { halfX: 2.72, halfZ: 2.22, corner: 0.42 },
      shadows: [
        { x: 0, z: 0.06, radius: 0.34, opacity: 0.28, stretchX: 1.32, stretchY: 0.56 },
        { x: 1.24, z: 0.10, radius: 0.11, opacity: 0.16, stretchX: 0.9, stretchY: 0.45 },
      ],
    });
    canvas.addEventListener('webglcontextlost', () => host.fail('老虎机已暂停，请重新打开这一页。'));
    const meshes = buildMeshes(studio);
    const timeline = new Timeline(() => studio.lost);
    const scalePoint = p => p.map(v => v * MODEL_SCALE);
    for (const mesh of studio.meshes) mesh.scale = MODEL_SCALE;
    const jewelFacing = qAxis(AXIS_X, Math.PI / 2);
    const modTurn = angle => ((angle % TAU) + TAU) % TAU;
    const stopAngle = cell => modTurn((5.5 - cell) * TAU / 6 - faceAngle);
    const symbol = trains => trains ? '练' : '歇';

    let reelTexture = null;
    let installedK = -1;
    let angles = [0, 0, 0];
    let drag = null;
    let leverPull = 0;
    let pendingDraw = false;
    let spinning = false;
    let restHint = HINT;

    function setup() {
      const [, kText = '3', rule = 'majority'] = /^([0-6])-(majority|any|all)$/.exec(host.stopKey() || '') || [];
      const k = Number(kText);
      if (k !== installedK) {
        reelTexture = studio.canvasTexture(makeReelStripTexture(k), reelTexture, true);
        for (const reel of meshes.reels) reel.texture = reelTexture;
        installedK = k;
      }
      return { pattern: REEL_PATTERNS[k], minimum: { any: 1, majority: 2, all: 3 }[rule] };
    }

    function cellsOf(outcome) {
      if (outcome === null || !/^[1-6],[1-6],[1-6]$/.test(outcome)) return null;
      return host.parts(outcome).map(cell => Number(cell) - 1);
    }

    function pose(nextAngles = angles, pull = 0, dip = 0) {
      leverPull = pull;
      const offset = [0, -dip * MODEL_SCALE, 0];
      for (const part of [meshes.cabinet, meshes.marquee, meshes.bezel, meshes.glass, meshes.leverMount]) {
        part.position = offset;
      }
      meshes.leverArm.position = scalePoint([leverPivot[0], leverPivot[1] - dip, leverPivot[2]]);
      meshes.leverArm.q = qAxis(AXIS_X, pull * PULL_ANGLE);

      reelXs.forEach((x, i) => {
        const reel = meshes.reels[i];
        reel.position = scalePoint([x, reelY - dip, reelZ]);
        reel.q = qAxis(AXIS_X, nextAngles[i]);
        const jewel = meshes.jewels[i];
        jewel.position = scalePoint([x * 0.82, 2.09 - dip, 0.475]);
        jewel.q = jewelFacing;
      });
      studio.draw();
    }

    function lights(states) {
      states.forEach((state, i) => {
        const jewel = meshes.jewels[i];
        jewel.color = LEDs[state].color;
        jewel.emissive = LEDs[state].emissive;
      });
    }

    function clearDrag() {
      if (!drag) return;
      const { id } = drag;
      drag = null;
      stage.classList.remove('is-pulling', 'is-orbiting');
      if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    }

    function rest(cells, pattern) {
      let states = ['idle', 'idle', 'idle'];
      restHint = HINT;
      if (cells) {
        const flags = cells.map(cell => pattern[cell]);
        states = flags.map(flag => flag ? 'train' : 'rest');
        restHint = flags.map(symbol).join(' · ');
      } else {
        const firstTrain = pattern.indexOf(true), firstRest = pattern.indexOf(false);
        cells = firstTrain >= 0 && firstRest >= 0 ? [firstTrain, firstRest, firstTrain] : [0, 2, 4];
      }
      angles = cells.map(stopAngle);
      lights(states);
      hint.textContent = restHint;
      pose();
    }

    function show(outcome) {
      timeline.cancel();
      clearDrag();
      spinning = pendingDraw = false;
      const { pattern } = setup();
      rest(cellsOf(outcome), pattern);
    }

    function settleLever(pull) {
      hint.textContent = restHint;
      const generation = timeline.cancel();
      timeline.run(180, t => pose(angles, pull * (1 - ease(t))), generation);
    }

    function onLever(x, y) {
      const { left, top } = stage.getBoundingClientRect();
      const radius = clamp(studio.stageH * 0.135, 26, 42);
      return [1.38, 0.86, 0.4].some(height => {
        const [px, py] = studio.project(scalePoint([leverPivot[0] + 0.23, leverPivot[1] + height, leverPivot[2] + 0.05]));
        return Math.hypot(x - left - px, y - top - py) <= radius;
      });
    }

    stage.addEventListener('pointerdown', e => {
      if (drag || stage.disabled || spinning || pendingDraw || e.button !== 0) return;
      e.preventDefault();
      timeline.cancel();
      const lever = onLever(e.clientX, e.clientY);
      drag = { id: e.pointerId, lever, x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add(lever ? 'is-pulling' : 'is-orbiting');
      if (lever) hint.textContent = '向下拖动拉杆';
      else if (leverPull > 0) pose();
    });

    stage.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.lever) {
        const pull = clamp((e.clientY - drag.y) / PULL_RANGE, 0, 1);
        pose(angles, pull, pull * 0.022);
        hint.textContent = pull >= PULL_THRESHOLD ? '松手开转' : '继续向下拖动';
      } else {
        studio.orbit(e.clientX - drag.x, e.clientY - drag.y);
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    });

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const { lever } = drag;
      clearDrag();
      if (!lever) return;
      if (e.type === 'pointerup' && leverPull >= PULL_THRESHOLD) {
        pendingDraw = true;
        hint.textContent = '三轮即将开转';
        host.draw();
      } else {
        settleLever(leverPull);
      }
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('lostpointercapture', endDrag);

    async function reveal(outcome) {
      const cells = cellsOf(outcome);
      if (!cells) return null;
      const generation = timeline.cancel();
      clearDrag();
      const initialPull = pendingDraw ? leverPull : 0;
      pendingDraw = false;
      spinning = true;
      const { pattern, minimum } = setup();

      if (!reducedMotion.matches) {
        const flags = cells.map(cell => pattern[cell]);
        const firstTwo = Number(flags[0]) + Number(flags[1]);
        const cliffhanger = firstTwo === minimum - 1;
        const pullMs = initialPull > 0.2 ? 90 : 280;
        const startMs = pullMs * 0.55;
        const stopMs = [980, 1480, cliffhanger ? 2420 : 1960];
        const settleMs = 220;
        const totalMs = stopMs[2] + settleMs;
        const turns = [3, 5, cliffhanger ? 8 : 6];
        const targets = cells.map((cell, i) => {
          let delta = stopAngle(cell) - modTurn(angles[i]);
          if (delta < 0.3) delta += TAU;
          return angles[i] + delta + turns[i] * TAU;
        });
        let stopped = 0;
        hint.textContent = '三轮转动中…';
        lights(['spin', 'spin', 'spin']);

        const finished = await timeline.run(totalMs, t => {
          const elapsed = t * totalMs;
          let pull = 0;
          if (elapsed < pullMs) {
            pull = initialPull + (1 - initialPull) * easeInOut(elapsed / pullMs);
          } else if (elapsed < pullMs + 240) {
            const p = (elapsed - pullMs) / 240;
            pull = Math.max(0, Math.exp(-p * 5.2) * Math.cos(p * Math.PI * 1.5));
          }

          const spinAngles = angles.map((start, i) => {
            if (elapsed <= startMs) return start;
            if (elapsed >= stopMs[i]) {
              const p = Math.min(1, (elapsed - stopMs[i]) / settleMs);
              return targets[i] + Math.sin(p * TAU) * Math.exp(-p * 4.5) * 0.065;
            }
            const p = (elapsed - startMs) / (stopMs[i] - startMs);
            const eased = 1 - Math.pow(1 - p, i === 2 && cliffhanger ? 4.6 : 4);
            const over = p > 0.86 ? Math.sin((p - 0.86) / 0.14 * Math.PI) * 0.12 : 0;
            return start + (targets[i] - start) * eased + over;
          });
          const landed = stopMs.filter(ms => elapsed >= ms).length;
          if (landed !== stopped) {
            stopped = landed;
            lights(flags.map((flag, i) => i >= stopped ? 'spin' : flag ? 'train' : 'rest'));
            host.haptic(stopped === 3 ? 'thud' : 'tick');
            const rolls = flags.map((flag, i) => i < stopped ? symbol(flag) : '？').join(' · ');
            hint.textContent = stopped === 2 && cliffhanger ? rolls + '　第三轮定结果…' : rolls;
          }
          pose(spinAngles, pull, pull * 0.026);
        }, generation);
        if (!finished) return null;
      }

      rest(cells, pattern);
      spinning = false;
      return cells.map(cell => cell + 1).join(',');
    }

    show(null);
    return { reveal, show, revealing: () => spinning || pendingDraw };
  },
});

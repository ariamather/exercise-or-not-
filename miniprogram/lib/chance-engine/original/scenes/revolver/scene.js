// Synced from Android chance/scenes/revolver/scene.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window
  const { EonAnim, EonChance, EonRevolverModel, EonStudio } = window

;
/* A virtual tabletop showpiece beside a flip plaque. Each press reveals one saved round. */
EonChance.register({
  api: 1,
  tapToDraw: false,
  libs: ['anim.js', 'studio.js'],
  requires: ['model.js'],
  styles: ['scene.css'],
  labels: {
    action: '开始一局',
    again: '再来一局',
    busy: '正在翻牌…',
    idle: '抽一格，看看借口翻不翻。',
    waiting: '逐格揭晓',
    stageIdle: '左轮翻牌。点击开始一局',
    stageBusy: '左轮翻牌进行中。就位后点击推进一回合',
    stageResult: () => '左轮翻牌已结束。点击再来一局',
    loadError: '无法加载左轮翻牌，请重新打开这一页。',
  },
  create(stage, host) {
    const { Timeline, clamp, ease, easeInOut, qAxis } = EonAnim;
    const { SEAT_COUNT, SEAT_STEP, seatPosition } = EonRevolverModel;
    const TAU = Math.PI * 2;
    const AXIS_X = [1, 0, 0], AXIS_Y = [0, 1, 0], AXIS_Z = [0, 0, 1];
    const PLAQUE_POS = [-0.10, 0, -3.45];
    const PLAQUE_SCALE = 1.20;
    const AIM_POS = [0.48, 0.93, 1.05];
    const AIM = {
      position: AIM_POS,
      yaw: Math.atan2(AIM_POS[2] - PLAQUE_POS[2], PLAQUE_POS[0] - AIM_POS[0]),
      roll: -0.10, pitch: 0.03, scale: 0.98,
    };
    const LOAD = { position: [0.13, 1.54, -0.40], yaw: 2.30, roll: -0.03, pitch: 0.21, scale: 0.98 };
    const TURN_CLOSED = TAU + SEAT_STEP;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const lerp = (a, b, t) => a + (b - a) * t;
    const offset = (p, d) => p.map((value, i) => value + d[i]);

    function rotate(point, q) {
      const [x, y, z] = point;
      const [qx, qy, qz, w] = q;
      const tx = 2 * (qy * z - qz * y);
      const ty = 2 * (qz * x - qx * z);
      const tz = 2 * (qx * y - qy * x);
      return [
        x + w * tx + qy * tz - qz * ty,
        y + w * ty + qz * tx - qx * tz,
        z + w * tz + qx * ty - qy * tx,
      ];
    }

    function compose(a, b) {
      const [x, y, z, w] = a;
      const [u, v, r, s] = b;
      return [w * u + x * s + y * r - z * v, w * v - x * r + y * s + z * u,
        w * r + x * v - y * u + z * s, w * s - x * u - y * v - z * r];
    }

    function transform(point, position, q, scale) {
      return offset(position, rotate(point, q).map(value => value * scale));
    }

    function mixPose(a, b, t) {
      return {
        position: a.position.map((value, i) => lerp(value, b.position[i], t)),
        yaw: lerp(a.yaw, b.yaw, t), roll: lerp(a.roll, b.roll, t),
        pitch: lerp(a.pitch, b.pitch, t), scale: lerp(a.scale, b.scale, t),
      };
    }

    // Kotlin enumerates these layouts in the same order. The low bits are read in round order.
    const layouts = Array.from({ length: SEAT_COUNT + 1 }, () => []);
    const seatIndices = Array.from({ length: SEAT_COUNT }, (_, i) => i);
    for (let mask = 0; mask < 1 << SEAT_COUNT; mask++) {
      layouts[seatIndices.filter(slot => marked(mask, slot)).length].push(mask);
    }

    stage.classList.add('revolver-stage');
    const shadow = document.createElement('canvas');
    const canvas = document.createElement('canvas');
    const effects = document.createElement('canvas');
    const track = document.createElement('span');
    const cue = document.createElement('span');
    const summary = document.createElement('span');
    const wrap = document.createElement('div');
    const spin = document.createElement('button');
    const slots = seatIndices.map(() => document.createElement('span'));

    for (const el of [shadow, canvas, effects, track, cue]) el.setAttribute('aria-hidden', 'true');
    wrap.className = 'revolver-stage-wrap';
    track.className = 'revolver-track';
    cue.className = 'revolver-cue';
    summary.id = 'revolver-summary';
    summary.hidden = true;
    stage.setAttribute('aria-describedby', summary.id);
    spin.className = 'revolver-spin';
    spin.type = 'button';
    spin.textContent = '↻ 转一转';
    track.append(...slots);
    stage.before(wrap);
    wrap.append(stage, spin);
    stage.append(shadow, canvas, effects, track, cue, summary);

    const propShadow = { x: AIM_POS[0], z: AIM_POS[2], radius: 0.16, opacity: 0.18, stretchX: 0.72, stretchY: 0.55 };
    const studio = new EonStudio(stage, canvas, shadow, {
      eye: [0, 1.72, 3.15],
      target: [0, 0.58, -3.50],
      tray: { halfX: 2.45, halfZ: 4.30, centerZ: -1.20, corner: 0.42 },
      fov: 40,
      minAspect: 1.29,
      shadows: [
        propShadow,
        { x: PLAQUE_POS[0], z: PLAQUE_POS[2], radius: 0.15, opacity: 0.20, stretchX: 1.0, stretchY: 0.40 },
      ],
    });
    canvas.addEventListener('webglcontextlost', () => host.fail('左轮翻牌已暂停，请重新打开这一页。'));
    const model = EonRevolverModel.build(studio);
    const timeline = new Timeline(() => studio.lost);
    const fx = effects.getContext('2d');

    model.plaqueStand.scale = model.plaque.scale = PLAQUE_SCALE;
    let active = null;
    let presented = null;
    let spinAngle = 0;
    let spinning = false;
    let currentHits = 0;

    function config() {
      const [, k = '3', rounds = '1'] = /^([0-6])-([1-6])-(?:any|all)$/.exec(host.stopKey() || '') || [];
      return { masks: layouts[Number(k)], rounds: Number(rounds) };
    }

    function savedRound(outcome) {
      const { masks, rounds } = config();
      const id = Number(outcome);
      if (!Number.isInteger(id) || id < 1 || id > 60) return null;
      return { outcome: String(id), mask: masks[(id - 1) % masks.length], rounds, train: host.train() };
    }

    function marked(mask, slot) {
      return !!(mask & (1 << slot));
    }

    function paint({ rounds, mask }, shown, hint, done = false) {
      slots.forEach((slot, i) => {
        const visible = i < shown || done;
        const state = visible ? marked(mask, i) ? 'mark' : 'blank' : 'closed';
        slot.className = 'revolver-cell ' + state +
          (i >= rounds ? ' outside-rounds' : !done && i === shown ? ' next-round' : '');
        slot.textContent = visible ? state === 'mark' ? '翻' : '空' : '·';
      });
      cue.textContent = hint;
      summary.textContent = done ? '本局各回合：' + slots.slice(0, rounds).map(slot => slot.textContent).join('、') : hint;
    }

    function plaqueHits(count) {
      if (count === currentHits) return;
      currentHits = count;
      model.markPlaque(count);
    }

    function pose({
      prop = AIM, open = 0, angle = spinAngle, tokens = [], recoil = 0,
      ornament = 0, plateAngle = 0, plaqueKick = 0, flash = null,
    } = {}) {
      const position = offset(prop.position, [recoil * 0.09, recoil * 0.13, recoil * 0.23]);
      const q = compose(compose(qAxis(AXIS_Y, prop.yaw), qAxis(AXIS_X, prop.roll - recoil * 0.09)),
        qAxis(AXIS_Z, prop.pitch + recoil * 0.34));
      for (const mesh of model.body) {
        mesh.position = position;
        mesh.q = q;
        mesh.scale = prop.scale;
      }
      model.ornament.position = transform([-0.46, 0.19, 0], position, q, prop.scale);
      model.ornament.q = compose(q, qAxis(AXIS_Z, ornament));
      model.ornament.scale = prop.scale;

      const openAngle = open * 1.22;
      const drumOffset = [0, 0.22 * (Math.cos(openAngle) - 1), -0.47 * Math.sin(openAngle)];
      const drumCenter = transform(drumOffset, position, q, prop.scale);
      const drumQ = compose(q, qAxis(AXIS_X, angle));
      model.roller.position = drumCenter;
      model.roller.q = drumQ;
      model.roller.scale = prop.scale;
      model.tokens.forEach((mesh, i) => {
        const flight = tokens[i];
        mesh.scale = flight == null ? 0 : prop.scale;
        if (flight == null) return;
        const [x, y, z] = seatPosition(i);
        mesh.position = transform([x - flight, y + flight * 0.20, z], drumCenter, drumQ, prop.scale);
        mesh.q = drumQ;
      });

      propShadow.x = position[0];
      propShadow.z = position[2];
      const plaquePos = offset(PLAQUE_POS, [0, 0, -plaqueKick * 0.17]);
      const plaqueQ = qAxis(AXIS_X, -plaqueKick * 0.15);
      model.plaqueStand.position = plaquePos;
      model.plaqueStand.q = plaqueQ;
      model.plaque.position = transform([0, 1.12, 0], plaquePos, plaqueQ, PLAQUE_SCALE);
      model.plaque.q = compose(plaqueQ, qAxis(AXIS_X, plateAngle));

      studio.drawFloor();
      studio.draw();
      drawFlash(flash, transform([1.36, 0.156, 0], position, q, prop.scale), model.plaque.position);
    }

    function drawFlash(progress, source, target) {
      if (!fx) return;
      if (effects.width !== canvas.width || effects.height !== canvas.height) {
        effects.width = canvas.width;
        effects.height = canvas.height;
      }
      fx.setTransform(studio.dpr, 0, 0, studio.dpr, 0, 0);
      fx.clearRect(0, 0, studio.stageW, studio.stageH);
      if (progress == null) return;
      const [sx, sy] = studio.project(source);
      const [tx, ty] = studio.project(target);
      const angle = Math.atan2(ty - sy, tx - sx);
      const size = studio.stageW / 350;
      const motion = !reduce.matches;

      if (progress < 0.24) {
        const p = progress / 0.24;
        fx.save();
        fx.translate(sx, sy);
        fx.rotate(angle);
        fx.scale(motion ? 1.42 : 1.12, 1);
        fx.globalAlpha = 1 - p;
        burst(0, 0, size * (motion ? 36 + 11 * p : 20), 8, '#e5862d', '#a9461e');
        burst(0, 0, size * (motion ? 23 + 7 * p : 14), 8, '#fff3a6');
        fx.restore();
      }

      const impact = clamp((progress - 0.08) / 0.75, 0, 1);
      if (impact <= 0 || impact >= 1) return;
      fx.save();
      if (!motion) {
        fx.globalAlpha = (1 - impact) * 0.8;
        burst(tx, ty, size * 12, 5, '#ffca63');
        fx.restore();
        return;
      }
      fx.globalAlpha = (1 - impact) * 0.96;
      if (impact < 0.35) {
        burst(tx, ty, size * (14 + 32 * impact), 7, '#f5a840', '#a9461e');
        burst(tx, ty, size * (8 + 14 * impact), 7, '#fff5b9');
      }
      fx.lineWidth = 1.8;
      fx.strokeStyle = '#d57931';
      fx.beginPath();
      fx.arc(tx, ty, size * (7 + 39 * ease(impact)), 0, TAU);
      fx.stroke();
      for (let i = 0; i < 10; i++) {
        const a = i * TAU / 10 + 0.16;
        const radius = size * (9 + (33 + (i % 3) * 8) * ease(impact));
        fx.save();
        fx.translate(tx + Math.cos(a) * radius, ty + Math.sin(a) * radius + 18 * impact * impact);
        fx.rotate(a);
        const length = size * (i % 2 ? 11 : 8) * (1 - impact);
        fx.fillStyle = i % 2 ? '#a84625' : '#e29126';
        fx.beginPath();
        fx.moveTo(length, 0);
        fx.lineTo(0, 2.5 * size);
        fx.lineTo(-length * 0.55, 0);
        fx.lineTo(0, -2.5 * size);
        fx.closePath();
        fx.fill();
        fx.restore();
      }
      fx.restore();
    }

    function burst(x, y, radius, points, fill, outline) {
      fx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = i * Math.PI / points;
        const r = i % 2 ? radius * 0.32 : radius * (i % 4 ? 0.76 : 1);
        fx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      fx.closePath();
      fx.fillStyle = fill;
      fx.fill();
      if (outline) {
        fx.lineWidth = 2;
        fx.strokeStyle = outline;
        fx.lineJoin = 'round';
        fx.stroke();
      }
    }

    function tokensFor(round, spent = round.shown) {
      return seatIndices.map(slot => slot >= spent && marked(round.mask, slot) ? 0 : null);
    }

    async function load(round) {
      const order = seatIndices.filter(i => marked(round.mask, i))
        .sort((a, b) => (a * 5 + Number(round.outcome)) % 7 - (b * 5 + Number(round.outcome)) % 7);
      if (reduce.matches) {
        paint(round, 0, '正在装填…');
        if (!(await timeline.pause(240, round.generation)) || active !== round) return;
      } else {
        const moveOut = 260, openTime = 330, each = 175, inspect = 280, spinTime = 315, closeTime = 260, moveIn = 490;
        const seatStart = moveOut + openTime;
        const seatEnd = seatStart + order.length * each;
        const turnStart = seatEnd + inspect;
        const turnEnd = turnStart + spinTime;
        const closeEnd = turnEnd + closeTime;
        const duration = closeEnd + moveIn;
        paint(round, 0, '正在装填…');
        const loaded = await timeline.run(duration, t => {
          const time = t * duration;
          const prop = time < moveOut ? mixPose(AIM, LOAD, easeInOut(time / moveOut))
            : mixPose(LOAD, AIM, easeInOut(clamp((time - closeEnd) / moveIn, 0, 1)));
          const open = time < turnEnd ? ease(clamp((time - moveOut) / openTime, 0, 1))
            : 1 - easeInOut(clamp((time - turnEnd) / closeTime, 0, 1));
          const turning = easeInOut(clamp((time - turnStart) / spinTime, 0, 1));
          const tokens = seatIndices.map(() => null);
          for (const [index, slot] of order.entries()) {
            const progress = (time - seatStart - each * index) / each;
            if (progress >= 0) tokens[slot] = 0.56 * (1 - ease(clamp(progress, 0, 1)));
          }
          pose({ prop, open, angle: TURN_CLOSED * turning, tokens });
        }, round.generation);
        if (!loaded || active !== round) return;
      }

      spinAngle = TURN_CLOSED;
      round.phase = 'ready';
      pose({ tokens: tokensFor(round) });
      paint(round, 0, '点击揭晓第 1 回合');
      refreshControls();
    }

    function show(outcome) {
      timeline.cancel();
      if (active) active.finish(null);
      active = null;
      spinning = false;
      spinAngle = 0;
      const round = presented = savedRound(outcome);
      if (round) {
        spinAngle = -(round.rounds - 1) * SEAT_STEP;
        plaqueHits(seatIndices.slice(0, round.rounds).filter(i => marked(round.mask, i)).length);
        paint(round, round.rounds, '本局已揭晓', true);
        pose({ plateAngle: round.train ? -Math.PI : 0, tokens: tokensFor(round, round.rounds) });
      } else {
        plaqueHits(0);
        paint(config(), 0, '点击开始一局');
        pose();
      }
      refreshControls();
    }

    async function advance(round) {
      if (round !== active || round.phase !== 'ready' || spinning) return;
      round.phase = 'reveal';
      refreshControls();
      const hit = marked(round.mask, round.shown);
      const count = round.shown + 1;
      const last = count === round.rounds;
      const flip = last && round.train;
      const motion = !reduce.matches;
      const cockTime = motion ? 215 : 90;
      const reactionTime = motion ? (hit || flip ? 690 : 270) : 300;
      const duration = cockTime + reactionTime;
      const startSpin = spinAngle;
      let ticked = false;
      let impactShown = false;
      paint(round, round.shown, '揭晓第 ' + count + ' 回合…');

      const finished = await timeline.run(duration, t => {
        const elapsed = t * duration;
        const step = ease(clamp(elapsed / cockTime, 0, 1));
        const reaction = clamp((elapsed - cockTime) / reactionTime, 0, 1);
        const impact = clamp((reaction - 0.08) / 0.92, 0, 1);
        const angle = startSpin - SEAT_STEP * (motion ? step : Math.floor(step));

        if (elapsed >= cockTime && !ticked) {
          ticked = true;
          host.haptic(hit ? 'thud' : 'tick');
          paint(round, count, hit ? '翻到啦' : '这一格是空的');
        }
        if (hit && impact > 0 && !impactShown) {
          impactShown = true;
          plaqueHits(currentHits + 1);
        }

        const returnKick = Math.exp(-reaction * 6);
        const recoil = motion ? (hit ? 1.18 : 0.10) * returnKick * Math.sin(Math.min(1, reaction * 12) * Math.PI / 2) : 0;
        const kick = motion && hit ? Math.sin(impact * 13) * Math.exp(-impact * 4) * (1 - impact) : 0;
        const plateAngle = flip ? -Math.PI * (motion ? easeInOut(impact) : Math.floor(impact)) : 0;
        const ornament = motion ? -0.34 * step * (1 - ease(clamp(reaction * 8, 0, 1))) : 0;
        pose({
          angle, recoil, ornament, plaqueKick: kick * 0.35, plateAngle: plateAngle + kick * 0.78,
          tokens: tokensFor(round, ticked ? count : round.shown), flash: hit && ticked ? reaction : null,
        });
      }, round.generation);
      if (!finished || active !== round) return;

      spinAngle = startSpin - SEAT_STEP;
      round.shown = count;
      pose({ plateAngle: flip ? -Math.PI : 0, tokens: tokensFor(round) });
      if (last) {
        paint(round, count, '本局已揭晓', true);
        presented = round;
        active = null;
        round.finish(round.outcome);
      } else {
        round.phase = 'ready';
        paint(round, count, '点击揭晓第 ' + (count + 1) + ' 回合');
      }
      refreshControls();
    }

    function reveal(outcome) {
      const round = savedRound(outcome);
      if (!round) return Promise.resolve(null);
      if (active) active.finish(null);
      return new Promise(resolve => {
        active = { ...round, shown: 0, phase: 'load', finish: resolve, generation: timeline.cancel() };
        presented = null;
        spinning = false;
        spinAngle = 0;
        plaqueHits(0);
        pose();
        refreshControls();
        void load(active);
      });
    }

    function refreshControls() {
      spin.disabled = spinning || !!active && active.phase !== 'ready';
      host.refreshControls?.();
    }

    function primaryState() {
      if (spinning) return { label: '正在转动…', enabled: false };
      if (!active) return null;
      if (active.phase === 'load') return { label: '装填中…', enabled: false };
      if (active.phase === 'reveal') return { label: '正在揭晓…', enabled: false };
      return { label: '扣扳机', enabled: true };
    }

    function primaryAction() {
      if (spinning) return;
      if (active) void advance(active);
      else host.draw();
    }

    spin.addEventListener('click', async () => {
      const round = active;
      if (spinning || round && round.phase !== 'ready') return;
      const resting = round || presented;
      const tokens = resting ? tokensFor(resting, round ? round.shown : resting.rounds) : [];
      const plateAngle = !round && resting?.train ? -Math.PI : 0;
      const start = spinAngle;
      const motion = !reduce.matches;
      const generation = round?.generation ?? timeline.cancel();
      spinning = true;
      refreshControls();
      const completed = await timeline.run(motion ? 480 : 210, t => {
        pose({ angle: start + (motion ? TAU * 2 * ease(t) : 0), plateAngle, tokens });
      }, generation);
      if (!completed || round !== active) return;
      spinning = false;
      pose({ plateAngle, tokens });
      refreshControls();
    });

    stage.addEventListener('click', primaryAction);
    show(null);
    return { reveal, show, revealing: () => active !== null, primaryAction, primaryState };
  },
});

}

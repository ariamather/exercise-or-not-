/*
 * Dice cup, drawn with the same 3D renderer, lights and tray as the die.
 * Press and drag to pick the cup up and shake it anywhere over the tray: left/right moves it
 * across, up/down moves it back/forth, and dragging faster lifts it higher. Shaking is
 * decoration only: the face is drawn by Android when "开盅" is pressed and handed to reveal().
 * While the cup is closed the die is not rendered at all, so nothing can peek out from under it.
 * One button is always enough: pressing it without shaking plays a short automatic figure 8.
 */
EonChance.register({
  api: 1,
  tapToDraw: false,
  styles: ['scene.css'],
  libs: ['anim.js', 'dice-physics.js', 'gl.js'],
  labels: {
    action: '开盅', again: '再摇一次', busy: '开盅中…',
    idle: '拖动骰盅摇一摇，再开盅。',
    stageIdle: '骰盅。可以拖动摇晃，也可以直接点下方按钮开盅',
    stageBusy: '正在开盅',
    stageResult: face => '骰盅已开，骰子 ' + face + ' 点。拖动可以重新摇',
    loadError: '无法加载骰盅，请重新打开这一页。',
  },
  create(stage, host) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const HALF = EonDicePhysics.HALF;
    const CX = 0, CZ = .45;                 // where the cup and the die rest on the tray
    const R = 1.18, MARGIN = .12;           // rim radius and a little breathing room
    const X_LIMIT = 2.85 - R - MARGIN;      // 1.55: furthest the cup centre may go sideways
    const Z_LIMIT = 2.5 - R - MARGIN;       // 1.20: furthest it may go forward/back, in |z|
    const HOVER = .5, HOP_MAX = 1.1;        // hover plus hop tops out at 1.6
    const TILT_MAX = .3, OPEN_LIFT = 1.3, OPEN_TILT = .55, OPEN_SWING = 1.75;
    const PICK_MS = 150, DROP_MS = 180, BOUNCE_MS = 90;
    const SHAKEN_PX = 60;                   // total drag distance that counts as "shaken"

    stage.classList.add('cup-stage');
    const shadowCanvas = document.createElement('canvas');
    const glCanvas = document.createElement('canvas');
    const hint = document.createElement('div');
    shadowCanvas.setAttribute('aria-hidden', 'true');
    glCanvas.setAttribute('aria-hidden', 'true');
    hint.className = 'cup-hint';
    hint.setAttribute('aria-hidden', 'true');
    stage.append(shadowCanvas, glCanvas, hint);

    const scene = new EonGL.Scene(glCanvas, shadowCanvas);
    glCanvas.addEventListener('webglcontextlost', () => host.fail('骰盅已暂停，请重新打开这一页。'));
    const cup = scene.addMesh(cupGeometry(), [.25, .42, .31], .2, { band: true });

    let open = false, shaken = false, revealing = false;
    let drag = null, lastTick = 0;
    // Where the cup last landed: offsets from CX/CZ. The die is placed there when the cup opens.
    let restX = 0, restZ = 0;
    // Current drag state.
    let x = 0, z = 0, dragging = false, raf = 0, pickStart = 0, lastFrame = 0, lastMove = 0;
    let hop = 0, tiltX = 0, tiltZ = 0;
    // A new press, reveal or show() cancels whatever is still animating.
    const tl = new EonAnim.Timeline(() => scene.lost);
    const vel = new EonAnim.Velocity({ smoothMs: 60, reverseDegrees: 100, minSpeed: 1.2 });
    const { ease, clamp, qAxis, wait } = EonAnim;

    // The cup's origin is the centre of its rim, so the mesh sits straight on the tray.
    function pose(px, lift, pz, ax = tiltX, az = tiltZ) {
      cup.position = [CX + px, lift, CZ + pz];
      // Small rotations compose as one rotation vector: (ax, 0, az), angle |(ax, az)|.
      const m = Math.hypot(ax, az);
      cup.q = m > 1e-4 ? qAxis([ax / m, 0, az / m], m) : [0, 0, 0, 1];
      scene.draw();
    }
    function placeDie(value) {
      scene.cancel();
      scene.q = EonDice.faceRotation(value, -.3 + (Math.random() - .5) * .5);
      scene.position = [CX + restX, HALF, CZ + restZ];
      scene.air = 0;
      scene.dieVisible = true;
    }
    function hideDie() {
      open = false;
      scene.dieVisible = false;
      stage.classList.remove('is-open');
    }
    // Put the closed cup straight back on the tray where it last landed.
    function restPose() {
      hideDie();
      hop = 0; vel.reset(); tiltX = 0; tiltZ = 0;
      x = restX; z = restZ;
      hint.textContent = '拖动骰盅，摇一摇';
      pose(x, 0, z, 0, 0);
    }
    // Choose where the cup swings to open. It lifts first, then leans away from the die.
    // The far side wins when it is reachable; otherwise swinging across the die is better
    // than staying on top of it. The tilt always lowers the side away from the die.
    function openTarget() {
      const side = restX < 0 ? -1 : 1;
      const out = clamp(restX + side * OPEN_SWING, -X_LIMIT, X_LIMIT);
      const across = clamp(restX - side * OPEN_SWING, -X_LIMIT, X_LIMIT);
      const tx = Math.abs(across - restX) > Math.abs(out - restX) + .001 ? across : out;
      return { x: tx, tilt: (tx >= restX ? -1 : 1) * OPEN_TILT };
    }
    function opened() {
      const t = openTarget();
      open = true;
      stage.classList.add('is-open');
      hint.textContent = '';
      pose(t.x, OPEN_LIFT, restZ, 0, t.tilt);
    }
    function tick(now) {
      if (now - lastTick < 70) return;
      lastTick = now;
      host.haptic('tick');
    }
    // Screen pixels per world unit at the tray, so the cup follows the finger 1:1.
    // The tray's two axes have different on-screen lengths, so each gets its own scale.
    function scales(px, pz) {
      const a = scene.project([CX + px, 0, CZ + pz]);
      const bx = scene.project([CX + px + 1, 0, CZ + pz]);
      const bz = scene.project([CX + px, 0, CZ + pz + 1]);
      return [Math.max(20, Math.hypot(bx[0] - a[0], bx[1] - a[1])),
              Math.max(20, Math.hypot(bz[0] - a[0], bz[1] - a[1]))];
    }

    // ---- while the finger is down: lift, follow, hop, lean and rattle on reversals ----
    function frame(now) {
      if (!dragging || scene.lost) return;
      const dt = Math.min(64, now - (lastFrame || now)), k = 1 - Math.exp(-dt / 80);
      lastFrame = now;
      if (now - lastMove > 40) vel.decay(dt, 90);
      const speed = vel.speed;
      hop += (Math.min(HOP_MAX, speed * .16) - hop) * k;
      // Lean against the motion; a rotation vector keeps reversals smooth through zero.
      let ax = -vel.z * .04, az = vel.x * .04;
      const m = Math.hypot(ax, az);
      if (m > TILT_MAX) { ax *= TILT_MAX / m; az *= TILT_MAX / m; }
      const f = 1 - Math.exp(-dt / 70);
      tiltX += (ax - tiltX) * f;
      tiltZ += (az - tiltZ) * f;
      const hover = reduced.matches ? 0 : HOVER * ease(Math.min(1, (now - pickStart) / PICK_MS));
      pose(x, hover + (reduced.matches ? 0 : hop), z);
      raf = requestAnimationFrame(frame);
    }

    stage.addEventListener('pointerdown', e => {
      if (stage.disabled || revealing || drag) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      tl.cancel();  // a new press cancels a landing/bounce still in flight
      vel.reset();
      if (open) restPose();
      const [sx, sz] = scales(restX, restZ);
      x = restX; z = restZ;
      hop = 0; tiltX = 0; tiltZ = 0;
      drag = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastY: e.clientY,
        lastT: e.timeStamp, lastWX: x, lastWZ: z, moved: 0, sx, sz,
      };
      dragging = true;
      pickStart = lastFrame = lastMove = performance.now();
      stage.classList.add('is-dragging');
      raf = requestAnimationFrame(frame);
    });
    stage.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const nx = clamp(restX + (e.clientX - drag.x0) / drag.sx, -X_LIMIT, X_LIMIT);
      const nz = clamp(CZ + restZ + (e.clientY - drag.y0) / drag.sz, -Z_LIMIT, Z_LIMIT) - CZ;
      drag.moved += Math.hypot(e.clientX - drag.lastX, e.clientY - drag.lastY);
      // Velocity from how far the cup actually moved, so pushing against an edge doesn't count.
      if (vel.add(nx - drag.lastWX, nz - drag.lastWZ, e.timeStamp - drag.lastT)) tick(e.timeStamp);
      lastMove = e.timeStamp;
      drag.lastX = e.clientX; drag.lastY = e.clientY; drag.lastT = e.timeStamp;
      drag.lastWX = nx; drag.lastWZ = nz;
      x = nx; z = nz;
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved > SHAKEN_PX) { shaken = true; hint.textContent = '摇好了，开盅看看'; }
      drag = null;
      dragging = false;
      cancelAnimationFrame(raf);
      stage.classList.remove('is-dragging');
      restX = x; restZ = z;
      settle(tl.generation);
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    const animate = (duration, frame, gen) => tl.run(duration, frame, gen);
    // Fall back onto the tray where the cup was released, with a small bounce.
    function settle(gen) {
      const lift = cup.position[1], fromHop = hop, fromX = tiltX, fromZ = tiltZ;
      hop = 0; vel.reset();
      if (reduced.matches || lift <= .01) { tiltX = 0; tiltZ = 0; pose(x, 0, z, 0, 0); return Promise.resolve(true); }
      return animate(DROP_MS, t => {
        const left = 1 - ease(t);
        tiltX = fromX * left; tiltZ = fromZ * left; hop = fromHop * left;
        pose(x, lift * left, z);
      }, gen).then(ok => {
        if (!ok) return false;
        tiltX = 0; tiltZ = 0;
        pose(x, 0, z, 0, 0);
        tick(performance.now());
        return animate(BOUNCE_MS, t => {
          pose(x, .045 * Math.sin(Math.PI * t), z, 0, 0);
        }, gen).then(done => { if (done) pose(x, 0, z, 0, 0); return done; });
      });
    }
    // No drag at all: draw a small figure 8 above the tray before opening.
    function autoShake(gen) {
      const bx = clamp(restX, -1, 1), bz = clamp(restZ, -.7, .7);
      return animate(900, (t, now) => {
        const a = Math.PI * 4 * t;
        const lift = HOVER * ease(Math.min(1, t * 3)) + .04 * Math.abs(Math.sin(2 * a));
        pose(bx + .5 * Math.sin(a), lift, bz + .28 * Math.sin(2 * a),
          -.1 * Math.sin(2 * a), .12 * Math.cos(a));
        if (Math.abs(Math.cos(a)) < .2) tick(now);
      }, gen).then(ok => {
        if (ok) { x = restX; z = restZ; pose(x, 0, z, 0, 0); }
        return ok;
      });
    }

    async function reveal(outcome) {
      const value = Number(outcome);
      if (!(value >= 1 && value <= 6)) return null;
      const gen = tl.cancel();
      revealing = true;
      try {
        // Opening mid-drag: stop following the finger and land where the cup is now.
        if (drag) {
          drag = null; dragging = false;
          cancelAnimationFrame(raf);
          stage.classList.remove('is-dragging');
          restX = x = cup.position[0] - CX;
          restZ = z = cup.position[2] - CZ;
        }
        // Already open: close instantly over the die, like pressing again to re-shake.
        if (open) restPose(); else hideDie();
        if (!reduced.matches && cup.position[1] > .01 && !(await settle(gen))) return null;
        if (!tl.live(gen)) return null;
        if (!reduced.matches && !shaken && !(await autoShake(gen))) return null;
        if (!tl.live(gen)) return null;
        placeDie(value);
        host.haptic('thud');
        if (reduced.matches) { opened(); return outcome; }
        // Lift straight up first, then swing aside, so the die is uncovered from above.
        const t = openTarget();
        const ok = await animate(560, (p) => {
          const up = ease(Math.min(1, p / .45)), side = ease(Math.max(0, (p - .2) / .8));
          pose(restX + (t.x - restX) * side, OPEN_LIFT * up, restZ, 0, t.tilt * side);
        }, gen);
        if (!ok) return null;
        opened();
        await wait(120);
        return tl.live(gen) ? outcome : null;
      } finally {
        if (gen === tl.generation) { revealing = false; shaken = false; }
      }
    }

    function show(outcome) {
      tl.cancel();
      revealing = false;
      if (drag) {
        drag = null; dragging = false;
        cancelAnimationFrame(raf);
        stage.classList.remove('is-dragging');
      }
      const value = Number(outcome);
      if (value >= 1 && value <= 6) { placeDie(value); opened(); } else { restPose(); }
    }

    restPose();
    // A tiny read-only probe: the desktop preview asserts poses without diffing pixels.
    Object.defineProperty(stage, '__cup', {
      value: {
        pose: () => cup.position.slice(),
        tilt: () => cup.q.slice(),
        die: () => scene.position.slice(),
        isOpen: () => open,
        dieVisible: () => scene.dieVisible,
        rest: () => [restX, restZ],
      },
    });
    return { reveal, show, revealing: () => revealing };
  },
});

/*
 * A dice cup turned on a lathe: outer wall with a rounded top, the rim at the base, and the
 * cavity. Vertices are [x,y,z, nx,ny,nz, u,v, cavity]; the origin is the centre of the rim.
 * The die is 1.31 wide, so the opening (2.12) clears it with room to rattle.
 */
function cupGeometry() {
  const R0 = 1.18, R1 = .9, H = 2.05, T = .1, B = .22, SEG = 56;
  const out = [];
  const arc = [];
  for (let i = 0; i <= 8; i++) {
    const a = i / 8 * Math.PI / 2;
    arc.push([R1 - B + B * Math.cos(a), H - B + B * Math.sin(a)]);
  }
  lathe([[R0, 0], [R1, H - B], ...arc.slice(1), [0, H]], false, 0);
  lathe([[R0 - T, 0], [R0, 0]], false, 0);
  lathe([[R0 - T, 0], [R1 - T, H - T - B * .5], [0, H - T]], true, 1);
  return new Float32Array(out);

  function lathe(profile, inward, cavity) {
    // Smooth normals within one profile: average the 2D normals of the neighbouring segments.
    const seg = profile.slice(1).map((p, i) => {
      const dr = p[0] - profile[i][0], dy = p[1] - profile[i][1], l = Math.hypot(dr, dy) || 1;
      return inward ? [-dy / l, dr / l] : [dy / l, -dr / l];
    });
    const normals = profile.map((_, i) => {
      const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
      const n = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(n[0], n[1]) || 1;
      return [n[0] / l, n[1] / l];
    });
    const vertex = (j, s) => {
      const t = s / SEG * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      const [r, y] = profile[j], [nr, ny] = normals[j];
      return [r * c, y, r * sn, nr * c, ny, nr * sn, s / SEG, y / H, cavity];
    };
    for (let s = 0; s < SEG; s++) for (let j = 0; j < profile.length - 1; j++) {
      const a = vertex(j, s), b = vertex(j, s + 1), c = vertex(j + 1, s + 1), d = vertex(j + 1, s);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
}

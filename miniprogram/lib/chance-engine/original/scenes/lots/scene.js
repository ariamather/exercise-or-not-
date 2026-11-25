// Synced from Android chance/scenes/lots/scene.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window
  const { EonAnim, EonChance, EonGL } = window

;
/*
 * Bamboo fortune-stick cylinder ("青竹签筒"). Press and drag to shake the cylinder over the tray;
 * releasing settles it, and drawing glides it back while the chosen slip shoots out and floats
 * enlarged in front of the camera with a classical proverb. Android owns the draw and persistence.
 */
EonChance.register({
  api: 1,
  tapToDraw: false,
  styles: ['scene.css'],
  libs: ['anim.js', 'dice-physics.js', 'gl.js'],
  labels: {
    action: '抽一签', again: '再抽一签', busy: '抽签中…',
    idle: '拖动签筒摇一摇，再抽一签。',
    stageIdle: '签筒。可以拖动摇晃，也可以直接点下方按钮抽一签',
    stageBusy: '正在抽签',
    stageResult: id => '已抽出第 ' + id + ' 签。拖动签筒可以重新摇',
    loadError: '无法加载签筒，请重新打开这一页。',
  },
  create(stage, host) {
    const TAU = Math.PI * 2;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const { ease, easeInOut, clamp, qAxis, wait } = EonAnim;
    const { qMultiply, qSlerp } = EonGL;

    const CX = 0, CZ = 0.22;
    const R = 0.83, MARGIN = 0.15;
    const X_LIMIT = 2.85 - R - MARGIN;          // 1.87
    const Z_LIMIT = 2.5 - R - MARGIN;           // 1.52
    const HOVER = 0.48, HOP_MAX = 0.95, TILT_MAX = 0.28;
    const PICK_MS = 150, DROP_MS = 180, BOUNCE_MS = 90, SHAKEN_PX = 60;

    const REVEAL_CYL_X = -0.88, REVEAL_CYL_Z = -0.42, REVEAL_CYL_YAW = 0.18;
    const HERO_LEN = 2.04;
    const HERO_FRONT_POS = [1.18, 2.14, 2.25];
    const HERO_FRONT_SCALE = 1.32;
    const HERO_FRONT_Q = qMultiply(
      qAxis([0, 1, 0], 0.22),
      qMultiply(qAxis([1, 0, 0], -0.46), qAxis([0, 0, 1], -0.04))
    );

    stage.classList.add('lots-stage');
    const shadowCanvas = document.createElement('canvas');
    const glCanvas = document.createElement('canvas');
    const hint = document.createElement('div');
    shadowCanvas.setAttribute('aria-hidden', 'true');
    glCanvas.setAttribute('aria-hidden', 'true');
    hint.className = 'lots-hint';
    hint.setAttribute('aria-hidden', 'true');
    stage.append(shadowCanvas, glCanvas, hint);

    const scene = new EonGL.Scene(glCanvas, shadowCanvas, { die: false });
    glCanvas.addEventListener('webglcontextlost', () => host.fail('签筒已暂停，请重新打开这一页。'));

    const CYL_MAT = {
      color: [0.20, 0.34, 0.25],
      accent: [0.62, 0.67, 0.42],
      trim: [0.16, 0.27, 0.20],
      cavity: [0.10, 0.16, 0.12],
      cull: true,
    };
    const TIP_COLORS = [
      [0.71, 0.29, 0.23],
      [0.21, 0.36, 0.26],
      [0.52, 0.58, 0.38],
    ];
    const INNER_LAYOUT = [
      { r: 0.12, ang: 0.35, tilt: 0.05, yaw: 0.25, h: 0.42, tip: 0 },
      { r: 0.17, ang: 2.35, tilt: 0.07, yaw: 1.45, h: 0.54, tip: 1 },
      { r: 0.14, ang: 4.45, tilt: 0.06, yaw: 2.65, h: 0.38, tip: 2 },
      { r: 0.34, ang: 0.12, tilt: 0.11, yaw: 0.75, h: 0.28, tip: 1 },
      { r: 0.35, ang: 1.08, tilt: 0.12, yaw: 1.85, h: 0.35, tip: 0 },
      { r: 0.36, ang: 2.02, tilt: 0.10, yaw: 0.35, h: 0.26, tip: 2 },
      { r: 0.33, ang: 2.98, tilt: 0.13, yaw: 2.15, h: 0.37, tip: 1 },
      { r: 0.35, ang: 3.92, tilt: 0.11, yaw: 1.05, h: 0.30, tip: 0 },
      { r: 0.34, ang: 4.88, tilt: 0.12, yaw: 2.75, h: 0.34, tip: 2 },
      { r: 0.33, ang: 5.75, tilt: 0.09, yaw: 0.55, h: 0.24, tip: 1 },
    ];

    const cylMesh = scene.addMesh(cylinderGeometry(), CYL_MAT.color, 0.19, CYL_MAT);
    const innerGeo = buildBeveledSlab(bambooStickOutline(0.24, 2.02, 0.87), 0.055, 0.014, 0.014, 0, 0.87, 2);
    const innerSticks = INNER_LAYOUT.map(cfg => ({
      cfg,
      mesh: scene.addMesh(innerGeo, [0.91, 0.86, 0.74], 0, {
        accent: TIP_COLORS[cfg.tip],
        trim: [0.89, 0.83, 0.70],
        cavity: [0.16, 0.25, 0.18],
        grain: true,
        cull: true,
      }),
    }));
    const heroGeo = buildBeveledSlab(centerOutlineY(bambooStickOutline(0.50, HERO_LEN, 0.83)), 0.095, 0.022, 0.022, 3, 0.83, 2);
    const heroMesh = scene.addMesh(heroGeo, [0.95, 0.91, 0.82], 0.22, {
      accent: TIP_COLORS[0],
      trim: [0.89, 0.83, 0.70],
      cavity: [0.16, 0.25, 0.18],
      visible: false,
      cull: true,
    });

    const slipCanvas = document.createElement('canvas');
    slipCanvas.width = 256;
    slipCanvas.height = 1024;
    let heroTex = null;
    let lastSlipKey = null;

    let revealed = false, shaken = false, revealing = false;
    let drag = null, lastTick = 0;
    // Cylinder resting offset from (CX, CZ)
    let restX = 0, restZ = 0, cylYaw = 0;
    // Active drag & animation state
    let x = 0, z = 0, dragging = false, raf = 0, pickStart = 0, lastFrame = 0, lastMove = 0;
    let hop = 0, tiltX = 0, tiltZ = 0, rattlePhase = 0, rattleEnergy = 0;

    const tl = new EonAnim.Timeline(() => scene.lost);
    const vel = new EonAnim.Velocity({ smoothMs: 60, reverseDegrees: 100, minSpeed: 1.2 });

    function qRotateVec(q, v) {
      const [qx, qy, qz, qw] = q;
      const [vx, vy, vz] = v;
      const tx = 2 * (qy * vz - qz * vy);
      const ty = 2 * (qz * vx - qx * vz);
      const tz = 2 * (qx * vy - qy * vx);
      return [
        vx + qw * tx + (qy * tz - qz * ty),
        vy + qw * ty + (qz * tx - qx * tz),
        vz + qw * tz + (qx * ty - qy * tx),
      ];
    }

    function cylQuat(ax, az, yaw = cylYaw) {
      const m = Math.hypot(ax, az);
      const qTilt = m > 1e-4 ? qAxis([ax / m, 0, az / m], m) : [0, 0, 0, 1];
      return Math.abs(yaw) > 1e-4 ? qMultiply(qTilt, qAxis([0, 1, 0], yaw)) : qTilt;
    }

    function poseCylinder(px, lift, pz, ax = tiltX, az = tiltZ, yaw = cylYaw, bundleLift = 0, bundleJitter = 0) {
      const wx = CX + px, wz = CZ + pz;
      const qCyl = cylQuat(ax, az, yaw);
      cylMesh.position = [wx, lift, wz];
      cylMesh.q = qCyl;

      for (let i = 0; i < innerSticks.length; i++) {
        const { cfg, mesh } = innerSticks[i];
        const lx = cfg.r * Math.cos(cfg.ang);
        const lz = cfg.r * Math.sin(cfg.ang);
        const jitter = bundleJitter * Math.sin(rattlePhase + i * 1.7);
        const ly = 0.26 + cfg.h + bundleLift + jitter * 0.14;

        const qTilt = qAxis([Math.sin(cfg.ang), 0, -Math.cos(cfg.ang)], cfg.tilt + jitter * 0.03);
        const qLocal = qMultiply(qTilt, qAxis([0, 1, 0], cfg.yaw));
        mesh.q = qMultiply(qCyl, qLocal);

        const off = qRotateVec(qCyl, [lx, ly, lz]);
        mesh.position = [wx + off[0], lift + off[1], wz + off[2]];
      }
      scene.draw();
    }

    function prepareSlip(num, isTrain) {
      const key = `${num}:${isTrain ? 1 : 0}`;
      if (key !== lastSlipKey) {
        lastSlipKey = key;
        paintBambooSlip(slipCanvas, num, isTrain);
        heroTex = scene.canvasTexture(slipCanvas, heroTex);
        heroMesh.texture = heroTex;
      }
      heroMesh.accent = isTrain ? TIP_COLORS[0] : TIP_COLORS[1];
    }

    function hideHero() {
      revealed = false;
      heroMesh.visible = false;
      stage.classList.remove('is-revealed');
    }

    function restPose() {
      hideHero();
      hop = 0; vel.reset(); tiltX = 0; tiltZ = 0; rattleEnergy = 0;
      x = restX; z = restZ;
      hint.textContent = '拖动签筒，摇一摇';
      poseCylinder(x, 0, z, 0, 0, cylYaw, 0, 0);
    }

    function showRevealed(num) {
      const isTrain = host.train();
      prepareSlip(num, isTrain);
      revealed = true;
      hop = 0; vel.reset(); tiltX = 0; tiltZ = 0; rattleEnergy = 0;
      restX = x = REVEAL_CYL_X - CX;
      restZ = z = REVEAL_CYL_Z - CZ;
      cylYaw = REVEAL_CYL_YAW;
      stage.classList.add('is-revealed');
      hint.textContent = '';
      heroMesh.visible = true;
      heroMesh.position = HERO_FRONT_POS.slice();
      heroMesh.q = HERO_FRONT_Q.slice();
      heroMesh.scale = HERO_FRONT_SCALE;
      poseCylinder(x, 0, z, 0, 0, cylYaw, 0, 0);
    }

    function tick(now) {
      if (now - lastTick < 70) return;
      lastTick = now;
      host.haptic('tick');
    }

    function scales(px, pz) {
      const a = scene.project([CX + px, 0, CZ + pz]);
      const bx = scene.project([CX + px + 1, 0, CZ + pz]);
      const bz = scene.project([CX + px, 0, CZ + pz + 1]);
      return [
        Math.max(20, Math.hypot(bx[0] - a[0], bx[1] - a[1])),
        Math.max(20, Math.hypot(bz[0] - a[0], bz[1] - a[1])),
      ];
    }

    function frame(now) {
      if (!dragging || scene.lost) return;
      const dt = Math.min(64, now - (lastFrame || now)), k = 1 - Math.exp(-dt / 80);
      lastFrame = now;
      if (now - lastMove > 40) vel.decay(dt, 90);
      const speed = vel.speed;
      hop += (Math.min(HOP_MAX, speed * 0.15) - hop) * k;
      rattlePhase += (dt / 1000) * (6 + speed * 4.2);
      rattleEnergy += (Math.min(1, speed * 0.18) - rattleEnergy) * k;

      let ax = -vel.z * 0.04, az = vel.x * 0.04;
      const m = Math.hypot(ax, az);
      if (m > TILT_MAX) { ax *= TILT_MAX / m; az *= TILT_MAX / m; }
      const f = 1 - Math.exp(-dt / 70);
      tiltX += (ax - tiltX) * f;
      tiltZ += (az - tiltZ) * f;
      const hover = reduced.matches ? 0 : HOVER * ease(Math.min(1, (now - pickStart) / PICK_MS));
      const bLift = reduced.matches ? 0 : Math.min(0.20, speed * 0.032);
      const bJitter = reduced.matches ? 0 : rattleEnergy;
      poseCylinder(x, hover + (reduced.matches ? 0 : hop), z, tiltX, tiltZ, cylYaw, bLift, bJitter);
      raf = requestAnimationFrame(frame);
    }

    stage.addEventListener('pointerdown', e => {
      if (stage.disabled || revealing || drag) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      tl.cancel();
      vel.reset();
      if (revealed) {
        cylYaw = 0;
        restPose();
      }
      const [sx, sz] = scales(restX, restZ);
      x = restX; z = restZ;
      hop = 0; tiltX = 0; tiltZ = 0; rattleEnergy = 0;
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
      if (vel.add(nx - drag.lastWX, nz - drag.lastWZ, e.timeStamp - drag.lastT)) {
        rattleEnergy = 1;
        tick(e.timeStamp);
      }
      lastMove = e.timeStamp;
      drag.lastX = e.clientX; drag.lastY = e.clientY; drag.lastT = e.timeStamp;
      drag.lastWX = nx; drag.lastWZ = nz;
      x = nx; z = nz;
    });

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved > SHAKEN_PX) { shaken = true; hint.textContent = '摇好了，抽一签试试'; }
      drag = null;
      dragging = false;
      cancelAnimationFrame(raf);
      stage.classList.remove('is-dragging');
      restX = x; restZ = z;
      settle(tl.generation);
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    const animate = (duration, onFrame, gen) => tl.run(duration, onFrame, gen);

    function settle(gen) {
      const lift = cylMesh.position[1], fromHop = hop, fromX = tiltX, fromZ = tiltZ, fromRattle = rattleEnergy;
      hop = 0; vel.reset(); rattleEnergy = 0;
      if (reduced.matches || lift <= 0.01) {
        tiltX = 0; tiltZ = 0;
        poseCylinder(x, 0, z, 0, 0, cylYaw, 0, 0);
        return Promise.resolve(true);
      }
      return animate(DROP_MS, t => {
        const left = 1 - ease(t);
        tiltX = fromX * left; tiltZ = fromZ * left; hop = fromHop * left;
        rattlePhase += 0.35;
        poseCylinder(x, lift * left, z, tiltX, tiltZ, cylYaw, 0, fromRattle * left);
      }, gen).then(ok => {
        if (!ok) return false;
        tiltX = 0; tiltZ = 0;
        poseCylinder(x, 0, z, 0, 0, cylYaw, 0, 0);
        tick(performance.now());
        return animate(BOUNCE_MS, t => {
          poseCylinder(x, 0.045 * Math.sin(Math.PI * t), z, 0, 0, cylYaw, 0.04 * Math.sin(Math.PI * t), 0);
        }, gen).then(done => {
          if (done) poseCylinder(x, 0, z, 0, 0, cylYaw, 0, 0);
          return done;
        });
      });
    }

    function autoShake(gen) {
      const bx = clamp(restX, -0.9, 0.9), bz = clamp(restZ, -0.7, 0.7);
      return animate(760, (t, now) => {
        const a = Math.PI * 4 * t;
        rattlePhase = t * 18;
        const lift = HOVER * ease(Math.min(1, t * 3)) + 0.06 * Math.abs(Math.sin(2 * a));
        const px = bx + 0.42 * Math.sin(a);
        const pz = bz + 0.24 * Math.sin(2 * a);
        const decay = 1 - Math.pow(t, 3);
        poseCylinder(px, lift, pz, -0.10 * Math.sin(2 * a), 0.14 * Math.cos(a), cylYaw, 0.14 * Math.sin(Math.PI * t), decay);
        if (Math.abs(Math.cos(a)) < 0.2) tick(now);
      }, gen).then(ok => {
        if (ok) {
          restX = x = bx; restZ = z = bz;
          poseCylinder(x, 0, z, 0, 0, cylYaw, 0, 0);
        }
        return ok;
      });
    }

    function moveToRevealSpot(gen) {
      const startX = restX, startZ = restZ, startYaw = cylYaw;
      const targetX = REVEAL_CYL_X - CX, targetZ = REVEAL_CYL_Z - CZ;
      return animate(400, t => {
        const k = easeInOut(t);
        rattlePhase = t * 12;
        const decay = 1 - Math.pow(t, 2);
        const lift = Math.sin(t * Math.PI) * 0.34;
        const sway = Math.sin(t * Math.PI * 3) * 0.16 * decay;
        x = startX + (targetX - startX) * k + sway;
        z = startZ + (targetZ - startZ) * k;
        cylYaw = startYaw + (REVEAL_CYL_YAW - startYaw) * k;
        poseCylinder(x, lift, z, 0.16 * Math.sin(t * Math.PI), Math.cos(t * Math.PI * 3) * 0.14 * decay, cylYaw, 0.10 * Math.sin(t * Math.PI), decay * 0.7);
      }, gen).then(ok => {
        if (ok) {
          restX = x = targetX; restZ = z = targetZ; cylYaw = REVEAL_CYL_YAW;
          poseCylinder(x, 0, z, 0, 0, cylYaw, 0, 0);
        }
        return ok;
      });
    }

    async function reveal(outcome) {
      const num = Number(outcome);
      if (!(Number.isInteger(num) && num >= 1 && num <= 10)) return null;
      const gen = tl.cancel();
      revealing = true;
      try {
        if (drag) {
          drag = null; dragging = false;
          cancelAnimationFrame(raf);
          stage.classList.remove('is-dragging');
          restX = x = cylMesh.position[0] - CX;
          restZ = z = cylMesh.position[2] - CZ;
        }
        if (revealed) {
          cylYaw = 0;
          restPose();
        } else {
          hideHero();
        }
        prepareSlip(num, host.train());

        if (reduced.matches) {
          host.haptic('thud');
          showRevealed(num);
          return outcome;
        }
        if (cylMesh.position[1] > 0.01 && !(await settle(gen))) return null;
        if (!tl.live(gen)) return null;
        if (!shaken && !(await autoShake(gen))) return null;
        if (!tl.live(gen)) return null;
        if (!(await moveToRevealSpot(gen))) return null;
        if (!tl.live(gen)) return null;

        const qEmerg = qAxis([1, 0, 0], 0.22);
        const [fx, fy, fz] = HERO_FRONT_POS;
        heroMesh.visible = true;
        stage.classList.add('is-revealed');
        hint.textContent = '';
        host.haptic('thud');

        // Phase 2: selected slip rises out from the cylinder
        const emerged = await animate(340, p => {
          const ep = ease(p);
          heroMesh.position = [REVEAL_CYL_X, 1.55 + ep * 1.42, REVEAL_CYL_Z + ep * 0.08];
          heroMesh.q = qEmerg;
          heroMesh.scale = 0.85 + 0.15 * ep;
          scene.draw();
        }, gen);
        if (!emerged) return null;

        // Phase 3: swoop forward to camera showcase position and enlarge
        const landed = await animate(480, p => {
          const k = easeInOut(p);
          const arc = Math.sin(k * Math.PI) * 0.42;
          heroMesh.position = [
            REVEAL_CYL_X + (fx - REVEAL_CYL_X) * k,
            2.97 * (1 - k) + fy * k + arc,
            (REVEAL_CYL_Z + 0.08) + (fz - (REVEAL_CYL_Z + 0.08)) * k,
          ];
          heroMesh.q = qSlerp(qEmerg, HERO_FRONT_Q, k);
          heroMesh.scale = 1.0 + (HERO_FRONT_SCALE - 1.0) * k;
          scene.draw();
        }, gen);
        if (!landed) return null;

        showRevealed(num);
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
      const num = Number(outcome);
      if (Number.isInteger(num) && num >= 1 && num <= 10) {
        showRevealed(num);
      } else {
        restX = 0; restZ = 0; cylYaw = 0;
        restPose();
      }
    }

    restPose();
    Object.defineProperty(stage, '__lots', {
      value: {
        pose: () => cylMesh.position.slice(),
        hero: () => heroMesh.position.slice(),
        heroScale: () => heroMesh.scale,
        isRevealed: () => revealed,
        heroVisible: () => heroMesh.visible,
        rest: () => [restX, restZ],
        slip: () => lastSlipKey,
      },
    });
    return { reveal, show, revealing: () => revealing };
  },
});

const TRAIN_SLIPS = [
  { rank: '上 · 吉', lines: ['动静得宜', '行健自强'], seal: '起行' },
  { rank: '中 · 吉', lines: ['千里之行', '始于足下'], seal: '行健' },
  { rank: '上 · 吉', lines: ['春生夏长', '顺时而动'], seal: '顺势' },
  { rank: '吉 · 利', lines: ['流水不腐', '户枢不蠹'], seal: '起行' },
  { rank: '吉 · 利', lines: ['筋骨既展', '百脉自通'], seal: '舒展' },
  { rank: '上 · 吉', lines: ['积土成山', '积水成渊'], seal: '笃行' },
  { rank: '中 · 吉', lines: ['不积跬步', '无以致远'], seal: '迈步' },
  { rank: '吉 · 利', lines: ['日日不断', '自有进境'], seal: '精进' },
  { rank: '上 · 吉', lines: ['力从地起', '气自丹田'], seal: '发力' },
  { rank: '上 · 吉', lines: ['身动心安', '无往不宜'], seal: '当行' },
];

const REST_SLIPS = [
  { rank: '安 · 闲', lines: ['一张一弛', '文武之道'], seal: '止息' },
  { rank: '平 · 安', lines: ['久行必息', '蓄势待发'], seal: '养锐' },
  { rank: '安 · 闲', lines: ['秋收冬藏', '静水深流'], seal: '归藏' },
  { rank: '清 · 宁', lines: ['偷得浮生', '半日清闲'], seal: '自在' },
  { rank: '平 · 安', lines: ['知止而后', '能定能安'], seal: '安宁' },
  { rank: '安 · 闲', lines: ['松风煮茗', '暂歇片刻'], seal: '品茗' },
  { rank: '清 · 宁', lines: ['月盈则休', '水满宜收'], seal: '留白' },
  { rank: '平 · 安', lines: ['以静制动', '养精蓄锐'], seal: '蓄力' },
  { rank: '安 · 闲', lines: ['顺其自然', '不必强求'], seal: '从容' },
  { rank: '清 · 宁', lines: ['今夕安眠', '他日再兴'], seal: '安寝' },
];

function paintBambooSlip(canvas, num, isTrain) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const bank = isTrain ? TRAIN_SLIPS : REST_SLIPS;
  const entry = bank[((num - 1) % bank.length + bank.length) % bank.length];

  ctx.save();
  ctx.scale(W / 384, H / 1536);
  const VW = 384, VH = 1536;

  ctx.fillStyle = '#f4edda';
  ctx.fillRect(0, 0, VW, VH);
  for (let x = 0; x < VW; x += 6) {
    ctx.fillStyle = x % 12 === 0 ? 'rgba(130, 112, 74, 0.04)' : 'rgba(255, 252, 244, 0.14)';
    ctx.fillRect(x, 0, 3, VH);
  }

  const accent = isTrain ? '#b5493a' : '#365b43';
  const ink = isTrain ? '#24372c' : '#435869';
  const serif = '"Noto Serif CJK SC", "Songti SC", "STSong", Georgia, serif';
  const sans = '"Noto Sans CJK SC", "PingFang SC", sans-serif';

  // Top 17% (y <= 261) aligns cleanly with tipRatio = 0.83
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, VW, 261);
  ctx.fillStyle = '#c8be82';
  ctx.fillRect(0, 258, VW, 16);

  ctx.strokeStyle = 'rgba(54, 91, 67, 0.48)';
  ctx.lineWidth = 8;
  ctx.strokeRect(34, 314, VW - 68, 1146);
  ctx.strokeStyle = 'rgba(54, 91, 67, 0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 328, VW - 96, 1118);

  ctx.fillStyle = isTrain ? '#365b43' : '#596e80';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 44px ${serif}, ${sans}`;
  ctx.fillText(entry.rank, VW / 2, 394);

  ctx.fillStyle = 'rgba(141, 154, 103, 0.60)';
  ctx.fillRect(VW / 2 - 58, 438, 116, 4);

  ctx.fillStyle = ink;
  ctx.font = `700 220px ${serif}, ${sans}`;
  ctx.fillText(isTrain ? '练' : '歇', VW / 2, 610);

  ctx.fillStyle = 'rgba(54, 91, 67, 0.25)';
  ctx.fillRect(72, 748, VW - 144, 4);

  ctx.fillStyle = 'rgba(141, 154, 103, 0.35)';
  ctx.fillRect(VW / 2 - 2, 810, 4, 390);

  ctx.font = `600 56px ${serif}, ${sans}`;
  const drawCol = (str, cx) => {
    ctx.fillStyle = '#28392f';
    const startY = 1005 - ((str.length - 1) * 78) / 2;
    for (let i = 0; i < str.length; i++) ctx.fillText(str[i], cx, startY + i * 78);
  };
  drawCol(entry.lines[0], VW / 2 + 66);
  drawCol(entry.lines[1], VW / 2 - 66);

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(VW / 2 - 62, 1322, 124, 80, 14);
  ctx.fill();
  ctx.fillStyle = '#fafbf5';
  ctx.font = `700 42px ${serif}, ${sans}`;
  ctx.fillText(entry.seal, VW / 2, 1363);
  ctx.restore();
}

/* Turned bamboo tube with foot ring, bamboo node ridge, brass band, rounded lip, and dark cavity. */
function cylinderGeometry() {
  const rings = [
    { r: 0.00, y: 0.00, flag: 3 },
    { r: 0.68, y: 0.00, flag: 3, sharp: true },
    { r: 0.76, y: 0.07, flag: 3 },
    { r: 0.78, y: 0.14, flag: 3, sharp: true },
    { r: 0.78, y: 0.14, flag: 0 },
    { r: 0.76, y: 0.56, flag: 0, sharp: true },
    { r: 0.79, y: 0.60, flag: 0 },
    { r: 0.79, y: 0.64, flag: 0 },
    { r: 0.755, y: 0.68, flag: 0, sharp: true },
    { r: 0.74, y: 1.04, flag: 0 },
    { r: 0.76, y: 1.38, flag: 0, sharp: true },
    { r: 0.775, y: 1.38, flag: 2 },
    { r: 0.775, y: 1.46, flag: 2, sharp: true },
    { r: 0.765, y: 1.46, flag: 0 },
    { r: 0.805, y: 1.88, flag: 0, sharp: true },
    { r: 0.825, y: 1.94, flag: 3 },
    { r: 0.822, y: 2.00, flag: 3 },
    { r: 0.785, y: 2.04, flag: 3 },
    { r: 0.735, y: 2.04, flag: 3 },
    { r: 0.705, y: 1.99, flag: 3, sharp: true },
    { r: 0.68, y: 1.65, flag: 1 },
    { r: 0.65, y: 0.30, flag: 1, sharp: true },
    { r: 0.00, y: 0.28, flag: 1 },
  ];
  const SEG = 64, TAU = Math.PI * 2, out = [];
  const runs = [];
  let cur = [rings[0]];
  for (let i = 1; i < rings.length; i++) {
    cur.push(rings[i]);
    if (rings[i].sharp && i < rings.length - 1) { runs.push(cur); cur = [rings[i]]; }
  }
  runs.push(cur);
  const maxY = rings.reduce((m, p) => Math.max(m, p.y), 0.001);

  for (const prof of runs) {
    const segN = prof.slice(1).map((p, i) => {
      const dr = p.r - prof[i].r, dy = p.y - prof[i].y, l = Math.hypot(dr, dy) || 1;
      return [dy / l, -dr / l];
    });
    const pN = prof.map((_, i) => {
      const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)];
      const nx = a[0] + b[0], ny = a[1] + b[1], l = Math.hypot(nx, ny) || 1;
      return [nx / l, ny / l];
    });
    const vert = (j, s) => {
      const t = (s / SEG) * TAU, c = Math.cos(t), sn = Math.sin(t);
      const { r, y, flag } = prof[j], [nr, ny] = pN[j];
      const nl = Math.hypot(nr, ny) || 1;
      return [r * c, y, r * sn, (nr / nl) * c, ny / nl, (nr / nl) * sn, s / SEG, y / maxY, flag];
    };
    for (let s = 0; s < SEG; s++) for (let j = 0; j < prof.length - 1; j++) {
      const a = vert(j, s), b = vert(j, s + 1), c = vert(j + 1, s + 1), d = vert(j + 1, s);
      out.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
  }
  return new Float32Array(out);
}

function bambooStickOutline(w, len, tipRatio = 2) {
  const hw = w / 2, archR = hw, bodyTop = len - archR, pts = [], br = 0.05;
  const capY = len * tipRatio;
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI + (i / 4) * (Math.PI / 2);
    pts.push([-hw + br + br * Math.cos(a), br + br * Math.sin(a)]);
  }
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push([hw - br + br * Math.cos(a), br + br * Math.sin(a)]);
  }
  if (capY > br + 0.01 && capY < bodyTop - 0.01) pts.push([hw, capY]);
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    pts.push([archR * Math.cos(a), bodyTop + archR * Math.sin(a)]);
  }
  if (capY > br + 0.01 && capY < bodyTop - 0.01) pts.push([-hw, capY]);
  return pts;
}

function centerOutlineY(pts) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const mid = (minY + maxY) * 0.5;
  return pts.map(([x, y]) => [x, y - mid]);
}

function buildBeveledSlab(outline, thickness, bevelXY, bevelZ, sideFlag = 3, tipRatio = 2, tipFlag = 2) {
  const out = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of outline) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const W = maxX - minX || 1, H = maxY - minY || 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, halfT = thickness / 2;
  const zF = halfT, zFB = halfT - bevelZ, zBB = -halfT + bevelZ, zB = -halfT;
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const N = outline.length;
  const edgeOut = outline.map((p, i) => {
    const q = outline[(i + 1) % N], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  });
  const vertOut = outline.map((_, i) => {
    const a = edgeOut[(i - 1 + N) % N], b = edgeOut[i], nx = a[0] + b[0], ny = a[1] + b[1], l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  });
  const inner = outline.map((p, i) => [p[0] - vertOut[i][0] * bevelXY, p[1] - vertOut[i][1] * bevelXY]);
  const uvOf = (x, y) => [(x - minX) / W, (y - minY) / H];
  const flagAt = y => ((y - minY) / H >= tipRatio ? tipFlag : sideFlag);
  const [cu, cv] = uvOf(cx, cy);

  for (let i = 0; i < N; i++) {
    const a = inner[i], b = inner[(i + 1) % N], [ua, va] = uvOf(a[0], a[1]), [ub, vb] = uvOf(b[0], b[1]);
    out.push(cx, cy, zF, 0, 0, 1, cu, cv, 0, a[0], a[1], zF, 0, 0, 1, ua, va, 0, b[0], b[1], zF, 0, 0, 1, ub, vb, 0);
    const fc = flagAt(cy), fa = flagAt(a[1]), fb = flagAt(b[1]);
    out.push(cx, cy, zB, 0, 0, -1, cu, cv, fc, b[0], b[1], zB, 0, 0, -1, ub, vb, fb, a[0], a[1], zB, 0, 0, -1, ua, va, fa);
  }

  const ringQuad = (p0, p1, q0, q1, n0, n1, m0, m1, flag) => {
    const [up0, vp0] = uvOf(p0[0], p0[1]), [up1, vp1] = uvOf(p1[0], p1[1]);
    const [uq0, vq0] = uvOf(q0[0], q0[1]), [uq1, vq1] = uvOf(q1[0], q1[1]);
    const a = [p0[0], p0[1], p0[2], ...n0, up0, vp0, flag], b = [p1[0], p1[1], p1[2], ...n1, up1, vp1, flag];
    const c = [q0[0], q0[1], q0[2], ...m0, uq0, vq0, flag], d = [q1[0], q1[1], q1[2], ...m1, uq1, vq1, flag];
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, o0 = outline[i], o1 = outline[j], i0 = inner[i], i1 = inner[j];
    const vo0 = vertOut[i], vo1 = vertOut[j];
    const ns0 = [vo0[0], vo0[1], 0], ns1 = [vo1[0], vo1[1], 0];
    const nfb0 = norm([vo0[0] * 0.65, vo0[1] * 0.65, 0.76]), nfb1 = norm([vo1[0] * 0.65, vo1[1] * 0.65, 0.76]);
    const nbb0 = norm([vo0[0] * 0.65, vo0[1] * 0.65, -0.76]), nbb1 = norm([vo1[0] * 0.65, vo1[1] * 0.65, -0.76]);
    const segFlag = flagAt((o0[1] + o1[1]) * 0.5);
    ringQuad([o0[0], o0[1], zFB], [o1[0], o1[1], zFB], [i1[0], i1[1], zF], [i0[0], i0[1], zF], nfb0, nfb1, nfb1, nfb0, segFlag);
    ringQuad([o0[0], o0[1], zBB], [o1[0], o1[1], zBB], [o1[0], o1[1], zFB], [o0[0], o0[1], zFB], ns0, ns1, ns1, ns0, segFlag);
    ringQuad([i0[0], i0[1], zB], [i1[0], i1[1], zB], [o1[0], o1[1], zBB], [o0[0], o0[1], zBB], nbb0, nbb1, nbb1, nbb0, segFlag);
  }
  return new Float32Array(out);
}

}

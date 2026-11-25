// Synced from Android chance/scenes/scratch/scene.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window
  const { EonAnim, EonChance, EonScratchArt, EonScratchStage } = window

;
(function () {
  'use strict';

  EonChance.register({
    api: 1,
    libs: ['anim.js'],
    requires: ['stage3d.js', 'ticket-art.js'],
    styles: ['scene.css'],
    tapToDraw: false,
    labels: {
      action: '刮开看看', again: '换一张再刮',
      idle: '刮开银箔，看看今日签。', waiting: '继续刮开银箔，看看今日签。',
      stageIdle: '刮开票券的银箔', stageBusy: '正在刮开银箔',
      stageResult: () => '刮刮票券已揭晓，点此再刮一张',
    },
    create(element, host) {
      const { Timeline, clamp, ease, qAxis } = EonAnim;
      const { ScratchStage3D, qFromChain } = EonScratchStage;
      const {
        TICKET_HX, TICKET_HZ, TICKET_H, TICKET_FOIL_BOX, FINISH, TRAIN_COPIES, REST_COPIES,
        buildTicketBodyGeo, buildTicketPrintGeo, buildTicketFoilGeo, buildMilledCoinGeo, buildShavingGeo,
        makeCoinEmblemCanvas, makeTicketPrintCanvas, paintTicketFoilBase, scrapeFoilLine,
      } = EonScratchArt;
      const lerp = (a, b, t) => a + (b - a) * t;
      const CARD_X = -0.46;
      const CARD_Z = -0.02;
      const FOIL_Y = TICKET_H + 0.015;
      const HIT_Y = FOIL_Y + 0.012;
      const PEEL_THRESHOLD = 0.58;
      const SHAVING_POOL = 42;
      const PARKED = { pos: [2.02, 0.038, 0.62], tilt: 0, yaw: 0.42, roll: 0 };
      const AUTO_STROKES = [
        [0.12, 0.25], [0.36, 0.18], [0.16, 0.62], [0.52, 0.20], [0.32, 0.78],
        [0.72, 0.24], [0.56, 0.80], [0.88, 0.34], [0.78, 0.76],
      ];

      const shadowCanvas = document.createElement('canvas');
      const glCanvas = document.createElement('canvas');
      shadowCanvas.setAttribute('aria-hidden', 'true');
      glCanvas.setAttribute('aria-hidden', 'true');
      const foilCanvas = document.createElement('canvas');
      foilCanvas.width = 640;
      foilCanvas.height = 280;
      const foilCtx = foilCanvas.getContext('2d', { willReadFrequently: true });

      element.classList.add('scratch-stage');
      element.append(shadowCanvas, glCanvas);
      const stage = new ScratchStage3D(element, glCanvas, shadowCanvas);
      const timeline = new Timeline(() => stage.gl.isContextLost());

      let serial = 428;
      let phase = 'idle';
      let pending = null;
      let pointer = null;
      let queuedStroke = null;
      let lastHit = null;
      let strokeCount = 0;
      let coin = PARKED;
      let particleIndex = 0;
      let particleFrame = null;

      function printCanvas(outcomeTrain, outcome) {
        const copies = outcomeTrain ? TRAIN_COPIES : REST_COPIES;
        const copy = copies[(Number(outcome) + copies.length - 1) % copies.length];
        const stop = typeof host.stopKey === 'function' ? host.stopKey() : '';
        const match = /^(10|[0-9])\/10$/.exec(stop);
        return makeTicketPrintCanvas(FINISH, outcomeTrain, match ? Number(match[1]) * 10 : 50, serial, copy);
      }

      const texPrint = stage.createTextureFromCanvas(printCanvas(null, null));
      paintTicketFoilBase(foilCanvas, FINISH);
      const texFoil = stage.createTextureFromCanvas(foilCanvas);
      const texCoin = stage.createTextureFromCanvas(makeCoinEmblemCanvas(FINISH.coinPalette));

      const bodyMesh = stage.addMesh(buildTicketBodyGeo(), { ...FINISH.body, surfaceStyle: 2 });
      bodyMesh.position = [CARD_X, 0, CARD_Z];
      const printMesh = stage.addMesh(buildTicketPrintGeo(), {
        color: [1, 1, 1], accent: [0.85, 0.82, 0.74], trim: [0.85, 0.82, 0.74],
        matMeta: [0, 0.1, 0.1], matRough: [0.86, 0.72, 0.72],
        texture: texPrint, surfaceStyle: 2,
      });
      printMesh.position = [CARD_X, TICKET_H - 0.008, CARD_Z];
      const coinMesh = stage.addMesh(buildMilledCoinGeo(), { ...FINISH.coinMat, texture: texCoin });
      const shavingGeo = buildShavingGeo();
      const shavings = Array.from({ length: SHAVING_POOL }, () => {
        const mesh = stage.addMesh(shavingGeo, {
          color: FINISH.shavingColor, metallic: 0.90, roughness: 0.22,
          visible: false, doubleSided: true,
        });
        return { mesh, pos: null, vel: null, rot: null, vrot: null, settled: true };
      });
      const foilMesh = stage.addMesh(buildTicketFoilGeo(), {
        ...FINISH.foilMat, texture: texFoil, useTexAlpha: true,
        transparent: true, doubleSided: true, surfaceStyle: 1,
      });
      foilMesh.position = [CARD_X, FOIL_Y, CARD_Z];

      const coinShadow = {
        kind: 'blob', x: PARKED.pos[0], z: PARKED.pos[2], y: 0,
        radius: 0.135, opacity: 0.28, stretch: 1, visible: true,
      };
      stage.shadows.push({
        kind: 'rect', x: CARD_X, z: CARD_Z, y: 0, hx: TICKET_HX, hz: TICKET_HZ,
        opacity: 0.23, visible: true,
      }, coinShadow);

      function drawScene() {
        coinMesh.position = coin.pos;
        coinMesh.q = qFromChain(qAxis([0, 1, 0], coin.yaw), qAxis([1, 0, 0], coin.tilt), qAxis([0, 0, 1], coin.roll));
        coinShadow.x = coin.pos[0];
        coinShadow.y = Math.max(0, coin.pos[1] - PARKED.pos[1]);
        coinShadow.z = coin.pos[2];
        stage.draw();
      }

      function foilPoint(u, v) {
        return {
          px: u * foilCanvas.width,
          py: v * foilCanvas.height,
          world: [
            CARD_X + lerp(TICKET_FOIL_BOX.x0, TICKET_FOIL_BOX.x1, u), HIT_Y,
            CARD_Z + lerp(TICKET_FOIL_BOX.z0, TICKET_FOIL_BOX.z1, v),
          ],
        };
      }

      function hitFoil(clientX, clientY, dragging = false) {
        const hit = stage.raycastPlaneY(clientX, clientY, HIT_Y);
        if (!hit) return null;
        const box = TICKET_FOIL_BOX;
        const u = (hit[0] - CARD_X - box.x0) / (box.x1 - box.x0);
        const v = (hit[2] - CARD_Z - box.z0) / (box.z1 - box.z0);
        if (!dragging && (u < -0.04 || u > 1.04 || v < -0.05 || v > 1.05)) return null;
        return foilPoint(clamp(u, 0, 1), clamp(v, 0, 1));
      }

      function clearedFraction() {
        const { width, height } = foilCanvas;
        const data = foilCtx.getImageData(0, 0, width, height).data;
        let cleared = 0;
        let total = 0;
        for (let y = 10; y < height - 10; y += 6) {
          for (let x = 10; x < width - 10; x += 6) {
            total++;
            if (data[(y * width + x) * 4 + 3] < 48) cleared++;
          }
        }
        return cleared / total;
      }

      function shavingFloor(x, z) {
        const onCard = Math.abs(x - CARD_X) < TICKET_HX - 0.04 && Math.abs(z - CARD_Z) < TICKET_HZ - 0.04;
        return onCard ? FOIL_Y + 0.024 : 0.020;
      }

      function poseShaving(s) {
        s.mesh.position = s.pos;
        s.mesh.q = qFromChain(qAxis([0, 1, 0], s.rot[1]), qAxis([1, 0, 0], s.rot[0]), qAxis([0, 0, 1], s.rot[2]));
      }

      function startParticleLoop() {
        if (particleFrame != null) return;
        let previous = performance.now();
        const frame = now => {
          const dt = Math.min(0.04, (now - previous) / 1000);
          previous = now;
          let moving = false;
          for (const s of shavings) {
            if (s.settled) continue;
            s.vel[1] -= 5.8 * dt;
            for (let axis = 0; axis < 3; axis++) {
              s.pos[axis] += s.vel[axis] * dt;
              s.rot[axis] += s.vrot[axis] * dt;
            }
            const floor = shavingFloor(s.pos[0], s.pos[2]);
            if (s.pos[1] <= floor) {
              s.pos[1] = floor;
              s.rot[0] = 0.22;
              s.rot[2] = 0.12;
              s.settled = true;
            } else {
              moving = true;
            }
            poseShaving(s);
          }
          stage.draw();
          particleFrame = moving ? requestAnimationFrame(frame) : null;
        };
        particleFrame = requestAnimationFrame(frame);
      }

      function spawnShavings(world, dx, dz, count, settled = false) {
        for (let i = 0; i < count; i++) {
          const s = shavings[particleIndex++ % SHAVING_POOL];
          const angle = (particleIndex * 2.39996) % (Math.PI * 2);
          const x = Math.cos(angle);
          const z = Math.sin(angle);
          s.mesh.scale = 0.72 + ((particleIndex * 19) % 7) * 0.11;
          s.mesh.visible = true;
          s.settled = settled;
          if (settled) {
            const rx = world[0] + x * (0.16 + (i % 4) * 0.14);
            const rz = world[2] + z * (0.14 + (i % 3) * 0.13);
            s.pos = [rx, shavingFloor(rx, rz), rz];
            s.rot = [0.22 + (i % 3) * 0.25, angle, 0.15];
          } else {
            const speed = (0.7 + ((particleIndex * 37) % 10) * 0.14) * 0.75;
            s.pos = [world[0] + x * 0.06, world[1] + 0.04, world[2] + z * 0.06];
            s.vel = [x * speed - dx * 0.35, 1.15 + ((particleIndex * 23) % 7) * 0.18, z * speed - dz * 0.35];
            s.rot = [angle, angle * 1.4, angle * 0.6];
            s.vrot = [6 - (i % 3) * 4, 8, -5 + (i % 2) * 7];
          }
          poseShaving(s);
        }
        if (!settled) startParticleLoop();
      }

      function clearShavings() {
        if (particleFrame != null) cancelAnimationFrame(particleFrame);
        particleFrame = null;
        particleIndex = 0;
        for (const s of shavings) {
          s.settled = true;
          s.mesh.visible = false;
        }
      }

      function leaveSettledShavings() {
        clearShavings();
        const anchors = [
          [CARD_X + 1.56, 0.02, 1.30], [CARD_X - 1.58, 0.02, 1.24],
          [CARD_X + 0.62, 0.02, 1.34], [CARD_X - 0.52, 0.02, 1.30],
        ];
        for (const point of anchors) spawnShavings(point, 0, 0, 2, true);
      }

      function moveCoin(start, end, t, lift) {
        const e = ease(t);
        coin = {
          pos: [
            lerp(start.pos[0], end.pos[0], e),
            lerp(start.pos[1], end.pos[1], e) + Math.sin(t * Math.PI) * lift,
            lerp(start.pos[2], end.pos[2], e),
          ],
          tilt: lerp(start.tilt, end.tilt, e),
          yaw: lerp(start.yaw, end.yaw, e),
          roll: lerp(start.roll, end.roll, e),
        };
      }

      function touchPose(world, yaw) {
        return { pos: [world[0] + 0.20, FOIL_Y + 0.23, world[2] + 0.12], tilt: 0.66, yaw, roll: -0.34 };
      }

      function scratch(hit, manual) {
        const from = lastHit || hit;
        scrapeFoilLine(foilCtx, from.px, from.py, hit.px, hit.py, 35);
        stage.updateTextureFromCanvas(texFoil, foilCanvas);

        const dx = hit.world[0] - from.world[0];
        const dz = hit.world[2] - from.world[2];
        const distance = Math.hypot(dx, dz);
        const yaw = distance > 0.01 ? Math.atan2(dx, dz) : coin.yaw;
        coin = touchPose(hit.world, lerp(coin.yaw, yaw * 0.35 + 0.55, 0.35));
        strokeCount++;
        if (!lastHit || distance > 0.05 || strokeCount % 2 === 0) {
          spawnShavings(hit.world, dx, dz, lastHit ? 3 : 4);
        }
        lastHit = hit;
        drawScene();
        if (manual && strokeCount % 3 === 0 && clearedFraction() >= PEEL_THRESHOLD) finishPeel();
      }

      function parkCoin() {
        const start = coin;
        const generation = timeline.cancel();
        void timeline.run(320, t => {
          moveCoin(start, PARKED, t, 0.18);
          drawScene();
        }, generation);
      }

      function endStroke() {
        lastHit = null;
        if (phase !== 'active') return;
        if (clearedFraction() >= PEEL_THRESHOLD) finishPeel();
        else parkCoin();
      }

      async function finishPeel() {
        if (phase !== 'active') return;
        phase = 'peeling';
        const generation = timeline.cancel();
        const start = coin;
        const { width, height } = foilCanvas;
        const finished = await timeline.run(360, t => {
          const diagonal = (width + height) * ease(t) * 1.15;
          foilCtx.save();
          foilCtx.globalCompositeOperation = 'destination-out';
          foilCtx.fillStyle = '#000';
          foilCtx.beginPath();
          foilCtx.moveTo(0, 0);
          foilCtx.lineTo(diagonal, 0);
          foilCtx.lineTo(0, diagonal);
          foilCtx.closePath();
          foilCtx.fill();
          foilCtx.restore();
          stage.updateTextureFromCanvas(texFoil, foilCanvas);
          moveCoin(start, PARKED, t, 0.24);
          drawScene();
        }, generation);
        if (!finished || !pending) return;
        phase = 'result';
        const { outcome, resolve } = pending;
        pending = null;
        foilMesh.visible = false;
        coin = PARKED;
        leaveSettledShavings();
        host.haptic('thud');
        drawScene();
        resolve(outcome);
      }

      async function autoScratch() {
        const generation = timeline.cancel();
        const approach = 220;
        const duration = approach + 1480;
        const first = foilPoint(...AUTO_STROKES[0]).world;
        const finished = await timeline.run(duration, t => {
          const ms = t * duration;
          if (ms < approach) {
            moveCoin(PARKED, touchPose(first, 0.55), ms / approach, 0.32);
            drawScene();
            return;
          }
          const segments = AUTO_STROKES.length - 1;
          const position = ((ms - approach) / (duration - approach)) * segments;
          const i = Math.min(segments - 1, Math.floor(position));
          const a = AUTO_STROKES[i];
          const b = AUTO_STROKES[i + 1];
          scratch(foilPoint(lerp(a[0], b[0], position - i), lerp(a[1], b[1], position - i)), false);
        }, generation);
        if (finished) finishPeel();
      }

      function resetCard(outcome, covered) {
        timeline.cancel();
        clearShavings();
        lastHit = null;
        strokeCount = 0;
        coin = PARKED;
        foilMesh.visible = covered;
        stage.updateTextureFromCanvas(texPrint, printCanvas(outcome == null ? null : host.train(), outcome));
        if (covered) {
          paintTicketFoilBase(foilCanvas, FINISH);
          stage.updateTextureFromCanvas(texFoil, foilCanvas);
        }
        drawScene();
      }

      function cancelReveal() {
        if (!pending) return;
        const { resolve } = pending;
        pending = null;
        resolve(null);
      }

      function show(outcome) {
        cancelReveal();
        queuedStroke = null;
        if (pointer?.mode === 'scratch') releasePointer(pointer.id);
        phase = outcome == null ? 'idle' : 'result';
        resetCard(outcome, outcome == null);
        if (outcome != null) {
          leaveSettledShavings();
          drawScene();
        }
      }

      function reveal(outcome) {
        cancelReveal();
        if (phase === 'result') serial++;
        phase = 'active';
        resetCard(outcome, true);
        return new Promise(resolve => {
          pending = { outcome, resolve };
          const stroke = queuedStroke;
          queuedStroke = null;
          if (stroke) {
            for (const hit of stroke.hits) {
              if (phase !== 'active') break;
              scratch(hit, true);
            }
            if (stroke.ended) endStroke();
          } else {
            void autoScratch();
          }
        });
      }

      function releasePointer(id) {
        pointer = null;
        element.classList.remove('is-scratching', 'is-orbiting');
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      }

      element.addEventListener('contextmenu', event => event.preventDefault());
      element.addEventListener('pointerdown', event => {
        if (pointer || element.disabled || (event.button !== 0 && event.button !== 2)) return;
        const hit = event.button === 0 && !event.altKey && !event.shiftKey && hitFoil(event.clientX, event.clientY);
        if (hit && (queuedStroke || phase === 'peeling')) return;
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        if (hit) {
          pointer = { id: event.pointerId, mode: 'scratch' };
          element.classList.add('is-scratching');
          if (phase === 'active') {
            timeline.cancel();
            lastHit = null;
            scratch(hit, true);
          } else {
            queuedStroke = { hits: [hit], ended: false };
            host.draw();
          }
        } else {
          pointer = { id: event.pointerId, mode: 'orbit', x: event.clientX, y: event.clientY };
          element.classList.add('is-orbiting');
        }
      });

      element.addEventListener('pointermove', event => {
        if (!pointer || event.pointerId !== pointer.id) return;
        if (pointer.mode === 'orbit') {
          stage.orbit(event.clientX - pointer.x, event.clientY - pointer.y);
          pointer.x = event.clientX;
          pointer.y = event.clientY;
          return;
        }
        if (!queuedStroke && phase !== 'active') return;
        const hit = hitFoil(event.clientX, event.clientY, true);
        if (!hit) return;
        if (queuedStroke) queuedStroke.hits.push(hit);
        else scratch(hit, true);
      });

      function endPointer(event) {
        if (!pointer || event.pointerId !== pointer.id) return;
        const wasScratch = pointer.mode === 'scratch';
        releasePointer(pointer.id);
        if (wasScratch) {
          if (queuedStroke) queuedStroke.ended = true;
          else endStroke();
        }
      }

      element.addEventListener('pointerup', endPointer);
      element.addEventListener('pointercancel', endPointer);
      element.addEventListener('lostpointercapture', endPointer);
      element.addEventListener('click', event => {
        if (event.detail === 0 && (phase === 'idle' || phase === 'result')) host.draw();
      });
      glCanvas.addEventListener('webglcontextlost', () => {
        timeline.cancel();
        clearShavings();
        host.fail('刮刮乐动画已中断，请重新打开这一页。');
        cancelReveal();
      });

      drawScene();
      return { reveal, show, revealing: () => pending != null || queuedStroke != null };
    },
  });
})();

}

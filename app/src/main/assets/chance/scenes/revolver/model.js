/* Static tabletop showpiece and two-sided plaque from design/explorations/revolver-3d-assets.html. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const SEAT_COUNT = 6;
  const SEAT_RADIUS = 0.156;
  const SEAT_STEP = TAU / SEAT_COUNT;
  const { clamp } = EonAnim;
  const lerp = (a, b, t) => a + (b - a) * t;

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const normalize = a => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };

  function pushTri(out, p0, p1, p2, n, uv0, uv1, uv2, flag = 0) {
    const cr = cross(sub(p1, p0), sub(p2, p0));
    if (dot(cr, n) < 0) {
      out.push(
        p0[0], p0[1], p0[2], n[0], n[1], n[2], uv0[0], uv0[1], flag,
        p2[0], p2[1], p2[2], n[0], n[1], n[2], uv2[0], uv2[1], flag,
        p1[0], p1[1], p1[2], n[0], n[1], n[2], uv1[0], uv1[1], flag
      );
    } else {
      out.push(
        p0[0], p0[1], p0[2], n[0], n[1], n[2], uv0[0], uv0[1], flag,
        p1[0], p1[1], p1[2], n[0], n[1], n[2], uv1[0], uv1[1], flag,
        p2[0], p2[1], p2[2], n[0], n[1], n[2], uv2[0], uv2[1], flag
      );
    }
  }

  function pushTriSmooth(out, p0, p1, p2, n0, n1, n2, uv0, uv1, uv2, f0, f1, f2) {
    const avgN = add(add(n0, n1), n2);
    const cr = cross(sub(p1, p0), sub(p2, p0));
    if (dot(cr, avgN) < 0) {
      out.push(
        p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], uv0[0], uv0[1], f0,
        p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], uv2[0], uv2[1], f2,
        p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], uv1[0], uv1[1], f1
      );
    } else {
      out.push(
        p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], uv0[0], uv0[1], f0,
        p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], uv1[0], uv1[1], f1,
        p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], uv2[0], uv2[1], f2
      );
    }
  }

  function pushQuad(out, p0, p1, p2, p3, n, uv0, uv1, uv2, uv3, flag = 0) {
    pushTri(out, p0, p1, p2, n, uv0, uv1, uv2, flag);
    pushTri(out, p0, p2, p3, n, uv0, uv2, uv3, flag);
  }

  function pushQuadSmooth(out, p0, p1, p2, p3, n0, n1, n2, n3, uv0, uv1, uv2, uv3, f0, f1, f2, f3) {
    pushTriSmooth(out, p0, p1, p2, n0, n1, n2, uv0, uv1, uv2, f0, f1, f2);
    pushTriSmooth(out, p0, p2, p3, n0, n2, n3, uv0, uv2, uv3, f0, f2, f3);
  }

  function appendBeveledBox(out, x0, x1, y0, y1, z0, z1, bevel = 0.015, flag = 0) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const b = Math.min(bevel, dx * 0.28, dy * 0.28, dz * 0.28);
    if (b <= 1e-5) {
      pushQuad(out, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
      return;
    }
    const xi0 = x0 + b, xi1 = x1 - b, yi0 = y0 + b, yi1 = y1 - b, zi0 = z0 + b, zi1 = z1 - b;
    pushQuad(out, [xi0, yi0, z1], [xi1, yi0, z1], [xi1, yi1, z1], [xi0, yi1, z1], [0, 0, 1], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi1, yi0, z0], [xi0, yi0, z0], [xi0, yi1, z0], [xi1, yi1, z0], [0, 0, -1], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [x1, yi0, zi1], [x1, yi0, zi0], [x1, yi1, zi0], [x1, yi1, zi1], [1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [x0, yi0, zi0], [x0, yi0, zi1], [x0, yi1, zi1], [x0, yi1, zi0], [-1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi0, y1, zi1], [xi1, y1, zi1], [xi1, y1, zi0], [xi0, y1, zi0], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi0, y0, zi0], [xi1, y0, zi0], [xi1, y0, zi1], [xi0, y0, zi1], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    const s2 = Math.SQRT1_2;
    pushQuad(out, [xi1, yi1, z1], [x1, yi1, zi1], [x1, yi0, zi1], [xi1, yi0, z1], [s2, 0, s2], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [x0, yi1, zi1], [xi0, yi1, z1], [xi0, yi0, z1], [x0, yi0, zi1], [-s2, 0, s2], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [x1, yi1, zi0], [xi1, yi1, z0], [xi1, yi0, z0], [x1, yi0, zi0], [s2, 0, -s2], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi0, yi1, z0], [x0, yi1, zi0], [x0, yi0, zi0], [xi0, yi0, z0], [-s2, 0, -s2], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi0, yi1, z1], [xi1, yi1, z1], [xi1, y1, zi1], [xi0, y1, zi1], [0, s2, s2], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi0, y0, zi1], [xi1, y0, zi1], [xi1, yi0, z1], [xi0, yi0, z1], [0, -s2, s2], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi1, yi1, z0], [xi0, yi1, z0], [xi0, y1, zi0], [xi1, y1, zi0], [0, s2, -s2], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi1, y0, zi0], [xi0, y0, zi0], [xi0, yi0, z0], [xi1, yi0, z0], [0, -s2, -s2], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi1, y1, zi1], [x1, yi1, zi1], [x1, yi1, zi0], [xi1, y1, zi0], [s2, s2, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [x0, yi1, zi1], [xi0, y1, zi1], [xi0, y1, zi0], [x0, yi1, zi0], [-s2, s2, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [x1, yi0, zi1], [xi1, y0, zi1], [xi1, y0, zi0], [x1, yi0, zi0], [s2, -s2, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    pushQuad(out, [xi0, y0, zi1], [x0, yi0, zi1], [x0, yi0, zi0], [xi0, y0, zi0], [-s2, -s2, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = sx > 0 ? [x1, xi1] : [x0, xi0];
          const py = sy > 0 ? [y1, yi1] : [y0, yi0];
          const pz = sz > 0 ? [z1, zi1] : [z0, zi0];
          pushTri(out, [px[0], py[1], pz[1]], [px[1], py[0], pz[1]], [px[1], py[1], pz[0]], normalize([sx, sy, sz]), [0, 0], [1, 0], [0.5, 1], flag);
        }
      }
    }
  }

  function signedArea2D(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s * 0.5;
  }

  function pointInTri2D(p, a, b, c) {
    const c1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const c2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
    const c3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
    return c1 >= -1e-6 && c2 >= -1e-6 && c3 >= -1e-6;
  }

  function triangulateCCW(poly) {
    const idx = poly.map((_, i) => i);
    const tris = [];
    let guard = 0;
    while (idx.length > 3 && guard++ < poly.length * poly.length) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length];
        const ib = idx[i];
        const ic = idx[(i + 1) % idx.length];
        const a = poly[ia], b = poly[ib], c = poly[ic];
        if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-6) continue;
        let hasInside = false;
        for (let k = 0; k < idx.length; k++) {
          const id = idx[k];
          if (id === ia || id === ib || id === ic) continue;
          if (pointInTri2D(poly[id], a, b, c)) { hasInside = true; break; }
        }
        if (!hasInside) {
          tris.push([ia, ib, ic]);
          idx.splice(i, 1);
          clipped = true;
          break;
        }
      }
      if (!clipped) break;
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return tris;
  }

  function appendExtrudedXY(out, rawPoly, z0, z1, bevel = 0.015, flag = 0) {
    const poly = signedArea2D(rawPoly) >= 0 ? rawPoly.slice() : rawPoly.slice().reverse();
    const N = poly.length;
    const b = Math.min(bevel, (z1 - z0) * 0.36);
    const zF = z1, zFB = z1 - b, zBB = z0 + b, zB = z0;

    const inner = poly.map((_, i) => {
      const pPrev = poly[(i + N - 1) % N], pCurr = poly[i], pNext = poly[(i + 1) % N];
      const e1 = normalize([pCurr[0] - pPrev[0], pCurr[1] - pPrev[1]]);
      const e2 = normalize([pNext[0] - pCurr[0], pNext[1] - pCurr[1]]);
      const nIn1 = [-e1[1], e1[0]];
      const nIn2 = [-e2[1], e2[0]];
      const bis = add([nIn1[0], nIn1[1], 0], [nIn2[0], nIn2[1], 0]);
      const bl = Math.hypot(bis[0], bis[1]) || 1;
      const d = Math.min(b * 0.72, 0.022);
      return [pCurr[0] + (bis[0] / bl) * d, pCurr[1] + (bis[1] / bl) * d];
    });

    const tris = triangulateCCW(inner);
    for (const [ia, ib, ic] of tris) {
      const a = inner[ia], bPt = inner[ib], c = inner[ic];
      pushTri(out, [a[0], a[1], zF], [bPt[0], bPt[1], zF], [c[0], c[1], zF], [0, 0, 1], [0, 0], [1, 0], [0.5, 1], flag);
      pushTri(out, [c[0], c[1], zB], [bPt[0], bPt[1], zB], [a[0], a[1], zB], [0, 0, -1], [0, 0], [1, 0], [0.5, 1], flag);
    }

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const o0 = poly[i], o1 = poly[j];
      const i0 = inner[i], i1 = inner[j];
      const ex = o1[0] - o0[0], ey = o1[1] - o0[1];
      const ns = normalize([ey, -ex, 0]);
      const nf = normalize([ns[0] * 0.68, ns[1] * 0.68, 0.73]);
      const nb = normalize([ns[0] * 0.68, ns[1] * 0.68, -0.73]);

      pushQuad(out, [o0[0], o0[1], zFB], [o1[0], o1[1], zFB], [i1[0], i1[1], zF], [i0[0], i0[1], zF], nf, [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, [o0[0], o0[1], zBB], [o1[0], o1[1], zBB], [o1[0], o1[1], zFB], [o0[0], o0[1], zFB], ns, [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, [i0[0], i0[1], zB], [i1[0], i1[1], zB], [o1[0], o1[1], zBB], [o0[0], o0[1], zBB], nb, [0, 0], [1, 0], [1, 1], [0, 1], flag);
    }
  }

  function appendCurvedTube(out, spinePts, closed, halfW, halfZ, flag = 0) {
    const c = 0.55;
    const profile = [
      [halfW, halfZ * c], [halfW * c, halfZ], [-halfW * c, halfZ], [-halfW, halfZ * c],
      [-halfW, -halfZ * c], [-halfW * c, -halfZ], [halfW * c, -halfZ], [halfW, -halfZ * c],
    ];
    const P = profile.length, S = spinePts.length;
    const rings = [];
    for (let i = 0; i < S; i++) {
      const pPrev = spinePts[closed ? (i + S - 1) % S : Math.max(0, i - 1)];
      const pNext = spinePts[closed ? (i + 1) % S : Math.min(S - 1, i + 1)];
      const tx = pNext[0] - pPrev[0], ty = pNext[1] - pPrev[1];
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const ring = [];
      for (let j = 0; j < P; j++) {
        const [u, v] = profile[j];
        ring.push({
          p: [spinePts[i][0] + nx * u, spinePts[i][1] + ny * u, v],
          n: normalize([nx * u, ny * u, v]),
          uv: [j / P, i / Math.max(1, S - 1)],
        });
      }
      rings.push(ring);
    }
    const segCount = closed ? S : S - 1;
    for (let i = 0; i < segCount; i++) {
      const r0 = rings[i], r1 = rings[(i + 1) % S];
      for (let j = 0; j < P; j++) {
        const jn = (j + 1) % P;
        const a = r0[j], b = r0[jn], cPt = r1[jn], d = r1[j];
        pushQuadSmooth(out, a.p, b.p, cPt.p, d.p, a.n, b.n, cPt.n, d.n, a.uv, b.uv, cPt.uv, d.uv, flag, flag, flag, flag);
      }
    }
    if (!closed) {
      const rStart = rings[0], rEnd = rings[S - 1];
      const tStart = normalize([spinePts[0][0] - spinePts[1][0], spinePts[0][1] - spinePts[1][1], 0]);
      const tEnd = normalize([spinePts[S - 1][0] - spinePts[S - 2][0], spinePts[S - 1][1] - spinePts[S - 2][1], 0]);
      for (let j = 0; j < P; j++) {
        const jn = (j + 1) % P;
        pushTri(out, [spinePts[0][0], spinePts[0][1], 0], rStart[j].p, rStart[jn].p, tStart, [0.5, 0.5], [0, 0], [1, 0], flag);
        pushTri(out, [spinePts[S - 1][0], spinePts[S - 1][1], 0], rEnd[j].p, rEnd[jn].p, tEnd, [0.5, 0.5], [0, 0], [1, 0], flag);
      }
    }
  }

  function appendLatheX(out, rings, segs, offset = [0, 0, 0]) {
    const runs = [];
    let current = [rings[0]];
    for (let i = 1; i < rings.length; i++) {
      current.push(rings[i]);
      if (rings[i].sharp && i < rings.length - 1) {
        runs.push(current);
        current = [rings[i]];
      }
    }
    runs.push(current);

    for (const prof of runs) {
      const segNorms = [];
      for (let i = 0; i < prof.length - 1; i++) {
        const dx = prof[i + 1].x - prof[i].x;
        const dr = prof[i + 1].r - prof[i].r;
        const l = Math.hypot(dx, dr) || 1;
        segNorms.push([-dr / l, dx / l]);
      }
      const pNorms = prof.map((_, i) => {
        const a = segNorms[Math.max(0, i - 1)];
        const b = segNorms[Math.min(segNorms.length - 1, i)];
        const nx = a[0] + b[0], nr = a[1] + b[1];
        const l = Math.hypot(nx, nr) || 1;
        return [nx / l, nr / l];
      });

      const vert = (j, s) => {
        const t = (s / segs) * TAU;
        const rr = prof[j].r;
        const ny = Math.cos(t), nz = Math.sin(t);
        const [nx, nr] = pNorms[j];
        const n = normalize([nx, nr * ny, nr * nz]);
        return {
          p: [prof[j].x + offset[0], rr * ny + offset[1], rr * nz + offset[2]],
          n,
          uv: [s / segs, (prof[j].x + 1) * 0.5],
          f: prof[j].flag,
        };
      };

      for (let s = 0; s < segs; s++) {
        for (let j = 0; j < prof.length - 1; j++) {
          const a = vert(j, s), b = vert(j, s + 1), c = vert(j + 1, s + 1), d = vert(j + 1, s);
          if (prof[j].r > 1e-4 || prof[j + 1].r > 1e-4) {
            pushQuadSmooth(out, a.p, b.p, c.p, d.p, a.n, b.n, c.n, d.n, a.uv, b.uv, c.uv, d.uv, a.f, b.f, c.f, d.f);
          }
        }
      }
    }
  }

  function buildLoftedGrip() {
    const out = [];
    const stations = [
      { cx: -0.41, cy: -0.14, rx: 0.155, rz: 0.135, tilt: -0.18 },
      { cx: -0.45, cy: -0.22, rx: 0.170, rz: 0.146, tilt: -0.32 },
      { cx: -0.50, cy: -0.32, rx: 0.184, rz: 0.156, tilt: -0.41 },
      { cx: -0.55, cy: -0.42, rx: 0.194, rz: 0.164, tilt: -0.45 },
      { cx: -0.61, cy: -0.53, rx: 0.204, rz: 0.168, tilt: -0.47 },
      { cx: -0.66, cy: -0.63, rx: 0.212, rz: 0.172, tilt: -0.47 },
      { cx: -0.72, cy: -0.74, rx: 0.218, rz: 0.172, tilt: -0.45 },
      { cx: -0.77, cy: -0.84, rx: 0.222, rz: 0.170, tilt: -0.43 },
      { cx: -0.82, cy: -0.93, rx: 0.222, rz: 0.166, tilt: -0.40 },
      { cx: -0.86, cy: -1.00, rx: 0.210, rz: 0.155, tilt: -0.38 },
      { cx: -0.89, cy: -1.05, rx: 0.180, rz: 0.135, tilt: -0.36 },
      { cx: -0.90, cy: -1.08, rx: 0.125, rz: 0.095, tilt: -0.35 },
    ];
    const segs = 30;
    const pExp = 2.4;
    const superCos = a => Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 2 / pExp);
    const superSin = a => Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 2 / pExp);

    const rings = [];
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      const ct = Math.cos(st.tilt), sn = Math.sin(st.tilt);
      const ring = [];
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * TAU - Math.PI;
        const lx = st.rx * superCos(a);
        const lz = st.rz * superSin(a);
        const px = st.cx + lx * ct;
        const py = st.cy + lx * sn;
        const pz = lz;
        const sideU = ((Math.atan2(lz / st.rz, lx / st.rx) + Math.PI) / TAU);
        const v = 1 - i / (stations.length - 1);
        ring.push({ p: [px, py, pz], uv: [sideU, v] });
      }
      rings.push(ring);
    }

    const vNorm = (i, s) => {
      const st = stations[i];
      const p = rings[i][s].p;
      const pPrev = i > 0 ? rings[i - 1][s].p : p;
      const pNext = i < stations.length - 1 ? rings[i + 1][s].p : p;
      const tDown = sub(pNext, pPrev);
      const sPrev = (s + segs - 1) % segs;
      const sNext = (s + 1) % segs;
      const tRing = sub(rings[i][sNext].p, rings[i][sPrev].p);
      let n = cross(tDown, tRing);
      const outHint = [p[0] - st.cx, p[1] - st.cy, p[2]];
      if (dot(n, outHint) < 0) n = scale(n, -1);
      return normalize(n);
    };

    for (let i = 0; i < stations.length - 1; i++) {
      for (let s = 0; s < segs; s++) {
        const a = rings[i][s], b = rings[i][s + 1];
        const c = rings[i + 1][s + 1], d = rings[i + 1][s];
        const na = vNorm(i, s), nb = vNorm(i, s + 1);
        const nc = vNorm(i + 1, s + 1), nd = vNorm(i + 1, s);
        pushQuadSmooth(out, a.p, b.p, c.p, d.p, na, nb, nc, nd, a.uv, b.uv, c.uv, d.uv, 0, 0, 0, 0);
      }
    }

    const bot = stations[stations.length - 1];
    const botCenter = [bot.cx - 0.01, bot.cy - 0.01, 0];
    const topSt = stations[0];
    const topCenter = [topSt.cx, topSt.cy, 0];
    for (let s = 0; s < segs; s++) {
      pushTri(out, botCenter, rings[stations.length - 1][s].p, rings[stations.length - 1][s + 1].p, [-0.35, -0.94, 0], [0.5, 0.5], [0, 0], [1, 0], 2);
      pushTri(out, topCenter, rings[0][s + 1].p, rings[0][s].p, [0.2, 0.98, 0], [0.5, 0.5], [0, 0], [1, 0], 0);
    }

    return new Float32Array(out);
  }

  function buildTopGeo() {
    const out = [];
    appendLatheX(out, [
      { x: 0.31, r: 0.114, flag: 0 },
      { x: 0.35, r: 0.126, flag: 0, sharp: true },
      { x: 0.42, r: 0.126, flag: 0, sharp: true },
      { x: 0.45, r: 0.114, flag: 0 },
      { x: 1.32, r: 0.104, flag: 0, sharp: true },
      { x: 1.36, r: 0.092, flag: 0, sharp: true },
      { x: 1.36, r: 0.001, flag: 0 },
    ], 36, [0, 0.156, 0]);

    appendExtrudedXY(out, [
      [0.32, -0.075],
      [1.14, -0.055],
      [1.26, -0.005],
      [1.30, 0.06],
      [1.30, 0.14],
      [0.32, 0.16],
    ], -0.082, 0.082, 0.032, 0);

    appendLatheX(out, [
      { x: 0.33, r: 0.001, flag: 2 },
      { x: 0.33, r: 0.028, flag: 2, sharp: true },
      { x: 1.16, r: 0.028, flag: 2, sharp: true },
      { x: 1.18, r: 0.044, flag: 2 },
      { x: 1.24, r: 0.044, flag: 2, sharp: true },
      { x: 1.26, r: 0.030, flag: 2 },
      { x: 1.27, r: 0.001, flag: 2 },
    ], 24, [0, -0.020, 0]);

    appendExtrudedXY(out, [
      [0.32, 0.235],
      [1.32, 0.228],
      [1.30, 0.285],
      [1.24, 0.375],
      [1.17, 0.375],
      [1.04, 0.280],
      [0.32, 0.295],
    ], -0.042, 0.042, 0.012, 0);
    appendExtrudedXY(out, [
      [1.18, 0.305], [1.24, 0.305], [1.24, 0.380], [1.18, 0.380],
    ], -0.018, 0.018, 0.005, 2);

    return new Float32Array(out);
  }

  function buildBodyGeo() {
    const out = [];
    appendExtrudedXY(out, [
      [-0.48, 0.22],
      [-0.30, 0.268],
      [0.34, 0.268],
      [0.34, 0.322],
      [-0.31, 0.342],
      [-0.44, 0.352],
      [-0.50, 0.318],
    ], -0.092, 0.092, 0.020, 0);

    // Compact frame + shorter metal grip tang matching the trimmer grip (-0.87, -1.02)
    appendExtrudedXY(out, [
      [-0.34, -0.325],
      [0.33, -0.318],
      [0.36, -0.260],
      [0.35, 0.11],
      [0.29, 0.11],
      [0.29, -0.265],
      [-0.30, -0.265],
      [-0.31, 0.285],
      [-0.46, 0.285],
      [-0.54, 0.04],
      [-0.51, -0.14],
      [-0.60, -0.40],
      [-0.74, -0.72],
      [-0.87, -1.00],
      [-0.81, -1.03],
      [-0.68, -0.78],
      [-0.54, -0.48],
      [-0.43, -0.325],
    ], -0.092, 0.092, 0.024, 0);

    appendLatheX(out, [
      { x: -0.43, r: 0.001, flag: 0 },
      { x: -0.43, r: 0.24, flag: 0 },
      { x: -0.39, r: 0.280, flag: 0, sharp: true },
      { x: -0.32, r: 0.280, flag: 0, sharp: true },
      { x: -0.305, r: 0.262, flag: 0, sharp: true },
      { x: -0.305, r: 0.001, flag: 0 },
    ], 36, [0, 0, 0]);

    const guardSpine = [];
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI + (i / 18) * Math.PI;
      guardSpine.push([-0.10 + 0.23 * Math.cos(a), -0.30 + 0.27 * Math.sin(a)]);
    }
    appendCurvedTube(out, guardSpine, false, 0.028, 0.042, 0);

    appendCurvedTube(out, [
      [-0.09, -0.29],
      [-0.12, -0.36],
      [-0.15, -0.44],
      [-0.13, -0.51],
      [-0.08, -0.54],
    ], false, 0.019, 0.022, 2);

    appendBeveledBox(out, -0.44, -0.30, 0.01, 0.09, -0.148, -0.09, 0.012, 2);
    for (const [sx, sy] of [[-0.36, -0.16], [-0.20, -0.28], [-0.42, -0.26]]) {
      appendBeveledBox(out, sx - 0.024, sx + 0.024, sy - 0.024, sy + 0.024, -0.112, 0.112, 0.007, 2);
    }

    return new Float32Array(out);
  }

  function buildOrnamentGeo() {
    const out = [];
    appendExtrudedXY(out, [
      [-0.05, -0.06],
      [0.06, -0.04],
      [0.11, 0.04],
      [0.04, 0.13],
      [-0.07, 0.19],
      [-0.22, 0.25],
      [-0.26, 0.20],
      [-0.18, 0.15],
      [-0.08, 0.08],
    ], -0.038, 0.038, 0.012, 2);
    return new Float32Array(out);
  }

  function buildPlaqueStandGeo() {
    const out = [];
    appendBeveledBox(out, -0.94, 0.94, 0.0, 0.12, -0.42, 0.42, 0.028, 3);
    appendBeveledBox(out, -0.88, -0.76, 0.10, 1.24, -0.075, 0.075, 0.018, 0);
    appendBeveledBox(out, 0.76, 0.88, 0.10, 1.24, -0.075, 0.075, 0.018, 0);
    appendBeveledBox(out, -0.92, -0.71, 1.06, 1.18, -0.092, 0.092, 0.015, 2);
    appendBeveledBox(out, 0.71, 0.92, 1.06, 1.18, -0.092, 0.092, 0.015, 2);
    return new Float32Array(out);
  }

  function buildPlaqueGeo() {
    const out = [];
    const hw = 0.72, hh = 0.74, hd = 0.052;
    pushQuad(out, [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd], [0, 0, 1], [0.004, 0], [0.496, 0], [0.496, 1], [0.004, 1], 0);
    pushQuad(out, [hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd], [0, 0, -1], [0.996, 1], [0.504, 1], [0.504, 0], [0.996, 0], 0);
    pushQuad(out, [-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 2);
    pushQuad(out, [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1], 2);
    pushQuad(out, [hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd], [1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], 2);
    pushQuad(out, [-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd], [-1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], 2);
    return new Float32Array(out);
  }

  function makeCherryTexture(palette) {
    const W = 512, H = 512;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, palette.light);
    grad.addColorStop(0.5, palette.mid);
    grad.addColorStop(1, palette.dark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 42; i++) {
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(28, 16, 10, 0.14)' : 'rgba(180, 128, 86, 0.08)';
      ctx.lineWidth = 2 + (i % 4);
      const x0 = (i / 42) * W;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(x0 + Math.sin(i) * 26, H * 0.35, x0 - Math.cos(i) * 26, H * 0.7, x0, H);
      ctx.stroke();
    }

    const drawCheckeredPanel = (cx) => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx - 54, 118, 108, 286, 26);
      ctx.clip();

      ctx.fillStyle = 'rgba(22, 12, 7, 0.25)';
      ctx.fillRect(cx - 58, 114, 116, 294);

      ctx.strokeStyle = 'rgba(18, 9, 4, 0.56)';
      ctx.lineWidth = 2.6;
      for (let d = -360; d <= 360; d += 14) {
        ctx.beginPath();
        ctx.moveTo(cx - 68, 100 + d);
        ctx.lineTo(cx + 68, 236 + d);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + 68, 100 + d);
        ctx.lineTo(cx - 68, 236 + d);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = 'rgba(30, 16, 8, 0.52)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(cx - 54, 118, 108, 286, 26);
      ctx.stroke();

      ctx.fillStyle = palette.medallion;
      ctx.beginPath();
      ctx.arc(cx, 74, 18, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(42, 28, 12, 0.65)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 244, 210, 0.45)';
      ctx.beginPath();
      ctx.arc(cx - 5, 69, 5, 0, TAU);
      ctx.fill();
    };

    drawCheckeredPanel(Math.round(W * 0.25));
    drawCheckeredPanel(Math.round(W * 0.75));
    return c;
  }

  function makePlaqueTexture(hits = 0) {
    const W = 1024, H = 512;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const bg = ctx.createLinearGradient(0, 0, 512, H);
    bg.addColorStop(0, '#f7f5ee');
    bg.addColorStop(1, '#eae7dc');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, H);

    ctx.strokeStyle = '#365b43';
    ctx.lineWidth = 11;
    ctx.strokeRect(24, 24, 512 - 48, H - 48);
    ctx.strokeStyle = 'rgba(141, 154, 103, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(38, 38, 512 - 76, H - 76);

    ctx.fillStyle = '#b99d5e';
    for (const [rx, ry] of [[58, 58], [454, 58], [58, 454], [454, 454]]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 8, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = '#7c886b';
    ctx.font = '600 28px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('借口 № 01', 256, 98);

    ctx.fillStyle = 'rgba(141, 154, 103, 0.45)';
    ctx.fillRect(256 - 72, 134, 144, 3);

    ctx.fillStyle = '#28392f';
    ctx.font = '700 84px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('今天太累了', 256, 232);

    ctx.fillStyle = '#536052';
    ctx.font = '500 35px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('只想瘫在沙发上', 256, 322);

    ctx.fillStyle = '#8d9a67';
    for (const [dx, dy] of [[0, -7], [-10, 7], [10, 7]]) {
      ctx.beginPath();
      ctx.arc(256 + dx, 424 + dy, 5, 0, TAU);
      ctx.fill();
    }

    for (let i = 0; i < hits; i++) {
      const x = i % 2 === 0 ? 400 - i * 6 : 111 + i * 6;
      const y = 171 + i * 52;
      const halo = ctx.createRadialGradient(x, y, 3, x, y, 55);
      halo.addColorStop(0, '#6b442bad');
      halo.addColorStop(1, '#6b442b00');
      ctx.fillStyle = halo;
      ctx.fillRect(x - 55, y - 55, 110, 110);
      ctx.strokeStyle = '#a66d43';
      ctx.lineWidth = 3;
      for (let j = 0; j < 6; j++) {
        const angle = j * TAU / 6 + 0.2 + i;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(x + dx * 9, y + dy * 9);
        ctx.lineTo(x + dx * 20 - dy * 5, y + dy * 20 + dx * 5);
        ctx.lineTo(x + dx * (30 + j * 3), y + dy * (30 + j * 3));
        ctx.stroke();
      }
    }

    const gBg = ctx.createLinearGradient(512, 0, 1024, H);
    gBg.addColorStop(0, '#3a6249');
    gBg.addColorStop(1, '#2a4a36');
    ctx.fillStyle = gBg;
    ctx.fillRect(512, 0, 512, H);

    ctx.strokeStyle = '#c8be82';
    ctx.lineWidth = 11;
    ctx.strokeRect(512 + 24, 24, 512 - 48, H - 48);
    ctx.strokeStyle = 'rgba(200, 190, 130, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(512 + 38, 38, 512 - 76, H - 76);

    ctx.fillStyle = '#c8be82';
    for (const [rx, ry] of [[512 + 58, 58], [1024 - 58, 58], [512 + 58, 454], [1024 - 58, 454]]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 8, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = '#c8be82';
    ctx.font = '600 30px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('借口作废', 768, 92);

    ctx.fillStyle = '#fafbf5';
    ctx.font = '700 186px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
    ctx.fillText('练', 768, 242);

    ctx.fillStyle = 'rgba(200, 190, 130, 0.45)';
    ctx.fillRect(768 - 102, 354, 204, 3);

    ctx.fillStyle = '#eff2e4';
    ctx.font = '600 35px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('走吧，练一点。', 768, 408);

    return c;
  }

  const finish = {
    body: {
      color: [0.24, 0.29, 0.35], accent: [0.78, 0.64, 0.36], trim: [0.52, 0.34, 0.22], cavity: [0.05, 0.07, 0.09],
      matMeta: [0.82, 0.90, 0.82], matRough: [0.24, 0.22, 0.24],
    },
    roller: {
      color: [0.74, 0.77, 0.78], accent: [0.78, 0.81, 0.82], trim: [0.74, 0.77, 0.78], cavity: [0.05, 0.06, 0.07],
      matMeta: [0.90, 0.90, 0.90], matRough: [0.20, 0.20, 0.20],
    },
    token: {
      color: [0.88, 0.64, 0.24], accent: [1.00, 0.83, 0.41], trim: [0.64, 0.37, 0.10],
      matMeta: [0.74, 0.63, 0.72], matRough: [0.24, 0.28, 0.30],
    },
    wood: { light: '#8a4e2e', mid: '#6c391e', dark: '#4a2412', medallion: '#d8b766' },
    plaqueStand: { color: [0.25, 0.30, 0.35], accent: [0.78, 0.64, 0.36], trim: [0.87, 0.85, 0.79], matMeta: [0.60, 0.86, 0.20], matRough: [0.34, 0.24, 0.52] },
  };

  function seatPosition(slot) {
    const a = slot * SEAT_STEP;
    return [0, SEAT_RADIUS * Math.cos(a), SEAT_RADIUS * Math.sin(a)];
  }

  function buildRollerGeo() {
    const out = [];
    const faceX = -0.30;
    const faceRadius = 0.238;
    const sectors = 96;
    const circle = (x, radius, angle) => [x, radius * Math.cos(angle), radius * Math.sin(angle)];
    const rim = [
      [faceX, faceRadius, 0], [-0.27, 0.255, 0], [-0.20, 0.255, 0.013],
      [-0.12, 0.255, 0.038], [0.12, 0.255, 0.038], [0.20, 0.255, 0.013],
      [0.27, 0.255, 0], [0.30, faceRadius, 0],
    ];
    const surface = rim.map(([x, radius, depth]) => Array.from({ length: sectors + 1 }, (_, i) => {
      const angle = i * TAU / sectors;
      const dip = depth * Math.pow(0.5 - 0.5 * Math.cos(angle * SEAT_COUNT), 4);
      return circle(x, radius - dip, angle);
    }));
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let ring = 0; ring < surface.length - 1; ring++) {
      for (let i = 0; i < sectors; i++) {
        const a = surface[ring][i], b = surface[ring][i + 1];
        const c = surface[ring + 1][i + 1], d = surface[ring + 1][i];
        const normal = cross(sub(d, a), sub(b, a));
        const at = p => normalize(dot(normal, [0, p[1], p[2]]) < 0 ? scale(normal, -1) : normal);
        pushQuadSmooth(out, a, b, c, d, at(a), at(b), at(c), at(d), ...uv, 0, 0, 0, 0);
      }
    }

    // Each sector of the end face is tessellated around a recessed model seat.
    const halfSector = Math.tan(SEAT_STEP / 2);
    const samples = 40;
    const floorX = faceX + 0.13;
    for (let slot = 0; slot < SEAT_COUNT; slot++) {
      const [_, cy, cz] = seatPosition(slot);
      const point = (x, y, z) => [x, (y * cy - z * cz) / SEAT_RADIUS, (y * cz + z * cy) / SEAT_RADIUS];
      const ring = Array.from({ length: samples + 1 }, (_, i) => {
        const phi = i * TAU / samples;
        const dy = Math.cos(phi), dz = Math.sin(phi);
        const b = SEAT_RADIUS * dy;
        const circleHit = -b + Math.sqrt(b * b + faceRadius * faceRadius - SEAT_RADIUS * SEAT_RADIUS);
        const sectorSlope = Math.abs(dz) - halfSector * dy;
        const sectorHit = sectorSlope > 0 ? halfSector * SEAT_RADIUS / sectorSlope : Infinity;
        const edge = Math.min(circleHit, sectorHit);
        return {
          outer: point(faceX, SEAT_RADIUS + edge * dy, edge * dz),
          lip: point(faceX, SEAT_RADIUS + 0.067 * dy, 0.067 * dz),
          inside: point(faceX + 0.018, SEAT_RADIUS + 0.058 * dy, 0.058 * dz),
          floor: point(floorX, SEAT_RADIUS + 0.054 * dy, 0.054 * dz),
          inward: normalize(point(0, -dy, -dz)),
        };
      });
      for (let i = 0; i < samples; i++) {
        const a = ring[i], b = ring[i + 1];
        pushQuad(out, a.outer, b.outer, b.lip, a.lip, [-1, 0, 0], ...uv);
        const beveled = n => normalize([-1, n[1], n[2]]);
        pushQuadSmooth(out, a.lip, b.lip, b.inside, a.inside,
          beveled(a.inward), beveled(b.inward), b.inward, a.inward, ...uv, 0, 0, 0, 0);
        pushQuadSmooth(out, a.inside, b.inside, b.floor, a.floor,
          a.inward, b.inward, b.inward, a.inward, ...uv, 1, 1, 1, 1);
        pushTri(out, a.floor, b.floor, [floorX, cy, cz], [-1, 0, 0], ...uv.slice(0, 3), 1);
      }
    }

    appendLatheX(out, [
      { x: faceX - 0.046, r: 0, flag: 2 },
      { x: faceX - 0.046, r: 0.040, flag: 2, sharp: true },
      { x: faceX, r: 0.054, flag: 2 },
    ], 36);
    appendLatheX(out, [
      { x: 0.30, r: faceRadius, flag: 0, sharp: true },
      { x: 0.30, r: 0.058, flag: 0, sharp: true },
      { x: 0.315, r: 0.035, flag: 2, sharp: true },
      { x: 0.315, r: 0, flag: 2 },
    ], 48);
    return new Float32Array(out);
  }

  function buildTokenGeo() {
    const out = [];
    appendLatheX(out, [
      { x: -0.326, r: 0, flag: 3 },
      { x: -0.326, r: 0.037, flag: 0, sharp: true },
      { x: -0.324, r: 0.049, flag: 2, sharp: true },
      { x: -0.310, r: 0.063, flag: 2, sharp: true },
      { x: -0.290, r: 0.063, flag: 0, sharp: true },
      { x: -0.279, r: 0.051, flag: 3, sharp: true },
      { x: -0.213, r: 0.051, flag: 0, sharp: true },
      { x: -0.192, r: 0.037, flag: 2, sharp: true },
      { x: -0.192, r: 0, flag: 2 },
    ], 32);
    const x = -0.327;
    const uv = [[0, 0], [1, 0], [1, 1]];
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      const b = (i + 1) * TAU / 8;
      const outer = i % 2 === 0 ? 0.031 : 0.011;
      const inner = i % 2 === 0 ? 0.011 : 0.031;
      pushTri(out, [x, 0, 0], [x, outer * Math.cos(a), outer * Math.sin(a)],
        [x, inner * Math.cos(b), inner * Math.sin(b)], [-1, 0, 0], ...uv, 2);
    }
    return new Float32Array(out);
  }

  function build(studio) {
    const wood = studio.canvasTexture(makeCherryTexture(finish.wood));
    const plaqueTex = studio.canvasTexture(makePlaqueTexture());
    const tokenGeo = buildTokenGeo();
    return {
      body: [
        studio.addMesh(buildTopGeo(), finish.body),
        studio.addMesh(buildBodyGeo(), finish.body),
        studio.addMesh(buildLoftedGrip(), { ...finish.body, texture: wood, matMeta: [0.02, 0.9, 0.82] }),
      ],
      ornament: studio.addMesh(buildOrnamentGeo(), finish.body),
      roller: studio.addMesh(buildRollerGeo(), finish.roller),
      tokens: Array.from({ length: SEAT_COUNT }, () => studio.addMesh(tokenGeo, finish.token)),
      plaqueStand: studio.addMesh(buildPlaqueStandGeo(), finish.plaqueStand),
      plaque: studio.addMesh(buildPlaqueGeo(), {
        texture: plaqueTex, accent: [0.79, 0.75, 0.52], trim: [0.35, 0.42, 0.34],
        matMeta: [0, 0.70, 0.34], matRough: [0.7, 0.28, 0.45],
      }),
      markPlaque(hits) { studio.canvasTexture(makePlaqueTexture(hits), plaqueTex); },
    };
  }

  window.EonRevolverModel = { build, seatPosition, SEAT_COUNT, SEAT_STEP };
})();

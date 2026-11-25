// Synced from Android chance/scenes/slot/model.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window
  const { EonAnim } = window

;
/* Meshes and reel artwork from the retro green-enamel prototype in design/explorations/slot-3d-assets.html. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const { clamp } = EonAnim;

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

  function appendBeveledBox(out, x0, x1, y0, y1, z0, z1, bevel = 0.02, flag = 0) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const b = Math.min(bevel, dx * 0.28, dy * 0.28, dz * 0.28);
    const uvXY = p => [clamp((p[0] + 1.5) / 3.0, 0, 1), clamp(p[1] / 2.2, 0, 1)];
    const uvZY = p => [clamp((p[2] + 1.2) / 2.4, 0, 1), clamp(p[1] / 2.2, 0, 1)];
    const uvXZ = p => [clamp((p[0] + 1.5) / 3.0, 0, 1), clamp((p[2] + 1.2) / 2.4, 0, 1)];
    const pq = (a, bp, c, d, n, uvFn) => pushQuad(out, a, bp, c, d, n, uvFn(a), uvFn(bp), uvFn(c), uvFn(d), flag);

    if (b <= 1e-5) {
      pq([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uvXY);
      pq([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uvXY);
      pq([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uvZY);
      pq([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uvZY);
      pq([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], uvXZ);
      pq([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], uvXZ);
      return;
    }
    const xi0 = x0 + b, xi1 = x1 - b, yi0 = y0 + b, yi1 = y1 - b, zi0 = z0 + b, zi1 = z1 - b;
    pq([xi0, yi0, z1], [xi1, yi0, z1], [xi1, yi1, z1], [xi0, yi1, z1], [0, 0, 1], uvXY);
    pq([xi1, yi0, z0], [xi0, yi0, z0], [xi0, yi1, z0], [xi1, yi1, z0], [0, 0, -1], uvXY);
    pq([x1, yi0, zi1], [x1, yi0, zi0], [x1, yi1, zi0], [x1, yi1, zi1], [1, 0, 0], uvZY);
    pq([x0, yi0, zi0], [x0, yi0, zi1], [x0, yi1, zi1], [x0, yi1, zi0], [-1, 0, 0], uvZY);
    pq([xi0, y1, zi1], [xi1, y1, zi1], [xi1, y1, zi0], [xi0, y1, zi0], [0, 1, 0], uvXZ);
    pq([xi0, y0, zi0], [xi1, y0, zi0], [xi1, y0, zi1], [xi0, y0, zi1], [0, -1, 0], uvXZ);

    const s2 = Math.SQRT1_2;
    pq([xi1, yi1, z1], [x1, yi1, zi1], [x1, yi0, zi1], [xi1, yi0, z1], [s2, 0, s2], uvXY);
    pq([x0, yi1, zi1], [xi0, yi1, z1], [xi0, yi0, z1], [x0, yi0, zi1], [-s2, 0, s2], uvXY);
    pq([x1, yi1, zi0], [xi1, yi1, z0], [xi1, yi0, z0], [x1, yi0, zi0], [s2, 0, -s2], uvXY);
    pq([xi0, yi1, z0], [x0, yi1, zi0], [x0, yi0, zi0], [xi0, yi0, z0], [-s2, 0, -s2], uvXY);
    pq([xi0, yi1, z1], [xi1, yi1, z1], [xi1, y1, zi1], [xi0, y1, zi1], [0, s2, s2], uvXY);
    pq([xi0, y0, zi1], [xi1, y0, zi1], [xi1, yi0, z1], [xi0, yi0, z1], [0, -s2, s2], uvXY);
    pq([xi1, yi1, z0], [xi0, yi1, z0], [xi0, y1, zi0], [xi1, y1, zi0], [0, s2, -s2], uvXY);
    pq([xi1, y0, zi0], [xi0, y0, zi0], [xi0, yi0, z0], [xi1, yi0, z0], [0, -s2, -s2], uvXY);
    pq([xi1, y1, zi1], [x1, yi1, zi1], [x1, yi1, zi0], [xi1, y1, zi0], [s2, s2, 0], uvXZ);
    pq([x0, yi1, zi1], [xi0, y1, zi1], [xi0, y1, zi0], [x0, yi1, zi0], [-s2, s2, 0], uvXZ);
    pq([x1, yi0, zi1], [xi1, y0, zi1], [xi1, y0, zi0], [x1, yi0, zi0], [s2, -s2, 0], uvXZ);
    pq([xi0, y0, zi1], [x0, yi0, zi1], [x0, yi0, zi0], [xi0, y0, zi0], [-s2, -s2, 0], uvXZ);

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = sx > 0 ? [x1, xi1] : [x0, xi0];
          const py = sy > 0 ? [y1, yi1] : [y0, yi0];
          const pz = sz > 0 ? [z1, zi1] : [z0, zi0];
          const a = [px[0], py[1], pz[1]], bp = [px[1], py[0], pz[1]], c = [px[1], py[1], pz[0]];
          pushTri(out, a, bp, c, normalize([sx, sy, sz]), uvXY(a), uvXY(bp), uvXY(c), flag);
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

  function insetPoly2D(poly, d) {
    const N = poly.length;
    return poly.map((_, i) => {
      const pPrev = poly[(i + N - 1) % N], pCurr = poly[i], pNext = poly[(i + 1) % N];
      const e1 = normalize([pCurr[0] - pPrev[0], pCurr[1] - pPrev[1], 0]);
      const e2 = normalize([pNext[0] - pCurr[0], pNext[1] - pCurr[1], 0]);
      const nIn1 = [-e1[1], e1[0]];
      const nIn2 = [-e2[1], e2[0]];
      const bx = nIn1[0] + nIn2[0], by = nIn1[1] + nIn2[1];
      const bl = Math.hypot(bx, by) || 1;
      return [pCurr[0] + (bx / bl) * d, pCurr[1] + (by / bl) * d];
    });
  }

  /** Extrudes a 2D (z, y) profile along X from x0..x1 with crisp side bevels. */
  function appendExtrudedX(out, rawPolyZY, x0, x1, bevel = 0.024, flag = 0) {
    const poly = signedArea2D(rawPolyZY) >= 0 ? rawPolyZY.slice() : rawPolyZY.slice().reverse();
    const N = poly.length;
    const b = Math.min(bevel, (x1 - x0) * 0.36);
    const xR = x1, xRB = x1 - b, xLB = x0 + b, xL = x0;
    const inner = insetPoly2D(poly, Math.min(b * 0.78, 0.032));
    const tris = triangulateCCW(inner);
    const uvCap = pt => [clamp((pt[0] + 1.2) / 2.4, 0, 1), clamp(pt[1] / 2.4, 0, 1)];
    const uvSide = (x, pt) => [clamp((x + 1.5) / 3.0, 0, 1), clamp((pt[0] + pt[1] + 1.2) / 3.6, 0, 1)];

    for (const [ia, ib, ic] of tris) {
      const a = inner[ia], bp = inner[ib], c = inner[ic];
      pushTri(out, [xR, a[1], a[0]], [xR, bp[1], bp[0]], [xR, c[1], c[0]], [1, 0, 0], uvCap(a), uvCap(bp), uvCap(c), flag);
      pushTri(out, [xL, c[1], c[0]], [xL, bp[1], bp[0]], [xL, a[1], a[0]], [-1, 0, 0], uvCap(c), uvCap(bp), uvCap(a), flag);
    }

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const o0 = poly[i], o1 = poly[j];
      const i0 = inner[i], i1 = inner[j];
      const dz = o1[0] - o0[0], dy = o1[1] - o0[1];
      const ns = normalize([0, -dz, dy]);
      const nr = normalize([0.70, ns[1] * 0.71, ns[2] * 0.71]);
      const nl = normalize([-0.70, ns[1] * 0.71, ns[2] * 0.71]);

      pushQuad(out, [xRB, o0[1], o0[0]], [xRB, o1[1], o1[0]], [xR, i1[1], i1[0]], [xR, i0[1], i0[0]], nr,
        uvSide(xRB, o0), uvSide(xRB, o1), uvSide(xR, i1), uvSide(xR, i0), flag);
      pushQuad(out, [xLB, o0[1], o0[0]], [xLB, o1[1], o1[0]], [xRB, o1[1], o1[0]], [xRB, o0[1], o0[0]], ns,
        uvSide(xLB, o0), uvSide(xLB, o1), uvSide(xRB, o1), uvSide(xRB, o0), flag);
      pushQuad(out, [xL, i0[1], i0[0]], [xL, i1[1], i1[0]], [xLB, o1[1], o1[0]], [xLB, o0[1], o0[0]], nl,
        uvSide(xL, i0), uvSide(xL, i1), uvSide(xLB, o1), uvSide(xLB, o0), flag);
    }
  }

  /** Extrudes a 2D (x, y) profile along Z from z0..z1 with bevels. */
  function appendExtrudedXY(out, rawPolyXY, z0, z1, bevel = 0.02, flag = 0) {
    const poly = signedArea2D(rawPolyXY) >= 0 ? rawPolyXY.slice() : rawPolyXY.slice().reverse();
    const N = poly.length;
    const b = Math.min(bevel, (z1 - z0) * 0.36);
    const zF = z1, zFB = z1 - b, zBB = z0 + b, zB = z0;
    const inner = insetPoly2D(poly, Math.min(b * 0.75, 0.028));
    const tris = triangulateCCW(inner);
    const uvXY = pt => [clamp((pt[0] + 1.2) / 2.4, 0, 1), clamp(pt[1] / 2.4, 0, 1)];

    for (const [ia, ib, ic] of tris) {
      const a = inner[ia], bp = inner[ib], c = inner[ic];
      pushTri(out, [a[0], a[1], zF], [bp[0], bp[1], zF], [c[0], c[1], zF], [0, 0, 1], uvXY(a), uvXY(bp), uvXY(c), flag);
      pushTri(out, [c[0], c[1], zB], [bp[0], bp[1], zB], [a[0], a[1], zB], [0, 0, -1], uvXY(c), uvXY(bp), uvXY(a), flag);
    }

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const o0 = poly[i], o1 = poly[j];
      const i0 = inner[i], i1 = inner[j];
      const ex = o1[0] - o0[0], ey = o1[1] - o0[1];
      const ns = normalize([ey, -ex, 0]);
      const nf = normalize([ns[0] * 0.70, ns[1] * 0.70, 0.71]);
      const nb = normalize([ns[0] * 0.70, ns[1] * 0.70, -0.71]);

      pushQuad(out, [o0[0], o0[1], zFB], [o1[0], o1[1], zFB], [i1[0], i1[1], zF], [i0[0], i0[1], zF], nf, [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, [o0[0], o0[1], zBB], [o1[0], o1[1], zBB], [o1[0], o1[1], zFB], [o0[0], o0[1], zFB], ns, [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, [i0[0], i0[1], zB], [i1[0], i1[1], zB], [o1[0], o1[1], zBB], [o0[0], o0[1], zBB], nb, [0, 0], [1, 0], [1, 1], [0, 1], flag);
    }
  }

  /** Lathe along X axis: rings are { x, r, flag, sharp? }. */
  function appendLatheX(out, rings, segs, offset = [0, 0, 0]) {
    const runs = [];
    let cur = [rings[0]];
    for (let i = 1; i < rings.length; i++) {
      cur.push(rings[i]);
      if (rings[i].sharp && i < rings.length - 1) {
        runs.push(cur);
        cur = [rings[i]];
      }
    }
    runs.push(cur);

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
        return {
          p: [prof[j].x + offset[0], rr * ny + offset[1], rr * nz + offset[2]],
          n: normalize([nx, nr * ny, nr * nz]),
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

  /** Lathe along Y axis: rings are { y, r, flag, sharp? }. */
  function appendLatheY(out, rings, segs, offset = [0, 0, 0]) {
    const runs = [];
    let cur = [rings[0]];
    for (let i = 1; i < rings.length; i++) {
      cur.push(rings[i]);
      if (rings[i].sharp && i < rings.length - 1) {
        runs.push(cur);
        cur = [rings[i]];
      }
    }
    runs.push(cur);

    for (const prof of runs) {
      const segNorms = [];
      for (let i = 0; i < prof.length - 1; i++) {
        const dy = prof[i + 1].y - prof[i].y;
        const dr = prof[i + 1].r - prof[i].r;
        const l = Math.hypot(dy, dr) || 1;
        segNorms.push([-dr / l, dy / l]);
      }
      const pNorms = prof.map((_, i) => {
        const a = segNorms[Math.max(0, i - 1)];
        const b = segNorms[Math.min(segNorms.length - 1, i)];
        const ny = a[0] + b[0], nr = a[1] + b[1];
        const l = Math.hypot(ny, nr) || 1;
        return [ny / l, nr / l];
      });
      const vert = (j, s) => {
        const t = (s / segs) * TAU;
        const rr = prof[j].r;
        const nx = Math.cos(t), nz = Math.sin(t);
        const [ny, nr] = pNorms[j];
        return {
          p: [rr * nx + offset[0], prof[j].y + offset[1], rr * nz + offset[2]],
          n: normalize([nr * nx, ny, nr * nz]),
          uv: [s / segs, (prof[j].y + 1) * 0.5],
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

  /** Sweeps a smooth circular tube along a 3D spine using parallel transport frames. */
  function appendTube3D(out, spine, radii, segs = 18, flag = 2) {
    const S = spine.length;
    const tangents = [];
    for (let i = 0; i < S; i++) {
      const prev = spine[Math.max(0, i - 1)];
      const next = spine[Math.min(S - 1, i + 1)];
      tangents.push(normalize(sub(next, prev)));
    }
    let up = Math.abs(tangents[0][1]) < 0.85 ? [0, 1, 0] : [0, 0, 1];
    let normal = normalize(cross(tangents[0], up));
    let binormal = cross(tangents[0], normal);

    const rings = [];
    for (let i = 0; i < S; i++) {
      if (i > 0) {
        const t = tangents[i];
        const proj = sub(normal, scale(t, dot(normal, t)));
        if (Math.hypot(...proj) > 1e-4) normal = normalize(proj);
        binormal = normalize(cross(t, normal));
      }
      const r = Array.isArray(radii) ? radii[i] : radii;
      const ring = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * TAU;
        const dir = add(scale(normal, Math.cos(a)), scale(binormal, Math.sin(a)));
        ring.push({
          p: add(spine[i], scale(dir, r)),
          n: normalize(dir),
          uv: [j / segs, i / Math.max(1, S - 1)],
        });
      }
      rings.push(ring);
    }

    for (let i = 0; i < S - 1; i++) {
      const r0 = rings[i], r1 = rings[i + 1];
      for (let j = 0; j < segs; j++) {
        const jn = (j + 1) % segs;
        const a = r0[j], b = r0[jn], c = r1[jn], d = r1[j];
        pushQuadSmooth(out, a.p, b.p, c.p, d.p, a.n, b.n, c.n, d.n, a.uv, b.uv, c.uv, d.uv, flag, flag, flag, flag);
      }
    }
    const t0 = scale(tangents[0], -1), t1 = tangents[S - 1];
    for (let j = 0; j < segs; j++) {
      const jn = (j + 1) % segs;
      pushTri(out, spine[0], rings[0][j].p, rings[0][jn].p, t0, [0.5, 0.5], [0, 0], [1, 0], flag);
      pushTri(out, spine[S - 1], rings[S - 1][j].p, rings[S - 1][jn].p, t1, [0.5, 0.5], [0, 0], [1, 0], flag);
    }
  }

  /** Helper: curved cylindrical arc plate/ring around an X-parallel axis at (0, cy, cz). */
  function appendArcRibbon(out, x0, x1, cy, cz, rIn, rOut, phi0, phi1, segs, flag = 2) {
    for (let i = 0; i < segs; i++) {
      const a0 = lerp(phi0, phi1, i / segs);
      const a1 = lerp(phi0, phi1, (i + 1) / segs);
      const s0 = Math.sin(a0), c0 = Math.cos(a0);
      const s1 = Math.sin(a1), c1 = Math.cos(a1);
      const oL0 = [x0, cy + rOut * s0, cz + rOut * c0], oR0 = [x1, cy + rOut * s0, cz + rOut * c0];
      const oL1 = [x0, cy + rOut * s1, cz + rOut * c1], oR1 = [x1, cy + rOut * s1, cz + rOut * c1];
      const iL0 = [x0, cy + rIn * s0, cz + rIn * c0], iR0 = [x1, cy + rIn * s0, cz + rIn * c0];
      const iL1 = [x0, cy + rIn * s1, cz + rIn * c1], iR1 = [x1, cy + rIn * s1, cz + rIn * c1];
      const n0 = [0, s0, c0], n1 = [0, s1, c1];
      const ni0 = [0, -s0, -c0], ni1 = [0, -s1, -c1];
      // Outer & inner arc surfaces
      pushQuadSmooth(out, oL0, oR0, oR1, oL1, n0, n0, n1, n1, [0, 0], [1, 0], [1, 1], [0, 1], flag, flag, flag, flag);
      pushQuadSmooth(out, iL1, iR1, iR0, iL0, ni1, ni1, ni0, ni0, [0, 0], [1, 0], [1, 1], [0, 1], flag, flag, flag, flag);
      // Left & right side walls
      pushQuad(out, oL0, oL1, iL1, iL0, [-1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
      pushQuad(out, oR1, oR0, iR0, iR1, [1, 0, 0], [0, 0], [1, 0], [1, 1], [0, 1], flag);
    }
    // End caps at phi0 and phi1
    const cap = (phi, dir) => {
      const s = Math.sin(phi), c = Math.cos(phi);
      const n = [0, dir * c, -dir * s];
      pushQuad(out,
        [x0, cy + rIn * s, cz + rIn * c], [x1, cy + rIn * s, cz + rIn * c],
        [x1, cy + rOut * s, cz + rOut * c], [x0, cy + rOut * s, cz + rOut * c],
        n, [0, 0], [1, 0], [1, 1], [0, 1], flag);
    };
    cap(phi0, -1);
    cap(phi1, 1);
  }

  /**
   * Builds a precision 72-segment cylindrical slot drum centered at (0,0,0) along X.
   * UV mapping verified:
   *  - u = 0 at -halfW (left), u = 1 at +halfW (right)  => NOT mirrored
   *  - v = phi / TAU increases with +phi (+Y on +Z front) => 100% upright with UNPACK_FLIP_Y_WEBGL=true
   */
  function buildReelDrumGeo(R, halfW, segs = 72) {
    const out = [];
    const rimW = 0.022;
    const stripW = halfW - rimW;

    // Textured central strip (flag = 0)
    for (let s = 0; s < segs; s++) {
      const v0 = s / segs, v1 = (s + 1) / segs;
      const a0 = v0 * TAU, a1 = v1 * TAU;
      const y0 = R * Math.sin(a0), z0 = R * Math.cos(a0);
      const y1 = R * Math.sin(a1), z1 = R * Math.cos(a1);
      const n0 = [0, Math.sin(a0), Math.cos(a0)];
      const n1 = [0, Math.sin(a1), Math.cos(a1)];
      pushQuadSmooth(
        out,
        [-stripW, y0, z0], [stripW, y0, z0], [stripW, y1, z1], [-stripW, y1, z1],
        n0, n0, n1, n1,
        [0, v0], [1, v0], [1, v1], [0, v1],
        0, 0, 0, 0
      );
    }

    // Machined metallic end collars + solid end caps + center bore boss (flag = 2)
    for (const side of [-1, 1]) {
      const xIn = side * stripW;
      const xOut = side * halfW;
      const rings = side > 0
        ? [
            { x: xIn, r: R, flag: 2, sharp: true },
            { x: xOut - 0.008, r: R + 0.004, flag: 2 },
            { x: xOut, r: R - 0.012, flag: 2, sharp: true },
            { x: xOut, r: 0.14, flag: 2, sharp: true },
            { x: xOut + 0.028, r: 0.12, flag: 2, sharp: true },
            { x: xOut + 0.028, r: 0.001, flag: 2 },
          ]
        : [
            { x: xOut - 0.028, r: 0.001, flag: 2 },
            { x: xOut - 0.028, r: 0.12, flag: 2, sharp: true },
            { x: xOut, r: 0.14, flag: 2, sharp: true },
            { x: xOut, r: R - 0.012, flag: 2, sharp: true },
            { x: xOut + 0.008, r: R + 0.004, flag: 2 },
            { x: xIn, r: R, flag: 2, sharp: true },
          ];
      appendLatheX(out, rings, 48);
    }

    return new Float32Array(out);
  }

  function buildJewelGeo(r = 0.068) {
    const out = [];
    const rings = [];
    const steps = 10;
    rings.push({ y: -0.02, r: 0.001, flag: 2 });
    rings.push({ y: -0.02, r: r * 1.18, flag: 2, sharp: true });
    rings.push({ y: 0.018, r: r * 1.18, flag: 2, sharp: true });
    rings.push({ y: 0.024, r: r * 0.96, flag: 0, sharp: true });
    for (let i = 1; i <= steps; i++) {
      const a = (i / steps) * (Math.PI * 0.5);
      rings.push({ y: 0.024 + Math.sin(a) * r * 0.62, r: Math.max(0.001, Math.cos(a) * r * 0.96), flag: 0 });
    }
    appendLatheY(out, rings, 24);
    return new Float32Array(out);
  }

  // ---- Scheme A (Retro Lever Desktop Slot Machine) Geometries ----
  const RETRO_REEL_Y = 1.16;
  const RETRO_REEL_Z = 0.12;
  const RETRO_REEL_R = 0.50;
  const RETRO_REEL_XS = [-0.56, 0.0, 0.56];
  const RETRO_PHI_VIEW = 0.16; // slightly angled upward for natural tabletop viewing
  const RETRO_LEVER_PIVOT = [1.14, 0.88, 0.10];

  function buildRetroBaseGeo() {
    const out = [];
    // Stepped cast-metal plinth sitting cleanly on y = 0
    appendBeveledBox(out, -1.16, 1.16, 0.0, 0.12, -0.88, 0.92, 0.032, 0);
    // Brass perimeter plinth accent molding
    appendBeveledBox(out, -1.10, 1.10, 0.10, 0.165, -0.82, 0.86, 0.018, 2);
    // Forward coin tray dish extending to z = 1.16
    appendBeveledBox(out, -0.84, 0.84, 0.02, 0.15, 0.66, 1.16, 0.030, 0);
    // Coin tray raised brass lip (front + left + right)
    appendBeveledBox(out, -0.82, 0.82, 0.12, 0.25, 1.07, 1.17, 0.024, 2);
    appendBeveledBox(out, -0.84, -0.74, 0.12, 0.27, 0.68, 1.15, 0.020, 2);
    appendBeveledBox(out, 0.74, 0.84, 0.12, 0.27, 0.68, 1.15, 0.020, 2);
    // Dark recessed coin tray floor well
    appendBeveledBox(out, -0.75, 0.75, 0.12, 0.16, 0.68, 1.08, 0.008, 1);
    // 3 miniature turned brass tokens resting inside the coin tray
    const tokenRings = [
      { y: 0.0, r: 0.001, flag: 2 },
      { y: 0.0, r: 0.105, flag: 2, sharp: true },
      { y: 0.026, r: 0.105, flag: 2, sharp: true },
      { y: 0.032, r: 0.088, flag: 2 },
      { y: 0.032, r: 0.001, flag: 2 },
    ];
    appendLatheY(out, tokenRings, 24, [-0.28, 0.158, 0.92]);
    appendLatheY(out, tokenRings, 24, [-0.14, 0.158, 0.97]);
    appendLatheY(out, tokenRings, 24, [-0.20, 0.188, 0.94]);
    return new Float32Array(out);
  }

  function buildRetroCabinetGeo() {
    const out = [];
    // Sculpted arched vintage side silhouette in (z, y)
    const sideProfile = [
      [-0.78, 0.15],
      [0.82, 0.15],
      [0.84, 0.42],
      [0.74, 0.66],
      [0.64, 0.74],
      [0.62, 1.56],
      [0.54, 1.82],
      [0.34, 1.98],
      [-0.12, 2.02],
      [-0.56, 1.94],
      [-0.74, 1.72],
      [-0.80, 1.24],
    ];
    // Left and right cast-enamel side cheeks
    appendExtrudedX(out, sideProfile, -1.04, -0.84, 0.038, 0);
    appendExtrudedX(out, sideProfile, 0.84, 1.04, 0.038, 0);

    // Solid rear & arched upper body shell (behind reels, z <= -0.36; top roof y >= 1.66)
    const rearShell = [
      [-0.78, 0.15],
      [-0.36, 0.15],
      [-0.36, 1.64],
      [0.54, 1.66],
      [0.48, 1.84],
      [0.28, 1.98],
      [-0.12, 2.01],
      [-0.54, 1.93],
      [-0.72, 1.70],
      [-0.78, 1.24],
    ];
    appendExtrudedX(out, rearShell, -0.88, 0.88, 0.020, 0);

    // Lower front belly panel below viewport (y: 0.15..0.68)
    const lowerBelly = [
      [-0.40, 0.15],
      [0.82, 0.15],
      [0.84, 0.42],
      [0.73, 0.68],
      [-0.40, 0.68],
    ];
    appendExtrudedX(out, lowerBelly, -0.88, 0.88, 0.022, 0);

    // Dark recessed interior cavity backing behind the 3 drums
    appendBeveledBox(out, -0.86, 0.86, 0.62, 1.70, -0.44, -0.32, 0.008, 1);

    // Lower belly decorative brass trim plate & coin chute escutcheon
    appendBeveledBox(out, -0.74, 0.74, 0.34, 0.56, 0.72, 0.82, 0.016, 2);
    appendBeveledBox(out, -0.58, 0.58, 0.38, 0.52, 0.79, 0.845, 0.010, 0);
    // Vertical coin slot plate on right-front belly
    appendBeveledBox(out, 0.52, 0.68, 0.37, 0.53, 0.80, 0.865, 0.010, 2);
    appendBeveledBox(out, 0.585, 0.615, 0.40, 0.50, 0.85, 0.875, 0.002, 1);
    // Decorative brass chute arch above coin tray
    appendBeveledBox(out, -0.44, 0.44, 0.18, 0.31, 0.76, 0.86, 0.015, 2);
    appendBeveledBox(out, -0.34, 0.34, 0.18, 0.27, 0.82, 0.875, 0.004, 1);

    // Decorative side fluted accents on cabinet flanks
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -1.065 : 1.015;
      const x1 = s < 0 ? -1.015 : 1.065;
      appendBeveledBox(out, x0, x1, 0.48, 1.56, -0.42, -0.32, 0.012, 2);
      appendBeveledBox(out, x0, x1, 0.56, 1.48, -0.58, -0.50, 0.012, 2);
    }

    return new Float32Array(out);
  }

  function buildRetroBezelGeo() {
    const out = [];
    const cy = RETRO_REEL_Y, cz = RETRO_REEL_Z, rVis = RETRO_REEL_R + 0.055;
    const phiBot = RETRO_PHI_VIEW - 0.74;
    const phiTop = RETRO_PHI_VIEW + 0.74;

    // Curved top visor brow & bottom sill
    appendArcRibbon(out, -0.90, 0.90, cy, cz, rVis - 0.02, rVis + 0.08, phiTop - 0.05, phiTop + 0.16, 10, 2);
    appendArcRibbon(out, -0.90, 0.90, cy, cz, rVis - 0.02, rVis + 0.08, phiBot - 0.14, phiBot + 0.05, 10, 2);

    // Left & right curved vertical jamb pillars
    appendArcRibbon(out, -0.90, -0.82, cy, cz, rVis - 0.06, rVis + 0.08, phiBot - 0.10, phiTop + 0.12, 20, 2);
    appendArcRibbon(out, 0.82, 0.90, cy, cz, rVis - 0.06, rVis + 0.08, phiBot - 0.10, phiTop + 0.12, 20, 2);

    // Two sculpted brass divider rings separating the 3 drums
    for (const dx of [-0.28, 0.28]) {
      appendArcRibbon(out, dx - 0.026, dx + 0.026, cy, cz, RETRO_REEL_R - 0.03, RETRO_REEL_R + 0.034, phiBot - 0.06, phiTop + 0.06, 26, 2);
    }

    // Center payline pointer triangles on inner left and right edges (pointing at exact phiView)
    const py = cy + (RETRO_REEL_R + 0.035) * Math.sin(RETRO_PHI_VIEW);
    const pz = cz + (RETRO_REEL_R + 0.035) * Math.cos(RETRO_PHI_VIEW);
    appendExtrudedXY(out, [[-0.84, py - 0.055], [-0.75, py], [-0.84, py + 0.055]], pz - 0.03, pz + 0.04, 0.008, 3);
    appendExtrudedXY(out, [[0.84, py - 0.055], [0.84, py + 0.055], [0.75, py]], pz - 0.03, pz + 0.04, 0.008, 3);

    return new Float32Array(out);
  }

  function buildRetroGlassGeo() {
    const out = [];
    const cy = RETRO_REEL_Y, cz = RETRO_REEL_Z, rG = RETRO_REEL_R + 0.048;
    const phi0 = RETRO_PHI_VIEW - 0.73;
    const phi1 = RETRO_PHI_VIEW + 0.73;
    const segs = 24;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const a0 = lerp(phi0, phi1, t0), a1 = lerp(phi0, phi1, t1);
      const y0 = cy + rG * Math.sin(a0), z0 = cz + rG * Math.cos(a0);
      const y1 = cy + rG * Math.sin(a1), z1 = cz + rG * Math.cos(a1);
      const n0 = [0, Math.sin(a0), Math.cos(a0)], n1 = [0, Math.sin(a1), Math.cos(a1)];
      pushQuadSmooth(
        out,
        [-0.83, y0, z0], [0.83, y0, z0], [0.83, y1, z1], [-0.83, y1, z1],
        n0, n0, n1, n1,
        [0, t0], [1, t0], [1, t1], [0, t1],
        0, 0, 0, 0
      );
    }
    return new Float32Array(out);
  }

  function buildRetroMarqueeGeo() {
    const out = [];
    // Sculpted arched crown crest above the cabinet
    const archPts = [];
    const A_SEG = 20;
    archPts.push([-0.82, 1.94]);
    archPts.push([0.82, 1.94]);
    for (let i = 0; i <= A_SEG; i++) {
      const t = i / A_SEG;
      const a = lerp(0.18, Math.PI - 0.18, t);
      archPts.push([0.82 * Math.cos(a), 1.96 + 0.36 * Math.sin(a)]);
    }
    appendExtrudedXY(out, archPts, -0.18, 0.42, 0.032, 0);

    // Brass arched crown bezel molding
    const innerArch = [];
    innerArch.push([-0.72, 1.97]);
    innerArch.push([0.72, 1.97]);
    for (let i = 0; i <= 16; i++) {
      const a = lerp(0.22, Math.PI - 0.22, i / 16);
      innerArch.push([0.72 * Math.cos(a), 1.98 + 0.28 * Math.sin(a)]);
    }
    appendExtrudedXY(out, innerArch, 0.36, 0.46, 0.016, 2);

    // Recessed enamel medallion center strip
    appendBeveledBox(out, -0.64, 0.64, 2.00, 2.18, 0.41, 0.475, 0.012, 0);

    return new Float32Array(out);
  }

  function buildRetroLeverMountGeo() {
    const out = [];
    // Stepped turned brass + chrome side pivot housing attached at x = 1.02..1.20
    appendLatheX(out, [
      { x: 1.00, r: 0.001, flag: 2 },
      { x: 1.00, r: 0.27, flag: 2, sharp: true },
      { x: 1.06, r: 0.27, flag: 2 },
      { x: 1.09, r: 0.22, flag: 2, sharp: true },
      { x: 1.15, r: 0.20, flag: 3, sharp: true },
      { x: 1.21, r: 0.15, flag: 3 },
      { x: 1.24, r: 0.11, flag: 2, sharp: true },
      { x: 1.25, r: 0.001, flag: 2 },
    ], 32, [0, RETRO_LEVER_PIVOT[1], RETRO_LEVER_PIVOT[2]]);
    return new Float32Array(out);
  }

  function buildRetroLeverArmGeo() {
    const out = [];
    // Local origin = RETRO_LEVER_PIVOT (1.14, 0.88, 0.10)
    // Pivot collar drum
    appendLatheX(out, [
      { x: 0.02, r: 0.001, flag: 3 },
      { x: 0.02, r: 0.115, flag: 3, sharp: true },
      { x: 0.16, r: 0.115, flag: 3, sharp: true },
      { x: 0.18, r: 0.085, flag: 2, sharp: true },
      { x: 0.19, r: 0.001, flag: 2 },
    ], 24);

    // Swept chrome S-curve arm rising cleanly up to the ball knob (flag = 3 chrome)
    const spine = [
      [0.09, 0.00, 0.00],
      [0.18, 0.04, 0.01],
      [0.25, 0.16, 0.02],
      [0.27, 0.36, 0.01],
      [0.26, 0.62, -0.02],
      [0.24, 0.88, -0.01],
      [0.23, 1.08, 0.03],
      [0.23, 1.20, 0.05],
    ];
    const radii = [0.056, 0.050, 0.044, 0.040, 0.037, 0.035, 0.036, 0.040];
    appendTube3D(out, spine, radii, 20, 3);

    // Turned brass ferrule collar + glossy lathe-turned spherical ball knob (flag = 0)
    const knobRings = [
      { y: 1.15, r: 0.001, flag: 2 },
      { y: 1.15, r: 0.068, flag: 2, sharp: true },
      { y: 1.21, r: 0.078, flag: 2, sharp: true },
      { y: 1.22, r: 0.065, flag: 0 },
    ];
    const Rk = 0.185;
    const cy = 1.22 + Rk * 0.90;
    const kSteps = 18;
    for (let i = 0; i <= kSteps; i++) {
      const a = lerp(-Math.PI * 0.38, Math.PI * 0.5, i / kSteps);
      knobRings.push({
        y: cy + Rk * Math.sin(a),
        r: Math.max(0.001, Rk * Math.cos(a)),
        flag: 0,
      });
    }
    appendLatheY(out, knobRings, 32, [0.23, 0, 0.05]);
    return new Float32Array(out);
  }

  const REEL_PATTERNS = [
    [false, false, false, false, false, false], // 0
    [true,  false, false, false, false, false], // 1
    [true,  false, false, true,  false, false], // 2
    [true,  false, true,  false, true,  false], // 3
    [true,  true,  false, true,  true,  false], // 4
    [true,  true,  true,  true,  true,  false], // 5
    [true,  true,  true,  true,  true,  true],  // 6
  ];

  /**
   * Generates a 512x2048 6-stop reel drum texture.
   * Cell `s` (0..5) occupies y in [s * H/6, (s+1) * H/6].
   * With UNPACK_FLIP_Y_WEBGL=true, cell center maps to cylinder angle phi_s = ((5.5 - s) / 6) * TAU.
   */
  function makeReelStripTexture(k) {
    const W = 512, H = 2048;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const cellH = H / 6;
    const pat = REEL_PATTERNS[k];

    // Base strip background
    ctx.fillStyle = '#f7f3e6';
    ctx.fillRect(0, 0, W, H);

    // Subtle mechanical roller shading along left/right margins
    const sideShade = ctx.createLinearGradient(0, 0, W, 0);
    sideShade.addColorStop(0, 'rgba(40, 52, 42, 0.14)');
    sideShade.addColorStop(0.09, 'rgba(40, 52, 42, 0.0)');
    sideShade.addColorStop(0.91, 'rgba(40, 52, 42, 0.0)');
    sideShade.addColorStop(1, 'rgba(40, 52, 42, 0.14)');
    ctx.fillStyle = sideShade;
    ctx.fillRect(0, 0, W, H);

    const drawDumbbell = (cx, cy, sc, mainCol, accentCol) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      ctx.fillStyle = accentCol;
      ctx.beginPath();
      ctx.roundRect(-52, -7, 104, 14, 6);
      ctx.fill();
      ctx.fillStyle = mainCol;
      // Outer & inner plates
      ctx.beginPath(); ctx.roundRect(-78, -32, 20, 64, 7); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-54, -42, 22, 84, 8); ctx.fill();
      ctx.beginPath(); ctx.roundRect(32, -42, 22, 84, 8); ctx.fill();
      ctx.beginPath(); ctx.roundRect(58, -32, 20, 64, 7); ctx.fill();
      // Crisp top highlight sheen on plates
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(-50, -35, 6, 36);
      ctx.fillRect(36, -35, 6, 36);
      ctx.restore();
    };

    const drawTeacup = (cx, cy, sc, mainCol, softCol) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      // Warm steam wisps
      ctx.strokeStyle = softCol;
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      for (const sx of [-20, 0, 20]) {
        ctx.beginPath();
        ctx.moveTo(sx, -24);
        ctx.bezierCurveTo(sx - 8, -38, sx + 8, -46, sx, -58);
        ctx.stroke();
      }
      // Cup handle
      ctx.strokeStyle = mainCol;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(46, 6, 20, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
      // Cup bowl
      ctx.fillStyle = mainCol;
      ctx.beginPath();
      ctx.moveTo(-48, -14);
      ctx.lineTo(48, -14);
      ctx.quadraticCurveTo(46, 40, 0, 42);
      ctx.quadraticCurveTo(-46, 40, -48, -14);
      ctx.closePath();
      ctx.fill();
      // Saucer
      ctx.fillStyle = softCol;
      ctx.beginPath();
      ctx.roundRect(-58, 44, 116, 10, 5);
      ctx.fill();
      ctx.restore();
    };

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let s = 0; s < 6; s++) {
      const y0 = s * cellH;
      const cy = y0 + cellH * 0.5;
      const isTrain = pat[s];

      // Retro collector enamel reel cell with distinct warm sage vs calm slate-ivory ground
      ctx.fillStyle = isTrain ? '#ebf1e4' : '#edf0f2';
      ctx.beginPath();
      ctx.roundRect(32, y0 + 22, W - 64, cellH - 44, 28);
      ctx.fill();

      // Vintage double frame line
      ctx.strokeStyle = isTrain ? 'rgba(45, 86, 61, 0.48)' : 'rgba(79, 102, 121, 0.36)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(32, y0 + 22, W - 64, cellH - 44, 28);
      ctx.stroke();

      // Horizontal brass band between stops
      ctx.fillStyle = '#c5a55e';
      ctx.fillRect(0, y0, W, 7);

      if (isTrain) {
        drawDumbbell(W * 0.5, cy - 76, 1.14, '#264d36', '#c69d44');
        ctx.fillStyle = '#1d402b';
        ctx.font = '700 146px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
        ctx.fillText('练', W * 0.5, cy + 60);
      } else {
        drawTeacup(W * 0.5, cy - 70, 1.05, '#4d6579', '#7d93a4');
        ctx.fillStyle = '#445c70';
        ctx.font = '700 136px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
        ctx.fillText('歇', W * 0.5, cy + 60);
      }
    }

    return c;
  }

  const finish = {
    cabinet: {
      color: [0.20, 0.36, 0.27], accent: [0.81, 0.67, 0.37], trim: [0.85, 0.87, 0.86], cavity: [0.05, 0.08, 0.06],
      matMeta: [0.30, 0.88, 0.90], matRough: [0.24, 0.24, 0.18],
    },
    bezel: {
      color: [0.81, 0.67, 0.37], accent: [0.81, 0.67, 0.37], trim: [0.21, 0.38, 0.28], cavity: [0.05, 0.08, 0.06],
      matMeta: [0.88, 0.88, 0.30], matRough: [0.24, 0.24, 0.28],
    },
    lever: {
      color: [0.22, 0.39, 0.29], accent: [0.81, 0.67, 0.37], trim: [0.84, 0.86, 0.86], cavity: [0.06, 0.08, 0.07],
      matMeta: [0.22, 0.88, 0.92], matRough: [0.18, 0.22, 0.16],
    },
    reel: {
      color: [0.96, 0.94, 0.88], accent: [0.80, 0.67, 0.38], trim: [0.76, 0.78, 0.76],
      matMeta: [0.03, 0.88, 0.86], matRough: [0.58, 0.24, 0.24],
    },
  };

  function buildMeshes(studio) {
    const reel = buildReelDrumGeo(RETRO_REEL_R, 0.242);
    const jewel = buildJewelGeo();
    return {
      base: studio.addMesh(buildRetroBaseGeo(), finish.cabinet),
      cabinet: studio.addMesh(buildRetroCabinetGeo(), finish.cabinet),
      bezel: studio.addMesh(buildRetroBezelGeo(), finish.bezel),
      marquee: studio.addMesh(buildRetroMarqueeGeo(), finish.cabinet),
      leverMount: studio.addMesh(buildRetroLeverMountGeo(), finish.lever),
      leverArm: studio.addMesh(buildRetroLeverArmGeo(), finish.lever),
      reels: RETRO_REEL_XS.map(() => studio.addMesh(reel, finish.reel)),
      jewels: RETRO_REEL_XS.map(() => studio.addMesh(jewel, {
        accent: finish.bezel.accent, matMeta: [0.10, 0.88, 0.88], matRough: [0.18, 0.24, 0.24],
      })),
      glass: studio.addMesh(buildRetroGlassGeo(), {
        color: [0.95, 0.98, 0.96], metallic: 0.05, roughness: 0.10, alpha: 0.045, doubleSided: true,
      }),
    };
  }

  window.EonSlotModel = {
    buildMeshes, makeReelStripTexture, REEL_PATTERNS,
    reelXs: RETRO_REEL_XS, reelY: RETRO_REEL_Y, reelZ: RETRO_REEL_Z,
    leverPivot: RETRO_LEVER_PIVOT, faceAngle: RETRO_PHI_VIEW,
  };
})();

}

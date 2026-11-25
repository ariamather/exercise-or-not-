// Synced from Android chance/scenes/scratch/ticket-art.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window
  const { EonAnim, EonScratchStage } = window

;
/* Ticket, milled coin, shavings and printed artwork from scheme A of the scratch prototype. */
(function () {
  'use strict';
  const { clamp } = EonAnim;
  const { add, sub, scale, dot, cross, normalize } = EonScratchStage;
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  // ---- Curated Chinese Copy (Calm & Guilt-free per prd.md) ----
  const TRAIN_COPIES = [
    { tag: '宜动 · 01', headline: '去都去了，先推两组', sub: '热身完不想练也能随时停' },
    { tag: '宜动 · 02', headline: '换上鞋就算赢了一半', sub: '不用破纪录，动起来就行' },
    { tag: '宜动 · 03', headline: '今日筋骨宜微热', sub: '二十分钟也是认真练过' },
    { tag: '宜动 · 04', headline: '多举半斤也是进步', sub: '只跟上次的自己比一点点' },
    { tag: '宜动 · 05', headline: '今天手气偏硬核', sub: '推完这组，晚餐更香' },
    { tag: '宜动 · 06', headline: '日拱一卒，不慌不忙', sub: '动作标准比重量更值钱' },
    { tag: '宜动 · 07', headline: '趁这股劲儿还没散', sub: '把今天这一笔存进记录' },
    { tag: '宜动 · 08', headline: '活动开比硬扛重要', sub: '轻重量也能练出好状态' },
  ];

  const REST_COPIES = [
    { tag: '宜歇 · 01', headline: '肌肉是在休息时长大的', sub: '安心歇着，明天更有劲' },
    { tag: '宜歇 · 02', headline: '少练一天天塌不下来', sub: '松弛有度，才能练得长久' },
    { tag: '宜歇 · 03', headline: '今日签面写着放空', sub: '早点睡觉也是高级恢复' },
    { tag: '宜歇 · 04', headline: '茶已温好，今日免战', sub: '散个小步，拉伸两下也不错' },
    { tag: '宜歇 · 05', headline: '一张一弛，文武之道', sub: '把好状态留给下一次起杠' },
    { tag: '宜歇 · 06', headline: '系统批准今日休整', sub: '不扣分、不打断、不内耗' },
    { tag: '宜歇 · 07', headline: '允许自己今天不动铁', sub: '吃顿踏实饭，给身体充充电' },
    { tag: '宜歇 · 08', headline: '蓄力也是训练的一部分', sub: '满电回归，下次更轻快' },
  ];

  // ---- Geometry Builders (Outward CCW enforced via pushTri) ----
  function pushTri(out, p0, p1, p2, n, uv0, uv1, uv2, flag = 0) {
    const e1 = sub(p1, p0);
    const e2 = sub(p2, p0);
    const cr = cross(e1, e2);
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

  function appendBeveledBox(out, x0, x1, y0, y1, z0, z1, bevel = 0.012, flag = 0) {
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

  // 2D ear-clipping triangulation + beveled extrusion along Y (for cards lying on XZ plane)
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
    while (idx.length > 3 && guard++ < poly.length * poly.length * 2) {
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

  /**
   * Extrudes a 2D [x, z] silhouette vertically along Y (y0..y1) with crisp bevels.
   * UV mapping on top face (+Y): u = (x - uvBox.x0)/(uvBox.x1-uvBox.x0), v = (uvBox.z1 - z)/(uvBox.z1-uvBox.z0)
   * which pairs with UNPACK_FLIP_Y_WEBGL=true for upright, non-mirrored Canvas textures!
   */
  function appendExtrudedXZ(out, rawPolyXZ, y0, y1, bevel = 0.016, flag = 0, uvBox = null, sideFlag = null) {
    // Work in (x, u_y = -z) so standard 2D CCW corresponds to +Y outward normal
    const pts2D = rawPolyXZ.map(p => [p[0], -p[1]]);
    const poly = signedArea2D(pts2D) >= 0 ? pts2D : pts2D.slice().reverse();
    const N = poly.length;
    const bY = Math.min(bevel, (y1 - y0) * 0.36);
    const bInset = Math.min(bY * 0.65, 0.012);
    const sFlag = sideFlag != null ? sideFlag : flag;

    const inner = poly.map((_, i) => {
      if (bInset <= 1e-5) return poly[i].slice();
      const pPrev = poly[(i + N - 1) % N], pCurr = poly[i], pNext = poly[(i + 1) % N];
      const e1x = pCurr[0] - pPrev[0], e1y = pCurr[1] - pPrev[1];
      const e2x = pNext[0] - pCurr[0], e2y = pNext[1] - pCurr[1];
      const l1 = Math.hypot(e1x, e1y) || 1;
      const l2 = Math.hypot(e2x, e2y) || 1;
      const nIn1 = [-e1y / l1, e1x / l1];
      const nIn2 = [-e2y / l2, e2x / l2];
      const bx = nIn1[0] + nIn2[0], by = nIn1[1] + nIn2[1];
      const bl = Math.hypot(bx, by) || 1;
      const d = Math.min(bInset, Math.min(l1, l2) * 0.36);
      return [pCurr[0] + (bx / bl) * d, pCurr[1] + (by / bl) * d];
    });

    const mapUV = (x, z) => {
      if (!uvBox) return [(x + 2) * 0.25, (2 - z) * 0.25];
      return [
        (x - uvBox.x0) / (uvBox.x1 - uvBox.x0),
        (uvBox.z1 - z) / (uvBox.z1 - uvBox.z0),
      ];
    };

    const tris = triangulateCCW(inner);
    for (const [ia, ib, ic] of tris) {
      const a = inner[ia], bPt = inner[ib], c = inner[ic];
      const paT = [a[0], y1, -a[1]], pbT = [bPt[0], y1, -bPt[1]], pcT = [c[0], y1, -c[1]];
      pushTri(out, paT, pbT, pcT, [0, 1, 0], mapUV(paT[0], paT[2]), mapUV(pbT[0], pbT[2]), mapUV(pcT[0], pcT[2]), flag);
      const paB = [a[0], y0, -a[1]], pbB = [bPt[0], y0, -bPt[1]], pcB = [c[0], y0, -c[1]];
      pushTri(out, pcB, pbB, paB, [0, -1, 0], [0, 0], [1, 0], [0.5, 1], sFlag);
    }

    const yTB = y1 - bY, yBB = y0 + bY;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const o0 = [poly[i][0], -poly[i][1]], o1 = [poly[j][0], -poly[j][1]];
      const i0 = [inner[i][0], -inner[i][1]], i1 = [inner[j][0], -inner[j][1]];
      const ex = poly[j][0] - poly[i][0], ey = poly[j][1] - poly[i][1];
      // Outward normal in 2D (x, -z) is (ey, -ex), so in 3D (x, y, z) it is (ey, 0, ex)
      const ns = normalize([ey, 0, ex]);
      const nt = normalize([ns[0] * 0.68, 0.73, ns[2] * 0.68]);
      const nb = normalize([ns[0] * 0.68, -0.73, ns[2] * 0.68]);

      if (bY > 1e-5) {
        pushQuad(out, [o0[0], yTB, o0[1]], [o1[0], yTB, o1[1]], [i1[0], y1, i1[1]], [i0[0], y1, i0[1]], nt, [0, 0], [1, 0], [1, 1], [0, 1], sFlag);
        pushQuad(out, [o0[0], yBB, o0[1]], [o1[0], yBB, o1[1]], [o1[0], yTB, o1[1]], [o0[0], yTB, o0[1]], ns, [0, 0], [1, 0], [1, 1], [0, 1], sFlag);
        pushQuad(out, [i0[0], y0, i0[1]], [i1[0], y0, i1[1]], [o1[0], yBB, o1[1]], [o0[0], yBB, o0[1]], nb, [0, 0], [1, 0], [1, 1], [0, 1], sFlag);
      } else {
        pushQuad(out, [o0[0], y0, o0[1]], [o1[0], y0, o1[1]], [o1[0], y1, o1[1]], [o0[0], y1, o0[1]], ns, [0, 0], [1, 0], [1, 1], [0, 1], sFlag);
      }
    }
  }

  function appendCircularRingY(out, cx, cz, y0, y1, rIn, rOut, segs, flag = 2) {
    const b = Math.min(0.008, (rOut - rIn) * 0.28, (y1 - y0) * 0.35);
    const prof = [
      [rIn, y0],
      [rOut, y0],
      [rOut, y1 - b],
      [rOut - b, y1],
      [rIn + b, y1],
      [rIn, y1 - b],
    ];
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU;
      const a1 = ((s + 1) / segs) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      for (let k = 0; k < prof.length; k++) {
        const kn = (k + 1) % prof.length;
        const [ra, ya] = prof[k];
        const [rb, yb] = prof[kn];
        const dr = rb - ra, dy = yb - ya;
        const nLen = Math.hypot(dr, dy) || 1;
        // Outward normal in (r, y) plane for CCW profile (rIn,y0)->(rOut,y0)->(rOut,y1)->(rIn,y1) is (dy, -dr)
        const nr = dy / nLen, ny = -dr / nLen;
        const p0 = [cx + ra * c0, ya, cz + ra * s0];
        const p1 = [cx + ra * c1, ya, cz + ra * s1];
        const p2 = [cx + rb * c1, yb, cz + rb * s1];
        const p3 = [cx + rb * c0, yb, cz + rb * s0];
        const n0 = normalize([nr * c0, ny, nr * s0]);
        const n1 = normalize([nr * c1, ny, nr * s1]);
        pushQuadSmooth(out, p0, p1, p2, p3, n0, n1, n1, n0, [s / segs, 0], [(s + 1) / segs, 0], [(s + 1) / segs, 1], [s / segs, 1], flag, flag, flag, flag);
      }
    }
  }

  // ---- Scheme A Constants & Geometry (Vintage Cotton Ticket + Milled Coin) ----
  const TICKET_HX = 1.92, TICKET_HZ = 1.19, TICKET_H = 0.115;
  const TICKET_PRINT_BOX = { x0: -1.72, x1: 1.72, z0: -1.07, z1: 1.07 };
  const TICKET_FOIL_BOX = { x0: -1.48, x1: 1.48, z0: -0.37, z1: 0.90 };

  function buildTicketSilhouette() {
    const pts = [];
    const hx = TICKET_HX, hz = TICKET_HZ, cr = 0.11;

    // Top edge: left-to-right (z = -hz)
    for (let i = 0; i <= 4; i++) {
      const a = Math.PI + (i / 4) * (Math.PI / 2);
      pts.push([-hx + cr + cr * Math.cos(a), -hz + cr + cr * Math.sin(a)]);
    }
    for (let i = 0; i <= 4; i++) {
      const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
      pts.push([hx - cr + cr * Math.cos(a), -hz + cr + cr * Math.sin(a)]);
    }

    // Right edge (x = +hx): top-to-bottom with 6 perforated stub notches + center thumb cutout
    const rightNotches = [
      { z: -0.84, r: 0.044 },
      { z: -0.60, r: 0.044 },
      { z: -0.36, r: 0.044 },
      { z: 0.0, r: 0.112 },   // classic vintage ticket thumb notch
      { z: 0.36, r: 0.044 },
      { z: 0.60, r: 0.044 },
      { z: 0.84, r: 0.044 },
    ];
    for (const nt of rightNotches) {
      const segs = nt.r > 0.08 ? 8 : 5;
      for (let i = 0; i <= segs; i++) {
        const a = -Math.PI / 2 - (i / segs) * Math.PI;
        pts.push([hx + nt.r * Math.cos(a), nt.z + nt.r * Math.sin(a)]);
      }
    }

    // Bottom-right corner -> bottom edge -> bottom-left corner (z = +hz)
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      pts.push([hx - cr + cr * Math.cos(a), hz - cr + cr * Math.sin(a)]);
    }
    for (let i = 0; i <= 4; i++) {
      const a = Math.PI / 2 + (i / 4) * (Math.PI / 2);
      pts.push([-hx + cr + cr * Math.cos(a), hz - cr + cr * Math.sin(a)]);
    }

    // Left edge (x = -hx): bottom-to-top with mirrored stub notches
    const leftNotches = rightNotches.slice().reverse();
    for (const nt of leftNotches) {
      const segs = nt.r > 0.08 ? 8 : 5;
      for (let i = 0; i <= segs; i++) {
        const a = Math.PI / 2 - (i / segs) * Math.PI;
        pts.push([-hx + nt.r * Math.cos(a), nt.z + nt.r * Math.sin(a)]);
      }
    }
    return pts;
  }

  function buildTicketBodyGeo() {
    const out = [];
    const silhouette = buildTicketSilhouette();
    appendExtrudedXZ(out, silhouette, 0, TICKET_H, 0.018, 0, { x0: -TICKET_HX, x1: TICKET_HX, z0: -TICKET_HZ, z1: TICKET_HZ }, 0);

    // Raised metallic letterpress border rails framing the ticket
    const y0 = TICKET_H - 0.002, y1 = TICKET_H + 0.014;
    const rx0 = -1.76, rx1 = 1.76, rz0 = -1.11, rz1 = 1.11, rw = 0.036;
    appendBeveledBox(out, rx0, rx1, y0, y1, rz0, rz0 + rw, 0.006, 2);
    appendBeveledBox(out, rx0, rx1, y0, y1, rz1 - rw, rz1, 0.006, 2);
    appendBeveledBox(out, rx0, rx0 + rw, y0, y1, rz0 + rw, rz1 - rw, 0.006, 2);
    appendBeveledBox(out, rx1 - rw, rx1, y0, y1, rz0 + rw, rz1 - rw, 0.006, 2);

    // Subtle embossed raised molding lip framing the large scratch foil window
    const fx0 = TICKET_FOIL_BOX.x0 - 0.04, fx1 = TICKET_FOIL_BOX.x1 + 0.04;
    const fz0 = TICKET_FOIL_BOX.z0 - 0.04, fz1 = TICKET_FOIL_BOX.z1 + 0.04;
    const fw = 0.030, fy1 = TICKET_H + 0.022;
    appendBeveledBox(out, fx0, fx1, y0, fy1, fz0, fz0 + fw, 0.006, 2);
    appendBeveledBox(out, fx0, fx1, y0, fy1, fz1 - fw, fz1, 0.006, 2);
    appendBeveledBox(out, fx0, fx0 + fw, y0, fy1, fz0 + fw, fz1 - fw, 0.006, 2);
    appendBeveledBox(out, fx1 - fw, fx1, y0, fy1, fz0 + fw, fz1 - fw, 0.006, 2);

    // Four small embossed metallic corner studs
    for (const [cx, cz] of [[-1.62, -0.97], [1.62, -0.97], [-1.62, 0.97], [1.62, 0.97]]) {
      appendCircularRingY(out, cx, cz, y0, y1 + 0.005, 0.008, 0.042, 16, 2);
    }
    return new Float32Array(out);
  }

  function buildTicketPrintGeo() {
    const out = [];
    const b = TICKET_PRINT_BOX;
    const poly = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]];
    appendExtrudedXZ(out, poly, 0, 0.012, 0.002, 0, b, 2);
    return new Float32Array(out);
  }

  /**
   * Pillowed subdivided metallic foil sheet for Scheme A so studio specular bands
   * sweep realistically across the raised foil coating.
   */
  function buildTicketFoilGeo() {
    const out = [];
    const b = TICKET_FOIL_BOX;
    const nx = 28, nz = 14;
    const domeH = 0.017;

    const pt = (ix, iz) => {
      const u = ix / nx;
      const vCanvas = iz / nz; // 0 at top (-z), 1 at bottom (+z)
      const x = lerp(b.x0, b.x1, u);
      const z = lerp(b.z0, b.z1, vCanvas);
      // Smooth pillowed edge falloff (flat-ish interior, rounded bevel rim)
      const ex = Math.min(u, 1 - u);
      const ez = Math.min(vCanvas, 1 - vCanvas);
      const bx = smoothstepJS(0, 0.09, ex);
      const bz = smoothstepJS(0, 0.14, ez);
      const crown = Math.sin(u * Math.PI) * Math.sin(vCanvas * Math.PI) * 0.006;
      const y = bx * bz * domeH + crown;
      return { x, y, z, u, vGL: 1 - vCanvas };
    };

    const grid = [];
    for (let iz = 0; iz <= nz; iz++) {
      const row = [];
      for (let ix = 0; ix <= nx; ix++) row.push(pt(ix, iz));
      grid.push(row);
    }

    const normalAt = (ix, iz) => {
      const l = grid[iz][Math.max(0, ix - 1)];
      const r = grid[iz][Math.min(nx, ix + 1)];
      const t = grid[Math.max(0, iz - 1)][ix];
      const bo = grid[Math.min(nz, iz + 1)][ix];
      const dx = [r.x - l.x, r.y - l.y, r.z - l.z];
      const dz = [bo.x - t.x, bo.y - t.y, bo.z - t.z];
      let n = cross(dz, dx);
      if (n[1] < 0) n = scale(n, -1);
      return normalize(n);
    };

    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const a = grid[iz][ix];
        const bP = grid[iz][ix + 1];
        const c = grid[iz + 1][ix + 1];
        const d = grid[iz + 1][ix];
        const na = normalAt(ix, iz), nb = normalAt(ix + 1, iz), nc = normalAt(ix + 1, iz + 1), nd = normalAt(ix, iz + 1);
        pushQuadSmooth(
          out,
          [a.x, a.y, a.z], [bP.x, bP.y, bP.z], [c.x, c.y, c.z], [d.x, d.y, d.z],
          na, nb, nc, nd,
          [a.u, a.vGL], [bP.u, bP.vGL], [c.u, c.vGL], [d.u, d.vGL],
          0, 0, 0, 0
        );
      }
    }
    return new Float32Array(out);
  }

  function smoothstepJS(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /**
   * High-detail 72-reed milled 3D metallic coin (radius 0.43, thickness 0.074).
   * Flag 0 = embossed coin face (textured), Flag 2 = bright milled edge & raised rim.
   */
  function buildMilledCoinGeo() {
    const out = [];
    const R = 0.43, rInner = 0.365, hRim = 0.037, hField = 0.029;
    const segs = 72;

    // 1. Reeded/milled outer cylindrical edge (alternating ridges)
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU;
      const a1 = ((s + 1) / segs) * TAU;
      const aMid = (a0 + a1) * 0.5;
      const r0 = R;
      const rMid = R - 0.011;
      const subSegs = [[a0, r0, aMid, rMid], [aMid, rMid, a1, r0]];
      for (const [tA, ra, tB, rb] of subSegs) {
        const p0 = [ra * Math.cos(tA), -hRim + 0.007, ra * Math.sin(tA)];
        const p1 = [rb * Math.cos(tB), -hRim + 0.007, rb * Math.sin(tB)];
        const p2 = [rb * Math.cos(tB), hRim - 0.007, rb * Math.sin(tB)];
        const p3 = [ra * Math.cos(tA), hRim - 0.007, ra * Math.sin(tA)];
        const n = normalize(cross(sub(p1, p0), sub(p3, p0)));
        const outN = dot(n, [Math.cos((tA + tB) * 0.5), 0, Math.sin((tA + tB) * 0.5)]) >= 0 ? n : scale(n, -1);
        pushQuad(out, p0, p1, p2, p3, outN, [0, 0], [1, 0], [1, 1], [0, 1], 2);
      }
    }

    // 2. Top & bottom beveled raised rims + recessed coin fields (upright non-mirrored UV!)
    const ringSegs = 64;
    for (const sgn of [1, -1]) {
      const yRimOuter = sgn * (hRim - 0.007);
      const yRimTop = sgn * hRim;
      const yFld = sgn * hField;
      for (let s = 0; s < ringSegs; s++) {
        const a0 = (s / ringSegs) * TAU, a1 = ((s + 1) / ringSegs) * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);

        // Outer bevel -> Rim crown -> Inner step down to field
        const rings = [
          [R, yRimOuter, normalize([c0 * 0.72, sgn * 0.69, s0 * 0.72]), normalize([c1 * 0.72, sgn * 0.69, s1 * 0.72])],
          [R - 0.014, yRimTop, [0, sgn, 0], [0, sgn, 0]],
          [rInner + 0.012, yRimTop, [0, sgn, 0], [0, sgn, 0]],
          [rInner, yFld, normalize([-c0 * 0.68, sgn * 0.73, -s0 * 0.68]), normalize([-c1 * 0.68, sgn * 0.73, -s1 * 0.68])],
        ];
        for (let k = 0; k < rings.length - 1; k++) {
          const [ra, ya, n0a, n1a] = rings[k];
          const [rb, yb, n0b, n1b] = rings[k + 1];
          const p0 = [ra * c0, ya, ra * s0];
          const p1 = [ra * c1, ya, ra * s1];
          const p2 = [rb * c1, yb, rb * s1];
          const p3 = [rb * c0, yb, rb * s0];
          pushQuadSmooth(out, p0, p1, p2, p3, n0a, n1a, n1b, n0b, [0, 0], [1, 0], [1, 1], [0, 1], 2, 2, 2, 2);
        }

        // Textured coin face disc (flag = 0)
        const pCenter = [0, yFld, 0];
        const pA = [rInner * c0, yFld, rInner * s0];
        const pB = [rInner * c1, yFld, rInner * s1];
        const uvMap = (x, z) => [0.5 + (x / rInner) * 0.48, 0.5 - (z / rInner) * 0.48];
        pushTri(out, pCenter, pA, pB, [0, sgn, 0], [0.5, 0.5], uvMap(pA[0], pA[2]), uvMap(pB[0], pB[2]), 0);
      }
    }
    return new Float32Array(out);
  }

  function buildShavingGeo() {
    const out = [];
    const segs = 6;
    const len = 0.155, w = 0.048;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const a0 = t0 * 2.5, a1 = t1 * 2.5;
      const x0 = (t0 - 0.5) * len, x1 = (t1 - 0.5) * len;
      const y0 = Math.sin(a0) * 0.032, y1 = Math.sin(a1) * 0.032;
      const tw0 = (t0 - 0.5) * 0.85, tw1 = (t1 - 0.5) * 0.85;
      const hw0 = w * (0.62 + 0.38 * Math.sin(t0 * Math.PI));
      const hw1 = w * (0.62 + 0.38 * Math.sin(t1 * Math.PI));
      const p0 = [x0, y0 - Math.sin(tw0) * hw0, -Math.cos(tw0) * hw0];
      const p1 = [x1, y1 - Math.sin(tw1) * hw1, -Math.cos(tw1) * hw1];
      const p2 = [x1, y1 + Math.sin(tw1) * hw1,  Math.cos(tw1) * hw1];
      const p3 = [x0, y0 + Math.sin(tw0) * hw0,  Math.cos(tw0) * hw0];
      const n = normalize(cross(sub(p1, p0), sub(p3, p0)));
      pushQuad(out, p0, p1, p2, p3, n, [t0, 0], [t1, 0], [t1, 1], [t0, 1], 0);
    }
    return new Float32Array(out);
  }
  const FINISH = {
    body: {
      color: [0.19, 0.33, 0.25], accent: [0.82, 0.69, 0.38], trim: [0.82, 0.69, 0.38],
      matMeta: [0.04, 0.88, 0.86], matRough: [0.84, 0.24, 0.26],
    },
    foilMat: {
      color: [0.82, 0.85, 0.83], matMeta: [0.86, 0.86, 0.86], matRough: [0.26, 0.26, 0.26],
    },
    coinMat: {
      color: [0.86, 0.72, 0.38], accent: [0.88, 0.74, 0.39], trim: [0.86, 0.72, 0.38],
      matMeta: [0.90, 0.92, 0.90], matRough: [0.22, 0.19, 0.22],
    },
    shavingColor: [0.84, 0.87, 0.85],
    cardTheme: { bg0: '#fbfaf3', bg1: '#efeade', headerBg: '#274333', headerInk: '#f4f2e6', badgeBg: '#395d47', badgeStroke: '#d4b56a', border: '#365b43', gold: '#b99648' },
    foilPalette: { c0: '#d7ddd9', c1: '#b8c1bc', c2: '#cfd6d2', ink: '#46544c', stroke: 'rgba(62, 76, 68, 0.35)' },
    coinPalette: { bg0: '#e2c574', bg1: '#b7933f', rim: '#7b5e21', ink: '#4c3810' },
  };

  // ---- Offscreen Canvas Texture Renderers (Guaranteed Upright, Non-Mirrored) ----
  function makeCoinEmblemCanvas(palette) {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const g = ctx.createRadialGradient(S * 0.36, S * 0.34, 24, S * 0.5, S * 0.5, S * 0.52);
    g.addColorStop(0, palette.bg0);
    g.addColorStop(0.7, palette.bg1);
    g.addColorStop(1, palette.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    // Subtle brushed radial metal rings
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    for (let r = 46; r < 245; r += 10) {
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, r, 0, TAU);
      ctx.stroke();
    }

    // Outer beaded border
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 222, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = palette.rim;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      ctx.beginPath();
      ctx.arc(S / 2 + Math.cos(a) * 198, S / 2 + Math.sin(a) * 198, 5.5, 0, TAU);
      ctx.fill();
    }

    // Embossed center emblem (∴ + 练不练)
    ctx.fillStyle = palette.ink;
    ctx.font = '700 132px Georgia, "Songti SC", serif';
    ctx.fillText('∴', S / 2, S / 2 - 22);

    ctx.font = '700 44px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('练不练', S / 2, S / 2 + 88);

    ctx.font = '600 24px -apple-system, sans-serif';
    ctx.fillText('EST · 2026', S / 2, S / 2 - 122);
    return c;
  }

  function makeTicketPrintCanvas(finish, outcomeTrain, probPct, serialNo, copyObj) {
    const W = 1024, H = 636;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const th = finish.cardTheme;

    // Cream cotton paper background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, th.bg0);
    bg.addColorStop(1, th.bg1);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle paper cotton flecks
    for (let i = 0; i < 240; i++) {
      const fx = ((i * 197) % W);
      const fy = ((i * 313) % H);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(40,57,47,0.035)' : 'rgba(180,165,120,0.045)';
      ctx.fillRect(fx, fy, 4, 2);
    }

    // Top Header Band (ALWAYS visible above scratch window! z = -1.07..-0.40 => py = 0..198)
    ctx.fillStyle = th.headerBg;
    ctx.fillRect(0, 0, W, 182);

    // Gold decorative hairline under header
    ctx.fillStyle = th.gold;
    ctx.fillRect(0, 178, W, 5);

    // Brand mark on header left
    ctx.fillStyle = th.headerInk;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 44px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('∴ 练不练 · 刮刮票券', 48, 72);

    ctx.font = '500 24px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.globalAlpha = 0.78;
    ctx.fillText(`票号 NO.${String(serialNo).padStart(4, '0')}  ·  刮开即晓`, 52, 132);
    ctx.globalAlpha = 1.0;

    // Live transparent probability stamp pill on header right
    const badgeX = 678, badgeY = 36, badgeW = 298, badgeH = 108;
    ctx.fillStyle = th.badgeBg;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 20);
    ctx.fill();
    ctx.strokeStyle = th.badgeStroke;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8f8f0';
    ctx.font = '600 22px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('透明设定 · 训练概率', badgeX + badgeW / 2, badgeY + 34);
    ctx.font = '700 44px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(`${probPct}%`, badgeX + badgeW / 2, badgeY + 78);

    if (outcomeTrain == null) return c;

    // Scratch Window Under-Print Area (matches TICKET_FOIL_BOX exactly: px 71..953, py 207..585)
    const wx = 74, wy = 212, ww = 876, wh = 370;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, 18);
    ctx.clip();

    // Guilloché security wave background
    const wBg = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    if (outcomeTrain) {
      wBg.addColorStop(0, '#eef4ea');
      wBg.addColorStop(1, '#e1ebdc');
    } else {
      wBg.addColorStop(0, '#eef2f5');
      wBg.addColorStop(1, '#e3eaef');
    }
    ctx.fillStyle = wBg;
    ctx.fillRect(wx, wy, ww, wh);

    ctx.strokeStyle = outcomeTrain ? 'rgba(54, 91, 67, 0.085)' : 'rgba(89, 110, 128, 0.095)';
    ctx.lineWidth = 2.2;
    for (let row = 0; row < 12; row++) {
      ctx.beginPath();
      const baseY = wy + 18 + row * 32;
      for (let x = wx; x <= wx + ww; x += 18) {
        const y = baseY + Math.sin((x - wx) * 0.025 + row * 0.7) * 10;
        if (x === wx) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Inner double frame
    ctx.strokeStyle = outcomeTrain ? 'rgba(54, 91, 67, 0.35)' : 'rgba(89, 110, 128, 0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(wx + 16, wy + 16, ww - 32, wh - 32);

    // Left Circular Verdict Stamp Seal
    const sealX = wx + 182, sealY = wy + wh / 2, sealR = 122;
    ctx.fillStyle = outcomeTrain ? '#365b43' : '#596e80';
    ctx.beginPath();
    ctx.arc(sealX, sealY, sealR, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = outcomeTrain ? '#d6be7a' : '#cfd9e2';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(sealX, sealY, sealR - 14, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = '#fafbf5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 132px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
    ctx.fillText(outcomeTrain ? '练' : '歇', sealX, sealY + 4);

    // Right Verdict Copy Block
    const tx = wx + 352;
    ctx.textAlign = 'left';
    ctx.fillStyle = outcomeTrain ? '#365b43' : '#596e80';
    ctx.font = '700 32px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText(outcomeTrain ? '今日签 · 走吧，练一点' : '今日签 · 今天，歇一歇', tx, wy + 96);

    // Accent bar
    ctx.fillStyle = outcomeTrain ? '#9dac67' : '#8da0b0';
    ctx.fillRect(tx, wy + 132, 116, 5);

    ctx.fillStyle = '#28392f';
    ctx.font = '700 50px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText(copyObj.headline, tx, wy + 204, wx + ww - tx - 42);

    ctx.fillStyle = '#536052';
    ctx.font = '500 31px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText(copyObj.sub, tx, wy + 276, wx + ww - tx - 42);

    ctx.fillStyle = outcomeTrain ? 'rgba(54, 91, 67, 0.55)' : 'rgba(89, 110, 128, 0.60)';
    ctx.font = '600 22px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(`不强制 · 可重刮 · 当前概率 ${probPct}%`, tx, wy + 332);

    ctx.restore();
    return c;
  }

  function paintTicketFoilBase(canvas, finish) {
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    const fp = finish.foilPalette;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    // Brushed metallic base gradient
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, fp.c0);
    g.addColorStop(0.42, fp.c1);
    g.addColorStop(0.72, fp.c2);
    g.addColorStop(1, fp.c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Fine directional brushed metal streaks
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.5;
    for (let i = -H; i < W + H; i += 9) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i - H * 0.55, H);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(30, 42, 36, 0.08)';
    for (let i = -H + 4; i < W + H; i += 13) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i - H * 0.55, H);
      ctx.stroke();
    }

    // Security diagonal watermark pattern
    ctx.strokeStyle = fp.stroke;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(18, 16, W - 36, H - 32);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(28, 26, W - 56, H - 52);

    // Subtle corner chevron ornaments
    for (const [cx, cy, sx, sy] of [[44, 42, 1, 1], [W - 44, 42, -1, 1], [44, H - 42, 1, -1], [W - 44, H - 42, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + sy * 18);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * 18, cy);
      ctx.stroke();
    }

    // Center embossed invitation
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fp.ink;
    ctx.font = '700 44px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('用硬币刮开此区', W / 2, H / 2 - 18);

    ctx.globalAlpha = 0.72;
    ctx.font = '600 21px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('∴  SCRATCH WITH COIN  ·  今日练不练', W / 2, H / 2 + 34);
    ctx.globalAlpha = 1.0;
  }

  // ---- Organic Coin-Edge Scratch Brush Stamp ----
  function scrapeFoilLine(ctx, x0, y0, x1, y1, radius) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.28)));
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(x0, x1, t);
      const y = lerp(y0, y1, t);
      // Organic slightly jagged metallic scrape mark (core + micro-edge dabs)
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.88, 0, TAU);
      ctx.fill();
      for (let k = 0; k < 5; k++) {
        const ang = (i * 1.7 + k * 1.28) % TAU;
        const off = radius * (0.25 + ((k * 37) % 10) * 0.032);
        ctx.fillStyle = k % 2 === 0 ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.58)';
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * off, y + Math.sin(ang) * off, radius * 0.42, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  window.EonScratchArt = {
    TICKET_HX, TICKET_HZ, TICKET_H, TICKET_FOIL_BOX, FINISH, TRAIN_COPIES, REST_COPIES,
    buildTicketBodyGeo, buildTicketPrintGeo, buildTicketFoilGeo, buildMilledCoinGeo, buildShavingGeo,
    makeCoinEmblemCanvas, makeTicketPrintCanvas, paintTicketFoilBase, scrapeFoilLine,
  };
})();

}

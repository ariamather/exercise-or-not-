// Synced from Android chance/scenes/scratch/stage3d.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window
  const { EonAnim } = window

;
/* WebGL studio renderer adapted from scheme A in design/explorations/scratch-3d-assets.html. */
(function () {
  'use strict';
  const { clamp } = EonAnim;
  const TAU = Math.PI * 2;
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

  function multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  }

  function invertMat4(m) {
    const out = new Float32Array(16);
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-10) return null;
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  }

  function unprojectNDC(invVP, ndcX, ndcY, ndcZ) {
    const x = invVP[0] * ndcX + invVP[4] * ndcY + invVP[8] * ndcZ + invVP[12];
    const y = invVP[1] * ndcX + invVP[5] * ndcY + invVP[9] * ndcZ + invVP[13];
    const z = invVP[2] * ndcX + invVP[6] * ndcY + invVP[10] * ndcZ + invVP[14];
    const w = invVP[3] * ndcX + invVP[7] * ndcY + invVP[11] * ndcZ + invVP[15];
    return [x / w, y / w, z / w];
  }

  function qMultiply(a, b) {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3];
    const bx = b[0], by = b[1], bz = b[2], bw = b[3];
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  }

  function qFromChain(...qs) {
    return qs.reduce((acc, q) => qMultiply(acc, q), [0, 0, 0, 1]);
  }

  function modelMatrix(q, p, s = 1) {
    const [x, y, z, w] = q;
    const xx = x * x, yy = y * y, zz = z * z;
    return new Float32Array([
      (1 - 2 * (yy + zz)) * s, (2 * (x * y + z * w)) * s, (2 * (x * z - y * w)) * s, 0,
      (2 * (x * y - z * w)) * s, (1 - 2 * (xx + zz)) * s, (2 * (y * z + x * w)) * s, 0,
      (2 * (x * z + y * w)) * s, (2 * (y * z - x * w)) * s, (1 - 2 * (xx + yy)) * s, 0,
      p[0], p[1], p[2], 1,
    ]);
  }

  function cameraMatrix(eye, target) {
    const z = normalize(add(eye, scale(target, -1)));
    const x = normalize(cross([0, 1, 0], z));
    const y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ]);
  }

  function perspective(aspect) {
    const f = Math.min(1, aspect / 1.3) / Math.tan((30 * Math.PI) / 360);
    const n = 0.1, far = 60;
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + n) / (n - far), -1,
      0, 0, (2 * far * n) / (n - far), 0,
    ]);
  }

  // ---- Studio WebGL Shaders with Brushed Foil, Torn-Edge Gleam & Cotton Paper Grain ----
  const VERTEX_SRC = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aUv;
    attribute float aFlag;
    uniform mat4 uModel;
    uniform mat4 uVP;
    varying vec3 vNormal;
    varying vec3 vWorld;
    varying vec2 vUv;
    varying float vFlag;
    void main() {
      vec4 p = uModel * vec4(aPosition, 1.0);
      vWorld = p.xyz;
      vNormal = mat3(uModel) * aNormal;
      vUv = aUv;
      vFlag = aFlag;
      gl_Position = uVP * p;
    }
  `;

  const FRAGMENT_SRC = `
    precision highp float;
    varying vec3 vNormal;
    varying vec3 vWorld;
    varying vec2 vUv;
    varying float vFlag;
    uniform vec3 uEye;
    uniform vec3 uColor;
    uniform vec3 uAccentColor;
    uniform vec3 uTrimColor;
    uniform vec3 uCavityColor;
    uniform vec3 uMatMeta;
    uniform vec3 uMatRough;
    uniform sampler2D uTex;
    uniform float uTextured;
    uniform float uUseTexAlpha;
    uniform float uSurfaceStyle; // 0: normal, 1: brushed metallic foil, 2: cotton cardstock grain
    uniform float uOpacity;

    void main() {
      vec3 n = normalize(vNormal);
      if (!gl_FrontFacing) n = -n;
      vec3 keyDir = normalize(vec3(-2.6, 7.6, 4.4));
      vec3 fillDir = normalize(vec3(5.2, 2.2, 2.4));
      vec3 rimDir = normalize(vec3(-3.8, 4.2, -5.2));
      vec3 viewDir = normalize(uEye - vWorld);
      vec3 R = reflect(-viewDir, n);

      float key = max(dot(n, keyDir), 0.0);
      float fill = max(dot(n, fillDir), 0.0);
      float rim = max(dot(n, rimDir), 0.0);
      float ndv = max(dot(n, viewDir), 0.0);

      if (vFlag > 0.5 && vFlag < 1.5) {
        float depthShade = mix(0.65, 1.0, clamp(vUv.y, 0.0, 1.0));
        vec3 cav = uCavityColor * (0.28 + key * 0.16 + fill * 0.08) * depthShade;
        gl_FragColor = vec4(cav, uOpacity);
        return;
      }

      vec3 base = uColor;
      float alpha = uOpacity;
      float metal = uMatMeta.x;
      float rough = uMatRough.x;
      float tearGleam = 0.0;

      if (vFlag < 0.5 && uTextured > 0.5) {
        vec4 texel = texture2D(uTex, vUv);
        base = texel.rgb;
        if (uUseTexAlpha > 0.5) {
          if (texel.a < 0.07) discard;
          alpha *= texel.a;
          // Freshly torn metallic foil edge catches crisp specular gleam
          tearGleam = smoothstep(0.07, 0.42, texel.a) * (1.0 - smoothstep(0.45, 0.94, texel.a));
        }
      } else if (vFlag > 1.5 && vFlag < 2.5) {
        base = uAccentColor;
        metal = uMatMeta.y;
        rough = uMatRough.y;
      } else if (vFlag > 2.5) {
        base = uTrimColor;
        metal = uMatMeta.z;
        rough = uMatRough.z;
      }

      // Surface micro-detail: brushed foil anisotropy vs tactile cotton paper fibers
      float brushAniso = 0.0;
      if (uSurfaceStyle > 0.5 && uSurfaceStyle < 1.5 && vFlag < 0.5) {
        float diag = vUv.x * 165.0 + vUv.y * 92.0;
        float fine = sin(diag) * 0.032 + sin(diag * 2.7 + vUv.y * 28.0) * 0.018;
        float shimmer = sin(vUv.x * 11.0 - vUv.y * 8.0 + dot(viewDir, vec3(3.2, 0.8, 2.4))) * 0.045;
        base *= (1.0 + fine + shimmer);
        brushAniso = (0.5 + 0.5 * sin(diag * 0.35 + dot(viewDir, vec3(2.4, 0.0, 1.8)))) * 0.16;
      } else if (uSurfaceStyle > 1.5 && vFlag < 0.5) {
        float grain = sin(vUv.x * 210.0 + sin(vUv.y * 130.0) * 1.6) * 0.014
                    + cos(vUv.y * 195.0 - sin(vUv.x * 84.0)) * 0.011;
        base *= (1.0 + grain);
      }

      metal = clamp(metal, 0.0, 0.95);
      rough = clamp(rough, 0.14, 0.94);

      // Analytic studio environment reflection
      float topBox = smoothstep(0.18, 0.84, R.y);
      float horizonBand = exp(-pow((R.y - 0.04) * 4.8, 2.0));
      float floorBounce = smoothstep(-0.04, -0.62, R.y);
      vec3 env = mix(vec3(0.56, 0.58, 0.54), vec3(1.07, 1.05, 1.00), topBox);
      env = mix(env, vec3(0.16, 0.20, 0.19), horizonBand * 0.82);
      env = mix(env, vec3(0.80, 0.81, 0.74), floorBounce * 0.72);

      float diffuseScale = mix(1.0, 0.42, metal);
      vec3 diffuse = base * diffuseScale * (0.52 + key * 0.40 + fill * 0.12);

      vec3 specTint = mix(vec3(1.0), base * 1.22, metal);
      float fresnel = metal + (1.0 - metal) * pow(1.0 - ndv, 4.0) * 0.50;
      float envWeight = (0.06 + metal * 0.66) * (1.0 - rough * 0.60) * (0.58 + 0.42 * fresnel);

      vec3 H = normalize(keyDir + viewDir);
      float ndh = max(dot(n, H), 0.0);
      float tightSpec = pow(ndh, mix(88.0, 14.0, rough)) * mix(0.56, 0.06, rough);
      float broadSpec = pow(ndh, mix(16.0, 5.0, rough)) * mix(0.24, 0.05, rough);
      float rimSpec = pow(rim, 1.8) * pow(1.0 - ndv, 2.2) * (0.10 + metal * 0.34);

      vec3 lit = diffuse
               + env * specTint * (envWeight + brushAniso * metal)
               + specTint * (tightSpec + broadSpec + rimSpec)
               + vec3(1.0, 0.99, 0.94) * tearGleam * 0.36;

      gl_FragColor = vec4(lit, alpha);
    }
  `;

  // Tabletop viewing camera: frames full rounded tray + card + coin cleanly inside .stage
  const DEFAULT_TARGET = [0.02, 0.08, 0.04];
  const BASE_YAW = 0.05;
  const BASE_PITCH = 0.88;
  const BASE_DIST = 9.10;

  class ScratchStage3D {
    constructor(stageEl, glCanvas, shadowCanvas) {
      this.stage = stageEl;
      this.canvas = glCanvas;
      this.shadow = shadowCanvas;
      this.ctx = shadowCanvas.getContext('2d');
      this.gl = glCanvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
      if (!this.gl) throw new Error('WebGL unavailable');

      const gl = this.gl;
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      this.program = gl.createProgram();
      gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VERTEX_SRC));
      gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);

      this.attribs = [['aPosition', 3, 0], ['aNormal', 3, 3], ['aUv', 2, 6], ['aFlag', 1, 8]]
        .map(([name, size, offset]) => {
          const loc = gl.getAttribLocation(this.program, name);
          gl.enableVertexAttribArray(loc);
          return [loc, size, offset];
        });
      const uNames = [
        'uModel', 'uVP', 'uEye', 'uColor', 'uAccentColor', 'uTrimColor', 'uCavityColor',
        'uMatMeta', 'uMatRough', 'uTex', 'uTextured', 'uUseTexAlpha', 'uSurfaceStyle', 'uOpacity',
      ];
      this.uniforms = Object.fromEntries(uNames.map(n => [n, gl.getUniformLocation(this.program, n)]));

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.clearColor(0, 0, 0, 0);

      this.meshes = [];
      this.shadows = [];
      this.tray = { halfX: 2.76, halfZ: 1.74, corner: 0.38 };
      this.target = DEFAULT_TARGET.slice();
      this.camYaw = BASE_YAW;
      this.camPitch = BASE_PITCH;
      this.camDist = BASE_DIST;
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.stage);
      this.resize();
    }

    updateCamera() {
      const cp = Math.cos(this.camPitch);
      this.eye = [
        this.target[0] + this.camDist * cp * Math.sin(this.camYaw),
        this.target[1] + this.camDist * Math.sin(this.camPitch),
        this.target[2] + this.camDist * cp * Math.cos(this.camYaw),
      ];
      this.view = cameraMatrix(this.eye, this.target);
      if (this.stageW && this.stageH) {
        this.vp = multiply(perspective(this.stageW / this.stageH), this.view);
        this.invVP = invertMat4(this.vp);
      }
    }

    orbit(dx, dy) {
      this.camYaw = (this.camYaw - dx * 0.011) % TAU;
      this.camPitch = clamp(this.camPitch + dy * 0.0085, 0.32, 1.44);
      this.updateCamera();
      this.draw();
    }

    raycastPlaneY(clientX, clientY, planeY) {
      if (!this.invVP) return null;
      const rect = this.stage.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
      const nearPt = unprojectNDC(this.invVP, ndcX, ndcY, -1);
      const farPt = unprojectNDC(this.invVP, ndcX, ndcY, 1);
      const dir = sub(farPt, nearPt);
      if (Math.abs(dir[1]) < 1e-6) return null;
      const t = (planeY - nearPt[1]) / dir[1];
      if (t < 0) return null;
      return [
        nearPt[0] + dir[0] * t,
        planeY,
        nearPt[2] + dir[2] * t,
      ];
    }

    addMesh(data, opts = {}) {
      const gl = this.gl;
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const mDef = opts.metallic ?? 0.0;
      const rDef = opts.roughness ?? 0.62;
      const mesh = {
        buffer,
        count: data.length / 9,
        color: opts.color || [0.3, 0.45, 0.35],
        accent: opts.accent || [0.78, 0.66, 0.38],
        trim: opts.trim || [0.55, 0.44, 0.28],
        cavity: opts.cavity || [0.08, 0.11, 0.09],
        matMeta: opts.matMeta || [mDef, mDef, mDef],
        matRough: opts.matRough || [rDef, rDef, rDef],
        texture: opts.texture || null,
        useTexAlpha: !!opts.useTexAlpha,
        surfaceStyle: opts.surfaceStyle || 0,
        opacity: opts.opacity ?? 1.0,
        transparent: !!opts.transparent,
        q: [0, 0, 0, 1],
        position: [0, 0, 0],
        scale: opts.scale || 1,
        visible: opts.visible !== false,
        doubleSided: !!opts.doubleSided,
      };
      this.meshes.push(mesh);
      return mesh;
    }

    createTextureFromCanvas(cnv) {
      const gl = this.gl;
      const t = gl.createTexture();
      this.updateTextureFromCanvas(t, cnv);
      return t;
    }

    updateTextureFromCanvas(tex, cnv) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    resize() {
      const sr = this.stage.getBoundingClientRect();
      if (sr.width < 1 || sr.height < 1) return;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.stageW = sr.width;
      this.stageH = sr.height;
      this.shadow.width = Math.round(sr.width * this.dpr);
      this.shadow.height = Math.round(sr.height * this.dpr);
      this.canvas.width = this.shadow.width;
      this.canvas.height = this.shadow.height;

      this.updateCamera();
      this.draw();
    }

    project(p) {
      const m = this.vp;
      const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      return [
        ((m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w) * (this.stageW / 2) + this.stageW / 2,
        (-(m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w + 1) * (this.stageH / 2),
      ];
    }

    floorPath(y = 0) {
      const ctx = this.ctx, rx = this.tray.halfX, rz = this.tray.halfZ, r = this.tray.corner;
      ctx.beginPath();
      const corners = [
        [-rx + r, -rz + r, Math.PI],
        [rx - r, -rz + r, -Math.PI / 2],
        [rx - r, rz - r, 0],
        [-rx + r, rz - r, Math.PI / 2],
      ];
      let first = true;
      for (const [cx, cz, angle] of corners) {
        for (let i = 0; i <= 8; i++) {
          const a = angle + (i * Math.PI) / 16;
          const pt = this.project([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]);
          if (first) { ctx.moveTo(pt[0], pt[1]); first = false; }
          else ctx.lineTo(pt[0], pt[1]);
        }
      }
      ctx.closePath();
    }

    drawRectShadow(x3, z3, hx, hz, opacity, lift) {
      const ctx = this.ctx;
      const ox = 0.08 + lift * 0.14;
      const oz = 0.09 + lift * 0.12;
      const pad = 0.08 + lift * 0.16;
      const pts = [
        this.project([x3 - hx - pad + ox, 0, z3 - hz - pad + oz]),
        this.project([x3 + hx + pad + ox, 0, z3 - hz - pad + oz]),
        this.project([x3 + hx + pad + ox, 0, z3 + hz + pad + oz]),
        this.project([x3 - hx - pad + ox, 0, z3 + hz + pad + oz]),
      ];
      ctx.save();
      ctx.filter = `blur(${Math.round(5 + lift * 6)}px)`;
      ctx.fillStyle = `rgba(40, 56, 36, ${opacity / (1 + lift * 1.1)})`;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawBlob(x3, z3, radiusFrac, opacity, air, stretchX = 1, angleRad = 0) {
      const ctx = this.ctx;
      const [sx, sy] = this.project([x3, 0, z3]);
      const size = this.stageH * radiusFrac * (1 + air * 0.14);
      ctx.save();
      ctx.translate(sx + 4 + air * 8, sy + 4 + air * 4);
      if (angleRad) ctx.rotate(angleRad);
      ctx.scale(stretchX, 0.72);
      const g = ctx.createRadialGradient(0, 0, size * 0.14, 0, 0, size);
      g.addColorStop(0, `rgba(42, 56, 34, ${opacity})`);
      g.addColorStop(0.45, `rgba(42, 56, 34, ${opacity * 0.52})`);
      g.addColorStop(1, 'rgba(42, 56, 34, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawFloor() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.stageW, this.stageH);

      this.floorPath(-0.068);
      ctx.fillStyle = '#d7dccd';
      ctx.fill();

      this.floorPath(0);
      const surface = ctx.createLinearGradient(0, this.stageH * 0.14, this.stageW, this.stageH * 0.92);
      surface.addColorStop(0, '#f0f1e8');
      surface.addColorStop(1, '#e6eadc');
      ctx.fillStyle = surface;
      ctx.fill();
      ctx.strokeStyle = '#dce1d1';
      ctx.lineWidth = 0.85;
      ctx.stroke();

      ctx.save();
      ctx.clip();
      for (const s of this.shadows) {
        if (!s.visible) continue;
        const lift = Math.max(0, s.y || 0);
        if (s.kind === 'rect') {
          this.drawRectShadow(s.x, s.z, s.hx, s.hz, s.opacity, lift);
        } else {
          const op = s.opacity / (1 + lift * 1.25);
          this.drawBlob(s.x, s.z, s.radius, op, lift, s.stretch || 1, s.angle || 0);
        }
      }
      ctx.restore();
    }

    drawMeshItem(m) {
      const gl = this.gl, u = this.uniforms;
      if (m.doubleSided) gl.disable(gl.CULL_FACE);
      else gl.enable(gl.CULL_FACE);

      gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer);
      for (const [loc, size, offset] of this.attribs) {
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, offset * 4);
      }
      gl.uniform3fv(u.uColor, m.color);
      gl.uniform3fv(u.uAccentColor, m.accent);
      gl.uniform3fv(u.uTrimColor, m.trim);
      gl.uniform3fv(u.uCavityColor, m.cavity);
      gl.uniform3fv(u.uMatMeta, m.matMeta);
      gl.uniform3fv(u.uMatRough, m.matRough);
      gl.uniform1f(u.uSurfaceStyle, m.surfaceStyle);
      gl.uniform1f(u.uTextured, m.texture ? 1 : 0);
      gl.uniform1f(u.uUseTexAlpha, m.useTexAlpha ? 1 : 0);
      gl.uniform1f(u.uOpacity, m.opacity);
      if (m.texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, m.texture);
        gl.uniform1i(u.uTex, 0);
      }
      gl.uniformMatrix4fv(u.uModel, false, modelMatrix(m.q, m.position, m.scale));
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    }

    draw() {
      if (!this.vp || this.gl.isContextLost()) return;
      const gl = this.gl, u = this.uniforms;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(u.uVP, false, this.vp);
      gl.uniform3fv(u.uEye, this.eye);

      // Pass 1: Opaque geometry (card stock, rims, print sheet, 3D coin, shavings)
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      for (const m of this.meshes) {
        if (!m.visible || m.transparent) continue;
        this.drawMeshItem(m);
      }

      // Pass 2: Alpha-masked metallic foil layers (smooth anti-aliased scraped edge over print sheet)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const m of this.meshes) {
        if (!m.visible || !m.transparent) continue;
        this.drawMeshItem(m);
      }
      gl.disable(gl.BLEND);

      this.drawFloor();
    }
  }
  window.EonScratchStage = { ScratchStage3D, qFromChain, add, sub, scale, dot, cross, normalize };
})();

}

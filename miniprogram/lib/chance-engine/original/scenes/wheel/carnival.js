// Synced from Android chance/scenes/wheel/carnival.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window

;
/*
 * Scheme A from design/explorations/wheel-3d-assets.html.
 * The prototype's brass/lacquer lighting and separate material roughness are kept here
 * alongside its seven procedural meshes and 1024px dial, all packaged offline.
 */
(function () {
  'use strict';
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

  function modelMatrix(q, p) {
    const [x, y, z, w] = q;
    const xx = x * x, yy = y * y, zz = z * z;
    return new Float32Array([
      1 - 2 * (yy + zz), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
      2 * (x * y - z * w), 1 - 2 * (xx + zz), 2 * (y * z + x * w), 0,
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (xx + yy), 0,
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
    const f = 1 / Math.tan((30 * Math.PI) / 360);
    const n = 0.1, far = 60;
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + n) / (n - far), -1,
      0, 0, (2 * far * n) / (n - far), 0,
    ]);
  }

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
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
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
    void main() {
      vec3 n = normalize(vNormal);
      vec3 keyDir = normalize(vec3(-3.0, 7.2, 5.2));
      vec3 fillDir = normalize(vec3(5.0, 1.4, 2.4));
      vec3 rimDir = normalize(vec3(-4.4, 4.2, -5.0));
      vec3 viewDir = normalize(uEye - vWorld);
      vec3 R = reflect(-viewDir, n);

      float key = max(dot(n, keyDir), 0.0);
      float fill = max(dot(n, fillDir), 0.0);
      float rim = max(dot(n, rimDir), 0.0);
      float ndv = max(dot(n, viewDir), 0.0);

      if (vFlag > 0.5 && vFlag < 1.5) {
        float depthShade = mix(0.58, 1.0, clamp(vUv.y, 0.0, 1.0));
        vec3 cav = uCavityColor * (0.24 + key * 0.16 + fill * 0.06) * depthShade;
        gl_FragColor = vec4(cav, 1.0);
        return;
      }

      vec3 base = uColor;
      float metal = uMatMeta.x;
      float rough = uMatRough.x;

      bool isTexFace = (vFlag < 0.5 && uTextured > 0.5);
      if (isTexFace) {
        base = texture2D(uTex, vUv).rgb;
      } else if (vFlag > 1.5 && vFlag < 2.5) {
        base = uAccentColor;
        metal = uMatMeta.y;
        rough = uMatRough.y;
      } else if (vFlag > 2.5) {
        base = uTrimColor;
        metal = uMatMeta.z;
        rough = uMatRough.z;
      }

      metal = clamp(metal, 0.0, 0.95);
      rough = clamp(rough, 0.14, 0.92);

      // Studio analytic reflection: overhead softbox, dark horizon band, warm desk bounce
      float topBox = smoothstep(0.20, 0.85, R.y);
      float horizonDistance = (R.y - 0.03) * 5.0;
      float horizonBand = exp(-horizonDistance * horizonDistance);
      float floorBounce = 1.0 - smoothstep(-0.65, -0.05, R.y);
      vec3 env = mix(vec3(0.52, 0.54, 0.50), vec3(1.07, 1.05, 1.00), topBox);
      env = mix(env, vec3(0.13, 0.16, 0.15), horizonBand * 0.86);
      env = mix(env, vec3(0.79, 0.80, 0.73), floorBounce * 0.75);

      if (isTexFace) {
        // High-legibility satin lacquer shading for dial faces so Chinese labels stay crisp
        vec3 diffuse = base * (0.64 + key * 0.34 + fill * 0.10);
        vec3 H = normalize(keyDir + viewDir);
        float ndh = max(dot(n, H), 0.0);
        float sheen = pow(ndh, 42.0) * 0.11 + pow(ndh, 12.0) * 0.04;
        float rimGlow = pow(rim, 2.0) * pow(1.0 - ndv, 2.4) * 0.07;
        vec3 lit = diffuse + env * 0.045 + vec3(sheen + rimGlow);
        gl_FragColor = vec4(lit, 1.0);
        return;
      }

      float diffuseScale = mix(1.0, 0.35, metal);
      vec3 diffuse = base * diffuseScale * (0.48 + key * 0.42 + fill * 0.12);

      vec3 specTint = mix(vec3(1.0), base * 1.24, metal);
      float fresnel = metal + (1.0 - metal) * pow(1.0 - ndv, 4.0) * 0.55;
      float envWeight = (0.08 + metal * 0.72) * (1.0 - rough * 0.62) * (0.55 + 0.45 * fresnel);

      vec3 H = normalize(keyDir + viewDir);
      float ndh = max(dot(n, H), 0.0);
      float tightSpec = pow(ndh, mix(96.0, 14.0, rough)) * mix(0.64, 0.09, rough);
      float broadSpec = pow(ndh, mix(18.0, 6.0, rough)) * mix(0.26, 0.07, rough);
      float rimSpec = pow(rim, 1.8) * pow(1.0 - ndv, 2.2) * (0.12 + metal * 0.36);

      vec3 lit = diffuse + env * specTint * envWeight + specTint * (tightSpec + broadSpec + rimSpec);
      gl_FragColor = vec4(lit, 1.0);
    }
  `;

  class CarnivalStage {
    constructor(stage, canvas, shadow) {
      this.stage = stage;
      this.canvas = canvas;
      this.shadow = shadow;
      this.ctx = shadow.getContext('2d');
      this.gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
      if (!this.gl) throw new Error('WebGL unavailable');

      const gl = this.gl;
      this.anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
      this.maxAniso = this.anisoExt ? Math.min(8, gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;

      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, VERTEX_SRC);
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);

      this.attribs = [['aPosition', 3, 0], ['aNormal', 3, 3], ['aUv', 2, 6], ['aFlag', 1, 8]]
        .map(([name, size, offset]) => {
          const loc = gl.getAttribLocation(this.program, name);
          gl.enableVertexAttribArray(loc);
          return [loc, size, offset];
        });
      const uniforms = [
        'uModel', 'uVP', 'uEye', 'uColor', 'uAccentColor', 'uTrimColor', 'uCavityColor',
        'uMatMeta', 'uMatRough', 'uTex', 'uTextured',
      ];
      this.uniforms = Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(this.program, name)]));
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.clearColor(0, 0, 0, 0);

      this.meshes = [];
      this.shadows = [
        { x: 0, y: 0, z: 0.02, radius: 0.27, opacity: 0.30, stretch: 1.48, stretchY: 0.44 },
        { x: 0, y: 0.14, z: -0.18, radius: 0.20, opacity: 0.18, stretch: 1.25, stretchY: 0.38 },
      ];
      this.tray = { halfX: 2.48, halfZ: 1.72, corner: 0.40 };
      this.eye = [1.38, 4.75, 9.25];
      this.view = cameraMatrix(this.eye, [0, 1.36, 0.04]);
      this.lost = false;
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(stage);
      window.addEventListener('resize', () => this.resize(), { passive: true });
      this.resize();
    }

    addMesh(data, material) {
      const gl = this.gl;
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const mesh = {
        buffer,
        count: data.length / 9,
        ...material,
        q: [0, 0, 0, 1],
        position: [0, 0, 0],
        visible: true,
      };
      this.meshes.push(mesh);
      return mesh;
    }

    canvasTexture(canvas, texture = this.gl.createTexture()) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (this.maxAniso > 1) {
        gl.texParameterf(gl.TEXTURE_2D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAniso);
      }
      return texture;
    }

    resize() {
      const { width, height } = this.stage.getBoundingClientRect();
      if (width < 1 || height < 1 || this.lost) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (width === this.stageW && height === this.stageH && dpr === this.dpr) return;
      this.dpr = dpr;
      this.stageW = width;
      this.stageH = height;
      this.canvas.width = this.shadow.width = Math.round(width * dpr);
      this.canvas.height = this.shadow.height = Math.round(height * dpr);
      this.vp = multiply(perspective(width / height), this.view);
      this.drawFloor();
      this.draw();
    }

    // Intersect the pointer's perspective ray with the actual dial plane.
    dialPoint(clientX, clientY) {
      if (!this.vp) return null;
      const rect = this.stage.getBoundingClientRect();
      const x = 2 * (clientX - rect.left) / rect.width - 1;
      const y = 1 - 2 * (clientY - rect.top) / rect.height;
      const m = this.vp;
      const a = m[0] - x * m[3], b = m[4] - x * m[7];
      const c = m[1] - y * m[3], d = m[5] - y * m[7];
      const w = m[11] * WHEEL_FACE_Z + m[15];
      const e = x * w - m[8] * WHEEL_FACE_Z - m[12];
      const f = y * w - m[9] * WHEEL_FACE_Z - m[13];
      const determinant = a * d - b * c;
      if (Math.abs(determinant) < 1e-6) return null;
      return [(e * d - b * f) / determinant, (a * f - e * c) / determinant - WHEEL_Y];
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

    drawBlob(x3, z3, radiusFrac, opacity, air, stretchX, stretchY) {
      const ctx = this.ctx;
      const [sx, sy] = this.project([x3, 0, z3]);
      const size = this.stageH * radiusFrac * (1 + air * 0.12);
      ctx.save();
      ctx.translate(sx + 5 + air * 9, sy + 3 + air * 3);
      ctx.scale(stretchX, stretchY);
      const g = ctx.createRadialGradient(0, 0, size * 0.14, 0, 0, size);
      g.addColorStop(0, `rgba(47, 62, 33, ${opacity})`);
      g.addColorStop(0.45, `rgba(47, 62, 33, ${opacity * 0.54})`);
      g.addColorStop(1, 'rgba(47, 62, 33, 0)');
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

      this.floorPath(-0.065);
      ctx.fillStyle = '#d7dccd';
      ctx.fill();

      this.floorPath(0);
      const surface = ctx.createLinearGradient(0, this.stageH * 0.18, this.stageW, this.stageH * 0.92);
      surface.addColorStop(0, '#f0f1e8');
      surface.addColorStop(1, '#e6eadc');
      ctx.fillStyle = surface;
      ctx.fill();
      ctx.strokeStyle = '#dce1d1';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.save();
      ctx.clip();
      for (const s of this.shadows) {
        const lift = s.y;
        const op = s.opacity / (1 + lift * 1.35);
        this.drawBlob(s.x, s.z, s.radius, op, lift, s.stretch, s.stretchY);
      }
      ctx.restore();
    }

    draw() {
      if (!this.vp || this.lost) return;
      const gl = this.gl, u = this.uniforms;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(u.uVP, false, this.vp);
      gl.uniform3fv(u.uEye, this.eye);

      for (const m of this.meshes) {
        if (!m.visible) continue;
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
        gl.uniform1f(u.uTextured, m.texture ? 1 : 0);
        if (m.texture) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, m.texture);
          gl.uniform1i(u.uTex, 0);
        }
        gl.uniformMatrix4fv(u.uModel, false, modelMatrix(m.q, m.position));
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
      }
    }
  }

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

  /**
   * Builds a lathe along the Z-axis (used for Scheme A upright wheel drum, brass pegs, hub cap).
   * Rings: { z, r, flag, sharp? }. Winding enforced strictly outward via pushQuadSmooth.
   */
  function appendLatheZ(out, rings, segs, offset = [0, 0, 0]) {
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
        const dz = prof[i + 1].z - prof[i].z;
        const dr = prof[i + 1].r - prof[i].r;
        const l = Math.hypot(dz, dr) || 1;
        // The profile runs from rear to front on the exterior and back along any recess.
        segNorms.push([-dr / l, dz / l]);
      }
      const pNorms = prof.map((_, i) => {
        const a = segNorms[Math.max(0, i - 1)];
        const b = segNorms[Math.min(segNorms.length - 1, i)];
        const nz = a[0] + b[0], nr = a[1] + b[1];
        const l = Math.hypot(nz, nr) || 1;
        return [nz / l, nr / l];
      });

      const vert = (j, s) => {
        const t = (s / segs) * TAU;
        const rr = prof[j].r;
        const cx = Math.cos(t), cy = Math.sin(t);
        const [nz, nr] = pNorms[j];
        const n = normalize([nr * cx, nr * cy, nz]);
        return {
          p: [rr * cx + offset[0], rr * cy + offset[1], prof[j].z + offset[2]],
          n,
          uv: [s / segs, (prof[j].z + 0.5)],
          f: prof[j].flag,
        };
      };

      for (let s = 0; s < segs; s++) {
        for (let j = 0; j < prof.length - 1; j++) {
          const a = vert(j, s), b = vert(j, s + 1), c = vert(j + 1, s + 1), d = vert(j + 1, s);
          if (prof[j].r > 1e-4 || prof[j + 1].r > 1e-4) {
            const segF = prof[j + 1].flag;
            pushQuadSmooth(out, a.p, b.p, c.p, d.p, a.n, b.n, c.n, d.n, a.uv, b.uv, c.uv, d.uv, segF, segF, segF, segF);
          }
        }
      }
    }
  }

  // The bracket cap is turned about the vertical Y axis.
  function appendLatheY(out, rings, segs, offset = [0, 0, 0]) {
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
        const dy = prof[i + 1].y - prof[i].y;
        const dr = prof[i + 1].r - prof[i].r;
        const l = Math.hypot(dy, dr) || 1;
        segNorms.push([dy / l, -dr / l]); // [nr, ny]
      }
      const pNorms = prof.map((_, i) => {
        const a = segNorms[Math.max(0, i - 1)];
        const b = segNorms[Math.min(segNorms.length - 1, i)];
        const nr = a[0] + b[0], ny = a[1] + b[1];
        const l = Math.hypot(nr, ny) || 1;
        return [nr / l, ny / l];
      });

      const vert = (j, s) => {
        const t = (s / segs) * TAU;
        const rr = prof[j].r;
        const cx = Math.cos(t), cz = Math.sin(t);
        const [nr, ny] = pNorms[j];
        const n = normalize([nr * cx, ny, nr * cz]);
        return {
          p: [rr * cx + offset[0], prof[j].y + offset[1], rr * cz + offset[2]],
          n,
          uv: [s / segs, prof[j].y],
          f: prof[j].flag,
        };
      };

      for (let s = 0; s < segs; s++) {
        for (let j = 0; j < prof.length - 1; j++) {
          const a = vert(j, s), b = vert(j, s + 1), c = vert(j + 1, s + 1), d = vert(j + 1, s);
          if (prof[j].r > 1e-4 || prof[j + 1].r > 1e-4) {
            const segF = prof[j + 1].flag;
            pushQuadSmooth(out, a.p, b.p, c.p, d.p, a.n, b.n, c.n, d.n, a.uv, b.uv, c.uv, d.uv, segF, segF, segF, segF);
          }
        }
      }
    }
  }

  /**
   * Builds a swept chamfered tube along a 3D polyline (for A-frame struts & swan-neck arch).
   */
  function appendTube3D(out, pts, rA, rB, flag = 0, closed = false) {
    const P = 10;
    const S = pts.length;
    const rings = [];
    for (let i = 0; i < S; i++) {
      const pPrev = pts[closed ? (i + S - 1) % S : Math.max(0, i - 1)];
      const pNext = pts[closed ? (i + 1) % S : Math.min(S - 1, i + 1)];
      const tang = normalize(sub(pNext, pPrev));
      const refUp = Math.abs(tang[0]) < 0.85 ? [1, 0, 0] : [0, 1, 0];
      const uVec = normalize(cross(tang, refUp));
      const vVec = normalize(cross(tang, uVec));
      const tFrac = i / Math.max(1, S - 1);
      const rX = rA * (1 - tFrac) + rB * tFrac;
      const ring = [];
      for (let j = 0; j < P; j++) {
        const a = (j / P) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const n = normalize(add(scale(uVec, ca), scale(vVec, sa)));
        const p = add(pts[i], scale(n, rX));
        ring.push({ p, n, uv: [j / P, tFrac] });
      }
      rings.push(ring);
    }
    const segCount = closed ? S : S - 1;
    for (let i = 0; i < segCount; i++) {
      const r0 = rings[i], r1 = rings[(i + 1) % S];
      for (let j = 0; j < P; j++) {
        const jn = (j + 1) % P;
        const a = r0[j], b = r0[jn], c = r1[jn], d = r1[j];
        pushQuadSmooth(out, a.p, b.p, c.p, d.p, a.n, b.n, c.n, d.n, a.uv, b.uv, c.uv, d.uv, flag, flag, flag, flag);
      }
    }
    if (!closed) {
      const tStart = normalize(sub(pts[0], pts[1]));
      const tEnd = normalize(sub(pts[S - 1], pts[S - 2]));
      for (let j = 0; j < P; j++) {
        const jn = (j + 1) % P;
        pushTri(out, pts[0], rings[0][j].p, rings[0][jn].p, tStart, [0.5, 0.5], [0, 0], [1, 0], flag);
        pushTri(out, pts[S - 1], rings[S - 1][j].p, rings[S - 1][jn].p, tEnd, [0.5, 0.5], [0, 0], [1, 0], flag);
      }
    }
  }

  /**
   * Builds a beveled XY extruded polygon (used for sculpted clapper pointer & nameplate).
   */
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

  function appendExtrudedXY(out, rawPoly, z0, z1, bevel = 0.012, flag = 0) {
    const poly = signedArea2D(rawPoly) >= 0 ? rawPoly.slice() : rawPoly.slice().reverse();
    const N = poly.length;
    const b = Math.min(bevel, (z1 - z0) * 0.36);
    const zF = z1, zFB = z1 - b, zBB = z0 + b, zB = z0;

    const inner = poly.map((_, i) => {
      const pPrev = poly[(i + N - 1) % N], pCurr = poly[i], pNext = poly[(i + 1) % N];
      const e1 = normalize([pCurr[0] - pPrev[0], pCurr[1] - pPrev[1], 0]);
      const e2 = normalize([pNext[0] - pCurr[0], pNext[1] - pCurr[1], 0]);
      const nIn1 = [-e1[1], e1[0]];
      const nIn2 = [-e2[1], e2[0]];
      const bis = [nIn1[0] + nIn2[0], nIn1[1] + nIn2[1]];
      const bl = Math.hypot(bis[0], bis[1]) || 1;
      const d = Math.min(b * 0.72, 0.020);
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

  const WHEEL_Y = 1.46;
  const WHEEL_R = 1.20;
  const WHEEL_FACE_R = 1.115;
  const WHEEL_PEG_R = 1.055;
  const WHEEL_FACE_Z = 0.165;

  function buildCarnivalStandGeo() {
    const out = [];
    // 1. Stepped chamfered base plinth sitting squarely on desk y = 0
    appendBeveledBox(out, -1.16, 1.16, 0.00, 0.125, -0.58, 0.56, 0.032, 0);
    // Upper recessed brass trim lip around plinth
    appendBeveledBox(out, -1.07, 1.07, 0.115, 0.165, -0.50, 0.48, 0.016, 2);
    // Front brass escutcheon badge on base front face
    appendBeveledBox(out, -0.34, 0.34, 0.035, 0.105, 0.54, 0.59, 0.012, 2);

    // 2. Twin sculpted flared A-frame legs (strictly at z <= -0.11 above y = 0.22 -> zero collision with wheel)
    for (const sgn of [-1, 1]) {
      // Foot pad anchored on plinth
      appendBeveledBox(out, sgn > 0 ? 0.72 : -1.02, sgn > 0 ? 1.02 : -0.72, 0.15, 0.23, -0.44, 0.24, 0.018, 2);
      // Primary swept A-frame leg rising from plinth flanks inward to rear axle housing
      const mainLeg = [
        [sgn * 0.86, 0.18, -0.18],
        [sgn * 0.78, 0.48, -0.19],
        [sgn * 0.60, 0.88, -0.20],
        [sgn * 0.38, 1.24, -0.21],
        [sgn * 0.22, WHEEL_Y, -0.21],
      ];
      appendTube3D(out, mainLeg, 0.078, 0.056, 0);

      // Rear tripod stabilizer brace
      const rearBrace = [
        [sgn * 0.54, 0.17, -0.42],
        [sgn * 0.36, 0.78, -0.34],
        [sgn * 0.16, WHEEL_Y - 0.04, -0.25],
      ];
      appendTube3D(out, rearBrace, 0.052, 0.042, 0);

      // Brass foot collar & mid-leg brass accent sleeve
      appendBeveledBox(out, sgn * 0.86 - 0.09, sgn * 0.86 + 0.09, 0.19, 0.28, -0.27, -0.09, 0.014, 2);
    }

    // 3. Turned horizontal brass cross-tie rod uniting the two A-frame legs
    const tiePts = [[-0.68, 0.62, -0.20], [0.68, 0.62, -0.20]];
    appendTube3D(out, tiePts, 0.036, 0.036, 2);
    // Decorative center brass medallion on tie-bar
    appendLatheZ(out, [
      { z: -0.25, r: 0.001, flag: 2 },
      { z: -0.25, r: 0.075, flag: 2, sharp: true },
      { z: -0.15, r: 0.075, flag: 2, sharp: true },
      { z: -0.15, r: 0.001, flag: 2 },
    ], 24, [0, 0.62, 0]);

    // 4. Turned rear axle bearing housing + forward spindle connecting to wheel back
    appendLatheZ(out, [
      { z: -0.34, r: 0.001, flag: 2 },
      { z: -0.34, r: 0.13, flag: 2, sharp: true },
      { z: -0.30, r: 0.21, flag: 2 },
      { z: -0.26, r: 0.23, flag: 0, sharp: true },
      { z: -0.12, r: 0.23, flag: 0, sharp: true },
      { z: -0.10, r: 0.15, flag: 2, sharp: true },
      { z: -0.02, r: 0.11, flag: 2, sharp: true },
      { z: -0.02, r: 0.001, flag: 2 },
    ], 36, [0, WHEEL_Y, 0]);

    return new Float32Array(out);
  }

  function buildCarnivalBracketGeo() {
    const out = [];
    // Graceful swan-neck brass arch rising from rear axle housing up & over 12 o'clock
    const archPts = [
      [0, WHEEL_Y + 0.16, -0.21],
      [0, WHEEL_Y + 0.80, -0.23],
      [0, WHEEL_Y + 1.24, -0.20],
      [0, WHEEL_Y + 1.38, -0.06],
      [0, WHEEL_Y + 1.40, 0.12],
      [0, WHEEL_Y + 1.32, 0.245],
    ];
    appendTube3D(out, archPts, 0.052, 0.040, 2);

    // Machined brass clapper pivot barrel at [0, WHEEL_Y + 1.28, 0.245]
    appendLatheZ(out, [
      { z: 0.17, r: 0.001, flag: 2 },
      { z: 0.17, r: 0.090, flag: 2, sharp: true },
      { z: 0.29, r: 0.090, flag: 2, sharp: true },
      { z: 0.315, r: 0.062, flag: 3, sharp: true },
      { z: 0.325, r: 0.044, flag: 2 },
      { z: 0.33, r: 0.001, flag: 2 },
    ], 28, [0, WHEEL_Y + 1.28, 0]);

    // Decorative finial spire crowning the arch apex
    appendLatheY(out, [
      { y: WHEEL_Y + 1.38, r: 0.001, flag: 2 },
      { y: WHEEL_Y + 1.38, r: 0.062, flag: 2, sharp: true },
      { y: WHEEL_Y + 1.44, r: 0.042, flag: 2 },
      { y: WHEEL_Y + 1.50, r: 0.056, flag: 2 },
      { y: WHEEL_Y + 1.57, r: 0.022, flag: 2 },
      { y: WHEEL_Y + 1.61, r: 0.001, flag: 2 },
    ], 24, [0, 0, 0.10]);

    return new Float32Array(out);
  }

  function buildCarnivalClapperGeo() {
    const out = [];
    // Local origin is the top pivot [0, 0, 0]; blade hangs down to y = -0.375
    // Sculpted teardrop lancet body (flag = 2 brass)
    const outerPoly = [
      [0.00, 0.075],
      [0.074, 0.042],
      [0.088, -0.025],
      [0.056, -0.185],
      [0.020, -0.352],
      [0.00, -0.378],
      [-0.020, -0.352],
      [-0.056, -0.185],
      [-0.088, -0.025],
      [-0.074, 0.042],
    ];
    appendExtrudedXY(out, outerPoly, -0.032, 0.032, 0.012, 2);

    // Contrasting recessed enamel arrow inlay on front face (flag = 3 vermilion/accent)
    const inlayPoly = [
      [0.00, -0.012],
      [0.046, -0.068],
      [0.014, -0.305],
      [0.00, -0.332],
      [-0.014, -0.305],
      [-0.046, -0.068],
    ];
    appendExtrudedXY(out, inlayPoly, 0.022, 0.044, 0.006, 3);

    return new Float32Array(out);
  }

  function buildCarnivalDrumGeo() {
    const out = [];
    // 96-segment precision beveled wheel chassis along Z (centered at local origin)
    appendLatheZ(out, [
      { z: -0.055, r: 0.001, flag: 0 },
      { z: -0.055, r: 0.28, flag: 2, sharp: true },
      { z: -0.040, r: 0.30, flag: 2, sharp: true },
      { z: -0.040, r: 1.13, flag: 0, sharp: true },
      { z: -0.018, r: WHEEL_R, flag: 0, sharp: true },
      { z: 0.035, r: WHEEL_R, flag: 0, sharp: true },
      // Central raised brushed-brass equatorial band around the drum perimeter
      { z: 0.045, r: WHEEL_R + 0.016, flag: 2, sharp: true },
      { z: 0.115, r: WHEEL_R + 0.016, flag: 2, sharp: true },
      { z: 0.125, r: WHEEL_R, flag: 0, sharp: true },
      // Front stepped brass bezel lip framing the recessed dial face
      { z: 0.168, r: WHEEL_R, flag: 2, sharp: true },
      { z: 0.205, r: 1.175, flag: 2, sharp: true },
      { z: 0.212, r: 1.135, flag: 2, sharp: true },
      { z: 0.175, r: 1.105, flag: 2, sharp: true },
      // Inner recessed seat behind dial face
      { z: 0.145, r: 1.105, flag: 1, sharp: true },
      { z: 0.145, r: 0.001, flag: 1 },
    ], 96);
    return new Float32Array(out);
  }

  function buildCarnivalFaceGeo() {
    const out = [];
    const segs = 96;
    const R = WHEEL_FACE_R;
    const zF = WHEEL_FACE_Z;
    const zB = WHEEL_FACE_Z - 0.022;

    // Front textured face (+Z): u = 0.5 + x/(2R), v = 0.5 + y/(2R) -> upright & non-mirrored!
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU;
      const a1 = ((s + 1) / segs) * TAU;
      const x0 = R * Math.cos(a0), y0 = R * Math.sin(a0);
      const x1 = R * Math.cos(a1), y1 = R * Math.sin(a1);
      pushTri(
        out,
        [0, 0, zF], [x0, y0, zF], [x1, y1, zF],
        [0, 0, 1],
        [0.5, 0.5],
        [0.5 + x0 / (2 * R), 0.5 + y0 / (2 * R)],
        [0.5 + x1 / (2 * R), 0.5 + y1 / (2 * R)],
        0
      );
      // Solid backing wafer on the rear of the dial.
      pushTri(
        out,
        [0, 0, zB], [x1, y1, zB], [x0, y0, zB],
        [0, 0, -1],
        [0.5, 0.5], [0, 0], [1, 0],
        2
      );
      // Perimeter rim of wafer
      const n0 = [Math.cos(a0), Math.sin(a0), 0];
      const n1 = [Math.cos(a1), Math.sin(a1), 0];
      pushQuadSmooth(
        out,
        [x0, y0, zB], [x1, y1, zB], [x1, y1, zF], [x0, y0, zF],
        n0, n1, n1, n0,
        [0, 0], [1, 0], [1, 1], [0, 1],
        2, 2, 2, 2
      );
    }
    return new Float32Array(out);
  }

  function buildCarnivalPegsGeo(count) {
    const out = [];
    for (let k = 0; k < count; k++) {
      // Exact sector boundary angle phi_k clockwise from 12 o'clock: x = R sin(phi), y = R cos(phi)
      const phi = (k / count) * TAU;
      const px = WHEEL_PEG_R * Math.sin(phi);
      const py = WHEEL_PEG_R * Math.cos(phi);
      appendLatheZ(out, [
        { z: WHEEL_FACE_Z - 0.005, r: 0.001, flag: 2 },
        { z: WHEEL_FACE_Z - 0.005, r: 0.044, flag: 2, sharp: true },
        { z: WHEEL_FACE_Z + 0.022, r: 0.042, flag: 2, sharp: true },
        { z: WHEEL_FACE_Z + 0.030, r: 0.026, flag: 2 },
        { z: WHEEL_FACE_Z + 0.095, r: 0.027, flag: 2 },
        { z: WHEEL_FACE_Z + 0.112, r: 0.036, flag: 2 },
        { z: WHEEL_FACE_Z + 0.130, r: 0.026, flag: 2 },
        { z: WHEEL_FACE_Z + 0.140, r: 0.001, flag: 2 },
      ], 16, [px, py, 0]);
    }
    return new Float32Array(out);
  }

  function buildCarnivalHubGeo() {
    const out = [];
    // Multi-tiered lathe-turned brass hub cap
    appendLatheZ(out, [
      { z: WHEEL_FACE_Z, r: 0.001, flag: 2 },
      { z: WHEEL_FACE_Z, r: 0.275, flag: 2, sharp: true },
      { z: WHEEL_FACE_Z + 0.030, r: 0.265, flag: 2, sharp: true },
      { z: WHEEL_FACE_Z + 0.044, r: 0.228, flag: 3, sharp: true },
      { z: WHEEL_FACE_Z + 0.056, r: 0.210, flag: 2, sharp: true },
      { z: WHEEL_FACE_Z + 0.088, r: 0.195, flag: 2 },
      { z: WHEEL_FACE_Z + 0.125, r: 0.155, flag: 2 },
      { z: WHEEL_FACE_Z + 0.152, r: 0.092, flag: 2 },
      { z: WHEEL_FACE_Z + 0.168, r: 0.036, flag: 2 },
      { z: WHEEL_FACE_Z + 0.172, r: 0.001, flag: 2 },
    ], 48);
    // 6 decorative brass perimeter bolts around the hub flange
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const bx = 0.238 * Math.cos(a), by = 0.238 * Math.sin(a);
      appendLatheZ(out, [
        { z: WHEEL_FACE_Z + 0.025, r: 0.001, flag: 2 },
        { z: WHEEL_FACE_Z + 0.025, r: 0.022, flag: 2, sharp: true },
        { z: WHEEL_FACE_Z + 0.044, r: 0.020, flag: 2 },
        { z: WHEEL_FACE_Z + 0.052, r: 0.001, flag: 2 },
      ], 12, [bx, by, 0]);
    }
    return new Float32Array(out);
  }

  const FINISH = {
    stand: {
      color: [0.18, 0.32, 0.24], accent: [0.81, 0.67, 0.36], trim: [0.44, 0.29, 0.19], cavity: [0.05, 0.08, 0.06],
      matMeta: [0.22, 0.90, 0.12], matRough: [0.34, 0.22, 0.50],
    },
    drum: {
      color: [0.19, 0.34, 0.25], accent: [0.82, 0.68, 0.37], trim: [0.46, 0.30, 0.19], cavity: [0.05, 0.08, 0.06],
      matMeta: [0.26, 0.91, 0.50], matRough: [0.28, 0.21, 0.36],
    },
    brass: {
      color: [0.82, 0.68, 0.37], accent: [0.84, 0.70, 0.38], trim: [0.74, 0.27, 0.21], cavity: [0.06, 0.06, 0.05],
      matMeta: [0.91, 0.92, 0.14], matRough: [0.21, 0.20, 0.34],
    },
    dialTrainInner: '#3f694e', dialTrainOuter: '#2d4f3a', dialTrainText: '#fafbf4',
    dialRestInner: '#f7f4ea', dialRestOuter: '#e8e4d6', dialRestBg: '#f2efe4', dialRestText: '#495f70',
    dialGold: '#cfa958', dialHubCollar: '#284533',
  };

  function createMeshes(stage) {
    const brass = FINISH.brass;
    stage.addMesh(buildCarnivalStandGeo(), FINISH.stand);
    stage.addMesh(buildCarnivalBracketGeo(), brass);
    const clapper = stage.addMesh(buildCarnivalClapperGeo(), brass);
    clapper.position = [0, WHEEL_Y + 1.28, 0.245];
    const drum = stage.addMesh(buildCarnivalDrumGeo(), FINISH.drum);
    const face = stage.addMesh(buildCarnivalFaceGeo(), {
      color: [1, 1, 1], accent: brass.accent, trim: brass.accent, cavity: brass.cavity,
      matMeta: [0.05, 0.88, 0.88], matRough: [0.40, 0.24, 0.24],
    });
    const pegs12 = stage.addMesh(buildCarnivalPegsGeo(12), brass);
    const pegs10 = stage.addMesh(buildCarnivalPegsGeo(10), brass);
    const hub = stage.addMesh(buildCarnivalHubGeo(), brass);
    const spinning = [drum, face, pegs12, pegs10, hub];
    for (const mesh of spinning) mesh.position = [0, WHEEL_Y, 0];
    return { face, pegs12, pegs10, clapper, spinning };
  }

  function arcLabelAngles(startRad, endRad) {
    const span = endRad - startRad;
    const count = span >= 5.2 ? 6 : span >= 3.8 ? 4 : span >= 2.6 ? 3 : span >= 1.7 ? 2 : 1;
    const angles = [];
    for (let i = 0; i < count; i++) {
      angles.push(startRad + ((i + 0.5) / count) * span);
    }
    return angles;
  }

  function paintDial(spec, canvas) {
    const finish = FINISH;
    const S = 1024, cx = S / 2, cy = S / 2, R = S * 0.5;
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    const span = TAU * spec.trainCount / spec.pegCount;
    const sectors = [
      { startRad: 0, endRad: span, isTrain: true },
      { startRad: span, endRad: TAU, isTrain: false },
    ].filter(sector => sector.endRad > sector.startRad);

    // Base fill
    ctx.fillStyle = finish.dialRestBg;
    ctx.fillRect(0, 0, S, S);

    // 1. Paint exact proportional sectors clockwise from 12 o'clock (-PI/2)
    for (const sec of sectors) {
      const a0 = sec.startRad - Math.PI / 2;
      const a1 = sec.endRad - Math.PI / 2;
      const grad = ctx.createRadialGradient(cx, cy, R * 0.14, cx, cy, R);
      if (sec.isTrain) {
        grad.addColorStop(0, finish.dialTrainInner);
        grad.addColorStop(1, finish.dialTrainOuter);
      } else {
        grad.addColorStop(0, finish.dialRestInner);
        grad.addColorStop(1, finish.dialRestOuter);
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1, false);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 2. Subtle decorative radial wood/enamel sheen rings
    ctx.strokeStyle = 'rgba(255, 252, 240, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.885, 0, TAU);
    ctx.stroke();

    // Outer brass beaded chapter ring
    ctx.strokeStyle = finish.dialGold;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.945, 0, TAU);
    ctx.stroke();

    // Hairline peg divisions and brass boundaries between the two continuous arcs.
    const N = spec.pegCount;
    const divider = (phi, start, color, width) => {
      const a = phi - Math.PI / 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * start, cy + Math.sin(a) * R * start);
      ctx.lineTo(cx + Math.cos(a) * R * 0.945, cy + Math.sin(a) * R * 0.945);
      ctx.stroke();
    };
    for (let i = 0; i < N; i++) divider(i / N * TAU, 0.85, 'rgba(204, 178, 108, 0.24)', 2);
    if (sectors.length === 2) {
      divider(0, 0.25, finish.dialGold, 7);
      divider(span, 0.25, finish.dialGold, 7);
    }

    // 4. Peg socket rings on the canvas matching 3D peg positions
    for (let i = 0; i < N; i++) {
      const phi = (i / N) * TAU;
      const pr = R * (WHEEL_PEG_R / WHEEL_FACE_R);
      const px = cx + pr * Math.sin(phi);
      const py = cy - pr * Math.cos(phi);
      ctx.fillStyle = 'rgba(28, 36, 30, 0.32)';
      ctx.beginPath();
      ctx.arc(px, py, 16, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = finish.dialGold;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 5. Radial Chinese labels read upright when they reach the pointer.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const drawRadialLabel = (phi, isTrain, fontSize, radiusRatio, subText) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(phi);
      const yPos = -R * radiusRatio;
      ctx.fillStyle = isTrain ? finish.dialTrainText : finish.dialRestText;
      ctx.font = `700 ${fontSize}px "Songti SC", "STSong", "Noto Serif CJK SC", "PingFang SC", serif`;
      ctx.fillText(isTrain ? '练' : '歇', 0, yPos);

      // Decorative pip near outer edge
      ctx.fillStyle = isTrain ? 'rgba(232, 214, 154, 0.82)' : 'rgba(89, 110, 128, 0.42)';
      ctx.beginPath();
      ctx.arc(0, -R * 0.835, 5.5, 0, TAU);
      ctx.fill();

      if (subText) {
        ctx.fillStyle = isTrain ? 'rgba(244, 240, 222, 0.80)' : 'rgba(72, 92, 108, 0.72)';
        ctx.font = '600 28px -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif';
        ctx.fillText(subText, 0, -R * 0.445);
      }
      ctx.restore();
    };

    const percentLabel = count => {
      if (3 * count === N) return '1/3';
      if (3 * count === 2 * N) return '2/3';
      return `${Math.round(count * 100 / N)}%`;
    };
    for (const sec of sectors) {
      const arc = sec.endRad - sec.startRad;
      const anchors = arcLabelAngles(sec.startRad, sec.endRad);
      const fontSize = arc < 0.75 ? 74 : arc < 1.3 ? 90 : 104;
      const label = percentLabel(sec.isTrain ? spec.trainCount : N - spec.trainCount);
      anchors.forEach((phi, i) => {
        const showSub = anchors.length <= 2 || i % 2 === 0;
        drawRadialLabel(phi, sec.isTrain, fontSize, 0.645, showSub ? label : null);
      });
    }

    // 6. Inner vintage sunburst collar around the central brass hub
    ctx.fillStyle = finish.dialHubCollar;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.30, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = finish.dialGold;
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  window.EonCarnival = { CarnivalStage, createMeshes, paintDial, WHEEL_R };
})();

}

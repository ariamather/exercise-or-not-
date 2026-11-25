// Synced from Android chance/lib/studio.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window
  const { EonAnim } = window

;
/* Studio lighting for tabletop props with metal finishes, emissive accents, and glass. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
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

  function perspective(aspect, fov, minAspect) {
    const f = Math.min(1, aspect / minAspect) / Math.tan(fov * Math.PI / 360);
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
    uniform float uAlpha;
    uniform float uEmissive;
    void main() {
      vec3 n = normalize(vNormal);
      if (!gl_FrontFacing) n = -n;
      vec3 keyDir = normalize(vec3(-2.6, 6.8, 5.4));
      vec3 fillDir = normalize(vec3(5.0, 1.4, 2.5));
      vec3 rimDir = normalize(vec3(-4.0, 4.2, -5.2));
      vec3 viewDir = normalize(uEye - vWorld);
      vec3 R = reflect(-viewDir, n);

      float key = max(dot(n, keyDir), 0.0);
      float fill = max(dot(n, fillDir), 0.0);
      float rim = max(dot(n, rimDir), 0.0);
      float ndv = max(dot(n, viewDir), 0.0);

      if (vFlag > 0.5 && vFlag < 1.5) {
        float depthShade = mix(0.58, 1.0, clamp(vUv.y, 0.0, 1.0));
        vec3 cav = uCavityColor * (0.26 + key * 0.14 + fill * 0.07) * depthShade;
        gl_FragColor = vec4(cav, uAlpha);
        return;
      }

      vec3 base = uColor;
      float metal = uMatMeta.x;
      float rough = uMatRough.x;

      if (vFlag < 0.5 && uTextured > 0.5) {
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
      rough = clamp(rough, 0.12, 0.92);

      // Analytic studio reflection map
      float topBox = smoothstep(0.20, 0.84, R.y);
      float horizonBand = exp(-pow((R.y - 0.03) * 5.0, 2.0));
      float floorBounce = 1.0 - smoothstep(-0.65, -0.05, R.y);
      vec3 env = mix(vec3(0.52, 0.54, 0.50), vec3(1.06, 1.04, 1.00), topBox);
      env = mix(env, vec3(0.14, 0.17, 0.16), horizonBand * 0.84);
      env = mix(env, vec3(0.80, 0.81, 0.75), floorBounce * 0.74);

      float diffuseScale = mix(1.0, 0.36, metal);
      vec3 diffuse = base * diffuseScale * (0.50 + key * 0.42 + fill * 0.12);

      vec3 specTint = mix(vec3(1.0), base * 1.22, metal);
      float fresnel = metal + (1.0 - metal) * pow(1.0 - ndv, 4.0) * 0.55;
      float envWeight = (0.08 + metal * 0.70) * (1.0 - rough * 0.62) * (0.55 + 0.45 * fresnel);

      vec3 H = normalize(keyDir + viewDir);
      float ndh = max(dot(n, H), 0.0);
      float tightSpec = pow(ndh, mix(110.0, 14.0, rough)) * mix(0.66, 0.09, rough);
      float broadSpec = pow(ndh, mix(18.0, 6.0, rough)) * mix(0.24, 0.06, rough);
      float rimSpec = pow(rim, 1.8) * pow(1.0 - ndv, 2.2) * (0.12 + metal * 0.34);

      if (uAlpha < 0.99) {
        // Crystal-clear architectural curved glass visor with subtle corner softbox reflection
        float gFres = pow(1.0 - ndv, 3.2);
        float diagSweep = exp(-pow((vUv.x * 0.92 + vUv.y * 0.72 - 1.18) * 6.8, 2.0)) * 0.24;
        float topEdge = smoothstep(0.76, 1.0, vUv.y) * 0.14;
        vec3 glassCol = mix(base, vec3(0.99, 0.99, 0.97), 0.78) * (0.88 + 0.30 * topBox)
                      + vec3(1.0) * (tightSpec * 1.25 + diagSweep + topEdge);
        float glassA = clamp(uAlpha + gFres * 0.18 + tightSpec * 0.32 + diagSweep * 0.38 + topEdge, 0.025, 0.44);
        gl_FragColor = vec4(glassCol, glassA);
        return;
      }

      vec3 lit = diffuse + env * specTint * envWeight + specTint * (tightSpec + broadSpec + rimSpec);
      lit += base * uEmissive;
      gl_FragColor = vec4(lit, 1.0);
    }
  `;

  class Studio {
    constructor(stage, canvas, shadow, { eye, target, tray, shadows, fov = 30, minAspect = 0.9 }) {
      this.stage = stage;
      this.canvas = canvas;
      this.shadow = shadow;
      this.ctx = shadow.getContext('2d');
      this.gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
      if (!this.gl || !this.ctx) throw new Error('Studio graphics unavailable');
      this.lost = false;
      canvas.addEventListener('webglcontextlost', () => { this.lost = true; });

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
        'uMatMeta', 'uMatRough', 'uTex', 'uTextured', 'uAlpha', 'uEmissive',
      ];
      this.uniforms = Object.fromEntries(uNames.map(n => [n, gl.getUniformLocation(this.program, n)]));

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.clearColor(0, 0, 0, 0);

      this.meshes = [];
      this.buffers = new WeakMap();
      this.shadows = shadows;
      this.tray = tray;
      this.target = target;
      this.fov = fov;
      this.minAspect = minAspect;
      const offset = sub(eye, target);
      this.camDist = Math.hypot(...offset);
      this.camYaw = Math.atan2(offset[0], offset[2]);
      this.camPitch = Math.asin(offset[1] / this.camDist);
      this.updateCamera();

      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.stage);
      window.addEventListener('resize', () => this.resize(), { passive: true });
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
        this.vp = multiply(perspective(this.stageW / this.stageH, this.fov, this.minAspect), this.view);
      }
    }

    addMesh(data, opts = {}) {
      const gl = this.gl;
      let buffer = this.buffers.get(data);
      if (!buffer) {
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        this.buffers.set(data, buffer);
      }
      const mDef = opts.metallic ?? 0.0;
      const rDef = opts.roughness ?? 0.55;
      const mesh = {
        buffer,
        count: data.length / 9,
        color: opts.color || [0.3, 0.45, 0.35],
        accent: opts.accent || [0.78, 0.65, 0.36],
        trim: opts.trim || [0.46, 0.32, 0.22],
        cavity: opts.cavity || [0.06, 0.08, 0.07],
        matMeta: opts.matMeta || [mDef, mDef, mDef],
        matRough: opts.matRough || [rDef, rDef, rDef],
        texture: opts.texture || null,
        alpha: opts.alpha ?? 1.0,
        emissive: opts.emissive ?? 0.0,
        q: [0, 0, 0, 1],
        position: [0, 0, 0],
        scale: opts.scale || 1,
        doubleSided: !!opts.doubleSided,
      };
      this.meshes.push(mesh);
      return mesh;
    }

    canvasTexture(cnv, existing = null, repeatT = false) {
      const gl = this.gl;
      const tex = existing || gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeatT ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      return tex;
    }

    resize() {
      const { width, height } = this.stage.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      if (width === this.stageW && height === this.stageH && dpr === this.dpr) return;
      this.dpr = dpr;
      this.stageW = width;
      this.stageH = height;
      this.shadow.width = this.canvas.width = Math.round(width * dpr);
      this.shadow.height = this.canvas.height = Math.round(height * dpr);
      this.updateCamera();
      this.drawFloor();
      this.draw();
    }

    orbit(dx, dy) {
      this.camYaw = (this.camYaw - dx * 0.011) % TAU;
      this.camPitch = clamp(this.camPitch + dy * 0.0085, 0.08, 1.42);
      this.updateCamera();
      this.drawFloor();
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
      const z = this.tray.centerZ ?? 0;
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
          const pt = this.project([cx + r * Math.cos(a), y, z + cz + r * Math.sin(a)]);
          if (first) { ctx.moveTo(pt[0], pt[1]); first = false; }
          else ctx.lineTo(pt[0], pt[1]);
        }
      }
      ctx.closePath();
    }

    drawBlob({ x, z, radius, opacity, stretchX, stretchY }) {
      const ctx = this.ctx;
      const [sx, sy] = this.project([x, 0, z]);
      const size = this.stageH * radius;
      ctx.save();
      ctx.translate(sx + 6, sy + 3);
      ctx.scale(stretchX, stretchY);
      const g = ctx.createRadialGradient(0, 0, size * 0.12, 0, 0, size);
      g.addColorStop(0, `rgba(40, 56, 35, ${opacity})`);
      g.addColorStop(0.45, `rgba(40, 56, 35, ${opacity * 0.52})`);
      g.addColorStop(1, 'rgba(40, 56, 35, 0)');
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
      for (const shadow of this.shadows) this.drawBlob(shadow);
      ctx.restore();
    }

    drawMeshList(list) {
      const gl = this.gl, u = this.uniforms;
      for (const m of list) {
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
        gl.uniform1f(u.uAlpha, m.alpha);
        gl.uniform1f(u.uEmissive, m.emissive);
        gl.uniform1f(u.uTextured, m.texture ? 1 : 0);
        if (m.texture) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, m.texture);
          gl.uniform1i(u.uTex, 0);
        }
        gl.uniformMatrix4fv(u.uModel, false, modelMatrix(m.q, m.position, m.scale));
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
      }
    }

    draw() {
      if (!this.vp || this.lost) return;
      const gl = this.gl, u = this.uniforms;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(u.uVP, false, this.vp);
      gl.uniform3fv(u.uEye, this.eye);

      const opaque = [];
      const translucent = [];
      for (const m of this.meshes) {
        if (m.alpha < 0.99) translucent.push(m);
        else opaque.push(m);
      }

      gl.disable(gl.BLEND);
      gl.depthMask(true);
      this.drawMeshList(opaque);

      if (translucent.length) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        this.drawMeshList(translucent);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }
  }

  window.EonStudio = Studio;
})();

}

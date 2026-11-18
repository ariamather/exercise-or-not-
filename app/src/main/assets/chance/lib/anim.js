/*
 * Small animation helpers shared by scenes. A scene keeps one Timeline; starting anything new
 * (a press, a reveal, show()) calls cancel(), and every animation still in flight resolves false.
 *
 *   const tl = new EonAnim.Timeline(() => scene.lost);
 *   const gen = tl.cancel();                       // a new step; earlier ones stop
 *   if (!(await tl.run(560, t => pose(EonAnim.ease(t)), gen))) return null;
 */
(function () {
  'use strict';
  const ease = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  /* Rotation by `angle` around a unit `axis`, as a quaternion [x, y, z, w]. */
  const qAxis = (axis, angle) => [...axis.map(v => v * Math.sin(angle / 2)), Math.cos(angle / 2)];

  class Timeline {
    /* `stopped()` is checked every frame (e.g. a lost WebGL context). */
    constructor(stopped = () => false) { this.generation = 0; this.stopped = stopped; }
    /* Starts a new step and returns its id; anything older stops at its next frame. */
    cancel() { return ++this.generation; }
    live(gen) { return gen === this.generation && !this.stopped(); }
    /* Calls frame(t, now) with t from 0 to 1 over `duration` ms; resolves true if it ran to the end. */
    run(duration, frame, gen = this.generation) {
      return new Promise(resolve => {
        const start = performance.now();
        const step = now => {
          if (!this.live(gen)) { resolve(false); return; }
          const t = Math.min(1, (now - start) / duration);
          frame(t, now);
          if (t < 1) requestAnimationFrame(step); else resolve(true);
        };
        requestAnimationFrame(step);
      });
    }
    /* Waits `ms`; resolves false if the step was cancelled meanwhile. */
    async pause(ms, gen = this.generation) { await wait(ms); return this.live(gen); }
  }

  /* Smooths a pointer's velocity (units per second) and spots sharp reversals, as a shake does. */
  class Velocity {
    constructor({ smoothMs = 60, reverseDegrees = 100, minSpeed = 1.2 } = {}) {
      this.smoothMs = smoothMs; this.reverse = Math.cos(reverseDegrees * Math.PI / 180);
      this.minSpeed = minSpeed; this.reset();
    }
    reset() { this.x = 0; this.z = 0; this.dir = null; }
    get speed() { return Math.hypot(this.x, this.z); }
    /* Adds a move of (dx, dz) over dt ms; returns true when it reverses sharply enough to rattle. */
    add(dx, dz, dt) {
      dt = Math.max(1, dt);
      const k = 1 - Math.exp(-dt / this.smoothMs);
      this.x += (dx / dt * 1000 - this.x) * k;
      this.z += (dz / dt * 1000 - this.z) * k;
      const speed = this.speed;
      if (speed <= this.minSpeed) return false;
      const d = [this.x / speed, this.z / speed];
      const reversed = !!this.dir && this.dir[0] * d[0] + this.dir[1] * d[1] < this.reverse;
      this.dir = d;
      return reversed;
    }
    /* Lets the velocity fade while the finger rests. */
    decay(dt, ms = 90) { const f = Math.exp(-dt / ms); this.x *= f; this.z *= f; }
  }

  window.EonAnim = { Timeline, Velocity, ease, easeInOut, clamp, wait, qAxis };
})();

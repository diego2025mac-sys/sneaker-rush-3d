// Progressive speed effects by displayed speed (km/h). Three tiers, each fading in smoothly
// (thresholds in SPEED.fx):
//   tier 1  ~100 km/h   wind motes, ground dust kicked up, a few degrees of FOV
//   tier 2  ~300 km/h   roadside streaks, stronger/longer shoe trail, more FOV, slight camera lag
//   tier 3  ~500+ km/h  speed lines around the edges of the view, max FOV
// A boost pad adds a short burst on top (lines + trail + FOV). No screen shake, and the centre of the
// view (runner + the lanes ahead) is kept clear so obstacles stay readable.
import * as THREE from 'three';
import { SPEED } from '../config/balance.js';
import { clamp, damp, smoothstep } from '../utils/math.js';
import { TRACK_FORWARD } from '../world/TrackFrame.js';

const N = 80;      // speed lines (air, edges of the view)
const NS = 48;     // roadside streaks (low, along the kerbs and verges)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class SpeedFX {
  constructor(scene, particles) {
    this.particles = particles;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.lines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 1), this.mat, N);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 1), this.streakMat, NS);
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    scene.add(this.streaks);
    this.data = [];
    for (let i = 0; i < N; i++) this.data.push({ x: 0, y: 0, z: 0, len: 1 });
    this.sdata = [];
    for (let i = 0; i < NS; i++) this.sdata.push({ x: 0, y: 0, z: 0, len: 1 });
    this.level = { t1: 0, t2: 0, t3: 0, lines: 0, burst: 0 };
    this.active = false;
    this._foot = new THREE.Vector3();
    this.trailTimer = 0;
  }

  respawn(d, px, pz, ahead) {
    // ring around the view axis, never through the middle (runner + lanes stay clear)
    const a = Math.random() * Math.PI * 2;
    const r = 4.5 + Math.random() * 9;
    d.x = px + Math.cos(a) * r;
    d.y = Math.max(0.4, 2.2 + Math.sin(a) * r * 0.6);
    d.z = pz + (ahead ? 30 + Math.random() * 60 : Math.random() * 90 - 10);
    d.len = 2 + Math.random() * 5;
  }

  respawnStreak(d, pz, ahead) {
    const side = Math.random() < 0.5 ? -1 : 1;
    d.x = side * (6.9 + Math.random() * 6);
    d.y = 0.15 + Math.random() * 1.6;
    d.z = pz + (ahead ? 40 + Math.random() * 50 : Math.random() * 90 - 10);
    d.len = 3 + Math.random() * 6;
  }

  start(player) {
    this.active = true;
    this.lines.visible = true;
    this.streaks.visible = true;
    for (const d of this.data) this.respawn(d, player.position.x, player.position.z, false);
    for (const d of this.sdata) this.respawnStreak(d, player.position.z, false);
  }

  stop() {
    this.active = false;
    this.lines.visible = false;
    this.streaks.visible = false;
    this.level = { t1: 0, t2: 0, t3: 0, lines: 0, burst: 0 };
  }

  /** Boost pad hit: short burst of lines, trail and FOV. */
  boost() { this.level.burst = 1; }

  shift(dz) { for (const d of this.data) d.z += dz; for (const d of this.sdata) d.z += dz; }

  /** Combined 0..1 intensity used by the camera (lag) and the runner animation. */
  get intensity() { const L = this.level; return clamp(L.t1 * 0.25 + L.t2 * 0.4 + L.t3 * 0.35, 0, 1); }

  /** Returns the extra FOV as a 0..1 fraction of CAMERA.maxFovBoost. */
  update(dt, player, character, kmh, worldSpeed, trailColor, glowColor) {
    if (!this.active) return 0;
    const f = SPEED.fx;
    const L = this.level;
    L.t1 = damp(L.t1, smoothstep(f.tier1[0], f.tier1[1], kmh), 3, dt);
    L.t2 = damp(L.t2, smoothstep(f.tier2[0], f.tier2[1], kmh), 3, dt);
    L.t3 = damp(L.t3, smoothstep(f.tier3[0], f.tier3[1], kmh), 3, dt);
    L.burst = Math.max(0, L.burst - dt / 0.9);
    const burst = L.burst * L.burst;
    L.lines = clamp(L.t3 + burst * 0.8, 0, 1);
    const px = player.position.x, pz = player.position.z;
    const fwd = TRACK_FORWARD;

    // tier 3 (and boost): speed lines rush past around the edges of the view
    this.mat.opacity = L.lines * (0.5 + 0.25 * burst);
    this.mat.color.setRGB(1 - 0.55 * burst, 1, 1); // boost lines flash cyan
    if (L.lines > 0.01) {
      const v = worldSpeed * 1.8 + 30;
      for (let i = 0; i < N; i++) {
        const d = this.data[i];
        d.z -= v * dt;
        if (d.z < pz - 12) this.respawn(d, px, pz, true);
        _p.set(d.x, d.y, d.z);
        _s.set(1, 1, d.len * (0.6 + L.lines));
        this.lines.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      this.lines.instanceMatrix.needsUpdate = true;
    }

    // tier 2: low streaks along the kerbs and verges, stretched by speed
    const st = clamp(L.t2 + burst * 0.5, 0, 1);
    this.streakMat.opacity = st * 0.42;
    if (st > 0.01) {
      const v = worldSpeed * 1.25 + 10;
      for (let i = 0; i < NS; i++) {
        const d = this.sdata[i];
        d.z -= v * dt;
        if (d.z < pz - 10) this.respawnStreak(d, pz, true);
        _p.set(d.x, d.y, d.z);
        _s.set(1, 1, d.len * (0.5 + st * 1.2));
        this.streaks.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      this.streaks.instanceMatrix.needsUpdate = true;
    }

    // tier 1: wind motes around the runner + dust off the road surface
    if (L.t1 > 0.05 && Math.random() < L.t1 * dt * 40) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(px + Math.cos(a) * 2.4, 1 + Math.sin(a) * 1.4, pz + 6, 0, 0, -worldSpeed * 1.3, 0xffffff, 0.12, 0.35, 0, 1);
    }
    if (L.t1 > 0.05 && character && Math.random() < L.t1 * dt * (14 + 26 * L.t2)) {
      character.footPosition(Math.random() < 0.5, this._foot);
      const back = -(2 + worldSpeed * 0.25);
      this.particles.emit(this._foot.x + (Math.random() - 0.5) * 0.5, 0.06, this._foot.z, (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.2, fwd.z * back, 0xd8d2c4, 0.14 + 0.1 * L.t2, 0.35 + 0.2 * L.t2, 6, 0.96);
    }

    // shoe trails: the sneaker's own trail, or a white one from tier 2; denser/longer with speed & boost
    const tr = clamp(L.t2 * 0.6 + L.t3 * 0.4 + burst, 0, 1.4);
    const trail = trailColor ?? (tr > 0.25 ? (L.burst > 0.05 ? 0x5ff3ff : 0xffffff) : null);
    if (trail != null && character && (tr > 0.05 || trailColor != null)) {
      this.trailTimer += dt;
      const rate = 0.03 - 0.014 * Math.min(1, tr);
      while (this.trailTimer > rate) {
        this.trailTimer -= rate;
        for (const left of [true, false]) {
          character.footPosition(left, this._foot);
          this.particles.emit(this._foot.x, this._foot.y + 0.05, this._foot.z, (Math.random() - 0.5) * 0.3, 0.2, -worldSpeed * 0.15, trail, 0.2 + tr * 0.14, 0.4 + tr * 0.25, 0, 0.98);
        }
      }
    }
    if (glowColor && Math.random() < dt * 20) {
      character.footPosition(Math.random() < 0.5, this._foot);
      this.particles.sparkle(this._foot, glowColor, 0.3, 1);
    }
    return clamp(L.t1 * 0.2 + L.t2 * 0.35 + L.t3 * 0.45, 0, 1);
  }
}

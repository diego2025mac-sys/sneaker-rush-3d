// Progressive speed effects, by displayed speed (km/h):
//  wind particles → speed lines → FOV boost → shoe trails & glow. No screen shake.
import * as THREE from 'three';
import { SPEED } from '../config/balance.js';
import { clamp, damp } from '../utils/math.js';

const N = 80;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class SpeedFX {
  constructor(scene, particles) {
    this.particles = particles;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.lines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 1), this.mat, N);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.data = [];
    for (let i = 0; i < N; i++) this.data.push({ x: 0, y: 0, z: 0, len: 1 });
    this.level = { wind: 0, lines: 0, fov: 0, trails: 0 };
    this.active = false;
    this._foot = new THREE.Vector3();
    this.trailTimer = 0;
  }

  respawn(d, px, pz, ahead) {
    const a = Math.random() * Math.PI * 2;
    const r = 3.5 + Math.random() * 9;
    d.x = px + Math.cos(a) * r;
    d.y = Math.max(0.3, 2 + Math.sin(a) * r * 0.6);
    d.z = pz + (ahead ? 30 + Math.random() * 60 : Math.random() * 90 - 10);
    d.len = 2 + Math.random() * 5;
  }

  start(player) {
    this.active = true;
    this.lines.visible = true;
    for (const d of this.data) this.respawn(d, player.position.x, player.position.z, false);
  }

  stop() {
    this.active = false;
    this.lines.visible = false;
    this.level = { wind: 0, lines: 0, fov: 0, trails: 0 };
  }

  shift(dz) { for (const d of this.data) d.z += dz; }

  /** Returns the extra FOV (degrees) to apply. */
  update(dt, player, character, kmh, worldSpeed, trailColor, glowColor) {
    if (!this.active) return 0;
    const t = SPEED.fx;
    const L = this.level;
    L.wind = damp(L.wind, clamp((kmh - t.wind) / 40, 0, 1), 3, dt);
    L.lines = damp(L.lines, clamp((kmh - t.lines) / 120, 0, 1), 3, dt);
    L.fov = damp(L.fov, clamp((kmh - t.fov) / 400, 0, 1), 2, dt);
    L.trails = damp(L.trails, clamp((kmh - t.trails) / 200, 0, 1), 3, dt);
    const px = player.position.x, pz = player.position.z;

    // speed lines rush past
    this.mat.opacity = L.lines * 0.55;
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

    // wind streak particles around the runner
    if (L.wind > 0.05 && Math.random() < L.wind * dt * 40) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(px + Math.cos(a) * 2.2, 1 + Math.sin(a) * 1.4, pz + 6, 0, 0, -worldSpeed * 1.3, 0xffffff, 0.12, 0.35, 0, 1);
    }

    // shoe trails (top tiers, or any shoe at very high speed)
    const trail = trailColor ?? (L.trails > 0.3 ? 0xffffff : null);
    if (trail != null && (L.trails > 0.05 || trailColor != null) && character) {
      this.trailTimer += dt;
      const rate = 0.025;
      while (this.trailTimer > rate) {
        this.trailTimer -= rate;
        for (const left of [true, false]) {
          character.footPosition(left, this._foot);
          this.particles.emit(this._foot.x, this._foot.y + 0.05, this._foot.z, (Math.random() - 0.5) * 0.3, 0.2, -worldSpeed * 0.15, trail, 0.22 + L.trails * 0.15, 0.45, 0, 0.98);
        }
      }
    }
    if (glowColor && Math.random() < dt * 20) {
      character.footPosition(Math.random() < 0.5, this._foot);
      this.particles.sparkle(this._foot, glowColor, 0.3, 1);
    }
    return L.fov;
  }
}

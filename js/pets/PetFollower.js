// Equipped pets float behind the player in a loose formation. No pathfinding, no physics:
// exponential follow + bob + face movement, and a smooth "poof" teleport if they fall far behind.
import * as THREE from 'three';
import { PETS } from '../config/pets.js';
import { damp, dampAngle } from '../utils/math.js';
import { rarityIndex } from '../systems/Economy.js';

const FORMATION = [
  [-1.3, -0.8], [1.3, -0.8], [-2.2, -1.9], [2.2, -1.9], [-1.2, -2.8], [1.2, -2.8],
];
// during runs pets fly beside the runner so they never block the camera
const RUN_FORMATION = [
  [-2.3, 0.4], [2.3, 0.4], [-3.4, -0.9], [3.4, -0.9], [-1.6, 1.8], [1.6, 1.8],
];

export class PetFollower {
  constructor(scene, particles, library, shadows = null) {
    this.scene = scene;
    this.particles = particles;
    this.library = library;   // visual models come from the ModelLibrary (GLB or procedural fallback)
    this.shadows = shadows;   // contact shadow blobs
    this.pets = []; // { uid, id, mesh, pos, vel, yaw, t }
    this.runMode = false;
    this._t = new THREE.Vector3();
    this._prev = new THREE.Vector3();
  }

  /** Rebuild the follower list from [{uid, id}] (keeps existing meshes when possible). */
  sync(list, player) {
    const keep = new Map(this.pets.map((p) => [p.uid, p]));
    const next = [];
    list.forEach(({ uid, id }) => {
      let p = keep.get(uid);
      const upgrade = p && p.id === id && p.mesh.userData.source === 'procedural' && this.library.templates.has('pet:' + PETS[id].species);
      if (p && p.id === id && !upgrade) {
        keep.delete(uid);
      } else {
        const { object: mesh, mixer } = this.library.createPet(id);
        if (mesh.userData.source === 'procedural') mesh.scale.setScalar(0.9);
        this.scene.add(mesh);
        const old = upgrade ? p : null;
        if (old) { keep.delete(uid); this.removePet(old); }
        p = { uid, id, mesh, mixer, pos: old ? old.pos : new THREE.Vector3(), yaw: old ? old.yaw : 0, t: Math.random() * 6, rank: rarityIndex(PETS[id].rarity), spawnFx: !old };
        p.shadow = this.shadows?.create(0.42);
        if (player && !old) {
          p.pos.copy(player.position).add(new THREE.Vector3(0, 1.4, -1));
          mesh.position.copy(p.pos);
        }
      }
      next.push(p);
    });
    for (const p of keep.values()) this.removePet(p);
    this.pets = next;
    for (const p of this.pets) if (this.library.assets.has(this.library.petPath(p.id)) && p.mesh.userData.source === 'procedural') {
      // swap to the imported model as soon as it finishes loading
      this.library.loadPet(p.id).then((t) => { if (t) this.onUpgrade?.(); });
    }
  }

  removePet(p) {
    this.scene.remove(p.mesh);
    if (p.shadow) this.shadows.release(p.shadow);
  }

  setVisible(v) { for (const p of this.pets) { p.mesh.visible = v; if (p.shadow) p.shadow.visible = v; } }

  /** Instantly place pets in formation (after teleports). */
  snap(player) {
    this.pets.forEach((p, i) => {
      this.slot(i, player, p.pos);
      p.mesh.position.copy(p.pos);
      p.yaw = player.yaw;
    });
  }

  /** Floating-origin shift. */
  shift(dz) {
    for (const p of this.pets) { p.pos.z += dz; p.mesh.position.z += dz; }
  }

  slot(i, player, out) {
    const F = this.runMode ? RUN_FORMATION : FORMATION;
    const [ox, oz] = F[i % F.length];
    const yaw = this.runMode ? 0 : player.yaw;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return out.set(player.position.x + ox * c + oz * s, (this.runMode ? 0.9 : player.position.y + 1.25), player.position.z - ox * s + oz * c);
  }

  update(dt, player, speed) {
    const lambda = 5 + Math.min(speed, 50) * 0.25;
    this.pets.forEach((p, i) => {
      p.t += dt;
      const target = this.slot(i, player, this._t);
      // feed-forward: lead the target by the expected exponential-follow lag so fast runs keep formation
      if (this.runMode) target.z += speed / lambda;
      this._prev.copy(p.pos);
      const d = p.pos.distanceTo(target);
      if (d > 22 || p.spawnFx) {
        // teleport smoothly: poof out, poof in
        if (!p.spawnFx) this.particles?.burst(p.pos, { count: 8, color: 0xffffff, speed: 2, up: 1, life: 0.4, size: 0.3, gravity: 0 });
        p.pos.copy(target);
        this.particles?.burst(p.pos, { count: 10, color: 0xffffff, speed: 2, up: 1, life: 0.45, size: 0.35, gravity: 0 });
        p.spawnFx = false;
      } else {
        p.pos.x = damp(p.pos.x, target.x, lambda, dt);
        p.pos.y = damp(p.pos.y, target.y, 6, dt);
        p.pos.z = damp(p.pos.z, target.z, lambda, dt);
      }
      const vx = p.pos.x - this._prev.x, vz = p.pos.z - this._prev.z;
      const moving = vx * vx + vz * vz > 1e-5;
      p.yaw = dampAngle(p.yaw, moving ? Math.atan2(vx, vz) : player.yaw, 8, dt);
      const bob = Math.sin(p.t * 3 + i) * 0.12;
      p.mesh.position.set(p.pos.x, p.pos.y + bob, p.pos.z);
      p.mixer?.update(dt);
      if (p.shadow) this.shadows.place(p.shadow, p.pos.x, p.pos.z, 0.42, Math.max(0.12, 0.42 - (p.pos.y + bob) * 0.12));
      p.mesh.rotation.set(Math.sin(p.t * 2 + i) * 0.06, p.yaw, moving ? -Math.max(-0.3, Math.min(0.3, vx * 3)) : 0);
      // rare pets sparkle
      if (p.rank >= 4 && Math.random() < dt * (p.rank - 2) * 2) {
        this.particles?.sparkle(p.mesh.position, p.rank >= 6 ? 0x00f0ff : p.rank >= 5 ? 0xff3d7f : 0xffd23f, 0.6, 1);
      }
    });
  }
}

// Rigged imported character driven by an AnimationMixer.
// Exposes exactly the interface the gameplay code already uses for the procedural Character
// (group, position, yaw, update(dt, speed, grounded), setSneaker, footPosition, anim.trigger*),
// so movement / collision / cameras never depend on the visual model.
//
// • Clips are matched by name aliases (config/assets.js CHARACTER.clips) — Mixamo, Blender or
//   custom names all work. Missing optional clips (sprint, celebrate, jump, stumble) degrade gracefully.
// • Locomotion clips are time-scaled to the real ground speed to avoid foot sliding.
// • Root motion on the hips is stripped (gameplay owns the position).
// • Sneaker sockets are created automatically on the foot bones: in the bind pose each socket is
//   aligned with the character's axes and placed on the ground under the ankle, so any game
//   sneaker (normalised to the same spec) fits every rig without hand-tuning.
import * as THREE from 'three';
import { CHARACTER, ASSET_OVERRIDES } from '../config/assets.js';
import { pickClip } from '../assets/ModelLibrary.js';
import { damp } from '../utils/math.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const lower = (s) => (s || '').toLowerCase();

function findBone(root, aliases) {
  let hit = null;
  root.traverse((o) => {
    if (hit || !o.isBone) return;
    const n = lower(o.name).replace(/\s/g, '');
    if (aliases.includes(n)) hit = o;
  });
  if (hit) return hit;
  // looser: name contains "foot" + side marker
  return null;
}

export class GLBCharacter {
  constructor(scene, library, template, look = {}) {
    this.library = library;
    this.cfg = { ...CHARACTER, ...(ASSET_OVERRIDES[CHARACTER.file] || {}) };
    this.cfg.clipSpeeds = { ...CHARACTER.clipSpeeds, ...(this.cfg.clipSpeeds || {}) };
    this.group = new THREE.Group();            // gameplay-owned transform (position + yaw)
    this.model = library.cloneOf(template);     // visual only
    this.group.add(this.model);
    scene.add(this.group);
    this.position = this.group.position;
    this.yaw = 0;
    this.sneakerId = null;
    this.isGLB = true;

    // hide the model's own shoes (the game's sneakers replace them)
    this.model.traverse((o) => {
      if (o.isMesh && this.cfg.hideMeshes.some((h) => lower(o.name).includes(h))) o.visible = false;
      if (o.isMesh) o.frustumCulled = false; // skinned bounds don't follow animation
    });

    // animation
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    const hips = findBone(this.model, this.cfg.hipsBones);
    for (const [state, aliases] of Object.entries(this.cfg.clips)) {
      const clip = pickClip(template.animations, aliases);
      if (!clip) continue;
      const c = hips && ['idle', 'walk', 'run', 'sprint', 'celebrate'].includes(state) ? stripRootMotion(clip, hips.name) : clip;
      const a = this.mixer.clipAction(c);
      if (state === 'celebrate' || state === 'stumble') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; }
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions[state] = a;
    }
    if (!this.actions.sprint && this.actions.run) this.actions.sprint = this.actions.run;
    this.weights = {};
    for (const k of Object.keys(this.actions)) this.weights[k] = k === 'idle' ? 1 : 0;
    this.celebrateTimer = 0;
    this.stumbleTimer = 0;
    this.lastPhase = 0;

    // gameplay-facing animation API (same names as the procedural animator)
    const self = this;
    this.anim = {
      onStep: null,
      triggerCelebrate(sec = 1.6) {
        self.celebrateTimer = sec;
        const a = self.actions.celebrate;
        if (a) { a.reset(); a.play(); }
      },
      triggerStumble() {
        self.stumbleTimer = 0.55;
        const a = self.actions.stumble;
        if (a) { a.reset(); a.play(); }
      },
    };

    this.buildSockets();
    this.setSneaker(look.sneaker || 'starter');
  }

  buildSockets() {
    // compute in the bind pose, detached, facing +Z
    const parent = this.group.parent;
    this.group.removeFromParent();
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.group.updateMatrixWorld(true);
    const off = this.cfg.socketOffset || [0, 0, 0];
    const scale = this.cfg.shoeScale || 1;
    this.sockets = {};
    for (const side of ['left', 'right']) {
      const bone = findBone(this.model, this.cfg.footBones[side]);
      const socket = new THREE.Object3D();
      socket.name = 'sneaker_socket_' + side;
      if (bone) {
        _p.setFromMatrixPosition(bone.matrixWorld);
        const desired = new THREE.Matrix4().compose(new THREE.Vector3(_p.x + off[0], off[1], _p.z + off[2]), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
        _m.copy(bone.matrixWorld).invert().multiply(desired);
        _m.decompose(socket.position, socket.quaternion, socket.scale);
        bone.add(socket);
      } else {
        // rig without recognisable foot bones: static sockets at the feet
        socket.position.set(side === 'left' ? -0.11 : 0.11, 0, 0);
        socket.scale.setScalar(scale);
        this.group.add(socket);
        console.warn('[Character] foot bone not found for', side, '— sneakers attached statically');
      }
      this.sockets[side] = socket;
    }
    if (parent) parent.add(this.group);
  }

  setSneaker(id) {
    this.sneakerId = id;
    const apply = () => {
      if (this.sneakerId !== id) return;
      for (const side of ['left', 'right']) {
        const s = this.sockets[side];
        while (s.children.length) s.remove(s.children[0]);
        s.add(this.library.createSneaker(id, side === 'left' ? -1 : 1));
      }
    };
    apply(); // immediate (procedural fallback if the GLB isn't loaded yet)
    if (this.library.hasSneakerAsset(id) && !this.library.isSneakerReady(id)) this.library.loadSneaker(id).then(apply);
  }

  footPosition(left, out) {
    return this.sockets[left ? 'left' : 'right'].getWorldPosition(out);
  }

  update(dt, speed, grounded) {
    this.group.rotation.y = this.yaw;
    const c = this.cfg;
    this.celebrateTimer -= dt;
    this.stumbleTimer -= dt;
    // target state
    let state = 'idle';
    if (speed > 0.3) state = speed < c.walkUntil ? 'walk' : speed < c.runUntil ? 'run' : 'sprint';
    if (!this.actions[state]) state = this.actions.run ? 'run' : 'idle';
    if (!grounded && this.actions.jump) state = 'jump';
    if (this.stumbleTimer > 0 && this.actions.stumble) state = 'stumble';
    else if (this.celebrateTimer > 0 && speed < 0.3 && this.actions.celebrate) state = 'celebrate';
    // speed-matched playback
    const aliasRun = state === 'sprint' && this.actions.sprint === this.actions.run;
    const clipSpeed = aliasRun ? c.clipSpeeds.run : c.clipSpeeds[state];
    for (const k of Object.keys(this.actions)) {
      if (this.weights[k] === undefined) this.weights[k] = 0;
      this.weights[k] = damp(this.weights[k], k === state ? 1 : 0, 10, dt);
    }
    // de-duplicate (sprint may alias run)
    const applied = new Map();
    for (const [k, a] of Object.entries(this.actions)) applied.set(a, Math.max(applied.get(a) || 0, this.weights[k]));
    for (const [a, w] of applied) a.setEffectiveWeight(w);
    if (clipSpeed && this.actions[state]) this.actions[state].timeScale = THREE.MathUtils.clamp(speed / clipSpeed, 0.55, 2.6);
    this.mixer.update(dt);
    // footsteps from the locomotion phase
    const loco = this.actions[state];
    if (loco && clipSpeed && grounded) {
      const ph = (loco.time / loco.getClip().duration) % 1;
      for (const sp of c.stepPhases) {
        if ((this.lastPhase < sp && ph >= sp) || (this.lastPhase > ph && sp === 0)) this.anim.onStep?.(speed);
      }
      this.lastPhase = ph;
    }
  }
}

/** Keep the hips' vertical bob but remove horizontal root motion (gameplay owns position). */
function stripRootMotion(clip, hipsName) {
  const c = clip.clone();
  for (const t of c.tracks) {
    if (t.name === `${hipsName}.position` || t.name.endsWith(`${hipsName}.position`)) {
      const v = t.values;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return c;
}

// Stylised low-poly runner (ported from the Salvage Island rig).
// Jointed rig: hips → thighs → shins(+sneakers), spine → head, shoulders → arms → forearms.
// All parts are merged into ONE rigidly-skinned mesh (single draw call).
// The equipped sneakers are real geometry on the feet: equipping rebuilds the skin.
import * as THREE from 'three';
import { damp, clamp } from '../utils/math.js';
import { G, StaticBatch, makeEmissiveVertexMaterial } from '../utils/Geo.js';
import { buildSneaker } from './SneakerModel.js';
import { SNEAKER_BY_ID } from '../config/sneakers.js';

const DEFAULT_LOOK = {
  shirt: 0x2ec4f1, shirt2: 0xffffff, pants: 0x2b2f3a, pants2: 0xff3d7f, skin: 0xf1c27d, hair: 0x3a2516,
  cap: 0xff3d7f, wristband: 0xffd23f, sneaker: 'starter',
};

const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c.getHex();
};

let PARTS = null;
const SHOE_SCALE = 1.12;
function part(bone, build) {
  const b = new StaticBatch(bone.id + 3);
  build((geo, o) => b.add(geo, { vary: 0.03, ao: false, ...o }));
  PARTS.push({ bone, geometry: b.geometry() });
}

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3();

function buildSkin(rig, parts) {
  if (rig.skinned) {
    rig.root.remove(rig.skinned);
    rig.skinned.geometry.dispose();
    rig.skinned.skeleton.dispose();
  }
  const parent = rig.root.parent;
  if (parent) parent.remove(rig.root);
  const saved = rig.bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const rootSaved = [rig.root.position.clone(), rig.root.quaternion.clone(), rig.root.scale.clone()];
  rig.bones.forEach((b, i) => { b.quaternion.identity(); b.scale.set(1, 1, 1); b.position.copy(rig.rest[i]); });
  rig.root.position.set(0, 0, 0); rig.root.quaternion.identity(); rig.root.scale.set(1, 1, 1);
  rig.root.updateMatrixWorld(true);

  const pos = [], nor = [], col = [], emit = [], idx = [], wgt = [];
  for (const { bone, geometry } of parts) {
    const bi = rig.bones.indexOf(bone);
    _m.copy(bone.matrixWorld);
    _n.getNormalMatrix(_m);
    const P = geometry.attributes.position, N = geometry.attributes.normal, C = geometry.attributes.color, Em = geometry.attributes.emit;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m); pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize(); nor.push(_v.x, _v.y, _v.z);
      col.push(C.getX(i), C.getY(i), C.getZ(i));
      emit.push(Em ? Em.getX(i) : 0);
      idx.push(bi, 0, 0, 0);
      wgt.push(1, 0, 0, 0);
    }
    geometry.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('emit', new THREE.Float32BufferAttribute(emit, 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
  g.computeBoundingSphere();
  g.boundingSphere.radius *= 1.5;
  const mesh = new THREE.SkinnedMesh(g, rig.material);
  mesh.castShadow = true;
  rig.root.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(rig.bones), mesh.matrixWorld);
  rig.skinned = mesh;

  rig.bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); });
  rig.root.position.copy(rootSaved[0]); rig.root.quaternion.copy(rootSaved[1]); rig.root.scale.copy(rootSaved[2]);
  if (parent) parent.add(rig.root);
}

export function buildCharacter(look = {}) {
  const root = new THREE.Group();
  const bone = (parent, x, y, z = 0) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent.add(b); return b; };
  const body = bone(root, 0, 0);
  const hips = bone(body, 0, 0.92);
  const spine = bone(hips, 0, 0.08);
  const head = bone(spine, 0, 0.56);
  const hatGroup = bone(head, 0, 0.3);
  const armL = bone(spine, -0.27, 0.44), armR = bone(spine, 0.27, 0.44);
  const elbowL = bone(armL, 0, -0.27), elbowR = bone(armR, 0, -0.27);
  const legL = bone(hips, -0.11, -0.02), legR = bone(hips, 0.11, -0.02);
  const kneeL = bone(legL, 0, -0.42), kneeR = bone(legR, 0, -0.42);
  // ankle joints: the sneakers hang from these so feet stay level and planted
  const footL = bone(kneeL, 0, -0.42), footR = bone(kneeR, 0, -0.42);
  const bones = [body, hips, spine, head, hatGroup, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, footL, footR];
  ['body', 'hips', 'spine', 'head', 'hat', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r']
    .forEach((n, i) => { bones[i].name = n; });
  const material = makeEmissiveVertexMaterial({ glow: 1.2 });
  material.side = THREE.DoubleSide; // sneaker surfaces are open lofts
  const rig = { root, body, hips, spine, head, hatGroup, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, footL, footR, bones,
    rest: bones.map((b) => b.position.clone()), skinned: null, material, look: { ...DEFAULT_LOOK, ...look }, auras: [] };
  dress(rig);
  return rig;
}

/** (Re)build every visible mesh of the rig from rig.look. */
export function dress(rig) {
  const L = rig.look;
  PARTS = [];
  const skinDark = shade(L.skin, 0.88);
  const shoe = SNEAKER_BY_ID[L.sneaker] || SNEAKER_BY_ID.starter;

  // hips
  part(rig.hips, (add) => {
    add(G.cbox(0.14), { sx: 0.4, sy: 0.2, sz: 0.26, color: L.pants });
    add(G.cbox(0.2), { y: 0.1, sx: 0.42, sy: 0.06, sz: 0.28, color: shade(L.pants, 0.8) });
    add(G.box(), { x: 0, y: 0.1, z: 0.142, sx: 0.04, sy: 0.08, sz: 0.01, color: 0xffffff }); // drawstring
  });

  // legs + sneakers
  for (const [thigh, knee, foot, side] of [[rig.legL, rig.kneeL, rig.footL, -1], [rig.legR, rig.kneeR, rig.footR, 1]]) {
    part(thigh, (add) => {
      add(G.taperC(0.84, 8), { y: -0.2, sx: 0.23, sz: 0.24, sy: 0.44, color: L.pants });
      // side stripe on joggers
      add(G.box(), { x: side * 0.112, y: -0.2, sx: 0.012, sy: 0.42, sz: 0.04, color: L.pants2 });
    });
    part(knee, (add) => {
      add(G.sphere(8, 6), { y: 0, s: 0.19, color: L.pants });
      add(G.taperC(0.8, 8), { y: -0.115, sx: 0.19, sz: 0.2, sy: 0.23, color: L.pants });
      add(G.box(), { x: side * 0.086, y: -0.11, sx: 0.012, sy: 0.21, sz: 0.035, color: L.pants2 });
      // cropped jogger cuff, then a crew sock down into the sneaker collar
      add(G.cyl(8), { y: -0.235, sx: 0.158, sz: 0.162, sy: 0.045, color: shade(L.pants, 0.75) });
      add(G.taperC(0.9, 8), { y: -0.33, sx: 0.096, sz: 0.096, sy: 0.18, color: 0xf5f5f5 });
      add(G.cyl(8), { y: -0.27, sx: 0.1, sz: 0.1, sy: 0.02, color: L.pants2 });
    });
    // the sneaker, in the ankle's frame (frame origin = ground under the ankle)
    part(foot, (add) => {
      add(G.sphere(8, 6), { y: 0, s: 0.09, color: 0xf5f5f5 });
      if (L.externalShoes) return; // an imported sneaker model is attached to the foot instead
      // stylised scale: slightly chunky so the design reads from the gameplay camera
      const frame = new THREE.Matrix4().makeScale(SHOE_SCALE, SHOE_SCALE, SHOE_SCALE).premultiply(new THREE.Matrix4().makeTranslation(0, -0.064, -0.006));
      buildSneaker((geo, o) => add(geo, { ...o, vary: 0.015 }), shoe, frame, side);
    });
  }

  // torso: athletic tee with raglan sleeves + number
  part(rig.spine, (add) => {
    add(G.taperC(1.25, 8), { y: 0.1, sx: 0.36, sz: 0.24, sy: 0.22, color: L.shirt });
    add(G.cbox(0.2), { y: 0.33, sx: 0.5, sy: 0.32, sz: 0.28, color: L.shirt });
    for (const x of [-0.25, 0.25]) add(G.sphere(8, 6), { x, y: 0.43, sx: 0.18, sy: 0.17, sz: 0.2, color: L.shirt2 });
    add(G.cyl(8), { y: 0.5, sx: 0.17, sz: 0.15, sy: 0.05, color: L.shirt2 });
    add(G.cyl(7), { y: 0.55, sx: 0.11, sz: 0.11, sy: 0.08, color: skinDark });
    // chest band + runner bib
    add(G.box(), { y: 0.24, z: 0.0, sx: 0.505, sy: 0.05, sz: 0.285, color: L.shirt2 });
    add(G.cbox(0.2), { y: 0.33, z: 0.142, sx: 0.2, sy: 0.14, sz: 0.012, color: 0xffffff });
    add(G.box(), { x: -0.035, y: 0.33, z: 0.15, sx: 0.025, sy: 0.08, sz: 0.006, color: 0x222222 });
    add(G.box(), { x: 0.035, y: 0.33, z: 0.15, sx: 0.05, sy: 0.016, sz: 0.006, color: 0x222222 });
    add(G.box(), { x: 0.035, y: 0.36, z: 0.15, sx: 0.05, sy: 0.016, sz: 0.006, color: 0x222222 });
    add(G.box(), { x: 0.035, y: 0.30, z: 0.15, sx: 0.05, sy: 0.016, sz: 0.006, color: 0x222222 });
  });

  // head + backwards cap
  part(rig.head, (add) => {
    add(G.sphere(12, 9), { y: 0.19, sx: 0.35, sy: 0.37, sz: 0.34, color: L.skin });
    add(G.sphere(10, 6), { y: 0.1, z: 0.02, sx: 0.27, sy: 0.16, sz: 0.27, color: L.skin });
    for (const x of [-0.17, 0.17]) add(G.sphere(6, 4), { x, y: 0.18, sx: 0.05, sy: 0.09, sz: 0.06, color: skinDark });
    for (const x of [-0.072, 0.072]) {
      add(G.sphere(8, 6), { x: x * 0.92, y: 0.205, z: 0.148, sx: 0.06, sy: 0.075, sz: 0.035, color: 0xffffff });
      add(G.sphere(6, 5), { x: x * 0.9, y: 0.2, z: 0.163, sx: 0.036, sy: 0.05, sz: 0.018, color: 0x2b1d14 });
      add(G.box(), { x, y: 0.268, z: 0.152, rz: x > 0 ? -0.15 : 0.15, sx: 0.08, sy: 0.02, sz: 0.02, color: shade(L.hair, 0.9) });
    }
    add(G.sphere(6, 4), { y: 0.155, z: 0.168, sx: 0.045, sy: 0.055, sz: 0.04, color: skinDark });
    add(G.box(), { y: 0.085, z: 0.14, rz: 0, sx: 0.09, sy: 0.016, sz: 0.012, color: 0x8a3b2e });
    for (const x of [-0.105, 0.105]) add(G.sphere(6, 4), { x, y: 0.13, z: 0.135, sx: 0.05, sy: 0.03, sz: 0.02, color: 0xf2a08a });
    // hair visible under the cap
    add(G.cbox(0.3), { y: 0.19, z: -0.12, sx: 0.33, sy: 0.22, sz: 0.11, color: L.hair });
    for (const x of [-0.165, 0.165]) add(G.box(), { x, y: 0.2, z: 0.05, sx: 0.03, sy: 0.1, sz: 0.06, color: L.hair });
  });
  part(rig.hatGroup, (add) => {
    add(G.hemi(12, 4), { y: -0.07, sx: 0.39, sy: 0.3, sz: 0.38, color: L.cap });
    add(G.cbox(0.3), { y: -0.065, z: -0.2, rx: 0.1, sx: 0.26, sy: 0.025, sz: 0.16, color: shade(L.cap, 0.8) }); // brim backwards
    add(G.sphere(6, 4), { y: 0.075, s: 0.05, color: shade(L.cap, 0.8) });
  });

  // arms
  for (const [arm, elbow, side] of [[rig.armL, rig.elbowL, -1], [rig.armR, rig.elbowR, 1]]) {
    part(arm, (add) => {
      add(G.taperC(0.92, 8), { y: -0.06, sx: 0.17, sz: 0.17, sy: 0.17, color: L.shirt2 });
      add(G.taperC(0.88, 8), { y: -0.18, sx: 0.13, sz: 0.13, sy: 0.18, color: L.skin });
    });
    part(elbow, (add) => {
      add(G.sphere(8, 6), { y: 0, s: 0.125, color: L.skin });
      add(G.taperC(0.8, 8), { y: -0.1, sx: 0.12, sz: 0.12, sy: 0.2, color: L.skin });
      add(G.cyl(8), { y: -0.17, sx: 0.135, sz: 0.135, sy: 0.06, color: L.wristband });
      add(G.cbox(0.3), { y: -0.25, sx: 0.115, sy: 0.12, sz: 0.095, color: L.skin });
      add(G.cbox(0.3), { x: -side * 0.055, y: -0.225, z: 0.035, rz: side * 0.4, sx: 0.04, sy: 0.07, sz: 0.045, color: L.skin });
    });
  }

  buildSkin(rig, PARTS);
  PARTS = null;
  updateAuras(rig, shoe);
}

const auraGeo = new THREE.TorusGeometry(0.15, 0.012, 4, 24);
function updateAuras(rig, shoe) {
  for (const a of rig.auras) { a.parent?.remove(a); a.material.dispose(); }
  rig.auras = [];
  if (!shoe.aura) return;
  for (const knee of [rig.footL, rig.footR]) {
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ color: i ? shoe.glow : shoe.aura, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(0, 0.07 - i * 0.05, 0.02);
      m.rotation.x = Math.PI / 2;
      m.userData.spin = (i ? -1 : 1) * (2 + i);
      knee.add(m);
      rig.auras.push(m);
    }
  }
}

export function setSneaker(rig, id) {
  if (rig.look.sneaker === id) return;
  rig.look.sneaker = id;
  dress(rig);
}

/**
 * Procedural animator: idle / walk / run / sprint / jump / celebrate / stumble.
 * speed is in world units/s; stride frequency scales with it (capped to stay readable).
 */
export class CharacterAnimator {
  constructor(rig) {
    this.rig = rig;
    this.phase = 0;
    this.t = Math.random() * 10;
    this.air = 0;
    this.move = 0;
    this.run = 0;
    this.sprint = 0;
    this.celebrate = 0;
    this.celebrateTimer = 0;
    this.stumbleTimer = 0;
    this.stumble = 0;
    this.lastStepSign = 1;
    this.onStep = null;
  }

  triggerCelebrate(sec = 1.6) { this.celebrateTimer = sec; }
  triggerStumble() { this.stumbleTimer = 0.55; }

  update(dt, speed, grounded) {
    const r = this.rig;
    this.t += dt;
    this.move = damp(this.move, speed > 0.3 ? 1 : 0, 10, dt);
    this.run = damp(this.run, clamp((speed - 4.5) / 3.5, 0, 1), 6, dt);
    this.sprint = damp(this.sprint, clamp((speed - 12) / 18, 0, 1), 4, dt);
    // stride matched to ground speed: one cycle = two steps of length ≈ 2·leg·sin(amplitude)
    const ampNow = 0.45 + this.run * 0.4 + this.sprint * 0.25;
    const cycle = 4 * 0.88 * Math.sin(ampNow);
    const rate = Math.min(24, (Math.PI * 2 * speed) / cycle);
    this.phase += dt * rate * (speed > 0.3 ? 1 : 0);
    this.air = damp(this.air, grounded ? 0 : 1, 12, dt);
    this.celebrateTimer -= dt;
    this.celebrate = damp(this.celebrate, this.celebrateTimer > 0 && this.move < 0.5 ? 1 : 0, 8, dt);
    this.stumbleTimer -= dt;
    this.stumble = damp(this.stumble, this.stumbleTimer > 0 ? 1 : 0, 14, dt);

    const p = this.phase, m = this.move, run = this.run, spr = this.sprint, air = this.air, cel = this.celebrate, stb = this.stumble;
    const s = Math.sin(p), c = Math.cos(p);
    const legAmp = (0.45 + run * 0.4 + spr * 0.25) * m * (1 - air * 0.7);
    const armAmp = (0.35 + run * 0.55 + spr * 0.35) * m * (1 - air * 0.6);

    const sign = Math.sign(s);
    if (m > 0.5 && grounded && sign !== this.lastStepSign) {
      this.lastStepSign = sign;
      this.onStep?.(speed);
    }

    const breathe = Math.sin(this.t * 2.1);
    const hop = cel * Math.max(0, Math.sin(this.t * 9)) * 0.18;
    const bob = m * Math.abs(c) * (0.035 + run * 0.06) - m * 0.03 * run;
    r.body.position.y = damp(r.body.position.y, bob + hop + (1 - m) * breathe * 0.006 - stb * 0.12, 18, dt);
    r.hips.rotation.y = s * 0.12 * m;
    r.hips.rotation.z = damp(r.hips.rotation.z, (1 - m) * Math.sin(this.t * 0.45) * 0.035, 4, dt);
    r.spine.rotation.y = -s * (0.16 + run * 0.08) * m;
    r.spine.rotation.x = damp(r.spine.rotation.x, run * 0.22 + spr * 0.16 + m * 0.05 - air * 0.1 + stb * 0.7 - cel * 0.12 + (1 - m) * breathe * 0.012, 10, dt);
    const look = (1 - m) * (1 - cel) * Math.sin(this.t * 0.35) * 0.35;
    r.head.rotation.x = damp(r.head.rotation.x, -r.spine.rotation.x * 0.7 - cel * 0.2, 10, dt);
    r.head.rotation.y = damp(r.head.rotation.y, -r.spine.rotation.y * 0.6 - r.hips.rotation.y * 0.5 + look, 6, dt);

    const kneeL = Math.max(0, -c) * (0.55 + run * 0.65 + spr * 0.35) * m + 0.08;
    const kneeR = Math.max(0, c) * (0.55 + run * 0.65 + spr * 0.35) * m + 0.08;
    r.legL.rotation.x = damp(r.legL.rotation.x, s * legAmp - air * 0.7 - hop * 2, 22, dt);
    r.legR.rotation.x = damp(r.legR.rotation.x, -s * legAmp - air * 0.1, 22, dt);
    r.kneeL.rotation.x = damp(r.kneeL.rotation.x, kneeL + air * 1.1 + hop * 3, 22, dt);
    r.kneeR.rotation.x = damp(r.kneeR.rotation.x, kneeR + air * 0.35, 22, dt);
    // ankles: keep the soles roughly parallel to the ground, with a little toe-off behind the body
    const toeOffL = Math.max(0, r.legL.rotation.x) * 0.5, toeOffR = Math.max(0, r.legR.rotation.x) * 0.5;
    r.footL.rotation.x = -(r.legL.rotation.x + r.kneeL.rotation.x) * 0.85 + toeOffL + air * 0.25;
    r.footR.rotation.x = -(r.legR.rotation.x + r.kneeR.rotation.x) * 0.85 + toeOffR + air * 0.25;

    // arms: counter-swing; celebrate = both fists up; stumble = flail forward
    const idleArm = (1 - m) * breathe * 0.03;
    const celArm = cel * (-2.7 + Math.sin(this.t * 9) * 0.25);
    r.armL.rotation.x = damp(r.armL.rotation.x, (-s * armAmp + idleArm) * (1 - cel) + celArm - air * 0.9 - stb * 1.4, 16, dt);
    r.armR.rotation.x = damp(r.armR.rotation.x, (s * armAmp - idleArm) * (1 - cel) + celArm - air * 0.9 - stb * 1.6, 16, dt);
    r.armL.rotation.z = damp(r.armL.rotation.z, -0.1 - air * 0.5 - cel * 0.35 - stb * 0.5, 10, dt);
    r.armR.rotation.z = damp(r.armR.rotation.z, 0.1 + air * 0.5 + cel * 0.35 + stb * 0.5, 10, dt);
    const elbowBase = -0.18 - run * 0.95 * m - spr * 0.25 - m * 0.15;
    r.elbowL.rotation.x = damp(r.elbowL.rotation.x, elbowBase * (1 - cel) - Math.max(0, -s) * 0.3 * m - cel * 0.4, 16, dt);
    r.elbowR.rotation.x = damp(r.elbowR.rotation.x, elbowBase * (1 - cel) - Math.max(0, s) * 0.3 * m - cel * 0.4, 16, dt);

    for (const a of r.auras) a.rotation.z += dt * a.userData.spin;
  }
}

/** Where an external (GLB) sneaker sits in the ankle bone frame — same frame as the baked shoe. */
const SHOE_FRAME = { y: -0.064, z: -0.006 };

export class Character {
  constructor(scene, look, library = null) {
    this.library = library;
    this.rig = buildCharacter(look);
    this.sneakerId = this.rig.look.sneaker;
    this.external = [];
    if (library?.isSneakerReady(this.sneakerId)) this.setSneaker(this.sneakerId, true);
    this.anim = new CharacterAnimator(this.rig);
    this.group = this.rig.root;
    scene.add(this.group);
    this.position = this.group.position;
    this.yaw = 0;
    this.glowPulse = 0;
  }

  /** Uses the imported sneaker model when it exists, otherwise bakes the procedural shoe. */
  setSneaker(id, force = false) {
    this.sneakerId = id;
    const lib = this.library;
    for (const o of this.external) o.removeFromParent();
    this.external = [];
    if (lib?.isSneakerReady(id)) {
      if (!this.rig.look.externalShoes || force || this.rig.look.sneaker !== id) {
        this.rig.look.externalShoes = true;
        this.rig.look.sneaker = id;
        dress(this.rig);
      }
      for (const [foot, side] of [[this.rig.footL, -1], [this.rig.footR, 1]]) {
        const shoe = lib.createSneaker(id, side);
        shoe.position.set(0, SHOE_FRAME.y, SHOE_FRAME.z);
        shoe.scale.multiplyScalar(SHOE_SCALE);
        foot.add(shoe);
        this.external.push(shoe);
      }
      return;
    }
    if (this.rig.look.externalShoes) { this.rig.look.externalShoes = false; this.rig.look.sneaker = null; }
    setSneaker(this.rig, id);
    if (lib?.hasSneakerAsset(id)) lib.loadSneaker(id).then(() => { if (this.sneakerId === id) this.setSneaker(id, true); });
  }

  /** World position of a foot (for trails). */
  footPosition(left, out) {
    const foot = left ? this.rig.footL : this.rig.footR;
    return out.set(0, -0.03, 0.04).applyMatrix4(foot.matrixWorld);
  }

  update(dt, speed, grounded) {
    this.group.rotation.y = this.yaw;
    this.anim.update(dt, speed, grounded);
    this.glowPulse += dt;
    this.rig.material.userData.glow.value = 1.1 + Math.sin(this.glowPulse * 5) * 0.25;
  }
}

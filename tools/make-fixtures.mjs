// TEST FIXTURES ONLY — not game art.
// Exports the procedural prototype models as GLB files into test/fixtures/assets/ so the GLB
// pipeline (loading, caching, cloning, skinning, AnimationMixer, sneaker sockets, pet finishes,
// prop placement) can be exercised end-to-end before real assets exist.
// Run the game with ?assets=fixtures (dev builds only) to load these instead of /assets.
//   node tools/make-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// --- minimal browser shims needed by GLTFExporter in Node
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); this.onload?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64'); this.onloadend?.(); this.onload?.(); }); }
};

const { buildCharacter, CharacterAnimator } = await import('../js/player/Character.js');
const { sneakerGeometry } = await import('../js/player/SneakerModel.js');
const { petGeometry } = await import('../js/pets/PetModel.js');
const { G, StaticBatch } = await import('../js/utils/Geo.js');

const OUT = 'test/fixtures/assets';
const std = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });

async function exportGLB(obj, file, animations = []) {
  const ab = await new GLTFExporter().parseAsync(obj, { binary: true, animations });
  mkdirSync(`${OUT}/${file.split('/')[0]}`, { recursive: true });
  writeFileSync(`${OUT}/${file}`, Buffer.from(ab));
  console.log('  wrote', file, (ab.byteLength / 1024).toFixed(0) + ' KB');
}

const meshOf = (geo) => {
  const g = geo.clone();
  g.deleteAttribute('emit');
  return new THREE.Mesh(g, std());
};

// ---- character: procedural rig WITHOUT shoes (sneakers attach to the foot sockets) + baked clips
const rig = buildCharacter({ externalShoes: true });
rig.skinned.material = std();
rig.skinned.name = 'Body';
const anim = new CharacterAnimator(rig);
function bake(name, { speed = 0, celebrate = false, duration = null }) {
  const a = new CharacterAnimator(rig);
  for (let i = 0; i < 180; i++) a.update(1 / 60, speed, true); // settle
  if (celebrate) a.triggerCelebrate(10);
  for (let i = 0; i < 30; i++) a.update(1 / 60, speed, true);
  const dt = 1 / 30;
  const startPhase = a.phase;
  const frames = [];
  let t = 0;
  while (true) {
    frames.push({ t, q: rig.bones.map((b) => b.quaternion.clone()), p: rig.body.position.clone() });
    a.update(dt, speed, true);
    t += dt;
    if (duration ? t > duration : (speed > 0.3 ? a.phase - startPhase >= Math.PI * 2 : t > 2.4)) break;
  }
  frames.push({ t, q: frames[0].q, p: frames[0].p }); // seamless loop
  const times = frames.map((f) => f.t);
  const tracks = rig.bones.map((b, i) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, frames.flatMap((f) => f.q[i].toArray())));
  tracks.push(new THREE.VectorKeyframeTrack(`${rig.body.name}.position`, times, frames.flatMap((f) => f.p.toArray())));
  return new THREE.AnimationClip(name, -1, tracks);
}
const clips = [
  bake('Idle', { speed: 0 }),
  bake('Walk', { speed: 1.6 }),
  bake('Run', { speed: 3.9 }),
  bake('Sprint', { speed: 6.5 }),
  bake('Celebrate', { speed: 0, celebrate: true, duration: 1.6 }),
];
for (const b of rig.bones) { b.quaternion.identity(); }
rig.bones.forEach((b, i) => b.position.copy(rig.rest[i]));
void anim;
console.log('fixtures →', OUT);
await exportGLB(rig.root, 'characters/runner.glb', clips);

// ---- sneakers (one right shoe each)
await exportGLB(meshOf(sneakerGeometry('starter')), 'sneakers/starter_canvas.glb');
await exportGLB(meshOf(sneakerGeometry('street')), 'sneakers/street_runner.glb');

// ---- pets (with a little float clip to exercise pet animation)
for (const [id, file] of [['dog', 'pets/dog.glb'], ['cat', 'pets/cat.glb']]) {
  const m = meshOf(petGeometry(id));
  m.name = 'pet';
  const g = new THREE.Group();
  g.add(m);
  const float = new THREE.AnimationClip('Float', 1.2, [new THREE.VectorKeyframeTrack('pet.position', [0, 0.6, 1.2], [0, 0, 0, 0, 0.08, 0, 0, 0, 0])]);
  await exportGLB(g, file, [float]);
}

// ---- props
const prop = (build) => { const b = new StaticBatch(3); build((geo, o) => b.add(geo, o)); const g = b.geometry(); g.deleteAttribute('emit'); return new THREE.Mesh(g, std()); };
await exportGLB(prop((add) => {
  add(G.cyl(6), { y: 1.0, sx: 0.3, sz: 0.3, sy: 2.2, color: 0x6b4a2b });
  add(G.ico(1), { y: 2.8, sx: 2.6, sy: 2.4, sz: 2.6, color: 0x5fbf4a });
  add(G.ico(1), { x: 0.5, y: 3.7, z: -0.3, s: 1.6, color: 0x78d05a });
}), 'props/tree.glb');
await exportGLB(prop((add) => {
  add(G.cbox(0.06), { y: 0.5, sx: 2.6, sy: 0.14, sz: 0.8, color: 0x2ec4f1 });
  add(G.cbox(0.06), { y: 0.25, sx: 2.3, sy: 0.5, sz: 0.5, color: 0x2b2f3a });
}), 'props/bench.glb');
await exportGLB(prop((add) => {
  add(G.cyl(8), { y: 2.5, sx: 0.18, sz: 0.18, sy: 5, color: 0x2b2f3a });
  add(G.cyl(8), { y: 0.15, sx: 0.5, sz: 0.5, sy: 0.3, color: 0x2b2f3a });
  add(G.sphere(8, 6), { y: 5.1, s: 0.45, color: 0xfff6d8 });
}), 'props/lamp.glb');

execSync(`node tools/assets.mjs ${OUT}`, { stdio: 'inherit' });

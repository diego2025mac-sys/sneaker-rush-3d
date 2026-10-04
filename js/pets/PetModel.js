// Procedural low-poly pets. Each pet = one merged geometry + one finish material (1 draw call).
// Pet frame: origin at the pet's belly centre, +Z = facing direction. Roughly 0.7 m tall.
import * as THREE from 'three';
import { G, StaticBatch, makeEmissiveVertexMaterial } from '../utils/Geo.js';
import { PETS } from '../config/pets.js';

const geoCache = new Map();
const matCache = new Map();

export function finishMaterial(finish) {
  if (matCache.has(finish)) return matCache.get(finish);
  let m;
  switch (finish) {
    case 'golden': m = makeEmissiveVertexMaterial({ glow: 1, shininess: 90, color: 0x553300, base: 0.35 }); break;
    case 'diamond': m = makeEmissiveVertexMaterial({ glow: 1, shininess: 120, color: 0x335577, base: 0.4 }); m.transparent = true; m.opacity = 0.88; break;
    case 'crystal': m = makeEmissiveVertexMaterial({ glow: 1.2, shininess: 100, color: 0x6633aa, base: 0.35 }); m.transparent = true; m.opacity = 0.8; break;
    case 'neon': m = makeEmissiveVertexMaterial({ glow: 1.6 }); break;
    case 'cosmic': m = makeEmissiveVertexMaterial({ glow: 1.5, shininess: 40, color: 0x220044, base: 0.5 }); break;
    case 'shadow': m = makeEmissiveVertexMaterial({ glow: 2 }); break;
    default: m = makeEmissiveVertexMaterial({ glow: 1 }); break;
  }
  matCache.set(finish, m);
  return m;
}

function eyes(add, y, z, spread, s, color = 0x1a1a1a, emit = 0) {
  for (const x of [-spread, spread]) {
    add(G.sphere(8, 6), { x, y, z, sx: s, sy: s * 1.2, sz: s * 0.6, color, emit });
    add(G.sphere(6, 4), { x: x + 0.012, y: y + s * 0.3, z: z + s * 0.25, s: s * 0.35, color: 0xffffff, emit: 1 });
  }
}

function legs(add, color, w = 0.16, z = 0.13, h = 0.16, r = 0.09) {
  for (const x of [-w / 2 - 0.02, w / 2 + 0.02]) for (const zz of [-z, z]) add(G.cyl(7), { x, y: -h / 2 - 0.05, z: zz, sx: r, sz: r, sy: h, color });
}

/** Build all parts of a species into `add`. */
function buildSpecies(add, def) {
  const [c0, c1, c2] = def.colors;
  const f = def.finish;
  const glowAcc = f === 'neon' || f === 'shadow' || f === 'cosmic' ? 1 : f === 'crystal' ? 0.5 : 0;
  const bodyEmit = f === 'crystal' ? 0.25 : f === 'golden' ? 0.1 : 0;
  const eyeEmit = f === 'shadow' || f === 'neon' ? 1 : 0;
  const eyeCol = f === 'shadow' ? c2 : f === 'neon' ? c2 : 0x1a1a1a;
  const B = (geo, o) => add(geo, { emit: bodyEmit, ...o });

  switch (def.species) {
    case 'dog': case 'robodog': {
      const robo = def.species === 'robodog';
      const geo = robo ? G.cbox(0.25) : G.sphere(10, 7);
      B(geo, { y: 0.02, sx: 0.34, sy: 0.3, sz: 0.46, color: c0 });
      B(robo ? G.cbox(0.25) : G.sphere(10, 7), { y: 0.25, z: 0.22, sx: 0.36, sy: 0.32, sz: 0.32, color: c0 });
      B(robo ? G.cbox(0.3) : G.sphere(8, 6), { y: 0.19, z: 0.38, sx: 0.18, sy: 0.13, sz: 0.16, color: c1 });
      add(G.sphere(6, 4), { y: 0.23, z: 0.46, s: 0.06, color: c2 });
      eyes(add, 0.3, 0.37, 0.085, 0.05, robo ? c1 : eyeCol, robo ? 1 : eyeEmit);
      for (const x of [-0.17, 0.17]) {
        if (robo) add(G.cbox(0.2), { x, y: 0.42, z: 0.18, sx: 0.06, sy: 0.14, sz: 0.1, color: c2 });
        else B(G.sphere(8, 6), { x, y: 0.28, z: 0.18, rz: x > 0 ? -0.5 : 0.5, sx: 0.09, sy: 0.22, sz: 0.13, color: def.finish === 'golden' ? c1 : c2 === 0x5a3a00 ? c1 : 0x6b4423 });
      }
      B(G.cone(6), { y: 0.1, z: -0.27, rx: -2.2, sx: 0.08, sy: 0.22, sz: 0.08, color: c0 });
      legs(add, robo ? c2 : c0);
      if (robo) {
        add(G.cyl(6), { y: 0.48, z: 0.2, sx: 0.02, sz: 0.02, sy: 0.16, color: c2 });
        add(G.sphere(6, 4), { y: 0.57, z: 0.2, s: 0.06, color: c1, emit: 1 });
        add(G.box(), { y: 0.1, z: 0.0, sx: 0.36, sy: 0.04, sz: 0.3, color: c1, emit: 1 });
      }
      break;
    }
    case 'cat': case 'tiger': case 'fox': {
      const tiger = def.species === 'tiger', fox = def.species === 'fox';
      const s = tiger ? 1.15 : 1;
      B(G.sphere(10, 7), { y: 0.02, sx: 0.32 * s, sy: 0.28 * s, sz: 0.44 * s, color: c0 });
      B(G.sphere(10, 7), { y: 0.27 * s, z: 0.21 * s, sx: 0.34 * s, sy: 0.3 * s, sz: 0.3 * s, color: c0 });
      B(G.sphere(8, 6), { y: 0.21 * s, z: (fox ? 0.37 : 0.33) * s, sx: 0.16 * s, sy: 0.11 * s, sz: (fox ? 0.2 : 0.12) * s, color: c1 });
      add(G.sphere(6, 4), { y: 0.24 * s, z: (fox ? 0.47 : 0.39) * s, s: 0.045, color: fox ? c2 : 0xff8fa3 });
      eyes(add, 0.31 * s, 0.34 * s, 0.08 * s, 0.048 * s, eyeCol, eyeEmit);
      for (const x of [-0.11, 0.11]) {
        B(G.cone(4), { x: x * s, y: 0.38 * s, z: 0.2 * s, rz: x > 0 ? -0.25 : 0.25, sx: 0.11 * s, sy: (fox ? 0.2 : 0.15) * s, sz: 0.07 * s, color: c0 });
        add(G.cone(4), { x: x * s, y: 0.4 * s, z: 0.215 * s, rz: x > 0 ? -0.25 : 0.25, sx: 0.06 * s, sy: 0.09 * s, sz: 0.02, color: fox ? c2 : 0xffb3c7, emit: glowAcc });
      }
      if (fox) {
        B(G.sphere(8, 6), { y: 0.12, z: -0.3, rx: 0.7, sx: 0.18, sy: 0.18, sz: 0.38, color: c0 });
        add(G.sphere(8, 6), { y: 0.25, z: -0.45, s: 0.13, color: c1, emit: glowAcc });
      } else {
        B(G.cyl(6), { y: 0.18 * s, z: -0.3 * s, rx: -0.6, sx: 0.06 * s, sz: 0.06 * s, sy: 0.38 * s, color: c0 });
        add(G.sphere(6, 4), { y: 0.35 * s, z: -0.42 * s, s: 0.08 * s, color: tiger ? c2 : c0, emit: glowAcc });
      }
      if (tiger) for (let i = 0; i < 4; i++) add(G.box(), { y: 0.14, z: -0.15 + i * 0.1, sx: 0.37, sy: 0.04, sz: 0.035, color: c2 });
      if (def.finish === 'neon') {
        add(G.torus(0.17, 0.015, 3, 14), { y: 0.06, rx: Math.PI / 2, sz: 1.4, color: c1, emit: 1 });
        add(G.box(), { y: 0.3 * s, z: 0.08, sx: 0.36, sy: 0.02, sz: 0.04, color: c2, emit: 1 });
      }
      legs(add, c0, 0.16 * s, 0.13 * s);
      break;
    }
    case 'bunny': {
      B(G.sphere(10, 7), { y: 0.05, sx: 0.36, sy: 0.34, sz: 0.38, color: c0 });
      B(G.sphere(10, 7), { y: 0.3, z: 0.13, sx: 0.32, sy: 0.3, sz: 0.3, color: c0 });
      for (const x of [-0.07, 0.07]) {
        B(G.sphere(8, 6), { x, y: 0.56, z: 0.08, rz: x > 0 ? -0.15 : 0.15, sx: 0.08, sy: 0.32, sz: 0.06, color: c0 });
        add(G.sphere(8, 6), { x, y: 0.56, z: 0.105, rz: x > 0 ? -0.15 : 0.15, sx: 0.045, sy: 0.24, sz: 0.02, color: c1, emit: glowAcc });
      }
      eyes(add, 0.33, 0.27, 0.075, 0.045, eyeCol, eyeEmit);
      add(G.sphere(6, 4), { y: 0.27, z: 0.29, s: 0.04, color: 0xff8fa3 });
      add(G.sphere(8, 6), { y: 0.1, z: -0.2, s: 0.13, color: c1, emit: glowAcc });
      for (const x of [-0.1, 0.1]) add(G.sphere(6, 5), { x, y: -0.1, z: 0.12, sx: 0.09, sy: 0.07, sz: 0.14, color: c0 });
      if (def.finish === 'cosmic') for (let i = 0; i < 6; i++) add(G.oct(), { x: Math.cos(i) * 0.19, y: 0.05 + (i % 3) * 0.1, z: Math.sin(i) * 0.19, s: 0.04, color: c1, emit: 1 });
      break;
    }
    case 'bird': case 'phoenix': {
      const ph = def.species === 'phoenix';
      B(G.sphere(10, 7), { y: 0.15, sx: 0.34, sy: 0.38, sz: 0.36, color: c0 });
      B(G.sphere(10, 7), { y: 0.38, z: 0.08, s: 0.26, color: ph ? c0 : c1 });
      add(G.cone(5), { y: 0.35, z: 0.22, rx: Math.PI / 2, sx: 0.07, sy: 0.12, sz: 0.06, color: c2, emit: ph ? 1 : 0 });
      eyes(add, 0.42, 0.18, 0.07, 0.04, eyeCol, eyeEmit);
      for (const x of [-1, 1]) {
        add(G.sphere(8, 6), { x: x * 0.2, y: 0.18, z: -0.02, rz: x * 0.6, sx: 0.08, sy: 0.26, sz: 0.24, color: ph ? c1 : c0, emit: ph ? 0.8 : 0 });
        if (ph) add(G.cone(4), { x: x * 0.3, y: 0.32, z: -0.05, rz: -x * 1.1, sx: 0.1, sy: 0.28, sz: 0.06, color: c2, emit: 1 });
      }
      for (let i = 0; i < (ph ? 3 : 1); i++) add(G.cone(4), { x: (i - (ph ? 1 : 0)) * 0.08, y: 0.08, z: -0.2, rx: -2.0 + i * 0.1, sx: 0.12, sy: ph ? 0.4 : 0.18, sz: 0.04, color: ph ? (i % 2 ? c1 : c2) : c0, emit: ph ? 1 : 0 });
      if (ph) add(G.cone(4), { y: 0.55, z: 0.02, sx: 0.08, sy: 0.16, sz: 0.04, color: c2, emit: 1 });
      for (const x of [-0.07, 0.07]) add(G.cyl(5), { x, y: -0.07, sx: 0.03, sz: 0.03, sy: 0.12, color: 0xff9f1c });
      break;
    }
    case 'dragon': {
      B(G.sphere(10, 7), { y: 0.06, sx: 0.36, sy: 0.32, sz: 0.5, color: c0 });
      B(G.sphere(8, 6), { y: 0.04, z: 0.06, sx: 0.26, sy: 0.24, sz: 0.38, color: c1 });
      B(G.sphere(10, 7), { y: 0.36, z: 0.24, sx: 0.32, sy: 0.28, sz: 0.34, color: c0 });
      B(G.cbox(0.3), { y: 0.3, z: 0.42, sx: 0.2, sy: 0.12, sz: 0.16, color: c0 });
      for (const x of [-0.04, 0.04]) add(G.sphere(5, 4), { x, y: 0.33, z: 0.5, s: 0.025, color: 0x1a1a1a });
      eyes(add, 0.42, 0.37, 0.09, 0.045, f === 'golden' ? 0x1a1a1a : eyeCol, eyeEmit || (f === 'crystal' ? 0.6 : 0));
      for (const x of [-0.09, 0.09]) add(G.cone(5), { x, y: 0.5, z: 0.18, rx: -0.6, sx: 0.05, sy: 0.18, sz: 0.05, color: c2, emit: glowAcc });
      for (const x of [-1, 1]) {
        add(G.prism(), { x: x * 0.28, y: 0.32, z: -0.02, rz: -x * 0.9, ry: Math.PI / 2, sx: 0.32, sy: 0.3, sz: 0.02, color: c1, emit: glowAcc * 0.6 });
      }
      B(G.cone(6), { y: 0.06, z: -0.4, rx: -1.9, sx: 0.12, sy: 0.4, sz: 0.12, color: c0 });
      for (let i = 0; i < 3; i++) add(G.cone(4), { y: 0.22, z: -0.05 - i * 0.12, sx: 0.06, sy: 0.1, sz: 0.06, color: c2, emit: glowAcc });
      if (f === 'cosmic') for (let i = 0; i < 7; i++) add(G.oct(), { x: Math.cos(i * 2) * 0.2, y: 0.1 + (i % 3) * 0.08, z: Math.sin(i * 2) * 0.25, s: 0.035, color: i % 2 ? c1 : c2, emit: 1 });
      legs(add, c0, 0.18, 0.15, 0.12, 0.1);
      break;
    }
    case 'unicorn': {
      B(G.sphere(10, 7), { y: 0.06, sx: 0.32, sy: 0.3, sz: 0.5, color: c0 });
      B(G.cyl(8), { y: 0.3, z: 0.2, rx: 0.5, sx: 0.16, sz: 0.16, sy: 0.3, color: c0 });
      B(G.cbox(0.3), { y: 0.45, z: 0.32, rx: 0.4, sx: 0.18, sy: 0.18, sz: 0.3, color: c0 });
      add(G.cone(6), { y: 0.6, z: 0.36, rx: 0.5, sx: 0.05, sy: 0.24, sz: 0.05, color: c2, emit: 1 });
      eyes(add, 0.5, 0.4, 0.08, 0.04, eyeCol, eyeEmit);
      for (let i = 0; i < 4; i++) add(G.cbox(0.3), { y: 0.48 - i * 0.08, z: 0.2 - i * 0.05, sx: 0.06, sy: 0.1, sz: 0.08, color: i % 2 ? c1 : c2, emit: 1 });
      add(G.cone(5), { y: 0.12, z: -0.32, rx: -2.1, sx: 0.12, sy: 0.35, sz: 0.08, color: c1, emit: 1 });
      legs(add, c0, 0.14, 0.16, 0.2, 0.08);
      break;
    }
    case 'bear': {
      B(G.sphere(10, 7), { y: 0.07, sx: 0.42, sy: 0.4, sz: 0.4, color: c0 });
      B(G.sphere(10, 7), { y: 0.36, z: 0.1, s: 0.34, color: c0 });
      for (const x of [-0.13, 0.13]) add(G.sphere(8, 6), { x, y: 0.52, z: 0.08, s: 0.12, color: c1, emit: glowAcc });
      B(G.sphere(8, 6), { y: 0.3, z: 0.25, sx: 0.16, sy: 0.11, sz: 0.1, color: c1 });
      add(G.sphere(6, 4), { y: 0.33, z: 0.3, s: 0.05, color: 0x1a1a1a });
      eyes(add, 0.4, 0.25, 0.08, 0.045, eyeCol, eyeEmit);
      add(G.sphere(8, 6), { y: 0.08, z: 0.18, sx: 0.24, sy: 0.24, sz: 0.06, color: c1, emit: glowAcc * 0.5 });
      for (let i = 0; i < 6; i++) add(G.oct(), { x: Math.cos(i * 1.7) * 0.22, y: 0.0 + (i % 3) * 0.12, z: Math.sin(i * 1.7) * 0.2, s: 0.035, color: i % 2 ? c2 : c1, emit: 1 });
      legs(add, c0, 0.2, 0.12, 0.12, 0.12);
      break;
    }
    case 'slime': default: {
      B(G.sphere(12, 8), { y: 0.12, sx: 0.5, sy: 0.4, sz: 0.48, color: c0 });
      B(G.sphere(10, 6), { y: 0.3, sx: 0.32, sy: 0.3, sz: 0.3, color: c0 });
      add(G.sphere(6, 4), { y: 0.48, z: -0.02, s: 0.1, color: c1, emit: 1 });
      eyes(add, 0.25, 0.2, 0.1, 0.06, c2, 1);
      for (let i = 0; i < 5; i++) add(G.sphere(6, 4), { x: Math.cos(i * 1.3) * 0.24, y: -0.05, z: Math.sin(i * 1.3) * 0.24, s: 0.09, color: c1, emit: 0.8 });
      add(G.torus(0.3, 0.012, 3, 18), { y: 0.12, rx: Math.PI / 2, color: c2, emit: 1 });
      break;
    }
  }
}

export function petGeometry(id) {
  if (geoCache.has(id)) return geoCache.get(id);
  const def = PETS[id];
  const b = new StaticBatch(id.length * 13);
  buildSpecies((geo, o) => b.add(geo, { vary: 0.03, ao: false, ...o }), def);
  const g = b.geometry();
  g.computeBoundingBox();
  geoCache.set(id, g);
  return g;
}

export function makePetMesh(id) {
  const def = PETS[id];
  const m = new THREE.Mesh(petGeometry(id), finishMaterial(def.finish));
  m.castShadow = true;
  return m;
}

// Egg meshes (lobby pedestals + hatch animation).
import * as THREE from 'three';
import { G, StaticBatch, makeEmissiveVertexMaterial } from '../utils/Geo.js';
import { mulberry32 } from '../utils/math.js';

const cache = new Map();
let eggShape = null;
let mat = null;

function shape() {
  if (!eggShape) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const a = t * Math.PI;
      const r = Math.sin(a) * 0.5 * (1 - 0.18 * t);
      pts.push(new THREE.Vector2(Math.max(0.0001, r), (1 - Math.cos(a)) * 0.62));
    }
    let g = new THREE.LatheGeometry(pts, 18);
    g.deleteAttribute('uv');
    g = g.toNonIndexed();
    g.computeVertexNormals();
    eggShape = g;
  }
  return eggShape;
}

/** Egg ~1.24 tall at scale 1, base at y=0. */
export function eggGeometry(egg) {
  if (cache.has(egg.id)) return cache.get(egg.id);
  const b = new StaticBatch(5);
  const glow = egg.glow ? 0.35 : 0;
  b.add(shape(), { color: egg.color, emit: glow * 0.4, ao: false, vary: 0.02 });
  const rnd = mulberry32(egg.id.length * 31 + 7);
  for (let i = 0; i < 14; i++) {
    const t = 0.15 + rnd() * 0.7;
    const a = rnd() * Math.PI * 2;
    const y = (1 - Math.cos(t * Math.PI)) * 0.62;
    const r = Math.sin(t * Math.PI) * 0.5 * (1 - 0.18 * t);
    const s = 0.08 + rnd() * 0.08;
    b.add(G.sphere(8, 5), { x: Math.cos(a) * r * 0.97, y, z: Math.sin(a) * r * 0.97, ry: -a, sx: s * 0.4, sy: s, sz: s, color: i % 3 === 0 && egg.glow ? egg.glow : egg.spots, emit: egg.glow ? 1 : 0, ao: false });
  }
  // band
  b.add(G.torus(0.47, 0.025, 4, 24), { y: 0.55, rx: Math.PI / 2, color: egg.glow || egg.spots, emit: egg.glow ? 1 : 0.2, ao: false });
  const g = b.geometry();
  cache.set(egg.id, g);
  return g;
}

export function eggMaterial() {
  if (!mat) mat = makeEmissiveVertexMaterial({ glow: 1.3, shininess: 60 });
  return mat;
}

export function makeEggMesh(egg) {
  const m = new THREE.Mesh(eggGeometry(egg), eggMaterial());
  m.castShadow = true;
  return m;
}

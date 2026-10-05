// Builds every pet species model from Kenney "Cube Pets" (CC0, reference/sources/kenney/cube-pets/) so the
// whole roster is one family with Dog and Cat. Re-run after changing a source or js/config/petLooks.js:
//   node tools/build-pets.mjs && npm run assets
//
// Per species:
//  1. copy the Kenney model and embed its colour atlas
//  2. remove parts that belong to the source animal only (deer antlers → unicorn, fish fins → slime)
//  3. re-target UVs onto ten channel swatches in the atlas's unused top band (CH in petLooks.js), so a
//     finish can recolour fur / accents / eyes independently at runtime without touching geometry
//  4. bake chunky species add-ons (robot antenna, dragon wings, unicorn horn, phoenix flames…) as
//     children of the animated `body` node, plus hidden per-variant add-ons named `variant_<petId>`
//  5. paint the species' base colours into the channel swatches
// Geometry stays low-poly (add-ons are boxes / 6-sided cones). Only the idle and walk clips are kept.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { readGltf, embedImages, writeGlb, accessorArray, addAccessor, decodePng, encodePng, compact } from './lib/gltf-io.mjs';
import { CH, ATLAS, SPECIES, VARIANT_ADDONS } from '../js/config/petLooks.js';

const SRC = 'reference/sources/kenney/cube-pets';
const KENNEY = 'Kenney, www.kenney.nl (CC0 1.0)';
const ATLAS_PNG = readFileSync(`${SRC}/Textures/colormap.png`);
const KEEP_CLIPS = ['idle', 'walk'];
const cellOf = (u, v) => `${Math.floor(u * 16)},${Math.floor(v * 4)}`;

// --------------------------------------------------------------- face helpers (body-local) --
// Every Cube Pet is a 1.26-wide cube "head-body" with the face on +z (z ≈ 0.63).
const front = (c) => c.z > 0.5;
const eyeBand = (c) => front(c) && c.y > 0.58 && c.y < 0.98 && Math.abs(c.x) > 0.1 && Math.abs(c.x) < 0.56;
const faceInk = (c) => front(c) && c.y < 1.02 && Math.abs(c.x) < 0.56;

// --------------------------------------------------------------- species rules --
// rule(cell, centroid, nodeName) → channel name | 'REMOVE'
const RULES = {
  'animal-dog': (k, c) => ({ '5,2': 'FUR', '1,3': 'FUR2', '5,3': 'ACCENT', '15,3': 'INK', '3,2': 'EYE' })[k],
  'animal-cat': (k, c, n) => ({ '13,3': n.startsWith('leg') && c.y < -0.25 ? 'FEET' : 'FUR', '1,2': 'FUR2', '15,3': n.startsWith('leg') ? 'FEET' : 'INK', '15,2': 'EYE' })[k],
  'animal-bunny': (k) => ({ '5,2': 'FUR', '1,3': 'FUR2', '5,3': 'FUR2', '7,2': 'ACCENT', '15,3': 'INK', '3,2': 'EYE' })[k],
  'animal-chick': (k, c, n) => ({ '15,2': n.startsWith('wing') ? 'FUR2' : 'FUR', '7,3': 'ACCENT', '3,2': 'EYE', '15,3': 'INK' })[k],
  'animal-fox': (k, c, n) => ({ '7,3': 'FUR', '3,2': eyeBand(c) && n === 'body' ? 'EYE' : 'FUR2', '15,3': 'INK', '5,3': 'ACCENT', '7,2': 'FEET' })[k],
  'animal-tiger': (k, c, n) => ({ '7,3': 'FUR', '15,3': n === 'body' && faceInk(c) ? 'INK' : 'PATTERN', '3,2': eyeBand(c) && n === 'body' ? 'EYE' : 'FUR2', '5,3': n.startsWith('leg') ? 'FEET' : 'ACCENT' })[k],
  'animal-cow': (k, c, n) => {
    if (n.startsWith('leg')) return k === '5,2' ? 'FEET' : 'FUR';
    if (n === 'Group') return 'FUR2';
    return ({ '3,2': eyeBand(c) ? 'EYE' : 'FUR', '15,3': faceInk(c) ? 'INK' : 'PATTERN', '5,3': 'ACCENT' })[k];
  },
  'animal-deer': (k, c, n) => {
    if (k === '7,2') return n === 'body' ? 'REMOVE' : 'FEET';   // antlers go, hooves stay
    return ({ '5,2': 'FUR', '5,3': 'FUR2', '15,3': 'INK', '3,2': 'EYE' })[k];
  },
  'animal-parrot': (k, c, n) => {
    if (n.startsWith('leg')) return 'FEET';
    return ({ '3,1': n === 'Group' ? 'FUR2' : 'FUR', '3,3': 'FUR2', '15,2': 'ACCENT', '13,3': 'FEET', '15,3': 'INK', '3,2': 'EYE' })[k];
  },
  'animal-polar': (k) => ({ '3,2': 'FUR', '1,2': 'FUR2', '15,3': 'INK' })[k],
  'animal-fish': (k, c, n) => {
    if (n === 'body' && c.y > 1.3) return 'REMOVE';                   // dorsal fin
    return ({ '7,3': 'FUR', '3,2': eyeBand(c) ? 'EYE' : 'FUR2', '15,3': faceInk(c) ? 'INK' : 'PATTERN' })[k];
  },
};
const DROP_NODES = { 'animal-fish': ['wing-left', 'wing-right'] };
const SQUASH = { 'animal-fish': [1.12, 0.8, 1.08] };   // body-local vertex scale: the slime is a squat jelly

// --------------------------------------------------------------- add-on geometry --
// Parts are chunky boxes / low-sided cones in body-local space; UVs sample the middle of a channel swatch,
// lighter on top faces and darker underneath (like Kenney's own gradients).
function parts() {
  const list = [];
  const P = {
    box(ch, [x, y, z], [sx, sy, sz], [rx = 0, ry = 0, rz = 0] = []) { list.push({ ch, geo: new THREE.BoxGeometry(sx, sy, sz), x, y, z, rx, ry, rz }); return P; },
    cone(ch, [x, y, z], r, h, [rx = 0, ry = 0, rz = 0] = [], seg = 6) { list.push({ ch, geo: new THREE.ConeGeometry(r, h, seg), x, y, z, rx, ry, rz }); return P; },
    cyl(ch, [x, y, z], r, h, [rx = 0, ry = 0, rz = 0] = [], seg = 8) { list.push({ ch, geo: new THREE.CylinderGeometry(r, r, h, seg), x, y, z, rx, ry, rz }); return P; },
    gem(ch, [x, y, z], s, [rx = 0, ry = 0, rz = 0] = []) { list.push({ ch, geo: new THREE.OctahedronGeometry(s, 0), x, y, z, rx, ry, rz }); return P; },
    star(ch, [x, y, z], s) { P.box(ch, [x, y, z], [s, s * 0.32, s * 0.32]); P.box(ch, [x, y, z], [s * 0.32, s, s * 0.32]); return P.box(ch, [x, y, z], [s * 0.32, s * 0.32, s]); },
    list,
  };
  return P;
}
function bake(list) {
  const pos = [], nor = [], uv = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  for (const p of list) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    g.computeVertexNormals();
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromEuler(e.set(p.rx, p.ry, p.rz)), new THREE.Vector3(1, 1, 1));
    nm.getNormalMatrix(m);
    const P = g.attributes.position, N = g.attributes.normal, u = (CH[p.ch] * ATLAS.cellW + ATLAS.cellW / 2) / ATLAS.size;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      const t = v.y > 0.5 ? 0.18 : v.y < -0.5 ? 0.85 : 0.5;   // top light, sides mid, bottom dark
      uv.push(u, (t * ATLAS.cellH) / ATLAS.size);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv) };
}

// species add-ons (always visible)
const ADDONS = {
  robodog: (P) => P
    .box('ADD_B', [0, 1.3, -0.1], [0.24, 0.08, 0.24]).cyl('ADD_A', [0, 1.44, -0.1], 0.06, 0.22).box('GLOW', [0, 1.6, -0.1], [0.16, 0.16, 0.16])
    .box('ADD_B', [0, 0.72, -0.66], [0.74, 0.46, 0.07]).box('GLOW', [0, 0.78, -0.705], [0.5, 0.07, 0.02]).box('GLOW', [0, 0.62, -0.705], [0.3, 0.07, 0.02])
    .box('GLOW', [-0.34, 0.52, 0.645], [0.14, 0.06, 0.03]).box('GLOW', [0.34, 0.52, 0.645], [0.14, 0.06, 0.03]),
  dragon: (P) => {
    for (const s of [-1, 1]) {
      // wings splay up and out from the upper back so they read from the front and in cards
      P.box('ADD_A', [s * 1.0, 1.08, -0.22], [0.78, 0.08, 0.5], [0, s * -0.3, s * 0.42]);         // front lobe
      P.box('ADD_A', [s * 0.9, 0.96, -0.6], [0.6, 0.08, 0.4], [0, s * -0.3, s * 0.3]);            // rear lobe
    }
    for (const [y, z] of [[1.24, -0.28], [1.12, -0.56], [0.84, -0.67]]) P.box('ADD_B', [0, y, z], [0.15, 0.15, 0.15], [Math.PI / 4, 0, 0]);
    return P.box('FUR', [0, 0.34, -0.78], [0.3, 0.26, 0.4], [-0.25, 0, 0]).box('FUR', [0, 0.46, -1.02], [0.2, 0.18, 0.28], [-0.45, 0, 0]).box('ADD_B', [0, 0.58, -1.18], [0.15, 0.15, 0.15], [Math.PI / 4, 0, 0]);
  },
  unicorn: (P) => P
    .cone('ADD_B', [0, 1.46, 0.36], 0.12, 0.44, [0.45, 0, 0]).box('ADD_B', [0, 1.28, 0.3], [0.2, 0.06, 0.2], [0.45, 0, 0])
    .box('ADD_A', [0, 1.33, 0.06], [0.24, 0.2, 0.22]).box('FUR2', [0, 1.3, -0.2], [0.24, 0.2, 0.22]).box('ADD_A', [0, 1.2, -0.46], [0.24, 0.2, 0.22]).box('FUR2', [0, 0.98, -0.66], [0.24, 0.24, 0.16])
    .box('ADD_A', [0, 0.62, -0.74], [0.22, 0.42, 0.18], [0.5, 0, 0]).box('FUR2', [0, 0.38, -0.86], [0.18, 0.22, 0.16], [0.5, 0, 0]),
  phoenix: (P) => P
    .box('ADD_A', [0, 1.36, 0.12], [0.18, 0.24, 0.18], [0.2, 0, 0]).box('GLOW', [0, 1.56, 0.05], [0.13, 0.22, 0.13], [0.3, 0, 0]).box('ADD_B', [-0.16, 1.33, 0.02], [0.13, 0.2, 0.13], [0.2, 0, 0.4]).box('ADD_B', [0.16, 1.33, 0.02], [0.13, 0.2, 0.13], [0.2, 0, -0.4])
    .box('ADD_A', [0, 0.62, -0.9], [0.2, 0.08, 0.5], [-0.55, 0, 0]).box('ADD_B', [-0.2, 0.55, -0.86], [0.16, 0.08, 0.44], [-0.5, -0.35, 0]).box('ADD_B', [0.2, 0.55, -0.86], [0.16, 0.08, 0.44], [-0.5, 0.35, 0])
    .box('GLOW', [0, 0.86, -1.1], [0.14, 0.08, 0.16], [-0.55, 0, 0]),
  bird: (P) => P.box('ADD_B', [0, 0.42, -0.74], [0.42, 0.1, 0.28], [-0.35, 0, 0]).box('ADD_A', [0, 0.36, 0.64], [0.5, 0.1, 0.03]),
  slime: (P) => P
    .box('ADD_B', [-0.42, -0.06, 0.6], [0.16, 0.22, 0.1]).box('ADD_B', [0.3, -0.04, 0.6], [0.12, 0.16, 0.1]).box('ADD_B', [0.6, 0.0, -0.3], [0.1, 0.2, 0.16]).box('ADD_B', [-0.6, -0.02, -0.1], [0.1, 0.18, 0.14]),
};
// variant add-ons (hidden unless the pet id matches)
const VARIANT_PARTS = {
  gem: (P) => P.gem('GLOW', [0, 1.1, 0.66], 0.15),
  stars: (P) => P.star('GLOW', [-0.62, 1.42, 0.2], 0.24).star('GLOW', [0.66, 1.3, -0.25], 0.2).star('GLOW', [0.1, 1.62, -0.4], 0.16),
  crystals: (P) => P.gem('ADD_B', [-0.48, 1.32, -0.15], 0.17, [0, 0, 0.3]).gem('ADD_B', [0.48, 1.32, -0.15], 0.17, [0, 0, -0.3]).gem('ADD_B', [0, 1.45, -0.35], 0.2),
  visor: (P) => P.box('GLOW', [0, 1.0, 0.655], [1.0, 0.08, 0.03]).box('GLOW', [-0.645, 1.0, 0.2], [0.03, 0.08, 0.9]).box('GLOW', [0.645, 1.0, 0.2], [0.03, 0.08, 0.9]),
  glitch: (P) => P.box('GLOW', [-0.82, 0.9, 0.2], [0.14, 0.14, 0.14]).box('ADD_B', [0.85, 0.6, -0.1], [0.12, 0.12, 0.12]).box('GLOW', [0.7, 1.35, 0.3], [0.1, 0.1, 0.1]).box('ADD_B', [-0.6, 1.4, -0.4], [0.1, 0.1, 0.1]),
  drips: (P) => P.box('GLOW', [0, 1.62, 0.02], [0.14, 0.14, 0.14], [Math.PI / 4, 0, Math.PI / 4]).box('ADD_B', [0.1, -0.08, 0.6], [0.12, 0.26, 0.1]).box('ADD_B', [-0.6, 0.02, 0.35], [0.1, 0.22, 0.12]),
};

// --------------------------------------------------------------- build one species --
function buildSpecies(speciesId) {
  const sp = SPECIES[speciesId];
  const g = readGltf(`${SRC}/${sp.src}.glb`);
  const rule = RULES[sp.src];
  const nodes = g.json.nodes;
  const sourceCells = {}; // channel → first source cell (for copying the Kenney gradient)
  const unmapped = new Map();
  // 1. drop whole nodes
  const dropped = new Set(nodes.map((n, i) => ((DROP_NODES[sp.src] || []).includes(n.name) ? i : -1)).filter((i) => i >= 0));
  for (const n of nodes) if (n.children) n.children = n.children.filter((i) => !dropped.has(i));
  for (const an of g.json.animations || []) an.channels = an.channels.filter((c) => !dropped.has(c.target.node));
  // 2./3. per primitive: remove triangles, re-target UVs
  const done = new Set();
  nodes.forEach((node) => {
    if (node.mesh === undefined || done.has(node.mesh)) return;
    done.add(node.mesh);
    for (const prim of g.json.meshes[node.mesh].primitives) {
      const P = accessorArray(g, prim.attributes.POSITION).arr, UV = accessorArray(g, prim.attributes.TEXCOORD_0).arr;
      const I = prim.indices !== undefined ? accessorArray(g, prim.indices).arr : Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
      const chOf = new Int8Array(P.length / 3).fill(-1), keep = [];
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        const cen = { x: (P[a * 3] + P[b * 3] + P[c * 3]) / 3, y: (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, z: (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3 };
        const k = cellOf((UV[a * 2] + UV[b * 2] + UV[c * 2]) / 3, (UV[a * 2 + 1] + UV[b * 2 + 1] + UV[c * 2 + 1]) / 3);
        const ch = rule(k, cen, node.name);
        if (ch === 'REMOVE') continue;
        if (!ch) { unmapped.set(k, (unmapped.get(k) || 0) + 1); keep.push(a, b, c); continue; }
        sourceCells[ch] ||= k;
        for (const vi of [a, b, c]) chOf[vi] = CH[ch];
        keep.push(a, b, c);
      }
      if (SQUASH[sp.src] && node.name === 'body') {
        const [kx, ky, kz] = SQUASH[sp.src], P2 = new Float32Array(P);
        for (let i = 0; i < P2.length; i += 3) { P2[i] *= kx; P2[i + 1] *= ky; P2[i + 2] *= kz; }
        prim.attributes.POSITION = addAccessor(g, P2, 'VEC3', { target: 34962, minmax: true });
      }
      const uv2 = new Float32Array(UV);
      for (let i = 0; i < chOf.length; i++) {
        if (chOf[i] < 0) continue;
        const cx = Math.floor(UV[i * 2] * 16), cy = Math.floor(UV[i * 2 + 1] * 4);
        uv2[i * 2] = UV[i * 2] + ((chOf[i] - cx) * ATLAS.cellW) / ATLAS.size;
        uv2[i * 2 + 1] = UV[i * 2 + 1] - (cy * ATLAS.cellH) / ATLAS.size;
      }
      prim.attributes.TEXCOORD_0 = addAccessor(g, uv2, 'VEC2', { target: 34962 });
      if (keep.length !== I.length) prim.indices = addAccessor(g, Uint32Array.from(keep), 'SCALAR', { target: 34963 });
    }
  });
  if (unmapped.size) console.log('   (unmapped cells kept as-is:', [...unmapped].map(([k, n]) => `${k}×${n}`).join(' '), ')');
  // 4. add-ons
  const body = nodes.findIndex((n) => n.name === 'body');
  const addNode = (name, list) => {
    const d = bake(list);
    const mesh = { name, primitives: [{ attributes: { POSITION: addAccessor(g, d.pos, 'VEC3', { target: 34962, minmax: true }), NORMAL: addAccessor(g, d.nor, 'VEC3', { target: 34962 }), TEXCOORD_0: addAccessor(g, d.uv, 'VEC2', { target: 34962 }) }, material: 0 }] };
    g.json.meshes.push(mesh);
    nodes.push({ name, mesh: g.json.meshes.length - 1 });
    (nodes[body].children ||= []).push(nodes.length - 1);
  };
  if (ADDONS[speciesId]) addNode('addon', ADDONS[speciesId](parts()).list);
  for (const [petId, kind] of Object.entries(VARIANT_ADDONS)) {
    if (PET_SPECIES[petId] === speciesId) addNode('variant_' + petId, VARIANT_PARTS[kind](parts()).list);
  }
  // 5. atlas: channel swatches = copied Kenney gradient (or a recolour of it), add-on swatches painted
  const img = decodePng(ATLAS_PNG);
  const cellPx = (cx, cy, x, y) => ((cy * ATLAS.cellH + y) * ATLAS.size + cx * ATLAS.cellW + x) * 4;
  for (const [name, ch] of Object.entries(CH)) {
    const src = sourceCells[name]?.split(',').map(Number);
    const target = sp.colors?.[name];
    for (let y = 0; y < ATLAS.cellH; y++) for (let x = 0; x < ATLAS.cellW; x++) {
      const o = cellPx(ch, 0, x, y);
      let r, gg, b;
      if (src) { const s = cellPx(src[0], src[1], x, y); r = img.data[s]; gg = img.data[s + 1]; b = img.data[s + 2]; }
      if (target !== undefined) {
        // keep the swatch's light→dark shading but move it to the target colour
        const k = src ? Math.max(0.55, Math.min(1.15, lum(r, gg, b) / Math.max(1, lumAt(img, src, x, Math.round(ATLAS.cellH * 0.18))))) : 1 - 0.3 * (y / ATLAS.cellH);
        r = ((target >> 16) & 255) * k; gg = ((target >> 8) & 255) * k; b = (target & 255) * k;
      } else if (!src) { const k = 1 - 0.3 * (y / ATLAS.cellH); r = 200 * k; gg = 200 * k; b = 210 * k; }
      img.data[o] = Math.min(255, r); img.data[o + 1] = Math.min(255, gg); img.data[o + 2] = Math.min(255, b); img.data[o + 3] = 255;
    }
  }
  // every triangle now samples the channel band, so clear the rest of the atlas (tiny PNG per species)
  img.data.fill(0, ATLAS.cellH * ATLAS.size * 4);
  for (let i = ATLAS.cellH * ATLAS.size * 4 + 3; i < img.data.length; i += 4) img.data[i] = 255;
  g.json.images.forEach((im) => { im.uri = 'colormap.png'; });
  embedImages(g, encodePng(img));
  g.json.asset = { ...g.json.asset, copyright: KENNEY + ' — modified for Sneaker Rush 3D', generator: 'tools/build-pets.mjs', extras: { petChannels: sourceCells } };
  // the follower plays `idle` (walk kept for future use); the other Kenney clips are dropped to stay light
  g.json.animations = (g.json.animations || []).filter((an) => KEEP_CLIPS.includes(an.name));
  compact(g);
  writeGlb(`assets/pets/${sp.file}.glb`, g.json, g.bin);
}
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const lumAt = (img, [cx, cy], x, y) => { const s = ((cy * ATLAS.cellH + y) * ATLAS.size + cx * ATLAS.cellW + x) * 4; return lum(img.data[s], img.data[s + 1], img.data[s + 2]); };

// pet id → species (read from the gameplay config without importing browser code)
import { PETS } from '../js/config/pets.js';
const PET_SPECIES = Object.fromEntries(Object.entries(PETS).map(([id, p]) => [id, p.species]));

console.log('Building pet species (Kenney Cube Pets base, CC0)…');
for (const id of Object.keys(SPECIES)) { console.log(' ', id, '←', SPECIES[id].src); buildSpecies(id); }

// Builds the "Option B" visual-slice assets from the original CC0 source files in reference/sources/
// (see assets/CREDITS.md for sources, authors and modifications). Re-run after changing a source:
//   node tools/build-slice-assets.mjs && npm run assets
//
// Outputs
//   assets/characters/runner.glb        Quaternius "Casual_Male" (recoloured materials, geometry/rig/animations untouched)
//   assets/sneakers/starter_canvas.glb  original variant derived from the Quaternius modular "Casual" footwear mesh
//   assets/sneakers/street_runner.glb   original variant derived from the same mesh (reshaped sole/heel, new zones)
//   assets/pets/dog.glb, cat.glb        Kenney Cube Pets (texture embedded, otherwise unmodified)
//   assets/props/shop_*.glb             Kenney Mini Market / Furniture Kit pieces for the shop test corner
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SRC = 'reference/sources';
const QUAT = 'Quaternius (CC0 1.0)';
const KENNEY = 'Kenney, www.kenney.nl (CC0 1.0)';

// ------------------------------------------------------------------ glTF / GLB I/O --
function readGltf(path) {
  const raw = readFileSync(path);
  let json, bin = null;
  if (raw.readUInt32LE(0) === 0x46546c67) { // GLB
    let off = 12;
    while (off < raw.length) {
      const len = raw.readUInt32LE(off), type = raw.readUInt32LE(off + 4);
      const chunk = raw.subarray(off + 8, off + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
      else if (type === 0x004e4942) bin = Buffer.from(chunk);
      off += 8 + len;
    }
  } else {
    json = JSON.parse(raw.toString('utf8'));
    const uri = json.buffers?.[0]?.uri;
    if (uri) {
      bin = uri.startsWith('data:') ? Buffer.from(uri.split(',')[1], 'base64') : readFileSync(join(dirname(path), uri));
      json.buffers = [{ byteLength: bin.length }];
    }
  }
  return { json, bin: bin || Buffer.alloc(0), dir: dirname(path) };
}

/** Move external images (Textures/colormap.png) into the binary chunk so each GLB is self-contained. */
function embedImages(g) {
  for (const img of g.json.images || []) {
    if (!img.uri) continue;
    const data = readFileSync(join(g.dir, decodeURIComponent(img.uri)));
    const pad = (4 - (g.bin.length % 4)) % 4;
    const offset = g.bin.length + pad;
    g.bin = Buffer.concat([g.bin, Buffer.alloc(pad), data]);
    g.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
    img.bufferView = g.json.bufferViews.length - 1;
    img.mimeType = img.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    delete img.uri;
  }
  if (!g.json.buffers?.length) g.json.buffers = [{}];
  g.json.buffers[0] = { byteLength: g.bin.length };
  return g;
}

function writeGlb(path, json, bin) {
  mkdirSync(dirname(path), { recursive: true });
  const js = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jsonChunk.length + (bin.length ? 8 + binChunk.length : 0), 8);
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
  writeFileSync(path, Buffer.concat([head, chunk(0x4e4f534a, jsonChunk), ...(bin.length ? [chunk(0x004e4942, binChunk)] : [])]));
  console.log('  wrote', path, (Buffer.byteLength(JSON.stringify(json)) / 1024 + bin.length / 1024).toFixed(0) + ' KB');
}

const srgb = (hex) => [16, 8, 0].map((s) => { const c = ((hex >> s) & 255) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const stamp = (json, credit) => { json.asset = { ...json.asset, copyright: credit + ' — modified for Sneaker Rush 3D', generator: 'tools/build-slice-assets.mjs' }; };

// --------------------------------------------------------------------- 1. player --
// Quaternius exported this pack with near-black skin (0.013) and white eye shapes; give it a natural stylized
// skin tone and dark eyes, and move the outfit into the game palette. Only material colours change.
{
  const g = readGltf(`${SRC}/quaternius/ultimate-animated-character-pack/Casual_Male.gltf`);
  const colors = { Skin: 0xe8b48f, Face: 0x1e1e26, Shirt: 0x2ec4f1, Pants: 0x24304f, Belt: 0xff3d7f, Hair: 0x6b3f22 };
  for (const m of g.json.materials) if (colors[m.name]) m.pbrMetallicRoughness.baseColorFactor = [...srgb(colors[m.name]), 1];
  stamp(g.json, QUAT);
  writeGlb('assets/characters/runner.glb', g.json, g.bin);
}

// ------------------------------------------------------------------- 2. sneakers --
function loadTris(path) {
  const { json, bin } = readGltf(path);
  const tris = [];
  for (const prim of json.meshes[0].primitives) {
    const a = json.accessors[prim.attributes.POSITION], v = json.bufferViews[a.bufferView];
    const f = new Float32Array(bin.buffer, bin.byteOffset + (v.byteOffset || 0), a.count * 3);
    const mat = json.materials[prim.material].name;
    for (let i = 0; i < a.count; i += 3) tris.push({ mat, p: [0, 1, 2].map((k) => [f[(i + k) * 3], f[(i + k) * 3 + 1], f[(i + k) * 3 + 2]]) });
  }
  return tris;
}
const centroid = (t) => [0, 1, 2].map((j) => (t.p[0][j] + t.p[1][j] + t.p[2][j]) / 3);
const normal = (p) => {
  const a = [0, 1, 2].map((j) => p[1][j] - p[0][j]), b = [0, 1, 2].map((j) => p[2][j] - p[0][j]);
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const l = Math.hypot(...n) || 1;
  return n.map((x) => x / l);
};
/** Axis-aligned box as 12 triangles (outward winding). */
function box(cx, cy, cz, sx, sy, sz, mat) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const q = (a, b, c, d) => [{ mat, p: [a, b, c] }, { mat, p: [a, c, d] }];
  return [
    ...q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]), ...q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]),
    ...q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]), ...q([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]),
    ...q([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]), ...q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]),
  ];
}
/** Highest point of the given triangles straight above (x, z). */
function surfaceY(tris, x, z) {
  let best = -Infinity;
  for (const { p } of tris) {
    const [a, b, c] = p;
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-12) continue;
    const w1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
    const w2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
    const w3 = 1 - w1 - w2;
    if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
    best = Math.max(best, w1 * a[1] + w2 * b[1] + w3 * c[1]);
  }
  return best;
}

function buildSneaker({ name, file, palette, reshape, zone, laceBars, extras }) {
  const base = loadTris(`${SRC}/quaternius/ultimate-modular-characters/casual_feet_right.gltf`);
  const L = Math.max(...base.flatMap((t) => t.p.map((v) => v[2])));
  const SOLE_TOP = 0.025;
  let tris = [];
  for (const t of base) {
    const c = centroid(t), n = normal(t.p);
    if (t.mat === 'White' && c[1] > 0.06) continue; // the modular character's sock/ankle stump, not part of the shoe
    const part = t.mat === 'White' ? 'sole' : 'upper';
    const mat = zone({ part, c, n, L });
    tris.push({ mat, p: t.p.map((v) => (reshape ? reshape(v, L, SOLE_TOP) : v.slice())), src: part });
  }
  // insole: the sole's footprint (its bottom faces), flipped to face up, inset and lifted to the top of the sole,
  // so the open collar shows a dark footbed instead of the ground through the shoe
  const bottom = base.filter((t) => t.mat === 'White' && centroid(t)[1] < 0.004 && normal(t.p)[1] < -0.9);
  const cx = bottom.flatMap((t) => t.p).reduce((s, v) => [s[0] + v[0], s[1] + v[2]], [0, 0]).map((s) => s / (bottom.length * 3));
  for (const t of bottom) {
    const p = [t.p[0], t.p[2], t.p[1]].map(([x, , z]) => [cx[0] + (x - cx[0]) * 0.86, SOLE_TOP + 0.004, cx[1] + (z - cx[1]) * 0.9]);
    tris.push({ mat: 'insole', p: p.map((v) => (reshape ? reshape(v, L, SOLE_TOP) : v)) });
  }
  // laces across the lace flap, placed on the actual surface
  const upper = tris.filter((t) => t.src === 'upper');
  for (let i = 0; i < laceBars.count; i++) {
    const z = laceBars.from + (laceBars.to - laceBars.from) * (i / Math.max(1, laceBars.count - 1));
    const y = Math.max(surfaceY(upper, -0.018, z), surfaceY(upper, 0, z), surfaceY(upper, 0.018, z));
    tris.push(...box(0, y + 0.003, z, laceBars.width, 0.006, 0.009, 'laces'));
  }
  if (extras) tris.push(...extras({ tris, upper, L }));
  // one primitive per material, flat normals
  const mats = [...new Set(tris.map((t) => t.mat))];
  const views = [], accessors = [], prims = [];
  let bin = Buffer.alloc(0);
  const push = (arr, min, max) => {
    const data = Buffer.from(new Float32Array(arr).buffer);
    views.push({ buffer: 0, byteOffset: bin.length, byteLength: data.length, target: 34962 });
    bin = Buffer.concat([bin, data]);
    accessors.push({ bufferView: views.length - 1, componentType: 5126, count: arr.length / 3, type: 'VEC3', ...(min ? { min, max } : {}) });
    return accessors.length - 1;
  };
  for (const m of mats) {
    const pos = [], nor = [];
    for (const t of tris.filter((x) => x.mat === m)) { const n = normal(t.p); for (const v of t.p) { pos.push(...v); nor.push(...n); } }
    const min = [0, 1, 2].map((j) => Math.min(...pos.filter((_, i) => i % 3 === j)));
    const max = [0, 1, 2].map((j) => Math.max(...pos.filter((_, i) => i % 3 === j)));
    prims.push({ attributes: { POSITION: push(pos, min, max), NORMAL: push(nor) }, material: mats.indexOf(m) });
  }
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: prims }],
    materials: mats.map((m) => ({ name: m, doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [...srgb(palette[m]), 1], metallicFactor: 0, roughnessFactor: 0.7 } })),
    accessors, bufferViews: views, buffers: [{ byteLength: bin.length }],
  };
  stamp(json, QUAT);
  writeGlb(file, json, bin);
  console.log(`    ${name}: ${tris.length} triangles, materials ${mats.join(', ')}`);
}

// Starter Canvas: the base shoe as-is (flat vulcanised sole), natural canvas upper, white rubber toe cap, 3 lace bars.
buildSneaker({
  name: 'starter_canvas', file: 'assets/sneakers/starter_canvas.glb',
  palette: { upper_canvas: 0xeadfc6, toe_cap_rubber: 0xf6f3ec, sole_rubber: 0xf6f3ec, outsole: 0xb9b2a3, insole: 0x4a4a52, laces: 0xffffff },
  zone: ({ part, c, n, L }) => part === 'sole' ? (n[1] < -0.5 ? 'outsole' : 'sole_rubber') : (c[2] > 0.81 * L && c[1] < 0.075 ? 'toe_cap_rubber' : 'upper_canvas'),
  laceBars: { count: 3, from: 0.15, to: 0.2, width: 0.044 },
});

// Street Runner: same last, reshaped into a runner — 2.7x midsole with heel-to-toe drop, toe spring, flared heel —
// plus a coloured heel counter, toe overlay, pink heel clip on the midsole, a pull tab and 4 lace bars.
buildSneaker({
  name: 'street_runner', file: 'assets/sneakers/street_runner.glb',
  palette: { upper_mesh: 0x3a8dff, toe_overlay: 0x1d3557, heel_counter: 0xff7a2f, midsole: 0xf7f7f2, midsole_heel_clip: 0xff3d7f, outsole_rubber: 0x2b2f3a, insole: 0x2b2f3a, laces: 0xffffff, heel_tab: 0xff7a2f },
  reshape: ([x, y, z], L, T) => {
    const K = 2.7, drop = 0.012 * (1 - z / L);
    let nx = x, ny, nz = z;
    if (y <= T + 1e-4) {
      ny = y * K + (y / T) * drop;
      nx = x * 1.06;                                                          // wider, more stable midsole
      if (z < 0.05) nz = z - 0.012 * (1 - z / 0.05) * (0.5 + 0.5 * (y / T));  // sculpted, flared heel
    } else ny = y + T * (K - 1) + drop;
    if (z > 0.78 * L) ny += ((z - 0.78 * L) / (0.22 * L)) ** 2 * 0.014;       // toe spring
    return [nx, ny, nz];
  },
  zone: ({ part, c, n, L }) => {
    if (part === 'sole') return n[1] < -0.5 ? 'outsole_rubber' : c[2] < 0.035 ? 'midsole_heel_clip' : 'midsole';
    if (c[2] < 0.045) return 'heel_counter';
    return c[2] > 0.81 * L && c[1] < 0.075 ? 'toe_overlay' : 'upper_mesh';
  },
  laceBars: { count: 4, from: 0.145, to: 0.21, width: 0.046 },
  extras: ({ upper }) => {
    const back = upper.filter((t) => centroid(t)[2] < 0.03);
    const top = Math.max(...back.flatMap((t) => t.p.map((v) => v[1])));
    return box(0, top - 0.004, -0.004, 0.03, 0.03, 0.012, 'heel_tab');
  },
});

// ----------------------------------------------------------------- 3. pets, shop --
// Kenney Furniture Kit materials are KHR_materials_unlit; drop the extension so they are lit like the rest of the
// scene (same base colours). Cube Pets and Mini Market are already lit.
function makeLit(json) {
  json.extensionsUsed = (json.extensionsUsed || []).filter((e) => e !== 'KHR_materials_unlit');
  if (!json.extensionsUsed.length) delete json.extensionsUsed;
  for (const m of json.materials || []) {
    if (!m.extensions?.KHR_materials_unlit) continue;
    delete m.extensions.KHR_materials_unlit;
    if (!Object.keys(m.extensions).length) delete m.extensions;
    m.pbrMetallicRoughness = { ...(m.pbrMetallicRoughness || {}), metallicFactor: 0, roughnessFactor: 0.8 };
  }
}
const copyKenney = (src, dst) => { const g = embedImages(readGltf(src)); makeLit(g.json); stamp(g.json, KENNEY); writeGlb(dst, g.json, g.bin); };
copyKenney(`${SRC}/kenney/cube-pets/animal-dog.glb`, 'assets/pets/dog.glb');
copyKenney(`${SRC}/kenney/cube-pets/animal-cat.glb`, 'assets/pets/cat.glb');
copyKenney(`${SRC}/kenney/mini-market/cash-register.glb`, 'assets/props/shop_counter.glb');
copyKenney(`${SRC}/kenney/furniture-kit/benchCushionLow.glb`, 'assets/props/shop_bench.glb');
copyKenney(`${SRC}/kenney/furniture-kit/pottedPlant.glb`, 'assets/props/shop_plant.glb');
copyKenney(`${SRC}/kenney/furniture-kit/lampSquareFloor.glb`, 'assets/props/shop_lamp.glb');

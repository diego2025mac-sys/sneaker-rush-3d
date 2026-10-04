// Builds ONE track chunk variant (track surface + ground + scenery) for a biome into a StaticBatch.
// Chunk local frame: z from 0 to chunkLength, x = 0 is the track centre, y = 0 the running surface.
// Variants are cached by RunTrack, so this code only runs a few times per biome.
import { G } from '../utils/Geo.js';
import { RUN } from '../config/balance.js';

const LEN = RUN.chunkLength;
const HW = RUN.trackHalfWidth;
const NEON = [0xff2bd6, 0x5ff3ff, 0x39ff88, 0xffe14d, 0xb45cff];

export function buildChunk(b, biome, rnd) {
  const add = (geo, o) => b.add(geo, { vary: 0.04, ...o });
  const box = (x, y, z, sx, sy, sz, color, o = {}) => add(G.cbox(o.bevel ?? 0.08), { x, y, z, sx, sy, sz, color, ...o });
  const floating = !biome.ground;

  // ---------------------------------------------------------------- track --
  add(G.box(), { y: -0.2, z: LEN / 2, sx: HW * 2, sy: 0.4, sz: LEN + 0.04, color: biome.track, ao: false, vary: 0.01 });
  for (const x of [-HW / 3, HW / 3]) {
    for (let z = 1.5; z < LEN; z += 6) add(G.box(), { x, y: 0.005, z, sx: 0.12, sy: 0.02, sz: 3, color: biome.trackLine, ao: false, emit: floating || biome.id === 'neon' ? 1 : 0 });
  }
  for (const s of [-1, 1]) {
    add(G.box(), { x: s * (HW - 0.3), y: 0.005, z: LEN / 2, sx: 0.14, sy: 0.02, sz: LEN, color: biome.trackLine, ao: false, emit: floating || biome.id === 'neon' ? 1 : 0 });
    // curbs (alternating colours every 3 m)
    for (let z = 0; z < LEN; z += 3) {
      add(G.box(), { x: s * (HW + 0.35), y: 0.1, z: z + 1.5, sx: 0.7, sy: 0.5, sz: 3, color: (z / 3) % 2 ? biome.curb : biome.track, ao: false, emit: floating ? 0.6 : 0, vary: 0.02 });
    }
  }

  // --------------------------------------------------------------- ground --
  if (!floating) {
    add(G.box(), { y: -0.5, z: LEN / 2, sx: 360, sy: 0.6, sz: LEN + 0.05, color: biome.ground, ao: false, vary: 0.0 });
  } else {
    // floating track: glowing underside + supports
    add(G.box(), { y: -0.9, z: LEN / 2, sx: HW * 1.6, sy: 1, sz: LEN, color: biome.id === 'space' ? 0x2a1f5a : 0xffffff, ao: false });
    for (const s of [-1, 1]) add(G.box(), { x: s * (HW + 0.75), y: -0.25, z: LEN / 2, sx: 0.12, sy: 0.12, sz: LEN, color: biome.curb, emit: 1, ao: false });
  }

  const sides = [-1, 1];
  switch (biome.id) {
    case 'city': {
      for (const s of sides) {
        add(G.box(), { x: s * 10, y: 0.0, z: LEN / 2, sx: 6, sy: 0.3, sz: LEN, color: 0xb8bec8, ao: false });
        for (let z = 6; z < LEN; z += 20) streetLight(add, s * 8.2, z, s);
        let z = 0;
        while (z < LEN) {
          const w = 8 + rnd() * 10, h = 10 + rnd() * 34, d = 10 + rnd() * 8;
          const x = s * (14 + d / 2 + rnd() * 3);
          const col = [0xf2e6da, 0xdfe6f2, 0xffd6c8, 0xc8e6ff, 0xe8dff2, 0xfff1c8][Math.floor(rnd() * 6)];
          add(G.boxBase(), { x, z: z + w / 2, sx: d, sy: h, sz: w, color: col, aoH: 20 });
          for (let k = 3; k < h - 1; k += 3.2) add(G.box(), { x: x - s * (d / 2 + 0.03), y: k, z: z + w / 2, sx: 0.08, sy: 1.3, sz: w * 0.8, color: rnd() < 0.2 ? 0xfff1b8 : 0x7fa8d8, emit: 0.15, ao: false });
          add(G.box(), { x, y: h + 0.3, z: z + w / 2, sx: d * 0.9, sy: 0.6, sz: w * 0.9, color: 0x8a8f99 });
          if (rnd() < 0.35) add(G.box(), { x: x - s * (d / 2 + 0.3), y: h * 0.6, z: z + w / 2, sx: 0.3, sy: 3.5, sz: w * 0.7, color: NEON[Math.floor(rnd() * 5)], emit: 0.8 });
          z += w + 1 + rnd() * 3;
        }
        for (let i = 0; i < 2; i++) tree(add, s * (12 + rnd()), 8 + rnd() * 44, rnd, 0x5fbf4a);
      }
      break;
    }
    case 'suburbs': {
      for (const s of sides) {
        add(G.box(), { x: s * 10.5, y: 0.0, z: LEN / 2, sx: 5, sy: 0.25, sz: LEN, color: 0xd8d4c8, ao: false });
        for (let z = 0; z < LEN; z += 2) add(G.box(), { x: s * 13.5, y: 0.5, z: z + 1, sx: 0.12, sy: 1, sz: 0.25, color: 0xffffff });
        add(G.box(), { x: s * 13.5, y: 0.8, z: LEN / 2, sx: 0.1, sy: 0.12, sz: LEN, color: 0xffffff });
        for (let z = 4; z < LEN; z += 20) {
          const x = s * (22 + rnd() * 6);
          const col = [0xffe0b8, 0xc8e6ff, 0xffd6e0, 0xe0ffd6, 0xfff6d6][Math.floor(rnd() * 5)];
          const roof = [0xd7263d, 0x3d6fd9, 0x6b4a2b, 0x2b2f3a][Math.floor(rnd() * 4)];
          add(G.boxBase(), { x, z: z + 6, sx: 9, sy: 5, sz: 10, color: col, aoH: 4 });
          add(G.prism(), { x, y: 5, z: z + 6, sx: 10, sy: 3.4, sz: 11, color: roof });
          add(G.box(), { x: x - s * 4.55, y: 1.3, z: z + 6, sx: 0.1, sy: 2.4, sz: 1.4, color: 0x6b4a2b });
          for (const dz of [-3, 3]) add(G.box(), { x: x - s * 4.55, y: 2.8, z: z + 6 + dz, sx: 0.1, sy: 1.4, sz: 1.6, color: 0x9fd6ff, emit: 0.2 });
          add(G.cylBase(6), { x: s * 14.5, z: z + 6, sx: 0.12, sz: 0.12, sy: 1.1, color: 0x6b4a2b });
          add(G.cbox(0.2), { x: s * 14.5, y: 1.2, z: z + 6, sx: 0.35, sy: 0.3, sz: 0.5, color: 0x3d6fd9 });
          tree(add, s * (17 + rnd() * 2), z + 14 + rnd() * 4, rnd, 0x4fae46);
        }
        for (let i = 0; i < 3; i++) bush(add, s * (12 + rnd() * 2), rnd() * LEN, rnd);
      }
      break;
    }
    case 'desert': {
      for (const s of sides) {
        for (let i = 0; i < 4; i++) add(G.sphere(10, 5), { x: s * (16 + rnd() * 60), y: -0.4, z: rnd() * LEN, sx: 14 + rnd() * 20, sy: 2 + rnd() * 4, sz: 10 + rnd() * 16, color: 0xf0c27a, ao: false });
        for (let i = 0; i < 3; i++) cactus(add, s * (9 + rnd() * 14), rnd() * LEN, rnd);
        for (let i = 0; i < 2; i++) add(G.rock(Math.floor(rnd() * 4)), { x: s * (10 + rnd() * 20), y: 0.2, z: rnd() * LEN, s: 1 + rnd() * 2, ry: rnd() * 6, color: 0xc0784a });
        if (rnd() < 0.7) {
          const x = s * (70 + rnd() * 60), z = rnd() * LEN, h = 18 + rnd() * 25;
          add(G.taper(0.8, 7), { x, z, sx: 30 + rnd() * 20, sy: h, sz: 30, color: 0xd9824a, aoH: 20 });
          add(G.cyl(7), { x, y: h, z, sx: 24, sz: 24, sy: 1, color: 0xe8995a });
        }
      }
      break;
    }
    case 'forest': {
      for (const s of sides) {
        for (let i = 0; i < 12; i++) pine(add, s * (9 + rnd() * 40), rnd() * LEN, rnd, 0x2f7a3a, 1 + rnd() * 0.8);
        for (let i = 0; i < 3; i++) add(G.rock(Math.floor(rnd() * 4)), { x: s * (9 + rnd() * 8), y: 0.1, z: rnd() * LEN, s: 0.8 + rnd() * 1.2, ry: rnd() * 6, color: 0x8a8f99 });
        for (let i = 0; i < 3; i++) mushroom(add, s * (8.5 + rnd() * 4), rnd() * LEN, rnd);
        if (rnd() < 0.5) add(G.cyl(8), { x: s * (10 + rnd() * 4), y: 0.35, z: rnd() * LEN, rz: Math.PI / 2, ry: rnd(), sx: 0.7, sz: 0.7, sy: 4, color: 0x6b4a2b });
      }
      break;
    }
    case 'mountains': {
      for (const s of sides) {
        for (let i = 0; i < 6; i++) pine(add, s * (9 + rnd() * 30), rnd() * LEN, rnd, 0x2a5f44, 1.2 + rnd() * 0.8, true);
        for (let i = 0; i < 2; i++) {
          const x = s * (60 + rnd() * 90), z = rnd() * LEN, h = 50 + rnd() * 70, w = 50 + rnd() * 40;
          add(G.cone(7), { x, z, sx: w, sy: h, sz: w, ry: rnd() * 3, color: 0x7d8aa8, aoH: 60 });
          add(G.cone(7), { x, y: h * 0.62, z, sx: w * 0.39, sy: h * 0.385, sz: w * 0.39, ry: rnd() * 3, color: 0xffffff, ao: false });
        }
        for (let i = 0; i < 3; i++) add(G.sphere(8, 4), { x: s * (10 + rnd() * 30), y: -0.2, z: rnd() * LEN, sx: 4 + rnd() * 6, sy: 1, sz: 3 + rnd() * 4, color: 0xffffff, ao: false });
      }
      break;
    }
    case 'neon': {
      for (const s of sides) {
        add(G.box(), { x: s * 10, y: 0.0, z: LEN / 2, sx: 6, sy: 0.3, sz: LEN, color: 0x1a1430, ao: false });
        add(G.box(), { x: s * 7.3, y: 0.16, z: LEN / 2, sx: 0.08, sy: 0.04, sz: LEN, color: NEON[s > 0 ? 0 : 1], emit: 1, ao: false });
        let z = 0;
        while (z < LEN) {
          const w = 8 + rnd() * 8, h = 18 + rnd() * 50, d = 10 + rnd() * 8;
          const x = s * (15 + d / 2 + rnd() * 4);
          const c = NEON[Math.floor(rnd() * 5)];
          add(G.boxBase(), { x, z: z + w / 2, sx: d, sy: h, sz: w, color: 0x1b1530, aoH: 30 });
          for (const dz of [-1, 1]) add(G.box(), { x: x - s * (d / 2 + 0.05), y: h / 2, z: z + w / 2 + dz * (w / 2 - 0.2), sx: 0.12, sy: h, sz: 0.18, color: c, emit: 1, ao: false });
          for (let k = 4; k < h; k += 5) add(G.box(), { x: x - s * (d / 2 + 0.04), y: k, z: z + w / 2, sx: 0.08, sy: 0.25, sz: w * 0.8, color: rnd() < 0.5 ? c : 0x3a2f6a, emit: 0.7, ao: false });
          if (rnd() < 0.4) add(G.box(), { x: x - s * (d / 2 + 0.6), y: h * 0.5, z: z + w / 2, sx: 0.3, sy: 4, sz: w * 0.6, color: NEON[Math.floor(rnd() * 5)], emit: 1 });
          z += w + 2 + rnd() * 3;
        }
      }
      // neon ring arch over the track
      if (rnd() < 0.6) add(G.torus(8.2, 0.18, 4, 32), { y: 0, z: LEN / 2, sy: 1, color: NEON[Math.floor(rnd() * 5)], emit: 1, ao: false });
      break;
    }
    case 'sky': {
      for (const s of sides) {
        for (let i = 0; i < 4; i++) cloud(add, s * (10 + rnd() * 50), -6 - rnd() * 14, rnd() * LEN, rnd, 2 + rnd() * 3);
        if (rnd() < 0.6) island(add, s * (25 + rnd() * 40), 2 + rnd() * 15, rnd() * LEN, rnd);
      }
      for (let i = 0; i < 2; i++) cloud(add, (rnd() - 0.5) * 20, -14 - rnd() * 8, rnd() * LEN, rnd, 3);
      if (rnd() < 0.35) {
        const cols = [0xff5a5a, 0xffa63d, 0xffe14d, 0x5fe36b, 0x3fa9ff, 0xb45cff];
        cols.forEach((c, i) => add(G.torus(22 - i * 0.8, 0.4, 3, 30), { x: 0, y: -6, z: LEN / 2, color: c, emit: 0.35, ao: false }));
      }
      break;
    }
    case 'space': default: {
      for (const s of sides) {
        for (let i = 0; i < 4; i++) add(G.rock(Math.floor(rnd() * 4)), { x: s * (12 + rnd() * 60), y: -10 + rnd() * 25, z: rnd() * LEN, s: 1.5 + rnd() * 5, rx: rnd() * 6, ry: rnd() * 6, color: 0x5a5470 });
        for (let i = 0; i < 2; i++) add(G.oct(), { x: s * (9 + rnd() * 6), y: -1 + rnd() * 4, z: rnd() * LEN, sx: 0.8, sy: 2.5 + rnd() * 3, sz: 0.8, color: NEON[Math.floor(rnd() * 5)], emit: 1 });
        if (rnd() < 0.3) {
          const x = s * (120 + rnd() * 80), y = 30 + rnd() * 60, z = rnd() * LEN, r = 20 + rnd() * 30;
          const c = [0xff7a3d, 0x3fa9ff, 0xb45cff, 0x39ff88][Math.floor(rnd() * 4)];
          add(G.sphere(16, 10), { x, y, z, s: r, color: c, emit: 0.35 });
          add(G.torus(r * 0.85, r * 0.06, 3, 30), { x, y, z, rx: 1.2, ry: 0.4, color: 0xffe9b0, emit: 0.4, ao: false });
        }
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- props ---
function streetLight(add, x, z, s) {
  add(G.cyl(6), { x, y: 3, z, sx: 0.16, sz: 0.16, sy: 6, color: 0x2b2f3a });
  add(G.box(), { x: x - s * 0.9, y: 6, z, sx: 1.9, sy: 0.12, sz: 0.12, color: 0x2b2f3a });
  add(G.cbox(0.2), { x: x - s * 1.7, y: 5.9, z, sx: 0.6, sy: 0.18, sz: 0.4, color: 0xfff6d8, emit: 1 });
}
function tree(add, x, z, rnd, col) {
  add(G.cyl(6), { x, y: 1.2, z, sx: 0.35, sz: 0.35, sy: 2.4, color: 0x6b4a2b });
  add(G.ico(1), { x, y: 3.6, z, s: 2.6 + rnd(), color: col });
  add(G.ico(0), { x: x + 0.6, y: 4.4, z: z + 0.3, s: 1.6, color: col });
}
function bush(add, x, z, rnd) {
  add(G.ico(0), { x, y: 0.5, z, sx: 1.6 + rnd(), sy: 1.1, sz: 1.4, color: 0x4fae46 });
}
function cactus(add, x, z, rnd) {
  const h = 2 + rnd() * 2.5;
  add(G.cylBase(7), { x, z, sx: 0.55, sz: 0.55, sy: h, color: 0x4f9a3a });
  add(G.sphere(7, 4), { x, y: h, z, s: 0.55, color: 0x4f9a3a });
  for (const s of [-1, 1]) {
    if (rnd() < 0.7) {
      const y = h * (0.4 + rnd() * 0.3);
      add(G.cyl(6), { x: x + s * 0.5, y, z, rz: Math.PI / 2, sx: 0.35, sz: 0.35, sy: 0.6, color: 0x4f9a3a });
      add(G.cylBase(6), { x: x + s * 0.8, y, z, sx: 0.35, sz: 0.35, sy: 1, color: 0x4f9a3a });
    }
  }
}
function pine(add, x, z, rnd, col, s = 1, snow = false) {
  add(G.cylBase(6), { x, z, sx: 0.4 * s, sz: 0.4 * s, sy: 1.4 * s, color: 0x5a3a22 });
  for (let i = 0; i < 3; i++) {
    add(G.cone(7), { x, y: (1 + i * 1.3) * s, z, sx: (3.4 - i * 0.9) * s, sz: (3.4 - i * 0.9) * s, sy: 2.4 * s, color: col });
    if (snow) add(G.cone(7), { x, y: (2.2 + i * 1.3) * s, z, sx: (1.6 - i * 0.4) * s, sz: (1.6 - i * 0.4) * s, sy: 1.2 * s, color: 0xffffff, ao: false });
  }
}
function mushroom(add, x, z, rnd) {
  const h = 0.5 + rnd() * 0.6;
  add(G.cylBase(6), { x, z, sx: 0.25, sz: 0.25, sy: h, color: 0xf5ecd8 });
  add(G.hemi(8, 3), { x, y: h, z, sx: 0.9, sy: 0.6, sz: 0.9, color: 0xe03a3a });
  add(G.sphere(5, 3), { x: x + 0.15, y: h + 0.22, z, s: 0.12, color: 0xffffff });
}
function cloud(add, x, y, z, rnd, s) {
  for (let i = 0; i < 5; i++) add(G.ico(1), { x: x + (rnd() - 0.5) * 4 * s, y: y + rnd() * s, z: z + (rnd() - 0.5) * 3 * s, s: s * (1.2 + rnd()), color: 0xffffff, emit: 0.15, ao: false });
}
function island(add, x, y, z, rnd) {
  const r = 5 + rnd() * 6;
  add(G.cone(7), { x, y, z, sx: r * 2, sy: r * 1.4, sz: r * 2, rx: Math.PI, color: 0xb08a6b });
  add(G.cyl(7), { x, y, z, sx: r * 2, sz: r * 2, sy: 0.8, color: 0x7ad85a });
  tree(add, x, z, rnd, 0xff9ad8);
}

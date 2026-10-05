// Builds ONE track chunk variant (road + terrain + scenery) for a biome into a StaticBatch.
// Chunk local frame: z from 0 to chunkLength (TRACK_FORWARD), x = 0 is the track centre, y = 0 the
// running surface. Variants are cached by RunTrack, so this code only runs a few times per biome.
//
//  • road:     asphalt sections, patches, cracks, lane/edge lines, painted arrows, kerbs, shoulders
//  • terrain:  a per-biome cross profile (ditches, embankments, cliffs) shared by every variant of the
//              biome, so chunks always join; hills / plateaus are separate meshes on top of it
//  • kinds:    'normal' plus road events built as special chunks (tunnel, bridge, forest arch,
//              construction zone, checkpoint gate, canyon). They are purely visual — the running
//              surface, lanes and collisions are identical on every kind.
// Collision never looks at this geometry (items live in RunTrack), so terrain can be as bumpy as we like.
import * as THREE from 'three';
import { G } from '../utils/Geo.js';
import { RUN } from '../config/balance.js';
import { TRACK_FORWARD, yawToward, chevronGeometry } from './TrackFrame.js';

const LEN = RUN.chunkLength;
const HW = RUN.trackHalfWidth;
const KERB = 0.45;              // kerb stones right outside the running surface
const SHOULDER = HW + 2.0;      // outer edge of the gravel shoulder / sidewalk gutter
const NEON = [0xff2bd6, 0x5ff3ff, 0x39ff88, 0xffe14d, 0xb45cff];
const FWD_YAW = yawToward(TRACK_FORWARD);  // painted arrows point down the track
const SKIRT = -34;              // terrain skirts drop to here so seams never show the sky

/** Road events per biome (built as special chunk variants). */
export const CHUNK_KINDS = {
  city: ['underpass', 'construction', 'checkpoint'],
  suburbs: ['bridge', 'construction', 'checkpoint'],
  desert: ['canyon', 'bridge', 'checkpoint'],
  forest: ['tunnel', 'bridge', 'forestArch', 'construction'],
  mountains: ['tunnel', 'bridge', 'checkpoint'],
  neon: ['tunnel', 'checkpoint'],
  sky: ['checkpoint'],
  space: ['tunnel', 'checkpoint'],
};
/** Biomes whose terrain is asymmetric (cliff road) must not be mirrored. */
export const CAN_MIRROR = (biome) => biome.id !== 'mountains';

// ------------------------------------------------------------- terrain ---
// Cross profiles: [distance from the track centre, height]. Left = −x, right = +x.
const P = {
  flat: [[SHOULDER, -0.02], [200, -0.02]],
  suburbs: [[SHOULDER, -0.03], [9.3, -0.38], [10.4, -0.32], [12.5, 0.1], [30, 0.3], [55, 1.4], [95, 3.2], [140, 1.5], [200, 2.5]],
  desert: [[SHOULDER, -0.03], [9.5, -0.32], [12, 0.15], [30, 0.9], [60, 2.6], [100, 1.2], [150, 4], [200, 2]],
  forest: [[SHOULDER, -0.04], [9.4, -0.6], [10.6, -0.55], [13.5, 0.7], [18, 1.6], [26, 1.4], [40, 2.5], [60, 1.7], [90, 3.4], [140, 1.2], [200, 2.5]],
  cliff: [[SHOULDER, -0.03], [9.2, -0.3], [10.4, -0.2], [11.6, 2.4], [14.5, 7], [19, 11.5], [28, 15], [55, 22], [110, 30], [200, 34]],
  drop: [[SHOULDER, -0.03], [9.3, -0.45], [12, -1.4], [16, -4.5], [30, -10], [60, -16], [120, -20], [200, -21]],
};
function profiles(biome) {
  switch (biome.id) {
    case 'suburbs': return { L: P.suburbs, R: P.suburbs };
    case 'desert': return { L: P.desert, R: P.desert };
    case 'forest': return { L: P.forest, R: P.forest };
    case 'mountains': return { L: P.cliff, R: P.drop };
    default: return { L: P.flat, R: P.flat };
  }
}
function profileY(prof, d) {
  if (d <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) {
    const [x1, y1] = prof[i];
    if (d <= x1) {
      const [x0, y0] = prof[i - 1];
      const t = (d - x0) / (x1 - x0);
      return y0 + (y1 - y0) * (t * t * (3 - 2 * t)) * 0.35 + (y1 - y0) * t * 0.65;
    }
  }
  return prof[prof.length - 1][1];
}
/** Sample x positions for one side: profile points plus in-between samples (smoother slopes). */
function sideXs(prof) {
  const xs = [];
  for (let i = 0; i < prof.length; i++) {
    xs.push(prof[i][0]);
    if (i < prof.length - 1) {
      const a = prof[i][0], b = prof[i + 1][0], n = Math.min(4, Math.floor((b - a) / 7));
      for (let k = 1; k <= n; k++) xs.push(a + ((b - a) * k) / (n + 1));
    }
  }
  return xs;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
/** Non-indexed triangle soup with flat normals; every triangle is wound so its normal faces `want`. */
class Soup {
  constructor() { this.pos = []; }
  tri(p0, p1, p2, want) {
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    _n.crossVectors(_a, _b);
    if (_n.dot(want) < 0) this.pos.push(...p0, ...p2, ...p1);
    else this.pos.push(...p0, ...p1, ...p2);
  }
  quad(a, b, c, d, want) { this.tri(a, b, c, want); this.tri(a, c, d, want); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals();
    return g;
  }
}
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1), BACK = new THREE.Vector3(0, 0, -1);

/**
 * Terrain strip for one side, with skirts under both chunk ends and the far edge.
 * `dip(x, z)` lowers the surface (bridge ravines). Returns one geometry per colour band.
 */
function terrainSide(prof, sign, zs, dip, steepColor) {
  const xs = sideXs(prof);
  const flat = new Soup(), steep = new Soup();
  const y = (d, z) => profileY(prof, d) - (dip ? dip(d, z) : 0);
  for (let j = 0; j < zs.length - 1; j++) {
    const z0 = zs[j], z1 = zs[j + 1];
    for (let i = 0; i < xs.length - 1; i++) {
      const d0 = xs[i], d1 = xs[i + 1];
      const a = [sign * d0, y(d0, z0), z0], b = [sign * d1, y(d1, z0), z0], c = [sign * d1, y(d1, z1), z1], d = [sign * d0, y(d0, z1), z1];
      const slope = Math.abs(b[1] - a[1]) / (d1 - d0);
      (steepColor && slope > 0.7 ? steep : flat).quad(a, b, c, d, UP);
    }
  }
  // skirts: chunk ends (hidden between equal neighbours, they close the gap at biome changes) + far edge
  const skirt = flat;
  for (const [z, want] of [[zs[0], BACK], [zs[zs.length - 1], FWD]]) {
    for (let i = 0; i < xs.length - 1; i++) {
      const d0 = xs[i], d1 = xs[i + 1];
      skirt.quad([sign * d0, y(d0, z), z], [sign * d1, y(d1, z), z], [sign * d1, SKIRT, z], [sign * d0, SKIRT, z], want);
    }
  }
  const far = xs[xs.length - 1];
  const out = new THREE.Vector3(sign, 0, 0);
  for (let j = 0; j < zs.length - 1; j++) skirt.quad([sign * far, y(far, zs[j]), zs[j]], [sign * far, y(far, zs[j + 1]), zs[j + 1]], [sign * far, SKIRT, zs[j + 1]], [sign * far, SKIRT, zs[j]], out);
  return { flat: flat.geometry(), steep: steep.pos.length ? steep.geometry() : null };
}

// Smooth mound geometries (unit size: radius 0.5, height 1), cached.
const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) {
    let g = make();
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.index) g = g.toNonIndexed();
    g.computeVertexNormals();
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}
function jitter(g, seed, amt) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = g.attributes.position, seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, [(rnd() - 0.5) * amt, (rnd() - 0.5) * amt * 0.6, (rnd() - 0.5) * amt]);
    const [dx, dy, dz] = seen.get(k);
    if (pos.getY(i) > 0.01 && Math.hypot(pos.getX(i), pos.getZ(i)) > 0.01) pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + dy, pos.getZ(i) + dz);
  }
  return g;
}
const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);
const HILL = (v) => cachedGeo('hill' + v, () => jitter(lathe([[0.5, -0.05], [0.47, 0.06], [0.4, 0.22], [0.31, 0.5], [0.2, 0.78], [0.09, 0.95], [0, 1]], 10), 11 + v * 7, 0.06));
const PLATEAU = (v) => cachedGeo('plat' + v, () => jitter(lathe([[0.5, -0.05], [0.46, 0.35], [0.41, 0.8], [0.37, 1], [0.15, 1.03], [0, 1.02]], 9), 51 + v * 5, 0.05));
const hillProfile = (t) => (t >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * t)); // ≈ the HILL lathe

const _c = new THREE.Color();
function shade(hex, rnd, amt = 0.08) {
  _c.set(hex);
  _c.offsetHSL((rnd() - 0.5) * amt * 0.25, (rnd() - 0.5) * amt * 0.5, (rnd() - 0.5) * amt);
  return _c.getHex();
}
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3();
function frame(x, y, z, ry = 0, s = 1, tx = 0, tz = 0) {
  _E.set(tx, ry, tz, 'YXZ');
  return new THREE.Matrix4().compose(_P.set(x, y, z), _Q.setFromEuler(_E), _S.set(s, s, s));
}

// ================================================================ build ===
export function buildChunk(b, biome, rnd, kind = 'normal') {
  const add = (geo, o) => b.add(geo, { vary: 0.04, ...o });
  const floating = !biome.ground;
  const prof = profiles(biome);
  const hills = [];
  const dip = kind === 'bridge' && !floating ? ravine(biome) : null;
  // ground height at (x, z): cross profile (minus a bridge ravine) + hills/plateaus placed in this chunk
  const H = (x, z) => {
    let y = profileY(x < 0 ? prof.L : prof.R, Math.abs(x)) - (dip ? dip(Math.abs(x), z) : 0);
    for (const h of hills) {
      const t = Math.hypot(x - h.x, z - h.z) / h.r;
      if (t < 1) y = Math.max(y, h.base + h.h * (h.plateau ? (t < 0.68 ? 1 : hillProfile((t - 0.68) / 0.32)) : hillProfile(t)));
    }
    return y;
  };
  // lowest ground under a footprint of radius r — props on slopes sit in the hill, never float
  const Hmin = (x, z, r) => Math.min(H(x, z), H(x - r, z), H(x + r, z), H(x, z - r), H(x, z + r));
  const ctx = { add, rnd, biome, H, Hmin, hills, kind, b };

  road(ctx);
  if (!floating) terrain(ctx);
  else floatingDeck(ctx);

  // ------------------------------------------------------------ events --
  switch (kind) {
    case 'tunnel': tunnel(ctx); break;
    case 'underpass': underpass(ctx); break;
    case 'bridge': bridge(ctx); break;
    case 'forestArch': forestArch(ctx); break;
    case 'construction': construction(ctx); break;
    case 'checkpoint': checkpoint(ctx); break;
    case 'canyon': canyon(ctx); break;
  }

  // ------------------------------------------------------------ biome --
  const sides = [-1, 1];
  const busy = (z) => kind !== 'normal' && z > 6 && z < LEN - 6; // events own the roadside here
  switch (biome.id) {
    case 'city': {
      for (const s of sides) {
        sidewalk(ctx, s, 0xb8bec8);
        for (let z = 6; z < LEN; z += 20) streetLight(add, s * (SHOULDER + 0.6), z, s);
        let z = 0;
        while (z < LEN) {
          const w = 8 + rnd() * 10, h = 10 + rnd() * 34, d = 10 + rnd() * 8;
          if (ctx.gap && z + w > ctx.gap[0] && z < ctx.gap[1]) { z = ctx.gap[1] + 0.5; continue; }
          const x = s * (15 + d / 2 + rnd() * 3);
          building(add, rnd, x, z + w / 2, w, h, d, s);
          z += w + 1 + rnd() * 3;
        }
        for (let i = 0; i < 2; i++) roundTree(add, frame(s * (12.5 + rnd()), 0.15, 8 + rnd() * 44, rnd() * 6, 0.8 + rnd() * 0.3), rnd, 0x5fbf4a);
      }
      break;
    }
    case 'suburbs': {
      for (const s of sides) {
        if (kind !== 'bridge') {
          for (let z = 0; z < LEN; z += 2) add(G.box(), { x: s * 13.5, y: H(s * 13.5, z) + 0.5, z: z + 1, sx: 0.12, sy: 1, sz: 0.25, color: 0xffffff });
          add(G.box(), { x: s * 13.5, y: H(s * 13.5, 0) + 0.8, z: LEN / 2, sx: 0.1, sy: 0.12, sz: LEN, color: 0xffffff });
          for (let z = 4; z < LEN; z += 20) {
            const x = s * (22 + rnd() * 6);
            house(add, rnd, x, H(x, z + 6) - 0.1, z + 6, s);
            add(G.cylBase(6), { x: s * 14.5, y: H(s * 14.5, z + 6), z: z + 6, sx: 0.12, sz: 0.12, sy: 1.1, color: 0x6b4a2b });
            add(G.cbox(0.2), { x: s * 14.5, y: H(s * 14.5, z + 6) + 1.2, z: z + 6, sx: 0.35, sy: 0.3, sz: 0.5, color: 0x3d6fd9 });
            const tx = s * (17 + rnd() * 2), tz = z + 14 + rnd() * 4;
            (rnd() < 0.5 ? roundTree : birch)(add, frame(tx, H(tx, tz), tz, rnd() * 6, 0.9 + rnd() * 0.3), rnd, 0x4fae46);
          }
        }
        for (let i = 0; i < 3; i++) { const x = s * (11.5 + rnd() * 1.5), z = rnd() * LEN; bush(add, x, H(x, z), z, rnd, 0x4fae46); }
        backdropTrees(ctx, s, 40, 95, 10, [0x4fae46, 0x3f9a3f, 0x5fb84a]);
      }
      break;
    }
    case 'desert': {
      for (const s of sides) {
        if (kind !== 'canyon') {
          for (let i = 0; i < 3; i++) { const x = s * (11 + rnd() * 16), z = rnd() * LEN; if (!busy(z)) cactus(add, x, H(x, z), z, rnd); }
          for (let i = 0; i < 4; i++) { const x = s * (10.5 + rnd() * 24), z = rnd() * LEN; add(G.rock(Math.floor(rnd() * 4)), { x, y: ctx.Hmin(x, z, 0.8) + 0.1, z, s: 0.5 + rnd() * 1.6, ry: rnd() * 6, color: shade(0xc0784a, rnd) }); }
          if (rnd() < 0.55) hoodoo(add, rnd, s * (26 + rnd() * 20), rnd() * LEN, H);
          if (rnd() < 0.5) tumbleweed(add, s * (11 + rnd() * 6), rnd() * LEN, rnd, H);
          for (let i = 0; i < 2; i++) { const x = s * (14 + rnd() * 18), z = rnd() * LEN; add(G.box(), { x, y: H(x, z) + 0.02, z, sx: 1.5 + rnd() * 3, sy: 0.05, sz: 1 + rnd() * 2, ry: rnd() * 3, color: 0x8a7a4a, ao: false }); }
        }
        if (rnd() < 0.7) {
          const x = s * (75 + rnd() * 60), z = rnd() * LEN, h = 18 + rnd() * 25;
          mesa(add, rnd, x, H(x, z), z, 30 + rnd() * 20, h);
        }
      }
      break;
    }
    case 'forest': forest(ctx); break;
    case 'mountains': mountains(ctx); break;
    case 'neon': {
      for (const s of sides) {
        sidewalk(ctx, s, 0x1a1430);
        add(G.box(), { x: s * (SHOULDER - 0.2), y: 0.17, z: LEN / 2, sx: 0.08, sy: 0.04, sz: LEN, color: NEON[s > 0 ? 0 : 1], emit: 1, ao: false });
        if (kind === 'tunnel') continue;
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
      if (kind === 'normal' && rnd() < 0.6) add(G.torus(8.2, 0.18, 4, 32), { y: 0, z: LEN / 2, sy: 1, color: NEON[Math.floor(rnd() * 5)], emit: 1, ao: false });
      break;
    }
    case 'sky': {
      for (const s of sides) {
        for (let i = 0; i < 4; i++) cloud(add, s * (10 + rnd() * 50), -6 - rnd() * 14, rnd() * LEN, rnd, 2 + rnd() * 3);
        if (rnd() < 0.6) island(add, s * (25 + rnd() * 40), 2 + rnd() * 15, rnd() * LEN, rnd);
      }
      for (let i = 0; i < 2; i++) cloud(add, (rnd() - 0.5) * 20, -14 - rnd() * 8, rnd() * LEN, rnd, 3);
      if (kind === 'normal' && rnd() < 0.35) {
        const cols = [0xff5a5a, 0xffa63d, 0xffe14d, 0x5fe36b, 0x3fa9ff, 0xb45cff];
        cols.forEach((c, i) => add(G.torus(22 - i * 0.8, 0.4, 3, 30), { x: 0, y: -6, z: LEN / 2, color: c, emit: 0.35, ao: false }));
      }
      break;
    }
    case 'space': default: {
      for (const s of sides) {
        for (let i = 0; i < 4; i++) add(G.rock(Math.floor(rnd() * 4)), { x: s * (12 + rnd() * 60), y: -10 + rnd() * 25, z: rnd() * LEN, s: 1.5 + rnd() * 5, rx: rnd() * 6, ry: rnd() * 6, color: 0x5a5470 });
        for (let i = 0; i < 2; i++) add(G.oct(), { x: s * (9 + rnd() * 6), y: -1 + rnd() * 4, z: rnd() * LEN, sx: 0.8, sy: 2.5 + rnd() * 3, sz: 0.8, color: NEON[Math.floor(rnd() * 5)], emit: 1 });
      }
      break;
    }
  }
}

// ================================================================= road ===
function road(ctx) {
  const { add, rnd, biome, kind } = ctx;
  const glowLines = !biome.ground || biome.id === 'neon';
  const lineEmit = glowLines ? 1 : 0;
  // asphalt laid in sections of different age → subtle tone steps along the road
  let z = 0;
  while (z < LEN - 0.01) {
    const l = Math.min(LEN - z, [12, 18, 24, 30][Math.floor(rnd() * 4)]);
    add(G.box(), { y: -0.2, z: z + l / 2, sx: HW * 2, sy: 0.4, sz: l, color: shade(biome.asphalt, rnd, 0.06), ao: false, vary: 0.012 });
    z += l;
  }
  // repair patches and cracks (not on glowing sci-fi tracks)
  if (!glowLines) {
    const patches = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < patches; i++) {
      const sx = 1.2 + rnd() * 2.6, sz = 1.5 + rnd() * 5;
      add(G.box(), { x: (rnd() - 0.5) * (HW * 2 - sx - 0.6), y: 0.003, z: 2 + rnd() * (LEN - 4), sx, sy: 0.006, sz, color: shade(biome.patch, rnd, 0.05), ao: false, vary: 0.02 });
    }
    const cracks = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < cracks; i++) {
      let x = (rnd() - 0.5) * HW * 1.8, cz = 2 + rnd() * (LEN - 6), a = (rnd() - 0.5) * 1.2;
      const n = 3 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const l = 0.4 + rnd() * 0.9;
        a += (rnd() - 0.5) * 1.1;
        const nx = x + Math.sin(a) * l, nz = cz + Math.cos(a) * l;
        if (Math.abs(nx) > HW - 0.4) break;
        add(G.box(), { x: (x + nx) / 2, y: 0.004, z: (cz + nz) / 2, ry: a, sx: 0.05 + rnd() * 0.03, sy: 0.008, sz: l + 0.05, color: 0x1e1f24, ao: false, vary: 0 });
        x = nx; cz = nz;
      }
    }
  }
  // lane dividers (dashed) and solid edge lines
  for (const x of [-HW / 3, HW / 3]) {
    for (let dz = 1.5; dz < LEN; dz += 6) add(G.box(), { x, y: 0.005, z: dz, sx: 0.14, sy: 0.02, sz: 3, color: biome.trackLine, ao: false, emit: lineEmit, vary: 0.02 });
  }
  for (const s of [-1, 1]) {
    add(G.box(), { x: s * (HW - 0.3), y: 0.005, z: LEN / 2, sx: 0.16, sy: 0.02, sz: LEN, color: biome.trackLine, ao: false, emit: lineEmit });
    // racing kerb: alternating accent / white blocks
    for (let k = 0; k < LEN / 1.5; k++) {
      add(G.box(), { x: s * (HW + KERB / 2), y: 0.0, z: k * 1.5 + 0.75, sx: KERB, sy: 0.24, sz: 1.5, color: k % 2 ? biome.curb : biome.track, ao: false, emit: glowLines ? 0.6 : 0, vary: 0.02 });
    }
    // gravel shoulder
    add(G.box(), { x: s * (HW + KERB + (SHOULDER - HW - KERB) / 2), y: -0.07, z: LEN / 2, sx: SHOULDER - HW - KERB, sy: 0.1, sz: LEN, color: biome.shoulder, ao: false, vary: 0.05 });
  }
  // painted markings: forward arrows in one lane, sometimes diamonds or a zebra crossing
  const m = rnd();
  if (kind === 'normal' && m < 0.45) {
    const lane = RUN.laneX[Math.floor(rnd() * 3)], z0 = 10 + rnd() * 30;
    for (let k = 0; k < 2; k++) add(chevronGeometry(), { x: lane, y: 0.004, z: z0 + k * 2.2, ry: FWD_YAW, sx: 1.6, sy: 0.012, sz: 1.5, color: biome.track === biome.asphalt ? biome.trackLine : biome.track, ao: false, emit: lineEmit * 0.8, vary: 0 });
  } else if (kind === 'normal' && m < 0.6 && !glowLines) {
    const z0 = 10 + rnd() * 30;
    for (const lane of RUN.laneX) add(G.box(), { x: lane, y: 0.004, z: z0, ry: Math.PI / 4, sx: 1.1, sy: 0.012, sz: 1.1, color: biome.trackLine, ao: false, vary: 0 });
  } else if (kind === 'normal' && m < 0.72 && biome.id === 'city') {
    const z0 = 12 + rnd() * 30;
    for (let x = -HW + 0.6; x < HW - 0.4; x += 1.1) add(G.box(), { x, y: 0.005, z: z0, sx: 0.6, sy: 0.012, sz: 3.2, color: 0xf4f4f4, ao: false, vary: 0.02 });
  }
}

function terrain(ctx) {
  const { add, rnd, biome, kind } = ctx;
  const prof = profiles(biome);
  const zs = [0, 15, 30, 45, LEN];
  const dip = kind === 'bridge' ? ravine(biome) : null;
  const zz = kind === 'bridge' ? [0, 6, 9, 12, 15, 18, 22, 30, 38, 42, 45, 48, 51, 54, LEN] : zs;
  for (const [p, s] of [[prof.L, -1], [prof.R, 1]]) {
    const { flat, steep } = terrainSide(p, s, zz, dip, biome.id === 'mountains' || biome.id === 'desert');
    add(flat, { color: biome.ground, ao: false, vary: 0.05 });
    if (steep) add(steep, { color: biome.id === 'mountains' ? 0x8a90a0 : 0xc98a52, ao: false, vary: 0.06 });
  }
  // hills in the middle distance (not over a bridge ravine)
  if (kind !== 'bridge' && (biome.id === 'forest' || biome.id === 'suburbs' || biome.id === 'desert')) {
    const n = biome.id === 'forest' ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const s = rnd() < 0.5 ? -1 : 1, r = 16 + rnd() * 26, x = s * (r + 30 + rnd() * 70), z = 10 + rnd() * (LEN - 20);
      const h = (biome.id === 'desert' ? 4 : 7) + rnd() * (biome.id === 'desert' ? 8 : 16);
      addHill(ctx, x, z, r, h, false, biome.id === 'desert' ? shade(biome.ground, rnd, 0.06) : shade(biome.groundAlt, rnd, 0.1));
    }
  }
}

function addHill(ctx, x, z, r, h, plateau, color) {
  const base = ctx.H(x, z) - 0.25;
  ctx.hills.push({ x, z, r, h, base, plateau });
  ctx.add(plateau ? PLATEAU(Math.floor(ctx.rnd() * 3)) : HILL(Math.floor(ctx.rnd() * 3)), { x, y: base, z, sx: r * 2, sz: r * 2, sy: h, ry: ctx.rnd() * 6, color, ao: false, vary: 0.05 });
}

function floatingDeck(ctx) {
  const { add, biome } = ctx;
  add(G.box(), { y: -0.9, z: LEN / 2, sx: HW * 1.6, sy: 1, sz: LEN, color: biome.id === 'space' ? 0x2a1f5a : 0xffffff, ao: false });
  for (const s of [-1, 1]) {
    add(G.box(), { x: s * (SHOULDER + 0.05), y: -0.12, z: LEN / 2, sx: 0.12, sy: 0.12, sz: LEN, color: biome.curb, emit: 1, ao: false });
    add(G.box(), { x: s * (SHOULDER - 0.6), y: -0.5, z: LEN / 2, sx: 1.8, sy: 0.7, sz: LEN, color: biome.id === 'space' ? 0x2a1f5a : 0xf2eef8, ao: false });
  }
}

function sidewalk(ctx, s, color) {
  const { add } = ctx;
  add(G.box(), { x: s * (SHOULDER + 2.8), y: 0.0, z: LEN / 2, sx: 5.6, sy: 0.3, sz: LEN, color, ao: false });
  add(G.box(), { x: s * (SHOULDER + 0.08), y: 0.02, z: LEN / 2, sx: 0.16, sy: 0.3, sz: LEN, color: 0x8f949c, ao: false });
}

// ============================================================== forest ===
const LEAF = [0x2f7a3a, 0x3a8a3f, 0x2a6b3a, 0x4d9a40, 0x5fa84a, 0x356f34];
function forest(ctx) {
  const { add, rnd, kind, H } = ctx;
  for (const s of [-1, 1]) {
    // raised forest section (plateau) on one side sometimes
    if (rnd() < 0.45 && kind !== 'bridge') {
      const r = 7 + rnd() * 5, x = s * (16 + r * 0.7 + rnd() * 6), z = 12 + rnd() * (LEN - 24);
      addHill(ctx, x, z, r, 1.6 + rnd() * 2.2, true, shade(ctx.biome.groundAlt, rnd, 0.08));
      for (let i = 0; i < 5; i++) {
        const a = rnd() * 6.28, d = rnd() * r * 0.55, tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d;
        anyTree(add, rnd, tx, H(tx, tz) - 0.05, tz, 0.9 + rnd() * 0.5);
      }
    }
    // split the side into dense groves, open glades and the odd landmark
    let z = -2, landmark = false;
    while (z < LEN) {
      const segLen = 14 + rnd() * 16;
      const r = rnd();
      const type = kind === 'bridge' && z > 6 && z < LEN - 10 ? 'none' : (!landmark && r < 0.14 ? 'landmark' : r < 0.68 ? 'dense' : 'open');
      if (type === 'dense') {
        const centres = 1 + Math.floor(rnd() * 3);
        for (let c = 0; c < centres; c++) {
          const cx = s * (13 + rnd() * 14), cz = z + rnd() * segLen;
          const n = 4 + Math.floor(rnd() * 5);
          for (let i = 0; i < n; i++) {
            const tx = cx + s * Math.abs(gauss(rnd)) * 4 - s * 1.5, tz = cz + gauss(rnd) * 4.5;
            if (Math.abs(tx) < 11.6) continue;
            anyTree(add, rnd, tx, H(tx, tz) - 0.05, tz, 0.75 + rnd() * 0.65);
          }
          for (let i = 0; i < 3; i++) { const bx = cx + (rnd() - 0.5) * 6, bz = cz + (rnd() - 0.5) * 7; if (Math.abs(bx) > 11) bush(add, bx, H(bx, bz), bz, rnd, LEAF[Math.floor(rnd() * LEAF.length)]); }
          for (let i = 0; i < 2; i++) { const fx = cx + (rnd() - 0.5) * 5, fz = cz + (rnd() - 0.5) * 6; if (Math.abs(fx) > 11) fern(add, fx, H(fx, fz), fz, rnd); }
        }
      } else if (type === 'open') {
        for (let i = 0; i < 6; i++) { const gx = s * (11 + rnd() * 16), gz = z + rnd() * segLen; grass(add, gx, H(gx, gz), gz, rnd); }
        for (let i = 0; i < 3; i++) { const fx = s * (11 + rnd() * 12), fz = z + rnd() * segLen; flowers(add, fx, H(fx, fz), fz, rnd); }
        if (rnd() < 0.6) { const lx = s * (12 + rnd() * 8), lz = z + rnd() * segLen; log(add, lx, ctx.Hmin(lx, lz, 1.6), lz, rnd); }
        if (rnd() < 0.6) { const sx = s * (12 + rnd() * 10), sz = z + rnd() * segLen; stump(add, sx, ctx.Hmin(sx, sz, 0.5), sz, rnd); }
        for (let i = 0; i < 2; i++) { const mx = s * (11.5 + rnd() * 6), mz = z + rnd() * segLen; mushrooms(add, mx, H(mx, mz), mz, rnd); }
        if (rnd() < 0.7) { const rx = s * (13 + rnd() * 12), rz = z + rnd() * segLen; boulder(add, rx, ctx.Hmin(rx, rz, 1.2), rz, rnd, 1 + rnd() * 1.8); }
        const lone = s * (20 + rnd() * 10), lz = z + rnd() * segLen;
        anyTree(add, rnd, lone, H(lone, lz) - 0.05, lz, 1 + rnd() * 0.4);
      } else if (type === 'landmark') {
        landmark = true;
        const lx = s * (17 + rnd() * 6), lz = z + segLen / 2, pick = rnd();
        if (pick < 0.45) giantTree(add, frame(lx, H(lx, lz) - 0.1, lz, rnd() * 6, 1), rnd);
        else if (pick < 0.75) lookout(add, frame(lx, H(lx, lz), lz, yawToward(TRACK_FORWARD) + (s > 0 ? -Math.PI / 2 : Math.PI / 2), 1), rnd);
        else tor(add, lx, ctx.Hmin(lx, lz, 3), lz, rnd);
      }
      z += segLen;
    }
    // small stuff right by the road
    for (let i = 0; i < 3; i++) { const x = s * (10.9 + rnd() * 1.4), z2 = rnd() * LEN; if (kind !== 'bridge' || z2 < 8 || z2 > 52) (rnd() < 0.5 ? grass : rock)(add, x, H(x, z2), z2, rnd); }
    for (let z2 = 7 + rnd() * 4; z2 < LEN; z2 += 15) reflectorPost(add, s * (SHOULDER - 0.25), z2, 0xffffff);
    backdropTrees(ctx, s, 34, 110, 26, LEAF);
  }
}
function gauss(rnd) { return (rnd() + rnd() + rnd() - 1.5) / 1.5; }

/** Rows of cheap trees on the embankment and hills — the "forest wall" behind the detailed props. */
function backdropTrees(ctx, s, x0, x1, n, cols) {
  const { add, rnd, H } = ctx;
  for (let i = 0; i < n; i++) {
    const x = s * (x0 + Math.pow(rnd(), 1.4) * (x1 - x0)), z = rnd() * LEN;
    const y = H(x, z), sc = 1.2 + rnd() * 1.4, col = shade(cols[Math.floor(rnd() * cols.length)], rnd, 0.1);
    if (rnd() < 0.7) {
      add(G.cylBase(4), { x, y, z, sx: 0.5 * sc, sz: 0.5 * sc, sy: 1.6 * sc, color: 0x4a3020, ao: false });
      add(G.cone(5), { x, y: y + 1.1 * sc, z, ry: rnd() * 3, sx: 3.2 * sc, sz: 3.2 * sc, sy: 4.6 * sc * (0.85 + rnd() * 0.4), color: col, ao: false });
    } else {
      add(G.cylBase(4), { x, y, z, sx: 0.5 * sc, sz: 0.5 * sc, sy: 2 * sc, color: 0x4a3020, ao: false });
      add(G.ico(0), { x, y: y + 3 * sc, z, ry: rnd() * 3, sx: 3.6 * sc, sy: 3 * sc, sz: 3.4 * sc, color: col, ao: false });
    }
  }
}

function anyTree(add, rnd, x, y, z, s) {
  const P = frame(x, y, z, rnd() * 6.28, s, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12);
  const r = rnd(), col = LEAF[Math.floor(rnd() * LEAF.length)];
  if (r < 0.34) pine(add, P, rnd, col);
  else if (r < 0.52) spruce(add, P, rnd, col);
  else if (r < 0.78) roundTree(add, P, rnd, col);
  else if (r < 0.93) birch(add, P, rnd);
  else snag(add, P, rnd);
}
function pine(add, P, rnd, col, snow = false) {
  const trunk = 1 + rnd() * 0.6, layers = 3 + (rnd() < 0.4 ? 1 : 0);
  add(G.cylBase(5), { parent: P, sx: 0.36, sz: 0.36, sy: trunk + 1.2, color: 0x5a3a22 });
  for (let i = 0; i < layers; i++) {
    const w = (3.3 - (i / layers) * 2.3) * (0.9 + rnd() * 0.2);
    add(G.cone(6), { parent: P, y: trunk + i * 1.15, ry: rnd() * 3, sx: w, sz: w, sy: 2.3, color: shade(col, rnd, 0.08) });
    if (snow) add(G.cone(6), { parent: P, y: trunk + i * 1.15 + 1.25, sx: w * 0.42, sz: w * 0.42, sy: 1.1, color: 0xffffff, ao: false });
  }
}
function spruce(add, P, rnd, col) {
  add(G.cylBase(5), { parent: P, sx: 0.3, sz: 0.3, sy: 2, color: 0x4f3320 });
  for (let i = 0; i < 5; i++) {
    const w = (2.3 - i * 0.42) * (0.9 + rnd() * 0.2);
    add(G.cone(5), { parent: P, y: 0.8 + i * 1.05, ry: rnd() * 3, sx: w, sz: w, sy: 1.9, color: shade(col, rnd, 0.1) });
  }
}
function roundTree(add, P, rnd, col) {
  const h = 1.8 + rnd() * 0.8;
  add(G.taper(0.6, 6), { parent: P, sx: 0.5, sz: 0.5, sy: h + 0.8, color: 0x6b4a2b });
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rnd(), d = i === 0 ? 0 : 0.9 + rnd() * 0.4;
    add(G.ico(0), { parent: P, x: Math.cos(a) * d, y: h + 1.4 + (i === 0 ? 0.6 : rnd() * 0.6), z: Math.sin(a) * d, ry: rnd() * 3, s: (i === 0 ? 3.1 : 2.1) + rnd() * 0.6, color: shade(col, rnd, 0.12) });
  }
}
function birch(add, P, rnd) {
  const h = 3.2 + rnd() * 1.2;
  add(G.cylBase(5), { parent: P, sx: 0.24, sz: 0.24, sy: h + 1.2, color: 0xeeeae0 });
  for (let k = 0; k < 3; k++) add(G.box(), { parent: P, y: 0.6 + k * 1.1 + rnd() * 0.4, sx: 0.26, sy: 0.08, sz: 0.26, ry: rnd() * 3, color: 0x2b2b2b, ao: false });
  add(G.ico(0), { parent: P, y: h + 0.9, sx: 1.9, sy: 3.2, sz: 1.9, ry: rnd() * 3, color: shade(0x8cbf4a, rnd, 0.1) });
  add(G.ico(0), { parent: P, x: 0.5, y: h, z: 0.2, s: 1.4, color: shade(0x7fb444, rnd, 0.1) });
}
function snag(add, P, rnd) {
  add(G.taper(0.45, 5), { parent: P, sx: 0.45, sz: 0.45, sy: 4.5, color: 0x6e5a48 });
  add(G.cyl(4), { parent: P, x: 0.5, y: 2.8, rz: -0.9, sx: 0.14, sz: 0.14, sy: 1.4, color: 0x6e5a48 });
  add(G.cyl(4), { parent: P, x: -0.4, y: 3.4, rz: 0.8, sx: 0.12, sz: 0.12, sy: 1.1, color: 0x6e5a48 });
}
function giantTree(add, P, rnd) {
  add(G.taper(0.55, 8), { parent: P, sx: 2.2, sz: 2.2, sy: 9, color: 0x5a3a22, aoH: 4 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28;
    add(G.cone(4), { parent: P, x: Math.cos(a) * 1.1, z: Math.sin(a) * 1.1, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5, sx: 0.9, sz: 0.9, sy: 2, color: 0x4f3320 });
  }
  const cols = [0x2a6b3a, 0x2f7a3a, 0x3a8a3f];
  for (let i = 0; i < 7; i++) {
    const a = rnd() * 6.28, d = i === 0 ? 0 : 2 + rnd() * 2.5;
    add(G.ico(0), { parent: P, x: Math.cos(a) * d, y: 9.5 + rnd() * 3, z: Math.sin(a) * d, ry: rnd() * 3, s: (i === 0 ? 8 : 5) + rnd() * 2, color: shade(cols[i % 3], rnd, 0.1) });
  }
}
function lookout(add, P, rnd) {
  const wood = 0x8a5a34, dark = 0x5a3a22;
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]]) add(G.box(), { parent: P, x, y: 4, z, sx: 0.3, sy: 8, sz: 0.3, color: dark });
  for (const y of [2.5, 5.2]) for (const s of [-1, 1]) {
    add(G.box(), { parent: P, x: s * 1.4, y, rx: 0.9, sx: 0.12, sy: 3.6, sz: 0.12, color: dark });
    add(G.box(), { parent: P, z: s * 1.4, y, rz: 0.9, sx: 3.6, sy: 0.12, sz: 0.12, color: dark });
  }
  add(G.box(), { parent: P, y: 8.1, sx: 3.8, sy: 0.25, sz: 3.8, color: wood });
  add(G.box(), { parent: P, y: 9.4, sx: 3.2, sy: 2.4, sz: 3.2, color: 0xc28a52 });
  add(G.box(), { parent: P, y: 9.6, z: -1.62, sx: 2.2, sy: 1, sz: 0.06, color: 0x2b3f55, emit: 0.2 });
  add(G.prism(), { parent: P, y: 10.6, sx: 4.2, sy: 1.6, sz: 4.2, color: 0xa33b2b });
  for (let i = 0; i < 6; i++) add(G.box(), { parent: P, x: 1.75, y: 0.5 + i * 1.3, sx: 0.08, sy: 0.08, sz: 0.9, color: wood });
}
function tor(add, x, y, z, rnd) {
  for (let i = 0; i < 4; i++) {
    const s = 3.6 - i * 0.7 + rnd() * 0.6;
    add(G.rock(i % 4), { x: x + (rnd() - 0.5) * 1.5, y: y + 0.6 + i * 2.1, z: z + (rnd() - 0.5) * 1.5, s, ry: rnd() * 6, sy: s * 0.75, color: shade(0x8a8f99, rnd, 0.08) });
  }
  add(G.hemi(7, 2), { x, y: y + 7.4, z, sx: 1.8, sy: 0.6, sz: 1.6, color: 0x5f8f3a, ao: false });
  for (let i = 0; i < 3; i++) { const a = rnd() * 6.28; boulder(add, x + Math.cos(a) * 4, y - 0.3, z + Math.sin(a) * 4, rnd, 0.8 + rnd()); }
}
function bush(add, x, y, z, rnd, col) {
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) add(G.ico(0), { x: x + (rnd() - 0.5) * 1.2, y: y + 0.45, z: z + (rnd() - 0.5) * 1.2, ry: rnd() * 3, sx: 1.2 + rnd() * 0.8, sy: 0.9 + rnd() * 0.4, sz: 1.1 + rnd() * 0.7, color: shade(col, rnd, 0.12) });
}
function fern(add, x, y, z, rnd) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28 + rnd();
    add(G.box(), { x: x + Math.cos(a) * 0.35, y: y + 0.25, z: z + Math.sin(a) * 0.35, ry: -a + Math.PI / 2, rx: 0.7, sx: 0.06, sy: 0.75, sz: 0.28, color: shade(0x4a9a3a, rnd, 0.1), ao: false });
  }
}
function grass(add, x, y, z, rnd) {
  const n = 4 + Math.floor(rnd() * 4), col = shade(0x6fb04a, rnd, 0.12);
  for (let i = 0; i < n; i++) add(G.cone(3), { x: x + (rnd() - 0.5) * 0.8, y, z: z + (rnd() - 0.5) * 0.8, rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.5, ry: rnd() * 3, sx: 0.14, sz: 0.14, sy: 0.45 + rnd() * 0.5, color: col, ao: false });
}
function flowers(add, x, y, z, rnd) {
  const c = [0xffffff, 0xffe14d, 0xff8ad8, 0xb45cff][Math.floor(rnd() * 4)];
  for (let i = 0; i < 4; i++) add(G.ico(0), { x: x + (rnd() - 0.5) * 1.2, y: y + 0.18, z: z + (rnd() - 0.5) * 1.2, s: 0.16, color: c, ao: false });
}
function log(add, x, y, z, rnd) {
  const ry = rnd() * 6, l = 2.6 + rnd() * 2.4, r = 0.45 + rnd() * 0.25;
  const P = frame(x, y + r * 0.8, z, ry);
  add(G.cyl(7), { parent: P, rz: Math.PI / 2, sx: r * 2, sz: r * 2, sy: l, color: 0x6b4a2b });
  for (const s of [-1, 1]) add(G.cyl(7), { parent: P, x: s * (l / 2 + 0.01), rz: Math.PI / 2, sx: r * 1.7, sz: r * 1.7, sy: 0.04, color: 0xc8a070, ao: false });
  add(G.hemi(6, 2), { parent: P, y: r * 0.8, sx: l * 0.5, sy: 0.25, sz: r * 1.4, color: 0x5f9a3a, ao: false });
}
function stump(add, x, y, z, rnd) {
  const r = 0.4 + rnd() * 0.25;
  add(G.cylBase(7), { x, y: y - 0.05, z, sx: r * 2, sz: r * 2, sy: 0.55 + rnd() * 0.3, color: 0x6b4a2b });
  add(G.cyl(7), { x, y: y + 0.55, z, sx: r * 1.7, sz: r * 1.7, sy: 0.04, color: 0xc8a070, ao: false });
}
function mushrooms(add, x, y, z, rnd) {
  const red = rnd() < 0.6, n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const mx = x + (rnd() - 0.5) * 0.9, mz = z + (rnd() - 0.5) * 0.9, h = 0.3 + rnd() * 0.5, w = 0.5 + rnd() * 0.5;
    add(G.cylBase(6), { x: mx, y, z: mz, sx: 0.18 * w * 1.6, sz: 0.18 * w * 1.6, sy: h, color: 0xf5ecd8 });
    add(G.hemi(8, 3), { x: mx, y: y + h, z: mz, sx: w, sy: w * 0.6, sz: w, color: red ? 0xe03a3a : 0xb07a4a });
    if (red) add(G.sphere(5, 3), { x: mx + 0.12 * w, y: y + h + 0.22 * w, z: mz, s: 0.1 * w * 1.5, color: 0xffffff });
  }
}
function rock(add, x, y, z, rnd) {
  add(G.rock(Math.floor(rnd() * 4)), { x, y: y + 0.08, z, s: 0.35 + rnd() * 0.5, ry: rnd() * 6, color: shade(0x8a8f99, rnd, 0.1) });
}
function boulder(add, x, y, z, rnd, s) {
  add(G.rock(Math.floor(rnd() * 4)), { x, y: y + 0.25 * s, z, s, ry: rnd() * 6, color: shade(0x8a8f99, rnd, 0.1) });
  if (rnd() < 0.6) add(G.hemi(6, 2), { x, y: y + 0.55 * s, z, sx: s * 0.7, sy: s * 0.2, sz: s * 0.6, ry: rnd() * 3, color: 0x5f8f3a, ao: false });
}
function reflectorPost(add, x, z, col) {
  add(G.box(), { x, y: 0.5, z, sx: 0.12, sy: 1, sz: 0.12, color: col });
  add(G.box(), { x, y: 0.85, z: z - 0.065, sx: 0.08, sy: 0.16, sz: 0.02, color: 0xff7a1a, emit: 0.7, ao: false });
}

// =========================================================== mountains ===
function mountains(ctx) {
  const { add, rnd, kind, H } = ctx;
  // left: the road is cut into the mountainside (cliff wall); right: drop to the valley
  for (let i = 0; i < 4; i++) {
    const x = -(12.5 + rnd() * 6), z = rnd() * LEN, s = 1.6 + rnd() * 2.6;
    add(G.rock(Math.floor(rnd() * 4)), { x, y: ctx.Hmin(x, z, s * 0.45) + s * 0.15, z, s, ry: rnd() * 6, color: shade(0x8a90a0, rnd, 0.08) });
  }
  for (let i = 0; i < 8; i++) {
    const x = -(18 + rnd() * 40), z = rnd() * LEN;
    pine(add, frame(x, ctx.Hmin(x, z, 0.8) - 0.1, z, rnd() * 6, 1.1 + rnd() * 0.7), rnd, 0x2a5f44, true);
  }
  // guard rail on the drop side
  if (kind !== 'bridge') {
    for (let z = 1; z < LEN; z += 3) add(G.box(), { x: SHOULDER - 0.15, y: 0.45, z, sx: 0.14, sy: 0.9, sz: 0.14, color: 0x8a8f99, mat: 'metal' });
    add(G.box(), { x: SHOULDER - 0.05, y: 0.75, z: LEN / 2, sx: 0.08, sy: 0.32, sz: LEN, color: 0xc8ccd4, mat: 'metal' });
  }
  for (let i = 0; i < 5; i++) {
    const x = 16 + rnd() * 30, z = rnd() * LEN;
    pine(add, frame(x, ctx.Hmin(x, z, 0.8) - 0.1, z, rnd() * 6, 1.2 + rnd() * 0.8), rnd, 0x2a5f44, true);
  }
  // mid-distance peaks down in the valley
  for (let i = 0; i < 2; i++) {
    const x = 70 + rnd() * 90, z = rnd() * LEN, h = 45 + rnd() * 60, w = 45 + rnd() * 40;
    const y = H(x, z) - 2;
    add(G.cone(7), { x, y, z, sx: w, sy: h, sz: w, ry: rnd() * 3, color: 0x7d8aa8, aoH: 60 });
    add(G.cone(7), { x, y: y + h * 0.62, z, sx: w * 0.39, sy: h * 0.385, sz: w * 0.39, ry: rnd() * 3, color: 0xffffff, ao: false });
  }
}

// ============================================================= events ===
function rockMass(ctx, z0, z1, top) {
  const { add, rnd, biome } = ctx;
  const grassy = biome.id === 'forest';
  const col = grassy ? biome.groundAlt : 0x8a90a0;
  // a ridge over the tunnel (sloping down to both portals) and two flanking hills clear of the road
  const zc = (z0 + z1) / 2, half = (z1 - z0 + 6) / 2, rh = 9 + rnd() * 4, base = top - 0.5;
  add(G.prism(), { x: 0, y: base, z: zc, ry: Math.PI / 2, sx: half * 2, sy: rh, sz: 70, color: shade(col, rnd, 0.06), ao: false });
  const ridgeY = (z) => base + rh * Math.max(0, 1 - Math.abs(z - zc) / half);
  for (const s of [-1, 1]) {
    addHill(ctx, s * (SHOULDER + 30), zc, 24, 20 + rnd() * 6, false, shade(col, rnd, 0.06));
    for (let i = 0; i < 4; i++) {
      const x = s * (4 + rnd() * 26), z = zc + (rnd() - 0.5) * half * 1.2;
      if (grassy) pine(add, frame(x, ridgeY(z) - 0.3, z, rnd() * 6, 1 + rnd() * 0.5), rnd, LEAF[i % LEAF.length]);
      else add(G.rock(i % 4), { x, y: ridgeY(z), z, s: 2 + rnd() * 2, ry: rnd() * 6, color: shade(0x8a90a0, rnd) });
    }
  }
}
function tunnel(ctx) {
  const { add, rnd, biome } = ctx;
  const z0 = 12, z1 = 48, W = SHOULDER + 0.6, wallH = 4.8, top = 7.8, inner = 5.4;
  const neon = biome.id === 'neon', space = biome.id === 'space';
  if (space) {
    for (let z = z0; z <= z1; z += 4) add(G.torus(W + 0.4, 0.22, 4, 28), { y: 0.6, z, color: NEON[(z / 4) % 5 | 0], emit: 1, ao: false });
    for (let z = z0; z <= z1; z += 12) add(G.torus(W + 1.2, 0.6, 5, 28), { y: 0.6, z, color: 0x3a2c7a, ao: false });
    return;
  }
  const shell = neon ? 0x1b1530 : biome.id === 'mountains' ? 0x7d8494 : 0x9a968c;
  const lamp = neon ? NEON[Math.floor(rnd() * 5)] : 0xffe2a8;
  const slant = Math.hypot(W - inner, top - wallH), ang = Math.atan2(top - wallH, W - inner);
  for (const s of [-1, 1]) {
    add(G.box(), { x: s * (W + 0.4), y: wallH / 2, z: (z0 + z1) / 2, sx: 0.8, sy: wallH, sz: z1 - z0, color: shell });
    add(G.box(), { x: s * (W + inner) / 2, y: (wallH + top) / 2, z: (z0 + z1) / 2, rz: s * ang, sx: slant + 0.6, sy: 0.8, sz: z1 - z0, color: shell });
    // light strips along the slanted panels + a walkway kerb
    for (let z = z0 + 2; z < z1 - 1; z += 3) add(G.box(), { x: s * ((W + inner) / 2 - 0.45), y: (wallH + top) / 2 - 0.3, z, rz: s * ang, sx: 0.35, sy: 0.12, sz: 1.6, color: lamp, emit: 1, ao: false });
    add(G.box(), { x: s * (W - 0.2), y: 0.35, z: (z0 + z1) / 2, sx: 0.5, sy: 0.7, sz: z1 - z0, color: neon ? NEON[s > 0 ? 0 : 1] : 0xd8d2c0, emit: neon ? 0.8 : 0 });
    // inside wall stripe
    add(G.box(), { x: s * (W - 0.01), y: 1.6, z: (z0 + z1) / 2, sx: 0.04, sy: 0.3, sz: z1 - z0, color: neon ? NEON[2] : 0xffb21a, emit: neon ? 1 : 0.3, ao: false });
  }
  add(G.box(), { y: top + 0.4, z: (z0 + z1) / 2, sx: inner * 2 + 0.6, sy: 0.8, sz: z1 - z0, color: shell });
  // portals
  for (const z of [z0, z1]) {
    for (const s of [-1, 1]) add(G.cbox(0.2), { x: s * (W + 3), y: (top + 3) / 2, z, sx: 6, sy: top + 3, sz: 1.6, color: shell });
    add(G.cbox(0.2), { y: top + 1.4, z, sx: W * 2 + 12, sy: 2.6, sz: 1.6, color: shell });
    add(G.box(), { y: top + 0.1, z: z + (z === z0 ? -0.82 : 0.82), sx: W * 2, sy: 0.3, sz: 0.04, color: neon ? NEON[3] : 0xffb21a, emit: 1, ao: false });
  }
  if (!neon) rockMass(ctx, z0, z1, top + 2);
  else for (let z = z0; z <= z1; z += 6) add(G.torus(W + 1.6, 0.14, 4, 28), { y: 1, z, color: NEON[(z / 6) % 5 | 0], emit: 1, ao: false });
}
function underpass(ctx) {
  const { add, rnd } = ctx;
  const z = 24 + rnd() * 8, deckY = 7.2;
  ctx.gap = [z - 6, z + 6]; // buildings leave room for the crossing road
  add(G.box(), { y: deckY, z, sx: 160, sy: 1.4, sz: 9, color: 0x8f949c });
  add(G.box(), { y: deckY + 0.75, z, sx: 160, sy: 0.1, sz: 7.6, color: 0x4a4d55, ao: false });
  for (const dz of [-4.4, 4.4]) {
    add(G.box(), { y: deckY + 1.2, z: z + dz, sx: 160, sy: 0.9, sz: 0.3, color: 0xb8bec8 });
    add(G.box(), { y: deckY - 0.4, z: z + dz * 1.01, sx: 160, sy: 0.25, sz: 0.06, color: 0xffb21a, emit: 0.5, ao: false });
  }
  for (const s of [-1, 1]) {
    for (const dz of [-3, 3]) add(G.cboxBase(0.2), { x: s * (SHOULDER + 1.2), z: z + dz, sx: 1.4, sy: deckY - 0.6, sz: 1.4, color: 0xa8acb4 });
    // cars on the overpass
    for (let i = 0; i < 3; i++) {
      const cx = s * (14 + rnd() * 50), lane = (rnd() < 0.5 ? -1.8 : 1.8);
      add(G.cbox(0.3), { x: cx, y: deckY + 1.2, z: z + lane, sx: 4, sy: 0.9, sz: 1.8, color: [0xd7263d, 0x3d6fd9, 0xffd23f, 0xf2f2f2][Math.floor(rnd() * 4)] });
      add(G.cbox(0.3), { x: cx - 0.3, y: deckY + 1.85, z: z + lane, sx: 2.2, sy: 0.6, sz: 1.6, color: 0x2b3f55 });
    }
  }
  // lights under the deck
  for (let x = -HW + 1; x < HW; x += 3) add(G.box(), { x, y: deckY - 0.75, z, sx: 1, sy: 0.08, sz: 0.4, color: 0xfff1c8, emit: 1, ao: false });
}
function ravine(biome) {
  const depth = biome.id === 'mountains' ? 18 : biome.id === 'forest' ? 9 : biome.id === 'desert' ? 7 : 5;
  return (d, z) => {
    const t = z < 9 || z > 51 ? 0 : z < 18 ? (z - 9) / 9 : z > 42 ? (51 - z) / 9 : 1;
    return depth * (t * t * (3 - 2 * t));
  };
}
function bridge(ctx) {
  const { add, rnd, biome } = ctx;
  const depth = ravine(biome)(0, 30);
  const z0 = 7, z1 = 53, W = SHOULDER + 0.3;
  // deck, girders, piers
  add(G.box(), { y: -0.75, z: (z0 + z1) / 2, sx: W * 2, sy: 1.1, sz: z1 - z0, color: 0x8f949c });
  for (const s of [-1, 1]) add(G.box(), { x: s * (HW - 1), y: -1.8, z: (z0 + z1) / 2, sx: 0.8, sy: 1.2, sz: z1 - z0, color: 0x6e737c });
  for (const z of [20, 30, 40]) {
    for (const s of [-1, 1]) add(G.cboxBase(0.15), { x: s * (HW - 1.5), y: -depth - 1, z, sx: 1.6, sy: depth - 0.2, sz: 1.6, color: biome.id === 'suburbs' ? 0xb8a88a : 0xa8acb4 });
  }
  // water (or a dry gulch bed in the desert)
  const wet = biome.id !== 'desert';
  add(G.box(), { y: -depth + (wet ? 1.4 : 0.2), z: 30, sx: 400, sy: 0.1, sz: 24, color: wet ? (biome.id === 'mountains' ? 0x5f9fd6 : 0x3f8fc8) : 0xb88a5a, emit: wet ? 0.12 : 0, ao: false, vary: 0.03 });
  for (let i = 0; i < 10; i++) {
    const x = (rnd() - 0.5) * 120, z = 14 + rnd() * 32;
    if (Math.abs(x) < W + 1) continue;
    add(G.rock(i % 4), { x, y: -depth + 1.2, z, s: 1 + rnd() * 2.5, ry: rnd() * 6, color: shade(0x8a8f99, rnd) });
  }
  if (biome.id === 'suburbs') {
    // stone parapets
    for (const s of [-1, 1]) {
      add(G.cbox(0.12), { x: s * (W + 0.2), y: 0.5, z: (z0 + z1) / 2, sx: 0.5, sy: 1, sz: z1 - z0, color: 0xc8b89a });
      for (let z = z0; z <= z1; z += 6) add(G.cbox(0.12), { x: s * (W + 0.2), y: 0.7, z, sx: 0.7, sy: 1.4, sz: 0.7, color: 0xb8a88a });
    }
    return;
  }
  if (biome.id === 'desert') {
    // wooden trestle railing
    for (const s of [-1, 1]) {
      for (let z = z0; z <= z1; z += 2.5) add(G.box(), { x: s * (W + 0.1), y: 0.55, z, sx: 0.18, sy: 1.1, sz: 0.18, color: 0x8a5a34 });
      for (const y of [0.55, 1.05]) add(G.box(), { x: s * (W + 0.1), y, z: (z0 + z1) / 2, sx: 0.12, sy: 0.14, sz: z1 - z0, color: 0x9a6a40 });
      for (let z = z0 + 3; z < z1; z += 8) add(G.box(), { x: s * (HW - 1.5), y: -depth / 2 - 0.8, z, rx: 0.6, sx: 0.3, sy: depth * 1.1, sz: 0.3, color: 0x7a4a2a });
    }
    return;
  }
  // steel arch truss (forest / mountains)
  const steel = biome.id === 'mountains' ? 0x3d6fd9 : 0xc8452f;
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, z = z0 + t * (z1 - z0); pts.push([z, 0.4 + Math.sin(Math.PI * t) * 8.5]); }
    for (let i = 0; i < pts.length - 1; i++) {
      const [za, ya] = pts[i], [zb, yb] = pts[i + 1];
      add(G.box(), { x: s * (W + 0.3), y: (ya + yb) / 2, z: (za + zb) / 2, rx: -Math.atan2(yb - ya, zb - za), sx: 0.45, sy: 0.45, sz: Math.hypot(zb - za, yb - ya) + 0.2, color: steel, mat: 'metal' });
      if (i > 0) add(G.box(), { x: s * (W + 0.3), y: ya / 2, z: za, sx: 0.12, sy: ya, sz: 0.12, color: 0xd8dce4, mat: 'metal' });
    }
    add(G.box(), { x: s * (W + 0.3), y: 0.6, z: (z0 + z1) / 2, sx: 0.35, sy: 0.35, sz: z1 - z0, color: steel, mat: 'metal' });
    add(G.box(), { x: s * (W + 0.3), y: 1.1, z: (z0 + z1) / 2, sx: 0.08, sy: 0.1, sz: z1 - z0, color: 0xd8dce4, mat: 'metal' });
  }
  for (let z = z0 + 8; z < z1 - 6; z += 8) {
    const y = 0.4 + Math.sin(Math.PI * ((z - z0) / (z1 - z0))) * 8.5;
    if (y > 7.6) add(G.box(), { y: y - 0.1, z, sx: W * 2 + 0.6, sy: 0.3, sz: 0.3, color: steel, mat: 'metal' });
  }
}
function forestArch(ctx) {
  const { add, rnd } = ctx;
  for (let z = 8; z < LEN - 6; z += 5 + rnd() * 2) {
    for (const s of [-1, 1]) {
      const x = s * (SHOULDER + 1.8 + rnd() * 1.2);
      // trunk leaning in over the road
      add(G.taper(0.55, 6), { x, y: 0, z, rz: -s * 0.22, sx: 0.8, sz: 0.8, sy: 7.5, color: 0x5a3a22 });
      add(G.cyl(5), { x: x - s * 3.2, y: 7.6, z, rz: -s * 1.05, sx: 0.4, sz: 0.4, sy: 5, color: 0x5a3a22 });
    }
    for (let i = 0; i < 4; i++) add(G.ico(0), { x: (rnd() - 0.5) * 16, y: 9.2 + rnd() * 2.2, z: z + (rnd() - 0.5) * 3, ry: rnd() * 3, sx: 5 + rnd() * 3, sy: 2.6 + rnd(), sz: 4 + rnd() * 2, color: shade(LEAF[i % LEAF.length], rnd, 0.1) });
  }
  // hanging vines
  for (let i = 0; i < 10; i++) add(G.box(), { x: (rnd() - 0.5) * 12, y: 8.2, z: 8 + rnd() * 44, sx: 0.06, sy: 1.2 + rnd() * 1.2, sz: 0.06, color: 0x3f7a2f, ao: false });
}
function construction(ctx) {
  const { add, rnd, biome } = ctx;
  const s = rnd() < 0.5 ? -1 : 1;
  const xB = s * (SHOULDER + 0.6);
  // striped barricade fence along the shoulder edge
  for (let z = 6; z < LEN - 6; z += 3.2) {
    add(G.box(), { x: xB, y: 0.55, z, sx: 0.08, sy: 1.1, sz: 0.1, color: 0x2b2f3a });
    for (let k = 0; k < 4; k++) add(G.box(), { x: xB, y: 0.85, z: z + 0.4 + k * 0.6, sx: 0.06, sy: 0.3, sz: 0.6, color: k % 2 ? 0xffffff : 0xff6a1a, emit: 0.15 });
  }
  // cones on the kerb line and in the shoulder (never in a lane)
  for (let z = 4; z < LEN - 2; z += 4) cone(add, s * (HW + KERB + 0.5), z);
  // work zone: excavator, sand pile, light tower, signs
  const wx = s * (SHOULDER + 7), wz = 22 + rnd() * 12, wy = ctx.H(wx, wz);
  const P = frame(wx, wy, wz, s > 0 ? Math.PI : 0);
  add(G.cbox(0.15), { parent: P, y: 0.45, sx: 2.6, sy: 0.9, sz: 3.6, color: 0x2b2f3a });
  add(G.cbox(0.2), { parent: P, y: 1.6, sx: 2.6, sy: 1.5, sz: 2.8, color: 0xffb21a });
  add(G.box(), { parent: P, x: 0.3, y: 2.2, z: 0.6, sx: 1.4, sy: 1, sz: 1.2, color: 0x2b3f55, emit: 0.15 });
  add(G.box(), { parent: P, x: -0.2, y: 3.2, z: 2.6, rx: -0.6, sx: 0.4, sy: 0.4, sz: 3.4, color: 0xffb21a });
  add(G.box(), { parent: P, x: -0.2, y: 2.6, z: 4.4, rx: 0.5, sx: 0.35, sy: 2.4, sz: 0.35, color: 0xffb21a });
  add(G.cbox(0.2), { parent: P, x: -0.2, y: 1.3, z: 4.8, sx: 1.1, sy: 0.7, sz: 0.9, color: 0x5a5f6a });
  add(G.cone(7), { x: wx + s * 4, y: wy, z: wz + 6, sx: 5, sy: 2.2, sz: 4, color: shade(0xd9b070, rnd) });
  const lx = s * (SHOULDER + 3), lz = 12 + rnd() * 6;
  add(G.box(), { x: lx, y: 3, z: lz, sx: 0.2, sy: 6, sz: 0.2, color: 0x5a5f6a });
  add(G.box(), { x: lx, y: 6.2, z: lz, sx: 1.6, sy: 0.7, sz: 0.25, color: 0x2b2f3a });
  for (const dx of [-0.5, 0, 0.5]) add(G.box(), { x: lx + dx, y: 6.2, z: lz - 0.14, sx: 0.4, sy: 0.4, sz: 0.04, color: 0xfff6d8, emit: 1, ao: false });
  for (const z of [4, LEN - 8]) warningSign(add, s * (SHOULDER + 1.4), z);
  // fresh asphalt along the work zone edge
  add(G.box(), { x: s * (HW - 1.1), y: 0.003, z: LEN / 2, sx: 1.8, sy: 0.006, sz: LEN - 10, color: shade(biome.patch, rnd, 0.03), ao: false });
}
function cone(add, x, z) {
  add(G.cbox(0.1), { x, y: 0.03, z, sx: 0.6, sy: 0.06, sz: 0.6, color: 0x2b2f3a });
  add(G.cone(8), { x, y: 0.05, z, sx: 0.45, sy: 0.85, sz: 0.45, color: 0xff6a1a });
  add(G.cyl(8), { x, y: 0.45, z, sx: 0.3, sy: 0.12, sz: 0.3, color: 0xffffff, ao: false });
}
function warningSign(add, x, z) {
  add(G.box(), { x, y: 0.9, z, sx: 0.1, sy: 1.8, sz: 0.1, color: 0x5a5f6a });
  add(G.box(), { x, y: 2.2, z: z - 0.08, rz: Math.PI / 4, sx: 1.1, sy: 1.1, sz: 0.06, color: 0xffb21a, emit: 0.2 });
  add(G.box(), { x, y: 2.2, z: z - 0.12, rz: Math.PI / 4, sx: 0.85, sy: 0.85, sz: 0.02, color: 0x1b1d26, ao: false });
  add(G.box(), { x, y: 2.2, z: z - 0.14, rz: Math.PI / 4, sx: 0.7, sy: 0.7, sz: 0.02, color: 0xffb21a, emit: 0.2, ao: false });
  add(G.box(), { x, y: 2.25, z: z - 0.16, sx: 0.12, sy: 0.4, sz: 0.02, color: 0x1b1d26, ao: false });
}
function checkpoint(ctx) {
  const { add, rnd, biome } = ctx;
  const z = 30, W = SHOULDER + 1.2, h = 8.2;
  const glow = !biome.ground || biome.id === 'neon';
  for (const s of [-1, 1]) {
    add(G.cboxBase(0.2), { x: s * W, z, sx: 1.3, sy: h, sz: 1.3, color: 0x2b2f3a });
    add(G.box(), { x: s * (W - 0.67), y: h / 2, z, sx: 0.05, sy: h - 1, sz: 0.3, color: biome.track, emit: glow ? 1 : 0.5, ao: false });
    // booth
    const bx = s * (W + 3.2);
    add(G.cboxBase(0.15), { x: bx, z, sx: 2.6, sy: 2.6, sz: 2.4, color: 0xf2f2f2 });
    add(G.box(), { x: bx - s * 1.31, y: 1.7, z, sx: 0.04, sy: 0.9, sz: 1.6, color: 0x2b3f55, emit: 0.2 });
    add(G.cbox(0.15), { x: bx, y: 2.75, z, sx: 3, sy: 0.3, sz: 2.8, color: biome.track });
    // flags
    for (const dz of [-5, 5]) {
      add(G.cylBase(5), { x: s * (W + 1.4), z: z + dz, sx: 0.1, sz: 0.1, sy: 6, color: 0xd8dce4 });
      add(G.box(), { x: s * (W + 1.4) - s * 0.8, y: 5.4, z: z + dz, sx: 1.6, sy: 1, sz: 0.04, color: NEON[Math.floor(rnd() * 5)], emit: glow ? 0.6 : 0.1 });
    }
  }
  // chequered gantry and lights
  const n = 18, w = (W * 2) / n;
  for (let i = 0; i < n; i++) for (let r = 0; r < 2; r++) add(G.box(), { x: -W + (i + 0.5) * w, y: h + 0.35 + r * 0.5, z, sx: w, sy: 0.5, sz: 0.9, color: (i + r) % 2 ? 0x1b1d26 : 0xffffff, ao: false });
  for (let i = 0; i < 5; i++) add(G.sphere(6, 4), { x: -4 + i * 2, y: h - 0.05, z: z - 0.46, s: 0.42, color: i === 2 ? 0x39ff88 : 0xff3d3d, emit: 1, ao: false });
  // chequered timing line across the road
  for (let i = 0; i < 26; i++) for (let r = 0; r < 2; r++) add(G.box(), { x: -HW + (i + 0.5) * (HW * 2 / 26), y: 0.006, z: z + (r - 0.5) * 0.5, sx: HW * 2 / 26, sy: 0.012, sz: 0.5, color: (i + r) % 2 ? 0x1b1d26 : 0xffffff, ao: false, vary: 0 });
}
function canyon(ctx) {
  const { add, rnd } = ctx;
  const strata = [0xc0784a, 0xd9824a, 0xb8643a, 0xe8995a, 0xa85a34];
  for (const s of [-1, 1]) {
    for (let z = -4; z < LEN + 4; z += 7 + rnd() * 4) {
      const x = s * (SHOULDER + 4 + rnd() * 3), h = 18 + rnd() * 16;
      let y = ctx.H(x, z) - 0.5;
      for (let k = 0; k < 4; k++) {
        const lh = h / 4, w = 9 - k * 0.8 + rnd() * 1.5;
        add(G.cbox(0.25), { x: x + s * (k * 0.5), y: y + lh / 2, z, sx: w, sy: lh, sz: 9 + rnd() * 3, ry: (rnd() - 0.5) * 0.3, color: strata[(k + Math.floor(rnd() * 2)) % strata.length], aoH: 12 });
        y += lh;
      }
    }
  }
  // natural rock arch spanning the road
  const az = 26 + rnd() * 8;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = -(SHOULDER + 4) + t * (SHOULDER + 4) * 2, y = 12 + Math.sin(Math.PI * t) * 4;
    add(G.rock(i % 4), { x, y, z: az, s: 4.5 + rnd() * 1.2, sy: 3.4, ry: rnd() * 6, color: strata[i % strata.length] });
  }
  for (let i = 0; i < 6; i++) { const x = (rnd() < 0.5 ? -1 : 1) * (SHOULDER + 1 + rnd() * 2.5), z = rnd() * LEN; add(G.rock(i % 4), { x, y: 0.2, z, s: 0.6 + rnd() * 1.2, ry: rnd() * 6, color: shade(0xc0784a, rnd) }); }
}

// ================================================================ props ===
function streetLight(add, x, z, s) {
  add(G.cyl(6), { x, y: 3, z, sx: 0.16, sz: 0.16, sy: 6, color: 0x2b2f3a });
  add(G.box(), { x: x - s * 0.9, y: 6, z, sx: 1.9, sy: 0.12, sz: 0.12, color: 0x2b2f3a });
  add(G.cbox(0.2), { x: x - s * 1.7, y: 5.9, z, sx: 0.6, sy: 0.18, sz: 0.4, color: 0xfff6d8, emit: 1 });
}
function building(add, rnd, x, z, w, h, d, s) {
  const col = [0xf2e6da, 0xdfe6f2, 0xffd6c8, 0xc8e6ff, 0xe8dff2, 0xfff1c8][Math.floor(rnd() * 6)];
  add(G.boxBase(), { x, z, sx: d, sy: h, sz: w, color: col, aoH: 20 });
  for (let k = 3; k < h - 1; k += 3.2) add(G.box(), { x: x - s * (d / 2 + 0.03), y: k, z, sx: 0.08, sy: 1.3, sz: w * 0.8, color: rnd() < 0.2 ? 0xfff1b8 : 0x7fa8d8, emit: 0.15, ao: false });
  add(G.box(), { x, y: h + 0.3, z, sx: d * 0.9, sy: 0.6, sz: w * 0.9, color: 0x8a8f99 });
  if (rnd() < 0.35) add(G.box(), { x: x - s * (d / 2 + 0.3), y: h * 0.6, z, sx: 0.3, sy: 3.5, sz: w * 0.7, color: NEON[Math.floor(rnd() * 5)], emit: 0.8 });
  if (rnd() < 0.5) add(G.box(), { x: x - s * (d / 2 + 0.6), y: 3.4, z, sx: 1.2, sy: 0.15, sz: w * 0.9, color: [0xd7263d, 0x3d6fd9, 0x2fa86b, 0xffb21a][Math.floor(rnd() * 4)] });
  if (rnd() < 0.4) add(G.cylBase(8), { x: x + (rnd() - 0.5) * d * 0.4, y: h + 0.6, z: z + (rnd() - 0.5) * w * 0.4, sx: 2, sz: 2, sy: 2.4, color: 0x9aa0aa });
}
function house(add, rnd, x, y, z, s) {
  const col = [0xffe0b8, 0xc8e6ff, 0xffd6e0, 0xe0ffd6, 0xfff6d6][Math.floor(rnd() * 5)];
  const roof = [0xd7263d, 0x3d6fd9, 0x6b4a2b, 0x2b2f3a][Math.floor(rnd() * 4)];
  add(G.boxBase(), { x, y, z, sx: 9, sy: 5, sz: 10, color: col, aoH: 4 });
  add(G.prism(), { x, y: y + 5, z, sx: 10, sy: 3.4, sz: 11, color: roof });
  add(G.box(), { x: x - s * 4.55, y: y + 1.3, z, sx: 0.1, sy: 2.4, sz: 1.4, color: 0x6b4a2b });
  for (const dz of [-3, 3]) add(G.box(), { x: x - s * 4.55, y: y + 2.8, z: z + dz, sx: 0.1, sy: 1.4, sz: 1.6, color: 0x9fd6ff, emit: 0.2 });
  if (rnd() < 0.5) add(G.box(), { x: x + 2, y: y + 6.5, z: z + 2, sx: 0.8, sy: 2, sz: 0.8, color: 0x8a5a44 });
}
function cactus(add, x, y, z, rnd) {
  const h = 2 + rnd() * 2.5;
  add(G.cylBase(7), { x, y, z, sx: 0.55, sz: 0.55, sy: h, color: 0x4f9a3a });
  add(G.sphere(7, 4), { x, y: y + h, z, s: 0.55, color: 0x4f9a3a });
  for (const s of [-1, 1]) {
    if (rnd() < 0.7) {
      const ay = y + h * (0.4 + rnd() * 0.3);
      add(G.cyl(6), { x: x + s * 0.5, y: ay, z, rz: Math.PI / 2, sx: 0.35, sz: 0.35, sy: 0.6, color: 0x4f9a3a });
      add(G.cylBase(6), { x: x + s * 0.8, y: ay, z, sx: 0.35, sz: 0.35, sy: 1, color: 0x4f9a3a });
    }
  }
}
function hoodoo(add, rnd, x, z, H) {
  const y = H(x, z), h = 6 + rnd() * 8;
  add(G.taper(0.7, 6), { x, y, z, sx: 3, sz: 3, sy: h, ry: rnd() * 3, color: shade(0xc0784a, rnd), aoH: 6 });
  add(G.rock(Math.floor(rnd() * 4)), { x, y: y + h + 0.6, z, s: 3.2, sy: 1.8, ry: rnd() * 6, color: shade(0xd9824a, rnd) });
}
function tumbleweed(add, x, z, rnd, H) {
  add(G.ico(1), { x, y: H(x, z) + 0.45, z, s: 0.9, color: 0xa88a5a, ao: false });
}
function mesa(add, rnd, x, y, z, w, h) {
  add(G.taper(0.8, 7), { x, y, z, sx: w, sy: h, sz: w, color: 0xd9824a, aoH: 20 });
  add(G.box(), { x, y: y + h * 0.45, z, sx: w * 0.9, sy: 1.2, sz: w * 0.9, ry: 0.3, color: 0xb8643a, ao: false });
  add(G.cyl(7), { x, y: y + h, z, sx: w * 0.8, sz: w * 0.8, sy: 1, color: 0xe8995a });
}
function cloud(add, x, y, z, rnd, s) {
  for (let i = 0; i < 5; i++) add(G.ico(1), { x: x + (rnd() - 0.5) * 4 * s, y: y + rnd() * s, z: z + (rnd() - 0.5) * 3 * s, s: s * (1.2 + rnd()), color: 0xffffff, emit: 0.15, ao: false });
}
function island(add, x, y, z, rnd) {
  const r = 5 + rnd() * 6;
  add(G.cone(7), { x, y, z, sx: r * 2, sy: r * 1.4, sz: r * 2, rx: Math.PI, color: 0xb08a6b });
  add(G.cyl(7), { x, y, z, sx: r * 2, sz: r * 2, sy: 0.8, color: 0x7ad85a });
  roundTree(add, frame(x, y + 0.4, z, rnd() * 6, 1), rnd, 0xff9ad8);
}

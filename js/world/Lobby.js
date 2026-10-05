// The 3D lobby: a bright urban sneaker hub with physical areas.
//   West  — SNEAKER SHOP (walk-in store, shoe wall, next-upgrade podium, giant roof sneaker)
//   East  — PET HATCHERY (egg pedestals, my-pets pad)
//   North — RUN PORTAL
//   South — LEADERBOARD, MISSION BOARD, REBIRTH SHRINE
// Static geometry is merged into a couple of draw calls; only small things animate.
import * as THREE from 'three';
import { G, StaticBatch, makeEmissiveVertexMaterial, roundRect } from '../utils/Geo.js';
import { mulberry32, formatMoney, formatNumber } from '../utils/math.js';
import { neonSign, floatingLabel, canvasTexture, FONT } from '../utils/Labels.js';
import { POSTERS, drawPoster, neonSneakerSign } from './Posters.js';
import { SNEAKERS, SNEAKER_BY_ID } from '../config/sneakers.js';
import { EGGS } from '../config/pets.js';
import { silhouetteMaterial } from '../player/SneakerModel.js';
import { makeEggMesh } from '../pets/EggModel.js';
import { petMultiplier, canRebirth } from '../systems/Economy.js';
import { LOBBY } from '../config/balance.js';
import { chevronGeometry } from './TrackFrame.js';

export const LOBBY_PALETTE = {
  skyTop: 0x2f8ef0, skyBottom: 0xa9d6f7, horizon: 0xc4def2, fog: 0xc4def2, fogNear: 70, fogFar: 260,
  // clear sunny look: strong key light, softer (not black) shadows, a little less flat fill
  sun: 0xfff0d6, sunI: 2.75, shadowI: 0.7, hemiSky: 0xd8ecff, hemiGround: 0x9a8f80, hemiI: 1.08, stars: 0,
};

const SHOP_X = -23.5;
const HATCH_X = 22;
const PORTAL_Z = 27;

export class Lobby {
  constructor(scene, library) {
    this.library = library; // ModelLibrary: imported props/sneakers with procedural fallbacks
    this.propSpots = [];    // imported prop placements {name, x, z, ry}
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = makeEmissiveVertexMaterial({ glow: 1.1 });
    this.colliders = [];  // AABBs {minX,maxX,minZ,maxZ}
    this.circles = [];    // {x,z,r}
    this.zones = [];      // interaction pads
    this.anim = [];       // fns(dt,t)
    this.fadeLabels = []; // floating labels that fade with distance from `viewer` (set by Game)
    this.viewer = null;
    this.t = 0;
    this.build();
    this.placeProps();
    this.buildLights();
  }

  // ------------------------------------------------------------------ build --
  build() {
    const b = new StaticBatch(42);
    const add = (geo, o) => b.add(geo, { vary: 0.03, ...o });
    const box = (x, y, z, sx, sy, sz, color, o = {}) => add(G.cbox(o.bevel ?? 0.06), { x, y, z, sx, sy, sz, color, ...o });
    const flat = (x, y, z, sx, sz, color, o = {}) => add(G.box(), { x, y, z, sx, sy: 0.04, sz, color, ao: false, ...o });
    const rnd = mulberry32(5);
    const H = LOBBY.halfSize;

    // ---------------- floor: paving with subtle tone variation (skips areas covered by the stage/buildings)
    add(G.box(), { y: -0.25, sx: H * 2 + 6, sy: 0.5, sz: H * 2 + 6, color: 0xd3d7de, ao: false, vary: 0.0 });
    const PAVE = [0xe2e5eb, 0xdde1e8, 0xe6e8ed, 0xd8dce4];
    const covered = (x, z) => Math.hypot(x, z) < 15.2 || (x < SHOP_X + 7 && Math.abs(z) < 9.6) || Math.hypot(x - HATCH_X - 3, z) < 12.2;
    for (let x = -H; x < H; x += 4) for (let z = -H; z < H; z += 4) {
      if (covered(x + 2, z + 2)) continue;
      flat(x + 2, 0.005, z + 2, 3.9, 3.9, PAVE[Math.floor(rnd() * PAVE.length)], { vary: 0.012 });
    }
    // warm stone bands frame the plaza axes (they lead the eye to the three destinations)
    for (const [x, z, w, d] of [[0, 0, H * 2, 1.2], [0, 0, 1.2, H * 2]]) flat(x, 0.008, z, w, d, 0xcfc4b2, { vary: 0.02 });
    // central stage: running-track oval around a lighter plaza with a compass medallion
    add(G.cyl(48), { y: 0.015, sx: 32.6, sz: 32.6, sy: 0.04, color: 0xcfc4b2, ao: false, vary: 0 });
    add(G.cyl(48), { y: 0.02, sx: 30, sz: 30, sy: 0.04, color: 0xd9553b, ao: false, vary: 0 });
    for (const r of [26.6, 24.4, 22.2]) add(G.cyl(48), { y: 0.03 + (26.6 - r) * 0.001, sx: r, sz: r, sy: 0.04, color: r === 22.2 ? 0xffffff : 0xd9553b, ao: false, vary: 0 });
    add(G.cyl(48), { y: 0.045, sx: 21.6, sz: 21.6, sy: 0.04, color: 0x8b93a6, ao: false, vary: 0 });
    // inner paving ring + medallion
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      add(G.box(), { x: Math.cos(a) * 8.6, y: 0.05, z: Math.sin(a) * 8.6, ry: -a, sx: 3.6, sy: 0.04, sz: 2.1, color: i % 2 ? 0x98a0b2 : 0x929aad, ao: false, vary: 0 });
    }
    add(G.cyl(48), { y: 0.055, sx: 8.2, sz: 8.2, sy: 0.04, color: 0xff3d7f, ao: false, vary: 0, emit: 0.15 });
    add(G.cyl(48), { y: 0.06, sx: 7, sz: 7, sy: 0.04, color: 0x5c6680, ao: false, vary: 0 });
    add(G.star(), { y: 0.065, sx: 4.6, sz: 4.6, sy: 0.02, ry: Math.PI / 10, color: 0xf2efe8, ao: false, vary: 0 });
    // lane lines on the oval
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      for (const r of [12.2, 13.3]) flat(Math.cos(a) * r, 0.065, Math.sin(a) * r, 0.08, 0.9, 0xffffff, { ry: -a });
    }
    // wayfinding: painted chevron trails in each area's colour from the medallion to its entrance
    //   shop (west, blue) · hatchery (east, yellow) · run portal (north, red — continues as the run lanes)
    const chevron = chevronGeometry();
    const trail = (dirX, dirZ, color, from, to) => {
      const yaw = Math.atan2(dirX, dirZ);
      for (let d = from; d <= to; d += 1.5) add(chevron, { x: dirX * d, y: 0.07, z: dirZ * d, ry: yaw, sx: 1.05, sy: 0.02, sz: 0.75, color, ao: false, vary: 0, emit: 0.3 });
    };
    trail(-1, 0, 0x3fa9f5, 4.2, 12.4);
    trail(1, 0, 0xffc21a, 4.2, 14.4);
    trail(0, 1, 0xff5a3d, 4.2, 12.8);
    // footprints beside the trails: sneaker prints toward the shop, paw prints toward the hatchery
    for (let d = 5.2, k = 0; d < 14.5; d += 1.25, k++) {
      const off = k % 2 ? 0.45 : -0.45;
      add(G.cbox(0.3), { x: -d, y: 0.066, z: 1.7 + off, ry: Math.PI / 2, sx: 0.32, sy: 0.02, sz: 0.62, color: 0xdfe9f5, ao: false, vary: 0 });
      add(G.cyl(10), { x: d, y: 0.066, z: -1.7 + off, sx: 0.36, sy: 0.02, sz: 0.3, color: 0xfff1c8, ao: false, vary: 0 });
      for (const [tx, tz] of [[0.25, -0.2], [0.32, 0], [0.25, 0.2]]) add(G.cyl(8), { x: d + tx, y: 0.066, z: -1.7 + off + tz, sx: 0.13, sy: 0.02, sz: 0.13, color: 0xfff1c8, ao: false, vary: 0 });
    }
    // south path to the boards: stone pavers with purple edges
    flat(0, 0.012, -20.5, 4.6, 11, 0xcfc4b2, { vary: 0.02 });
    for (const x of [-2.45, 2.45]) flat(x, 0.014, -20.5, 0.22, 11, 0xb45cff, { emit: 0.25 });
    for (let z = -25.5; z < -15; z += 1.4) flat(0, 0.016, z, 4.2, 0.06, 0xb8ad9a);

    // ---------------- RUN PORTAL (north)
    const pz = PORTAL_Z;
    // run lanes leading in
    flat(0, 0.07, (14 + pz) / 2, 8, pz - 14, 0xd9553b);
    for (const x of [-2.7, 0, 2.7]) flat(x, 0.08, (14 + pz) / 2, 0.1, pz - 14, 0xffffff);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) flat(-3.5 + i + 0.5, 0.085, pz - 3 + j * 0.5, 1, 0.5, (i + j) % 2 ? 0x111111 : 0xffffff);
    box(0, 0.25, pz + 0.5, 11, 0.5, 4, 0x2b2f3a);
    for (const x of [-4.4, 4.4]) {
      box(x, 4.5, pz, 1.4, 9, 1.6, 0x1b1d26);
      add(G.box(), { x: x + (x > 0 ? -0.72 : 0.72), y: 4.5, z: pz - 0.81, sx: 0.12, sy: 8.6, sz: 0.06, color: 0x5ff3ff, emit: 1 });
      add(G.box(), { x, y: 4.5, z: pz - 0.82, sx: 0.12, sy: 8.6, sz: 0.06, color: 0xff3d7f, emit: 1 });
    }
    box(0, 9.4, pz, 10.4, 1.6, 1.8, 0x1b1d26);
    add(G.box(), { y: 8.62, z: pz - 0.92, sx: 7.2, sy: 0.12, sz: 0.06, color: 0x5ff3ff, emit: 1 });
    this.colliders.push({ minX: -5.2, maxX: -3.6, minZ: pz - 1, maxZ: pz + 1 }, { minX: 3.6, maxX: 5.2, minZ: pz - 1, maxZ: pz + 1 });
    this.colliders.push({ minX: -6, maxX: 6, minZ: pz + 0.3, maxZ: pz + 3 });

    // ---------------- SNEAKER SHOP (west)
    const sx = SHOP_X;
    flat(sx, 0.09, 0, 12.6, 17.4, 0xc99a6b);
    for (let z = -8; z <= 8; z += 1.2) flat(sx, 0.1, z, 12.6, 0.04, 0xb3855a);
    box(sx - 6.5, 4, 0, 0.7, 8, 18.6, 0xf4f1ea);                    // back wall
    box(sx - 6.1, 3.2, 0, 0.1, 5.8, 17, 0x2b2f3a, { ao: false });     // dark shoe wall
    for (const z of [-9, 9]) {
      box(sx, 4, z, 13.6, 8, 0.7, 0xf4f1ea);                           // side walls
      add(G.box(), { x: sx, y: 1.2, z: z - Math.sign(z) * 0.36, sx: 13, sy: 0.12, sz: 0.04, color: 0x9ad8ff, emit: 1 });
    }
    box(sx, 8.35, 0, 14.2, 0.7, 19.4, 0x6f7d97);                      // roof
    add(G.box(), { x: sx + 7.12, y: 8.35, sx: 0.06, sy: 0.16, sz: 19.4, color: 0x9ad8ff, emit: 1 });
    box(sx + 6.6, 7.1, 0, 0.8, 1.9, 19, 0x4a5875);                    // facade header (slate, matches the plaza trims)
    add(G.box(), { x: sx + 7.02, y: 6.12, sx: 0.06, sy: 0.08, sz: 19, color: 0x9ad8ff, emit: 1, ao: false });
    for (const z of [-8.6, 8.6, -5.7, 5.7]) {
      box(sx + 6.6, 3.1, z, 0.9, 6.2, 0.7, 0x4a5875);
      box(sx + 6.6, 0.2, z, 1.1, 0.4, 0.9, 0xcfc4b2);                  // stone pillar bases
    }
    // entrance canopy with warm downlights
    box(sx + 8.1, 5.75, 0, 2.6, 0.32, 11.6, 0xf4f1ea);
    add(G.box(), { x: sx + 9.42, y: 5.75, sx: 0.04, sy: 0.12, sz: 11.6, color: 0x9ad8ff, emit: 1, ao: false });
    for (let z = -4.5; z <= 4.5; z += 1.5) add(G.cyl(10), { x: sx + 8.3, y: 5.58, z, sx: 0.42, sz: 0.42, sy: 0.04, color: 0xfff1c8, emit: 1, ao: false });
    // forecourt: sky-blue tiles framed in stone, continuing the shop trail
    flat(sx + 8.6, 0.06, 0, 4, 11.8, 0xcfc4b2, { vary: 0.02 });
    for (let z = -5; z <= 5; z += 2) for (const dx of [-0.95, 0.95]) flat(sx + 8.6 + dx, 0.064, z, 1.8, 1.8, z % 4 ? 0xbcdcf2 : 0xa9d0ee, { vary: 0.01 });
    // display windows either side of the entrance
    for (const s of [-1, 1]) {
      box(sx + 6.6, 0.6, s * 7.15, 0.9, 1.2, 2.2, 0xf4f1ea);
      add(G.box(), { x: sx + 6.25, y: 3.6, z: s * 7.15, sx: 0.06, sy: 4.6, sz: 2.2, color: 0xbfeaff, emit: 0.35 });
      this.colliders.push({ minX: sx + 5.9, maxX: sx + 7.2, minZ: s > 0 ? 5.3 : -9.4, maxZ: s > 0 ? 9.4 : -5.3 });
    }
    this.colliders.push({ minX: sx - 7.2, maxX: sx - 5.6, minZ: -9.5, maxZ: 9.5 });
    this.colliders.push({ minX: sx - 7, maxX: sx + 7, minZ: -9.6, maxZ: -8.6 }, { minX: sx - 7, maxX: sx + 7, minZ: 8.6, maxZ: 9.6 });
    // shoe wall shelves: 2 rows × 7
    this.shelfSlots = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 7; col++) {
        const z = -6.9 + col * 2.3, y = 1.7 + row * 2.1;
        box(sx - 5.65, y, z, 0.9, 0.1, 2.0, 0xffffff, { ao: false });
        add(G.box(), { x: sx - 5.2, y: y - 0.06, z, sx: 0.04, sy: 0.04, sz: 1.9, color: 0x9ad8ff, emit: 1 });
        this.shelfSlots.push(new THREE.Vector3(sx - 5.6, y + 0.06, z));
      }
    }
    // try-on benches + counter.
    // Shop test corner (visual experiment): when the Kenney pieces are loaded, the north half (counter, north bench,
    // plant, floor lamp) uses imported models and the south half stays procedural for a side-by-side comparison.
    // Colliders are identical either way.
    const shopCorner = this.library?.hasPropReady('shop_counter');
    for (const z of [-3.5, 3.5]) {
      if (shopCorner && z < 0 && this.library.hasPropReady('shop_bench')) {
        for (const dx of [-0.65, 0.65]) this.propSpots.push({ name: 'shop_bench', x: sx - 1 + dx, z, ry: 0 });
        continue;
      }
      box(sx - 1, 0.45, z, 3.2, 0.3, 1, 0x5ab8ef); box(sx - 1, 0.2, z, 3, 0.4, 0.8, 0x34405a);
    }
    if (shopCorner) {
      this.propSpots.push({ name: 'shop_counter', x: sx - 3.2, z: -6.7, ry: Math.PI / 2 });
      if (this.library.hasPropReady('shop_plant')) this.propSpots.push({ name: 'shop_plant', x: sx - 4.85, z: -8.15, ry: 0.4 });
      if (this.library.hasPropReady('shop_lamp')) this.propSpots.push({ name: 'shop_lamp', x: sx - 4.85, z: -5.75, ry: 0 });
    } else {
      box(sx - 3.2, 0.6, -6.7, 2.4, 1.2, 2.4, 0x2b2f3a);
      box(sx - 3.2, 1.25, -6.7, 2.6, 0.12, 2.6, 0xffffff);
    }
    this.colliders.push({ minX: sx - 4.5, maxX: sx - 1.9, minZ: -8, maxZ: -5.4 });
    // feature podium (next upgrade)
    add(G.cylBase(20), { x: sx + 2.5, y: 0.1, z: 0, sx: 2.6, sz: 2.6, sy: 0.7, color: 0xffffff });
    add(G.cyl(20), { x: sx + 2.5, y: 0.82, z: 0, sx: 2.7, sz: 2.7, sy: 0.06, color: 0x9ad8ff, emit: 1 });
    this.circles.push({ x: sx + 2.5, z: 0, r: 1.5 });
    // shoe-box stacks outside
    for (const [x, z, n] of [[-16.6, -12.2, 3], [-16.6, 12.2, 3]]) {
      for (let i = 0; i < n; i++) {
        box(x, 0.35 + i * 0.62, z, 1.6, 0.6, 1, 0xff7a2f, { ry: i * 0.2 });
        box(x, 0.66 + i * 0.62, z, 1.66, 0.08, 1.06, 0xffffff, { ry: i * 0.2 });
      }
      this.circles.push({ x, z, r: 1.1 });
    }

    // ---------------- PET HATCHERY (east)
    // Eggs stand on a gentle arc, pedestals rising with rarity (basic → cosmic, left to right as you walk in);
    // the incubator arch behind the middle egg is the single focal point.
    const hx = HATCH_X;
    add(G.cylBase(40), { x: hx + 3, y: 0, z: 0, sx: 24, sz: 26, sy: 0.18, color: 0xeef6f1 });
    add(G.cyl(40), { x: hx + 3, y: 0.19, z: 0, sx: 24.3, sz: 26.3, sy: 0.04, color: 0xffc21a, emit: 0.25 });
    add(G.cyl(40), { x: hx + 3, y: 0.2, z: 0, sx: 23.5, sz: 25.5, sy: 0.04, color: 0xeef6f1, ao: false });
    add(G.cyl(40), { x: hx + 3, y: 0.205, z: 0, sx: 19, sz: 21, sy: 0.04, color: 0xe2efe8, ao: false });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; add(G.box(), { x: hx + 3 + Math.cos(a) * 10.4, y: 0.205, z: Math.sin(a) * 11.4, ry: -a, sx: 0.08, sy: 0.04, sz: 1.6, color: 0xd2e3da, ao: false }); }
    // greenhouse dome
    add(G.hemi(20, 6), { x: hx + 11, y: 0, z: 0, sx: 12, sy: 15, sz: 26, color: 0xbff5e0, emit: 0.08 });
    for (let i = -3; i <= 3; i++) add(G.torus(0.5, 0.012, 3, 24), { x: hx + 11, y: 0, z: i * 3.4, rx: 0, sx: 12, sy: 15 * Math.cos(Math.asin(Math.min(0.99, Math.abs(i * 3.4) / 13))), sz: 1, color: 0xffffff });
    this.colliders.push({ minX: hx + 6, maxX: hx + 18, minZ: -14, maxZ: 14 });
    // incubator arch (focal point): stone piers, golden arc, glowing core with a giant egg emblem
    const ax = hx + 4.6;
    for (const s2 of [-1, 1]) {
      box(ax, 3.2, s2 * 3.1, 1.3, 6.4, 1.3, 0xf4f1ea);
      box(ax, 0.3, s2 * 3.1, 1.7, 0.6, 1.7, 0xcfc4b2);
      add(G.box(), { x: ax - 0.67, y: 3.2, z: s2 * 3.1, sx: 0.05, sy: 5.6, sz: 0.2, color: 0xffd23f, emit: 1, ao: false });
    }
    add(G.torus(3.1, 0.38, 6, 28, Math.PI), { x: ax, y: 6.4, z: 0, ry: Math.PI / 2, color: 0xffc21a, mat: 'metal' });
    add(G.cyl(28), { x: ax + 0.2, y: 3.4, z: 0, rz: Math.PI / 2, sx: 4.4, sz: 4.4, sy: 0.12, color: 0xfff1c8, emit: 0.55, ao: false });
    add(G.sphere(16, 12), { x: ax - 0.25, y: 3.5, z: 0, sx: 0.5, sy: 2.6, sz: 1.9, color: 0xffd23f, emit: 0.7 });
    add(G.cylBase(24), { x: ax - 1.6, y: 0.2, z: 0, sx: 3.6, sz: 3.6, sy: 0.12, color: 0xffd23f, emit: 0.4 });
    this.colliders.push({ minX: ax - 0.9, maxX: ax + 0.9, minZ: -3.9, maxZ: -2.3 }, { minX: ax - 0.9, maxX: ax + 0.9, minZ: 2.3, maxZ: 3.9 });
    // egg pedestals: stepped base + column + rarity-coloured rim; taller and richer per tier
    const RARITY = [0x9ad8ff, 0xffd23f, 0xffb200, 0x39ff88, 0x5ff3ff];
    this.eggSlots = [];
    this.eggRarity = RARITY;
    EGGS.forEach((egg, i) => {
      const z = -10 + i * 5, x = hx - 1 + 0.05 * z * z, top = 0.75 + i * 0.22;
      add(G.cylBase(16), { x, y: 0.2, z, sx: 3, sz: 3, sy: 0.22, color: 0xcfc4b2 });
      add(G.cylBase(16), { x, y: 0.42, z, sx: 2.3, sz: 2.3, sy: top - 0.42, color: 0xffffff });
      add(G.cyl(16), { x, y: top + 0.04, z, sx: 2.5, sz: 2.5, sy: 0.08, color: RARITY[i], emit: 1 });
      // tier pips on the front of the base
      for (let k = 0; k <= i; k++) add(G.sphere(6, 4), { x: x - 1.42, y: 0.32, z: z + (k - i / 2) * 0.32, s: 0.16, color: RARITY[i], emit: 1, ao: false });
      if (i >= 3) add(G.torus(1.35, 0.05, 3, 24), { x, y: top + 0.12, z, rx: Math.PI / 2, color: RARITY[i], emit: 1, ao: false });
      this.circles.push({ x, z, r: 1.5 });
      this.eggSlots.push(new THREE.Vector3(x, top + 0.08, z));
    });
    // pet lounge for the "MY PETS" pad: a little cottage with a round door, paw emblem, bed and bowl
    const lx = hx - 1.6, lz = 14;
    box(lx, 0.15, lz, 4.2, 0.3, 4.2, 0xcfc4b2);
    box(lx, 1.4, lz, 3.4, 2.2, 3.4, 0xfff3e6);
    add(G.prism(), { x: lx, y: 2.5, z: lz, sx: 4.1, sy: 1.7, sz: 4.1, color: 0x5ec8e8 });
    add(G.box(), { x: lx, y: 4.2, z: lz, sx: 0.22, sy: 0.16, sz: 4.2, color: 0xffffff, ao: false });
    add(G.cyl(20), { x: lx - 1.71, y: 1.05, z: lz, rz: Math.PI / 2, sx: 1.5, sz: 1.5, sy: 0.04, color: 0x3a2a24, ao: false });
    add(G.torus(0.78, 0.09, 4, 20), { x: lx - 1.72, y: 1.05, z: lz, ry: Math.PI / 2, color: 0xffffff, ao: false });
    add(G.box(), { x: lx - 1.72, y: 0.6, z: lz, sx: 0.05, sy: 0.9, sz: 1.5, color: 0x3a2a24, ao: false });
    add(G.cyl(16), { x: lx - 2.06, y: 3.15, z: lz, rz: Math.PI / 2, sx: 0.9, sz: 0.9, sy: 0.04, color: 0xff8ad8, emit: 0.4, ao: false });
    for (const [dy, dz] of [[0.36, -0.3], [0.48, 0], [0.36, 0.3]]) add(G.cyl(10), { x: lx - 2.08, y: 3.15 + dy, z: lz + dz, rz: Math.PI / 2, sx: 0.22, sz: 0.22, sy: 0.04, color: 0xff8ad8, emit: 0.4, ao: false });
    for (const dz of [-1.1, 1.1]) add(G.cyl(16), { x: lx - 1.71, y: 1.8, z: lz + dz, rz: Math.PI / 2, sx: 0.55, sz: 0.55, sy: 0.04, color: 0x9fd6ff, emit: 0.25, ao: false });
    add(G.cyl(16), { x: lx - 2.9, y: 0.12, z: lz + 1.9, sx: 1.4, sz: 1.1, sy: 0.24, color: 0xff8ad8 });
    add(G.cyl(16), { x: lx - 2.9, y: 0.22, z: lz + 1.9, sx: 1.05, sz: 0.8, sy: 0.06, color: 0xfff1f8, ao: false });
    add(G.cylBase(12), { x: lx - 2.7, z: lz - 2.1, sx: 0.6, sz: 0.6, sy: 0.18, color: 0x5ec8e8 });
    this.circles.push({ x: lx, z: lz, r: 2.2 });

    // ---------------- SOUTH: leaderboard, missions, rebirth
    for (const x of [-11, 11]) {
      box(x, 4.3, -27, 10.6, 6.6, 0.7, 0x1b1d26);
      for (const lx of [-4, 4]) box(x + lx, 0.6, -27, 0.6, 1.2, 0.8, 0x2b2f3a);
      add(G.box(), { x, y: 7.66, z: -26.6, sx: 10.4, sy: 0.1, sz: 0.06, color: x < 0 ? 0xffd23f : 0x39ff88, emit: 1 });
      this.colliders.push({ minX: x - 5.4, maxX: x + 5.4, minZ: -27.6, maxZ: -26.4 });
    }
    add(G.cylBase(24), { x: 0, z: -28, sx: 6, sz: 6, sy: 0.4, color: 0x2b2f3a });
    add(G.cylBase(24), { x: 0, y: 0.4, z: -28, sx: 4.2, sz: 4.2, sy: 0.3, color: 0x3a1f7a });
    add(G.cyl(24), { x: 0, y: 0.72, z: -28, sx: 4.3, sz: 4.3, sy: 0.04, color: 0xb45cff, emit: 1 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      box(Math.cos(a) * 2.6, 1.5, -28 + Math.sin(a) * 2.6, 0.4, 3, 0.4, 0x24104f, { ry: -a });
      add(G.oct(), { x: Math.cos(a) * 2.6, y: 3.2, z: -28 + Math.sin(a) * 2.6, s: 0.45, color: 0xc48cff, emit: 1 });
    }
    this.circles.push({ x: 0, z: -28, r: 3.1 });

    // ---------------- perimeter, decor, skyline
    for (const s of [-1, 1]) {
      box(0, 0.6, s * (H + 1), H * 2 + 2, 1.2, 1, 0xf4f1ea);
      box(s * (H + 1), 0.6, 0, 1, 1.2, H * 2 + 2, 0xf4f1ea);
      add(G.box(), { y: 1.22, z: s * (H + 1), sx: H * 2 + 2, sy: 0.06, sz: 1.02, color: 0xff3d7f, emit: 0.8 });
      add(G.box(), { x: s * (H + 1), y: 1.22, sx: 1.02, sy: 0.06, sz: H * 2 + 2, color: 0x5ff3ff, emit: 0.8 });
    }
    // lamps: irregular spacing along the plaza edges (no mirrored pairs)
    const lamps = [[-8.5, 10.5], [7.5, 9.5], [-9, -12.5], [8, -11], [-17, 18.5], [15, 17], [-29, 15], [28.5, 19.5], [-28, -17], [29, -15.5], [-15.2, -25.5], [14.5, -25.5]];
    const useProp = (name) => this.library?.hasPropReady(name);
    lamps.forEach(([x, z], i) => {
      this.circles.push({ x, z, r: 0.35 });
      if (useProp('lamp')) { this.propSpots.push({ name: 'lamp', x, z, ry: Math.atan2(-x, -z) }); return; }
      add(G.cyl(8), { x, y: 2.5, z, sx: 0.18, sz: 0.18, sy: 5, color: 0x2b2f3a });
      add(G.cyl(8), { x, y: 0.15, z, sx: 0.5, sz: 0.5, sy: 0.3, color: 0x2b2f3a });
      add(G.torus(0.45, 0.07, 4, 16), { x, y: 5.1, z, rx: Math.PI / 2, color: i % 2 ? 0x5ff3ff : 0xff3d7f, emit: 1 });
      add(G.sphere(8, 6), { x, y: 5.1, z, s: 0.45, color: 0xfff6d8, emit: 1 });
    });
    // trees in planters: varied scale and rotation, kept to the plaza edges so they never block the view
    const trees = [[-30, 30, 0.95], [-21.5, 31, 0.82], [21, 30.5, 0.88], [30.5, 29, 1.0], [-31, -31, 0.9], [31, -30.5, 0.85], [-31.5, 23, 0.8], [31.5, 23.5, 0.92], [-19.5, -31.5, 0.86], [21, -31, 0.94], [-8.5, 30.5, 0.78], [8.5, 31, 0.84]];
    for (const [x, z, sc] of trees) {
      box(x, 0.4, z, 2.2, 0.8, 2.2, 0xf4f1ea);
      add(G.cyl(6), { x, y: 0.82, z, sx: 1.9, sz: 1.9, sy: 0.05, color: 0x5a3a22, ao: false });
      this.circles.push({ x, z, r: 1.3 });
      if (useProp('tree')) { this.propSpots.push({ name: 'tree', x, z, y: 0.84, ry: rnd() * 6.28, s: sc }); continue; }
      add(G.cyl(6), { x, y: 1.8 * sc, z, sx: 0.3, sz: 0.3, sy: 2.2 * sc, color: 0x6b4a2b });
      add(G.ico(1), { x, y: 3.6 * sc, z, sx: 2.6 * sc, sy: 2.4 * sc, sz: 2.6 * sc, color: 0x5fbf4a });
    }
    // low planters with shrubs and flowers frame the paths (cheap: a box, a soil cap, 2–3 low-poly shrubs)
    const FLOWERS = [0xff8ad8, 0xffd23f, 0xffffff, 0xb45cff];
    const planter = (x, z, w, d, ry = 0) => {
      box(x, 0.32, z, w, 0.64, d, 0xf4f1ea, { ry });
      add(G.box(), { x, y: 0.66, z, ry, sx: w - 0.24, sy: 0.04, sz: d - 0.24, color: 0x5a3a22, ao: false });
      const n = Math.max(2, Math.round(Math.max(w, d) / 1.3));
      const along = w >= d, len = Math.max(w, d);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5, ox = along ? t * (len - 0.6) : 0, oz = along ? 0 : t * (len - 0.6);
        const c = Math.cos(ry), sn = Math.sin(ry);
        const px = x + ox * c + oz * sn, pz = z - ox * sn + oz * c;
        if (k % 2 === 0) add(G.ico(0), { x: px, y: 0.88, z: pz, sx: 0.66, sy: 0.52, sz: 0.62, ry: rnd() * 3, color: [0x4fae46, 0x5fbf4a, 0x3f9a3f][k % 3] });
        else for (let f = 0; f < 3; f++) add(G.ico(0), { x: px + (rnd() - 0.5) * 0.5, y: 0.8, z: pz + (rnd() - 0.5) * 0.5, s: 0.22, color: FLOWERS[(k + f) % 4], ao: false });
      }
      if (ry === 0) this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      else this.colliders.push({ minX: x - d / 2, maxX: x + d / 2, minZ: z - w / 2, maxZ: z + w / 2 });
    };
    planter(-5.8, 19, 1.2, 4.2); planter(5.8, 23, 1.2, 4.2);               // portal approach (staggered)
    planter(-12.9, -10.4, 3.2, 1.1); planter(-12.9, 10.4, 3.2, 1.1);       // shop forecourt corners
    planter(15.4, -12.6, 3.2, 1.1); planter(13.6, 18.4, 1.1, 3);           // hatchery approach
    planter(-24, -13.4, 4.4, 1.1);                                        // south-west corner
    // benches (imported bench where available) facing the paths
    for (const [x, z, ry] of [[-6.2, -10.2, 0], [6.6, -9.4, 0], [-17.4, 14.2, Math.PI / 2], [11.6, 19.6, -0.4], [26.5, 13.5, Math.PI / 2]]) {
      if (useProp('bench')) { this.propSpots.push({ name: 'bench', x, z, ry }); this.circles.push({ x, z, r: 1.1 }); continue; }
      box(x, 0.5, z, 2.6, 0.14, 0.8, 0x2ec4f1, { ry });
      box(x, 0.25, z, 2.3, 0.5, 0.5, 0x2b2f3a, { ry });
      this.circles.push({ x, z, r: 1.1 });
    }
    // NE pet park: lawn, stepping stones, ball, hydrant, little agility hoop
    add(G.cyl(24), { x: 25, y: 0.02, z: 24, sx: 12.6, sy: 0.04, sz: 10.6, color: 0xcfc4b2, ao: false, vary: 0 });
    add(G.cyl(24), { x: 25, y: 0.035, z: 24, sx: 12, sy: 0.06, sz: 10, color: 0x7cc95a, ao: false, vary: 0.04 });
    for (let k = 0; k < 6; k++) add(G.cyl(9), { x: 17.8 + k * 1.3, y: 0.07, z: 17.6 + k * 0.9, sx: 0.9, sz: 0.75, sy: 0.04, color: 0xcfc4b2, ao: false });
    add(G.sphere(10, 8), { x: 23, y: 0.35, z: 26, s: 0.7, color: 0xff3d7f });
    add(G.cylBase(10), { x: 29, z: 21, sx: 0.5, sz: 0.5, sy: 0.75, color: 0xd7263d });
    add(G.sphere(10, 6), { x: 29, y: 0.78, z: 21, s: 0.5, color: 0xd7263d });
    add(G.torus(1.1, 0.08, 4, 20), { x: 26, y: 1.2, z: 27.5, color: 0xffd23f, emit: 0.2 });
    for (const dx of [-1.15, 1.15]) add(G.box(), { x: 26 + dx, y: 0.6, z: 27.5, sx: 0.1, sy: 1.2, sz: 0.1, color: 0x2b2f3a });
    this.circles.push({ x: 29, z: 21, r: 0.5 }, { x: 26, z: 27.5, r: 1.3 });
    // SW sneaker-care kiosk + vending machines against the west wall
    box(-29.5, 1.4, -24, 3, 2.8, 4.4, 0xf4f1ea);
    add(G.box(), { x: -27.96, y: 1.7, z: -24, sx: 0.06, sy: 1.4, sz: 3.6, color: 0x9ad8ff, emit: 0.5, ao: false });
    add(G.prism(), { x: -29.5, y: 2.8, z: -24, sx: 3.6, sy: 0.9, sz: 5, color: 0x5ab8ef });
    for (const [z, c] of [[-30.4, 0xff3d7f], [-28.6, 0x39ff88]]) {
      box(-32.6, 1.15, z, 1, 2.3, 1.5, 0x34405a);
      add(G.box(), { x: -32.08, y: 1.35, z, sx: 0.04, sy: 1.5, sz: 1.2, color: c, emit: 0.6, ao: false });
    }
    this.colliders.push({ minX: -31.1, maxX: -27.9, minZ: -26.3, maxZ: -21.7 }, { minX: -33.2, maxX: -32, minZ: -31.2, maxZ: -27.8 });
    // seating nooks in the two south quadrants: stone circle, round planter with a small tree, benches facing in
    for (const [nx, nz] of [[-20.5, -21], [21.5, -20]]) {
      add(G.cyl(28), { x: nx, y: 0.012, z: nz, sx: 9, sz: 9, sy: 0.04, color: 0xcfc4b2, ao: false, vary: 0 });
      add(G.cyl(28), { x: nx, y: 0.016, z: nz, sx: 8.2, sz: 8.2, sy: 0.04, color: 0xd9d0bf, ao: false, vary: 0 });
      add(G.cylBase(16), { x: nx, z: nz, sx: 2.4, sz: 2.4, sy: 0.6, color: 0xf4f1ea });
      add(G.cyl(16), { x: nx, y: 0.62, z: nz, sx: 2.1, sz: 2.1, sy: 0.04, color: 0x5a3a22, ao: false });
      this.circles.push({ x: nx, z: nz, r: 1.25 });
      if (useProp('tree')) this.propSpots.push({ name: 'tree', x: nx, z: nz, y: 0.62, ry: nx, s: 0.62 });
      else add(G.ico(1), { x: nx, y: 2.4, z: nz, s: 2, color: 0x5fbf4a });
      for (const a of [0.6, 0.6 + Math.PI]) {
        const bx = nx + Math.cos(a) * 2.9, bz = nz + Math.sin(a) * 2.9, ry = -a + Math.PI / 2;
        if (useProp('bench')) this.propSpots.push({ name: 'bench', x: bx, z: bz, ry: ry + Math.PI });
        else { box(bx, 0.5, bz, 2.6, 0.14, 0.8, 0x2ec4f1, { ry }); box(bx, 0.25, bz, 2.3, 0.5, 0.5, 0x2b2f3a, { ry }); }
        this.circles.push({ x: bx, z: bz, r: 1.1 });
      }
    }
    // bike rack with two bikes (east of the portal approach)
    for (let k = 0; k < 4; k++) add(G.torus(0.42, 0.04, 3, 12, Math.PI), { x: 12 + k * 0.9, y: 0, z: 27.5, ry: Math.PI / 2, color: 0x8f97a6, mat: 'metal' });
    for (const [bx, c] of [[12.45, 0xff3d7f], [14.25, 0x3fa9f5]]) {
      for (const dz of [-0.55, 0.55]) add(G.torus(0.36, 0.05, 3, 14), { x: bx, y: 0.4, z: 27.5 + dz, ry: Math.PI / 2, color: 0x2b2f3a });
      add(G.box(), { x: bx, y: 0.62, z: 27.5, rx: 0.25, sx: 0.06, sy: 0.06, sz: 1.1, color: c });
      add(G.box(), { x: bx, y: 0.88, z: 27.25, sx: 0.08, sy: 0.05, sz: 0.3, color: 0x2b2f3a });
    }
    this.colliders.push({ minX: 11.6, maxX: 15, minZ: 26.8, maxZ: 28.2 });
    // painted markings: a hopscotch near the portal approach and parking-style hatching near the boards
    for (let k = 0; k < 6; k++) { const two = k === 2 || k === 4; for (const dx of two ? [-0.5, 0.5] : [0]) flat(-11 + dx, 0.012, 17 + k * 1.05, 0.9, 0.9, 0xffffff, { ao: false }); flat(-11, 0.01, 17 + k * 1.05, two ? 2.1 : 1.1, 1.05, 0xb8c0cc, { ao: false }); }
    for (let k = 0; k < 5; k++) flat(24.6 + k * 1.05, 0.012, -30.4, 0.35, 2.6, 0xffd23f, { ry: 0.5, ao: false });

    // half court + hoop
    flat(-22, 0.02, 24, 12, 10, 0x2a5fa8);
    flat(-22, 0.03, 24, 0.1, 10, 0xffffff);
    add(G.torus(2, 0.06, 3, 28), { x: -22, y: 0.04, z: 24, rx: Math.PI / 2, color: 0xffffff, ao: false });
    add(G.cyl(8), { x: -28, y: 2, z: 24, sx: 0.25, sz: 0.25, sy: 4, color: 0x2b2f3a });
    box(-27.6, 4.2, 24, 0.12, 1.4, 2, 0xffffff);
    add(G.torus(0.35, 0.04, 4, 14), { x: -27.1, y: 3.8, z: 24, rx: Math.PI / 2, color: 0xff7a2f });
    this.circles.push({ x: -28, z: 24, r: 0.4 });
    // poster lightboxes along the north wall (artwork is drawn in buildPosters())
    this.posterSlots = [];
    const lightbox = (x, y, z, ry, w, h, trim) => {
      const sn = Math.sin(ry), cs = Math.cos(ry);
      const off = (d) => ({ x: x + sn * d, z: z + cs * d });
      box(x, y, z, w + 0.36, h + 0.36, 0.36, 0x1b1d26, { ry });
      for (const dy of [-1, 1]) add(G.box(), { ...off(0.19), y: y + dy * (h / 2 + 0.1), ry, sx: w + 0.2, sy: 0.07, sz: 0.04, color: trim, emit: 1, ao: false });
      this.posterSlots.push({ ...off(0.185), y, ry, w, h });
    };
    const trims = [0xff3d7f, 0x5ff3ff, 0xffd23f];
    let slot = 0;
    for (let i = 0; i < 12; i++) {
      const x = -H + 3 + i * 5.5;
      if (Math.abs(x) < 7) continue;
      lightbox(x, 2.7, H + 0.55, Math.PI, 4.6, 3.1, trims[slot++ % 3]);
      // small floor uplights under each poster
      add(G.cbox(0.3), { x, y: 0.12, z: H - 0.05, sx: 1.2, sy: 0.16, sz: 0.3, color: 0x2b2f3a });
      add(G.box(), { x, y: 0.21, z: H - 0.2, sx: 1, sy: 0.02, sz: 0.04, color: 0xfff6d8, emit: 1, ao: false });
    }
    // shop exterior: lightbox ads on both outer side walls
    lightbox(SHOP_X + 1, 4.4, -9.36, Math.PI, 7, 4.6, 0x9ad8ff);
    lightbox(SHOP_X + 1, 4.4, 9.36, 0, 7, 4.6, 0x9ad8ff);
    // shop exterior: two illuminated pedestal showcases with spotlights + neon threshold
    this.showcaseSlots = [];
    for (const zz of [-6.4, 6.4]) {
      const x = SHOP_X + 10.6;
      add(G.cylBase(18), { x, z: zz, sx: 1.8, sz: 1.8, sy: 0.9, color: 0xf4f1ea });
      add(G.cyl(18), { x, y: 0.92, z: zz, sx: 1.9, sz: 1.9, sy: 0.06, color: 0x9ad8ff, emit: 1, ao: false });
      add(G.cyl(18), { x, y: 0.2, z: zz, sx: 1.85, sz: 1.85, sy: 0.05, color: 0x9ad8ff, emit: 0.6, ao: false });
      this.circles.push({ x, z: zz, r: 1.05 });
      this.showcaseSlots.push(new THREE.Vector3(x, 0.96, zz));
    }
    add(G.box(), { x: SHOP_X + 7.05, y: 0.11, sx: 0.12, sy: 0.04, sz: 11, color: 0x9ad8ff, emit: 1, ao: false });
    for (const zz of [-6.4, 6.4]) {
      // spot heads on the facade header aimed at the showcases
      add(G.cyl(8), { x: SHOP_X + 7.2, y: 6.05, z: zz, rz: -0.6, sx: 0.36, sz: 0.36, sy: 0.5, color: 0x1b1d26 });
      add(G.cyl(8), { x: SHOP_X + 7.36, y: 5.85, z: zz, rz: -0.6, sx: 0.28, sz: 0.28, sy: 0.06, color: 0xfff6d8, emit: 1, ao: false });
    }
    // skyline ring: cheap boxes with a base storey, recessed entrance, cornice/ledges, varied window
    // treatments (bands, columns, grids) and rooftop details — enough depth to stop them reading as flat slabs
    const FACADES = [0xdfe6f2, 0xc9d6ea, 0xf2e6da, 0xb8c6dd, 0xe8dff2, 0xd9e8e0, 0xf0dccb];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rnd() * 0.05;
      const r = 70 + rnd() * 50;
      const w = 10 + rnd() * 12, h = 14 + rnd() * 55, d = 10 + rnd() * 10;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, ry = -a;
      const col = FACADES[Math.floor(rnd() * FACADES.length)];
      const F = b.frame(x, 0, z, ry);                  // local frame: −x faces the plaza
      const P = (o) => add(o.geo, { ...o, parent: F });
      P({ geo: G.boxBase(), sx: d, sy: h, sz: w, color: col, aoH: 30 });
      P({ geo: G.boxBase(), x: -d / 2 - 0.15, sx: 0.4, sy: 4, sz: w + 0.3, color: 0x8f97a6, ao: false });          // base storey
      P({ geo: G.box(), x: -d / 2 - 0.2, y: 1.6, sx: 0.12, sy: 3.2, sz: Math.min(4, w * 0.3), color: 0x3b4558, ao: false }); // entrance recess
      P({ geo: G.box(), x: -d / 2 - 0.5, y: 3.3, sx: 1, sy: 0.18, sz: Math.min(5, w * 0.4), color: [0xd7263d, 0x3d6fd9, 0x2fa86b, 0xffb21a][i % 4], ao: false }); // awning
      P({ geo: G.box(), y: h + 0.2, sx: d + 0.5, sy: 0.5, sz: w + 0.5, color: 0xf4f1ea, ao: false });               // cornice
      const style = i % 3, win = rnd() < 0.5 ? 0x9fc6ff : 0x8fb3dd;
      const nRows = Math.floor((h - 5) / 3.6);
      if (style === 0) {
        for (let k = 0; k < nRows; k++) P({ geo: G.box(), x: -d / 2 - 0.05, y: 5.6 + k * 3.6, sx: 0.1, sy: 1.3, sz: w * 0.84, color: k % 4 === 1 ? 0xfff1b8 : win, emit: 0.22, ao: false });
      } else if (style === 1) {
        const cols = Math.max(2, Math.floor(w / 3));
        for (let c = 0; c < cols; c++) P({ geo: G.box(), x: -d / 2 - 0.05, y: 4.5 + (h - 5) / 2, z: -w / 2 + (c + 0.5) * (w / cols), sx: 0.1, sy: h - 6, sz: (w / cols) * 0.45, color: win, emit: 0.22, ao: false });
      } else {
        const cols = Math.max(2, Math.floor(w / 3.2));
        for (let k = 0; k < nRows; k += 1) for (let c = 0; c < cols; c++) if (rnd() < 0.85) P({ geo: G.box(), x: -d / 2 - 0.05, y: 5.6 + k * 3.6, z: -w / 2 + (c + 0.5) * (w / cols), sx: 0.1, sy: 1.5, sz: (w / cols) * 0.6, color: rnd() < 0.15 ? 0xfff1b8 : win, emit: 0.22, ao: false });
      }
      if (h > 30) P({ geo: G.box(), x: -d / 2 - 0.25, y: h * 0.55, sx: 0.5, sy: 0.25, sz: w + 0.1, color: 0xf4f1ea, ao: false }); // mid ledge
      // rooftop: water tank, AC boxes or a stepped crown with an antenna
      const roof = rnd();
      if (roof < 0.35) P({ geo: G.cylBase(10), x: d * 0.15, y: h + 0.4, sx: Math.min(4, w * 0.3), sz: Math.min(4, w * 0.3), sy: 3, color: 0xb8c0cc });
      else if (roof < 0.7) for (let k = 0; k < 2; k++) P({ geo: G.boxBase(), x: (rnd() - 0.3) * d * 0.5, y: h + 0.4, z: (rnd() - 0.5) * w * 0.5, sx: 2, sy: 1.2, sz: 2.6, color: 0xa8b0bc });
      else {
        P({ geo: G.boxBase(), y: h + 0.4, sx: d * 0.6, sy: 3, sz: w * 0.6, color: col });
        P({ geo: G.cylBase(5), y: h + 3.4, sx: 0.3, sz: 0.3, sy: 6, color: 0x8f97a6 });
      }
    }

    const mesh = new THREE.Mesh(b.geometry(), this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.staticMesh = mesh;

    this.buildDynamic();
  }

  buildDynamic() {
    const g = this.group;
    // portal surface
    this.portalUniforms = { t: { value: 0 } };
    const portalMat = new THREE.ShaderMaterial({
      uniforms: this.portalUniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float t; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; p.y *= 1.15;
          float r = length(p), a = atan(p.y, p.x);
          float swirl = sin(a * 5.0 + r * 18.0 - t * 4.0) * 0.5 + 0.5;
          float rings = sin(r * 40.0 - t * 6.0) * 0.5 + 0.5;
          vec3 c1 = vec3(0.37, 0.95, 1.0), c2 = vec3(1.0, 0.24, 0.5), c3 = vec3(0.7, 0.36, 1.0);
          vec3 col = mix(mix(c3, c1, swirl), c2, rings * 0.35);
          col += (1.0 - smoothstep(0.0, 0.35, r)) * 0.9;
          float edge = 1.0 - smoothstep(0.42, 0.5, r);
          gl_FragColor = vec4(col, edge * 0.92);
          #include <colorspace_fragment>
        }`,
    });
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 8.2), portalMat);
    portal.position.set(0, 4.4, PORTAL_Z);
    g.add(portal);
    this.anim.push((dt) => { this.portalUniforms.t.value += dt; });
    const runSign = neonSign('RUN', { width: 6, color: '#5ff3ff', sub: 'ENTER THE TRACK ▶' });
    runSign.position.set(0, 11.4, PORTAL_Z - 0.2);
    runSign.rotation.y = Math.PI;
    g.add(runSign);

    // signs
    const shopSign = neonSign('SNEAKER SHOP', { width: 11, color: '#9ad8ff' });
    shopSign.position.set(SHOP_X + 7.05, 7.1, 0);
    shopSign.rotation.y = Math.PI / 2;
    g.add(shopSign);
    const petSign = neonSign('PET HATCHERY', { width: 10, color: '#ffd23f' });
    petSign.position.set(HATCH_X + 4.2, 10.9, 0);
    petSign.rotation.y = -Math.PI / 2;
    g.add(petSign);
    const rbSign = neonSign('REBIRTH', { width: 5, color: '#b45cff' });
    rbSign.position.set(0, 5.6, -28);
    g.add(rbSign);
    this.rebirthSign = rbSign;

    // shoe wall displays
    this.displays = [];
    this.shelfMeshes = SNEAKERS.map((s, i) => {
      const m = this.display(s.id);
      m.position.copy(this.shelfSlots[i]);
      m.scale.setScalar(3.4);
      m.rotation.y = 1.0; // three-quarter view toward the shop entrance
      g.add(m);
      return m;
    });
    // feature podium + label
    this.feature = this.display('street');
    this.feature.scale.setScalar(4.2);
    this.feature.position.set(SHOP_X + 2.5, 0.95, 0);
    g.add(this.feature);
    this.featureLabel = floatingLabel('NEXT UPGRADE', { scale: 2.6 });
    this.fadeLabels.push(this.featureLabel.sprite);
    this.featureLabel.sprite.position.set(SHOP_X + 2.5, 3.6, 0);
    g.add(this.featureLabel.sprite);
    this.anim.push((dt) => { this.feature.rotation.y += dt * 0.9; });
    // window displays
    for (const s of [-1, 1]) {
      const m = this.display(s < 0 ? 'retro' : 'airsprint');
      m.scale.setScalar(3.2);
      m.position.set(SHOP_X + 6.6, 1.25, s * 7.15);
      g.add(m);
      this.anim.push((dt) => { m.rotation.y += dt * 0.6 * s; });
      this.windowShoes = (this.windowShoes || []).concat(m);
    }
    // neon sneaker-outline signs either side of the shop name
    for (const zz of [-7.7, 7.7]) {
      const n = neonSneakerSign(3.4, '#9ad8ff', '#ffffff');
      n.position.set(SHOP_X + 7.06, 7.1, zz);
      n.rotation.y = Math.PI / 2;
      if (zz < 0) n.scale.x = -1; // mirrored pair, toes pointing outward
      g.add(n);
    }
    // outdoor showcases with spotlight beams
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    ['carbon', 'plasma'].forEach((id, i) => {
      const slotPos = this.showcaseSlots[i];
      const m = this.display(id);
      m.scale.setScalar(4);
      m.position.copy(slotPos);
      g.add(m);
      this.anim.push((dt, t) => { m.rotation.y = t * 0.6 + i * Math.PI; m.position.y = slotPos.y + 0.12 + Math.sin(t * 1.6 + i) * 0.06; });
      const from = new THREE.Vector3(SHOP_X + 7.36, 5.85, slotPos.z), to = slotPos.clone().setY(0.95);
      const len = from.distanceTo(to);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, len, 20, 1, true), beamMat);
      beam.position.copy(from).lerp(to, 0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
      beam.renderOrder = 3;
      g.add(beam);
    });

    // giant roof sneaker (equipped pair)
    this.roofShoe = this.display('starter');
    this.roofShoe.scale.setScalar(11);
    this.roofShoe.position.set(SHOP_X, 8.7, 0);
    g.add(this.roofShoe);
    this.anim.push((dt, t) => { this.roofShoe.rotation.y += dt * 0.35; this.roofShoe.position.y = 8.8 + Math.sin(t * 1.3) * 0.2; });

    // eggs
    this.eggMeshes = EGGS.map((egg, i) => {
      const m = makeEggMesh(egg);
      m.scale.setScalar(1.6);
      m.position.copy(this.eggSlots[i]);
      g.add(m);
      const lab = floatingLabel(egg.name.toUpperCase(), { sub: formatMoney(egg.price), color: '#' + new THREE.Color(this.eggRarity[i]).getHexString(), scale: 2.3 });
      lab.sprite.position.set(this.eggSlots[i].x, this.eggSlots[i].y + 2.75, this.eggSlots[i].z);
      this.fadeLabels.push(lab.sprite);
      g.add(lab.sprite);
      this.anim.push((dt, t) => { m.rotation.z = Math.sin(t * 2 + i) * 0.05; m.rotation.y += dt * 0.4; });
      return m;
    });

    // boards
    this.board = canvasTexture(1024, 620);
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 5.93), new THREE.MeshBasicMaterial({ map: this.board.texture, toneMapped: false, fog: false }));
    lb.position.set(-11, 4.3, -26.62);
    g.add(lb);
    this.mboard = canvasTexture(1024, 620);
    const mb = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 5.93), new THREE.MeshBasicMaterial({ map: this.mboard.texture, toneMapped: false, fog: false }));
    mb.position.set(11, 4.3, -26.62);
    g.add(mb);

    // rebirth ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.09, 6, 40), new THREE.MeshBasicMaterial({ color: 0xc48cff, toneMapped: false }));
    ring.position.set(0, 3.2, -28);
    g.add(ring);
    const ring2 = ring.clone();
    ring2.scale.setScalar(0.7);
    g.add(ring2);
    this.anim.push((dt, t) => { ring.rotation.x = t * 0.7; ring.rotation.y = t * 0.5; ring2.rotation.x = -t; ring2.rotation.z = t * 0.6; });
    this.rebirthRings = [ring, ring2];

    // interaction pads
    const pad = (id, x, z, label, color, r = 1.8, sub = '') => {
      const ringMesh = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(x, 0.12, z);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r - 0.25, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.11, z);
      g.add(ringMesh, disc);
      const lab = floatingLabel(label, { color: '#' + new THREE.Color(color).getHexString(), scale: 2.3, sub });
      this.fadeLabels.push(lab.sprite);
      lab.sprite.position.set(x, 2.6, z);
      g.add(lab.sprite);
      const zone = { id, x, z, r, title: label, ring: ringMesh, disc, label: lab, inside: false };
      this.zones.push(zone);
      this.anim.push((dt, t) => {
        const k = zone.inside ? 1.12 : 1 + Math.sin(t * 3 + x) * 0.04;
        ringMesh.scale.setScalar(k);
        lab.sprite.position.y = 2.6 + Math.sin(t * 2 + z) * 0.12;
      });
      return zone;
    };
    pad('shop', SHOP_X + 9.2, 0, 'SNEAKER SHOP', 0x9ad8ff, 2.2, 'speed upgrades');
    EGGS.forEach((egg, i) => pad('egg:' + egg.id, this.eggSlots[i].x - 3.2, this.eggSlots[i].z, egg.name.toUpperCase(), this.eggRarity[i], 1.5));
    pad('pets', HATCH_X - 5.6, 14, 'MY PETS', 0xff8ad8, 1.6, 'equip & manage');
    pad('stats', -11, -22.5, 'RECORDS', 0xffd23f, 1.7);
    pad('missions', 11, -22.5, 'MISSIONS', 0x39ff88, 1.7, 'daily • gems');
    this.rebirthZone = pad('rebirth', 0, -23.4, 'REBIRTH', 0xb45cff, 1.6);
    // egg labels are on the pedestal signs; hide their pad labels for clarity
    for (const z of this.zones) if (z.id.startsWith('egg:')) z.label.sprite.visible = false;
  }

  /** Draw the poster artwork (needs the thumbnail renderer for real sneaker renders). */
  buildPosters(thumbs) {
    const getShoe = (id) => thumbs.sneakerCanvas(id);
    const shopPosters = [POSTERS[0], POSTERS[5]];
    this.posterSlots.forEach((slot, i) => {
      const p = i < this.posterSlots.length - 2 ? POSTERS[i % POSTERS.length] : shopPosters[i - (this.posterSlots.length - 2)];
      const { canvas, ctx, texture } = canvasTexture(512, Math.round(512 * (slot.h / slot.w)));
      drawPoster(ctx, canvas.width, canvas.height, p, getShoe);
      texture.needsUpdate = true;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(slot.w, slot.h), new THREE.MeshBasicMaterial({ map: texture, color: 0xe8e8e8, toneMapped: false }));
      mesh.position.set(slot.x, slot.y, slot.z);
      mesh.rotation.y = slot.ry;
      this.group.add(mesh);
    });
  }

  // ------------------------------------------------------- sneaker displays --
  /** A display holder: its child is the sneaker model (GLB clone or procedural fallback). */
  display(id) {
    const holder = new THREE.Group();
    this.displays.push(holder);
    this.setDisplay(holder, id, false);
    return holder;
  }

  setDisplay(holder, id, locked = false) {
    const src = this.library.isSneakerReady(id) ? 'glb' : 'proc';
    const key = id + ':' + src + ':' + locked;
    if (holder.userData.key === key) return;
    holder.userData = { key, id, locked };
    holder.clear();
    const shoe = this.library.createSneaker(id);
    if (locked) shoe.traverse((o) => { if (o.isMesh) o.material = silhouetteMaterial; });
    holder.add(shoe);
  }

  /** Place imported props (tree / bench / lamp) at the spots reserved during build(). */
  placeProps() {
    for (const spot of this.propSpots) {
      const o = this.library.createProp(spot.name);
      if (!o) continue;
      o.position.set(spot.x, spot.y || 0, spot.z);
      o.rotation.y = spot.ry || 0;
      if (spot.s) o.scale.multiplyScalar(spot.s);
      this.group.add(o);
    }
  }

  /** Intentional lighting for the key areas (quality presets can switch it off). */
  buildLights() {
    const L = new THREE.Group();
    const shop = new THREE.SpotLight(0xfff1d6, 260, 26, 0.75, 0.6, 2);
    shop.position.set(SHOP_X + 11, 9, 0);
    shop.target.position.set(SHOP_X + 2, 0, 0);
    L.add(shop, shop.target);
    const hatch = new THREE.PointLight(0xffd98a, 110, 18, 2);
    hatch.position.set(HATCH_X + 1.5, 5.5, 0);   // lights the egg arc and the incubator arch
    const door = new THREE.PointLight(0xfff1d6, 60, 12, 2);
    door.position.set(SHOP_X + 9, 4.6, 0);       // warm pool of light under the shop canopy
    L.add(door);
    const portal = new THREE.PointLight(0x9a7cff, 80, 16, 2);
    portal.position.set(0, 4, PORTAL_Z - 3);
    L.add(hatch, portal);
    this.anim.push((dt, t) => { portal.intensity = 70 + Math.sin(t * 2.2) * 18; portal.color.setHSL(0.72 + Math.sin(t * 0.7) * 0.08, 0.9, 0.65); });
    this.group.add(L);
    this.lights = L;
  }

  setLightsEnabled(on) { if (this.lights) this.lights.visible = on; }

  // ---------------------------------------------------------------- dynamic --
  refresh(state) {
    const owned = new Set(state.sneakers.owned);
    const next = SNEAKERS.find((s) => !owned.has(s.id));
    this.shelfMeshes.forEach((m, i) => {
      const s = SNEAKERS[i];
      this.setDisplay(m, s.id, !(owned.has(s.id) || s === next));
    });
    if (next) {
      this.setDisplay(this.feature, next.id);
      this.featureLabel.set(next.name.toUpperCase(), formatMoney(next.price), '#9ad8ff');
    } else {
      this.setDisplay(this.feature, 'quantum');
      this.featureLabel.set('ALL COLLECTED!', '👑', '#ffd23f');
    }
    this.setDisplay(this.roofShoe, state.sneakers.equipped);
    for (const d of this.displays) this.setDisplay(d, d.userData.id, d.userData.locked); // pick up newly loaded GLBs
    const rb = canRebirth(state);
    this.rebirthZone.label.set(rb ? 'REBIRTH READY!' : 'REBIRTH', rb ? 'tap to view' : 'locked', rb ? '#ff8ad8' : '#b45cff');
    for (const r of this.rebirthRings) r.material.color.set(rb ? 0xff8ad8 : 0x6a4a9a);
    this.drawLeaderboard(state);
  }

  drawLeaderboard(state) {
    const { ctx, canvas, texture } = this.board;
    const W = canvas.width, H = canvas.height;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1b1440'); grd.addColorStop(1, '#0d0a20');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `64px ${FONT}`;
    ctx.fillStyle = '#ffd23f';
    ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 20;
    ctx.fillText('🏆 YOUR RECORDS', W / 2, 62);
    ctx.shadowBlur = 0;
    const sneaker = SNEAKER_BY_ID[state.sneakers.equipped];
    const rows = [
      ['BEST DISTANCE', fmtDist(state.stats.bestDistance), '#5ff3ff'],
      ['MONEY', formatMoney(state.money), '#7dff6a'],
      ['TOTAL EARNED', formatMoney(state.stats.totalEarned), '#7dff6a'],
      ['SNEAKERS', `${sneaker.name}  (tier ${sneaker.index + 1}/14)`, '#9ad8ff'],
      ['TOP SPEED', `${Math.round(state.stats.topSpeed)} km/h`, '#ff8ad8'],
      ['PET BONUS', `x${petMultiplier(state).toFixed(2)}`, '#ffd23f'],
      ['RUNS / REBIRTHS', `${formatNumber(state.stats.runs)} / ${state.rebirth.count}`, '#ffffff'],
    ];
    rows.forEach(([k, v, c], i) => {
      const y = 140 + i * 58;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)';
      roundRect(ctx, 40, y - 25, W - 80, 50, 12); ctx.fill();
      ctx.textAlign = 'left'; ctx.font = `34px ${FONT}`; ctx.fillStyle = '#b8c2cc';
      ctx.fillText(k, 64, y);
      ctx.textAlign = 'right'; ctx.font = `38px ${FONT}`; ctx.fillStyle = c;
      ctx.fillText(v, W - 64, y);
    });
    ctx.textAlign = 'center'; ctx.font = `28px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('🌍 ONLINE RANKINGS — COMING SOON', W / 2, H - 34);
    texture.needsUpdate = true;
  }

  drawMissions(missions, dailyReady) {
    const { ctx, canvas, texture } = this.mboard;
    const W = canvas.width, H = canvas.height;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0f2a22'); grd.addColorStop(1, '#0a1a16');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = `64px ${FONT}`; ctx.fillStyle = '#39ff88';
    ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 20;
    ctx.fillText('🎯 MISSIONS', W / 2, 62);
    ctx.shadowBlur = 0;
    missions.forEach((m, i) => {
      const y = 160 + i * 120;
      ctx.fillStyle = m.complete ? 'rgba(57,255,136,0.18)' : 'rgba(255,255,255,0.07)';
      roundRect(ctx, 40, y - 48, W - 80, 100, 16); ctx.fill();
      ctx.textAlign = 'left'; ctx.font = `36px ${FONT}`; ctx.fillStyle = '#ffffff';
      ctx.fillText(m.text, 66, y - 16);
      const p = Math.min(1, m.progress / m.target);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(ctx, 66, y + 16, W - 330, 20, 10); ctx.fill();
      ctx.fillStyle = m.complete ? '#39ff88' : '#ffd23f'; roundRect(ctx, 66, y + 16, Math.max(20, (W - 330) * p), 20, 10); ctx.fill();
      ctx.textAlign = 'right'; ctx.font = `34px ${FONT}`; ctx.fillStyle = m.complete ? '#39ff88' : '#ffd23f';
      ctx.fillText(m.complete ? 'CLAIM!' : `${Math.round(p * 100)}%`, W - 66, y + 4);
    });
    ctx.textAlign = 'center'; ctx.font = `32px ${FONT}`; ctx.fillStyle = dailyReady ? '#ffd23f' : 'rgba(255,255,255,0.45)';
    ctx.fillText(dailyReady ? '🎁 DAILY REWARD READY!' : '🎁 Daily reward claimed — come back tomorrow', W / 2, H - 40);
    texture.needsUpdate = true;
  }

  // ------------------------------------------------------------- physics --
  /** Push a circle (player) out of every collider. */
  collide(p, r) {
    const H = LOBBY.halfSize - 0.2;
    p.x = Math.max(-H, Math.min(H, p.x));
    p.z = Math.max(-H, Math.min(H, p.z));
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-5) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
    }
    for (const a of this.colliders) {
      const cx = Math.max(a.minX, Math.min(p.x, a.maxX)), cz = Math.max(a.minZ, Math.min(p.z, a.maxZ));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the shortest axis
          const pen = [p.x - a.minX, a.maxX - p.x, p.z - a.minZ, a.maxZ - p.z];
          const i = pen.indexOf(Math.min(...pen));
          if (i === 0) p.x = a.minX - r; else if (i === 1) p.x = a.maxX + r; else if (i === 2) p.z = a.minZ - r; else p.z = a.maxZ + r;
        }
      }
    }
  }

  inPortal(p) {
    return Math.abs(p.x) < 3.6 && p.z > PORTAL_Z - 1.2;
  }

  zoneAt(p) {
    for (const z of this.zones) if (Math.hypot(p.x - z.x, p.z - z.z) < z.r) return z;
    return null;
  }

  update(dt) {
    this.t += dt;
    for (const f of this.anim) f(dt, this.t);
    // world labels stay readable nearby but recede with distance, so they never dominate the plaza
    if (this.viewer) {
      for (const sp of this.fadeLabels) {
        const d = Math.hypot(sp.position.x - this.viewer.x, sp.position.z - this.viewer.z);
        sp.material.opacity = Math.max(0.2, Math.min(1, 1 - (d - 12) / 14));
      }
    }
  }

  setVisible(v) { this.group.visible = v; }
}

export function fmtDist(m) {
  if (m >= 1000) return (m / 1000).toFixed(m >= 100000 ? 1 : 2) + ' KM';
  return Math.floor(m) + ' M';
}

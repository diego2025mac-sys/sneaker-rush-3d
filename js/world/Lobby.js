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

export const LOBBY_PALETTE = {
  skyTop: 0x3d9cff, skyBottom: 0xd6efff, fog: 0xcde8ff, fogNear: 70, fogFar: 260,
  sun: 0xfff2dc, sunI: 2.5, hemiSky: 0xd8ecff, hemiGround: 0x9a8f80, hemiI: 1.2, stars: 0,
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

    // ---------------- floor
    add(G.box(), { y: -0.25, sx: H * 2 + 6, sy: 0.5, sz: H * 2 + 6, color: 0xe4e7ee, ao: false, vary: 0.0 });
    // checker tiles
    for (let x = -H; x < H; x += 4) for (let z = -H; z < H; z += 4) {
      if (((x + z) / 4) % 2 === 0) flat(x + 2, 0.005, z + 2, 3.96, 3.96, 0xd6dae3, { vary: 0.01 });
    }
    // central stage: concentric rings + running-track oval
    add(G.cyl(48), { y: 0.02, sx: 30, sz: 30, sy: 0.04, color: 0xd9553b, ao: false, vary: 0 });
    for (const r of [26.6, 24.4, 22.2]) add(G.cyl(48), { y: 0.03 + (26.6 - r) * 0.001, sx: r, sz: r, sy: 0.04, color: r === 22.2 ? 0xffffff : 0xd9553b, ao: false, vary: 0 });
    add(G.cyl(48), { y: 0.045, sx: 21.6, sz: 21.6, sy: 0.04, color: 0x2b2f3a, ao: false, vary: 0 });
    add(G.cyl(48), { y: 0.05, sx: 14, sz: 14, sy: 0.04, color: 0x3a3f4d, ao: false, vary: 0 });
    add(G.cyl(48), { y: 0.055, sx: 8, sz: 8, sy: 0.04, color: 0xff3d7f, ao: false, vary: 0, emit: 0.15 });
    add(G.cyl(48), { y: 0.06, sx: 6.6, sz: 6.6, sy: 0.04, color: 0x1b1d26, ao: false, vary: 0 });
    // lane lines on the oval
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      for (const r of [12.2, 13.3]) flat(Math.cos(a) * r, 0.065, Math.sin(a) * r, 0.08, 0.9, 0xffffff, { ry: -a });
    }
    // paths to each area
    flat(-13, 0.012, 0, 8, 5, 0x9ad8ff);    // to shop
    flat(13, 0.012, 0, 8, 5, 0xffd23f);     // to hatchery
    flat(0, 0.012, -18, 5, 8, 0xb45cff);    // to boards

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
    box(sx, 8.35, 0, 14.2, 0.7, 19.4, 0x2b2f3a);                      // roof
    add(G.box(), { x: sx + 7.12, y: 8.35, sx: 0.06, sy: 0.16, sz: 19.4, color: 0x9ad8ff, emit: 1 });
    box(sx + 6.6, 7.1, 0, 0.8, 1.9, 19, 0x1b1d26);                    // facade header
    for (const z of [-8.6, 8.6, -5.7, 5.7]) box(sx + 6.6, 3.1, z, 0.9, 6.2, 0.7, 0x1b1d26);
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
    // try-on benches + counter
    for (const z of [-3.5, 3.5]) { box(sx - 1, 0.45, z, 3.2, 0.3, 1, 0xff3d7f); box(sx - 1, 0.2, z, 3, 0.4, 0.8, 0x2b2f3a); }
    box(sx - 3.2, 0.6, -6.7, 2.4, 1.2, 2.4, 0x2b2f3a);
    box(sx - 3.2, 1.25, -6.7, 2.6, 0.12, 2.6, 0xffffff);
    this.colliders.push({ minX: sx - 4.5, maxX: sx - 1.9, minZ: -8, maxZ: -5.4 });
    // feature podium (next upgrade)
    add(G.cylBase(20), { x: sx + 2.5, y: 0.1, z: 0, sx: 2.6, sz: 2.6, sy: 0.7, color: 0xffffff });
    add(G.cyl(20), { x: sx + 2.5, y: 0.82, z: 0, sx: 2.7, sz: 2.7, sy: 0.06, color: 0x9ad8ff, emit: 1 });
    this.circles.push({ x: sx + 2.5, z: 0, r: 1.5 });
    // shoe-box stacks outside
    for (const [x, z, n] of [[-15, -11.5, 4], [-14, -12.8, 2], [-15.5, 11.5, 3]]) {
      for (let i = 0; i < n; i++) {
        box(x, 0.35 + i * 0.62, z, 1.6, 0.6, 1, 0xff7a2f, { ry: i * 0.2 });
        box(x, 0.66 + i * 0.62, z, 1.66, 0.08, 1.06, 0xffffff, { ry: i * 0.2 });
      }
      this.circles.push({ x, z, r: 1.1 });
    }

    // ---------------- PET HATCHERY (east)
    const hx = HATCH_X;
    add(G.cylBase(40), { x: hx + 3, y: 0, z: 0, sx: 24, sz: 26, sy: 0.18, color: 0xf2fbf6 });
    add(G.cyl(40), { x: hx + 3, y: 0.19, z: 0, sx: 24.3, sz: 26.3, sy: 0.04, color: 0xffd23f, emit: 0.3 });
    // greenhouse dome
    add(G.hemi(20, 6), { x: hx + 11, y: 0, z: 0, sx: 12, sy: 15, sz: 26, color: 0xbff5e0, emit: 0.08 });
    for (let i = -3; i <= 3; i++) add(G.torus(0.5, 0.012, 3, 24), { x: hx + 11, y: 0, z: i * 3.4, rx: 0, sx: 12, sy: 15 * Math.cos(Math.asin(Math.min(0.99, Math.abs(i * 3.4) / 13))), sz: 1, color: 0xffffff });
    this.colliders.push({ minX: hx + 6, maxX: hx + 18, minZ: -14, maxZ: 14 });
    // egg pedestals
    this.eggSlots = [];
    EGGS.forEach((egg, i) => {
      const z = -8 + i * 4;
      add(G.cylBase(16), { x: hx, y: 0.2, z, sx: 2.4, sz: 2.4, sy: 0.9, color: 0xffffff });
      add(G.cyl(16), { x: hx, y: 1.12, z, sx: 2.5, sz: 2.5, sy: 0.08, color: [0x9ad8ff, 0xffd23f, 0xffb200, 0x39ff88, 0x5ff3ff][i], emit: 1 });
      this.circles.push({ x: hx, z, r: 1.3 });
      this.eggSlots.push(new THREE.Vector3(hx, 1.16, z));
    });
    // doghouse for the "MY PETS" pad
    box(hx - 2, 1, 13.5, 3, 2, 3, 0xff7a2f);
    add(G.prism(), { x: hx - 2, y: 2, z: 13.5, ry: Math.PI / 2, sx: 3.6, sy: 1.4, sz: 3.6, color: 0xd7263d });
    add(G.cbox(0.2), { x: hx - 3.52, y: 0.75, z: 13.5, sx: 0.04, sy: 1.2, sz: 1.1, color: 0x2b1d14, ao: false });
    this.circles.push({ x: hx - 2, z: 13.5, r: 2 });

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
    // lamps with neon rings
    const lamps = [[-8, 10], [8, 10], [-8, -12], [8, -12], [-16, 18], [16, 18], [-28, 18], [28, 18], [-28, -18], [28, -18], [-16, -20], [16, -20]];
    const useProp = (name) => this.library?.hasPropReady(name);
    lamps.forEach(([x, z], i) => {
      this.circles.push({ x, z, r: 0.35 });
      if (useProp('lamp')) { this.propSpots.push({ name: 'lamp', x, z, ry: Math.atan2(-x, -z) }); return; }
      add(G.cyl(8), { x, y: 2.5, z, sx: 0.18, sz: 0.18, sy: 5, color: 0x2b2f3a });
      add(G.cyl(8), { x, y: 0.15, z, sx: 0.5, sz: 0.5, sy: 0.3, color: 0x2b2f3a });
      add(G.torus(0.45, 0.07, 4, 16), { x, y: 5.1, z, rx: Math.PI / 2, color: i % 2 ? 0x5ff3ff : 0xff3d7f, emit: 1 });
      add(G.sphere(8, 6), { x, y: 5.1, z, s: 0.45, color: 0xfff6d8, emit: 1 });
    });
    // trees in planters
    const trees = [[-30, 30], [-22, 30], [22, 30], [30, 30], [-31, -31], [31, -31], [-31, 22], [31, 22], [-20, -31], [20, -31], [-8, 30], [8, 30]];
    for (const [x, z] of trees) {
      box(x, 0.4, z, 2.2, 0.8, 2.2, 0xf4f1ea);
      add(G.cyl(6), { x, y: 0.82, z, sx: 1.9, sz: 1.9, sy: 0.05, color: 0x5a3a22, ao: false });
      this.circles.push({ x, z, r: 1.3 });
      if (useProp('tree')) { this.propSpots.push({ name: 'tree', x, z, y: 0.84, ry: (x * 13 + z * 7) % 6.28 }); continue; }
      add(G.cyl(6), { x, y: 1.8, z, sx: 0.3, sz: 0.3, sy: 2.2, color: 0x6b4a2b });
      add(G.ico(1), { x, y: 3.6, z, sx: 2.6, sy: 2.4, sz: 2.6, color: 0x5fbf4a });
      add(G.ico(1), { x: x + 0.5, y: 4.5, z: z - 0.3, s: 1.6, color: 0x78d05a });
    }
    // benches
    for (const [x, z, ry] of [[-6, -9, 0], [6, -9, 0], [-17, 13, Math.PI / 2], [12, 18, 0]]) {
      if (useProp('bench')) { this.propSpots.push({ name: 'bench', x, z, ry }); this.circles.push({ x, z, r: 1.1 }); continue; }
      box(x, 0.5, z, 2.6, 0.14, 0.8, 0x2ec4f1, { ry });
      box(x, 0.25, z, 2.3, 0.5, 0.5, 0x2b2f3a, { ry });
      this.circles.push({ x, z, r: 1.1 });
    }
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
    // skyline ring
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rnd() * 0.05;
      const r = 70 + rnd() * 50;
      const w = 10 + rnd() * 12, h = 14 + rnd() * 55, d = 10 + rnd() * 10;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const col = [0xdfe6f2, 0xc9d6ea, 0xf2e6da, 0xb8c6dd, 0xe8dff2][i % 5];
      add(G.boxBase(), { x, z, sx: w, sy: h, sz: d, ry: -a, color: col, aoH: 30 });
      const rows = Math.floor(h / 4);
      for (let k = 1; k < rows; k++) add(G.box(), { x: x - Math.cos(a) * (d / 2 + 0.05), y: k * 4, z: z - Math.sin(a) * (d / 2 + 0.05), ry: -a, sx: 0.1, sy: 1.1, sz: w * 0.86, color: k % 3 ? 0x9fc6ff : 0xfff1b8, emit: 0.25, ao: false });
      // rooftop water tank / AC unit instead of abstract colour bars
      if (rnd() < 0.35) add(G.cylBase(10), { x, y: h, z, sx: Math.min(4, w * 0.3), sz: Math.min(4, w * 0.3), sy: 3, color: 0xb8c0cc });
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
    petSign.position.set(HATCH_X + 4.6, 9.6, 0);
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
    this.featureLabel = floatingLabel('NEXT UPGRADE', { scale: 3.4 });
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
      const n = neonSneakerSign(3.4, '#9ad8ff', '#ff3d7f');
      n.position.set(SHOP_X + 7.06, 7.1, zz);
      n.rotation.y = Math.PI / 2;
      if (zz < 0) n.scale.x = -1; // mirrored pair, toes pointing outward
      g.add(n);
    }
    // outdoor showcases with spotlight beams
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
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
      const lab = floatingLabel(egg.name.toUpperCase(), { sub: formatMoney(egg.price), color: '#ffd23f', scale: 3 });
      lab.sprite.position.set(this.eggSlots[i].x, 3.9, this.eggSlots[i].z);
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
      const lab = floatingLabel(label, { color: '#' + new THREE.Color(color).getHexString(), scale: 2.8, sub });
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
    EGGS.forEach((egg, i) => pad('egg:' + egg.id, HATCH_X - 3.2, this.eggSlots[i].z, egg.name.toUpperCase(), [0x9ad8ff, 0xffd23f, 0xffb200, 0x39ff88, 0x5ff3ff][i], 1.5));
    pad('pets', HATCH_X - 5.2, 13.5, 'MY PETS', 0xff8ad8, 1.6, 'equip & manage');
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
    const hatch = new THREE.PointLight(0xffd98a, 90, 18, 2);
    hatch.position.set(HATCH_X - 1, 5, 0);
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
  }

  setVisible(v) { this.group.visible = v; }
}

export function fmtDist(m) {
  if (m >= 1000) return (m / 1000).toFixed(m >= 100000 ? 1 : 2) + ' KM';
  return Math.floor(m) + ' M';
}

// Effectively endless running track.
//  • A small fixed pool of chunk meshes is recycled: chunks behind the player are moved ahead.
//  • Each biome has a few cached chunk-variant geometries (normal road pieces + road events such as
//    tunnels and bridges), built lazily one per frame. Chunks are also randomly mirrored, so the same
//    geometry reads as a different stretch of road. Variants of biomes left behind are disposed, so
//    memory stays bounded no matter how far the player runs.
//  • Coins / gems / hurdles / barriers / boost pads are InstancedMeshes with free-lists (object pooling).
//    Obstacles have several looks that share one collision shape per type.
//  • Floating origin: RunController calls shift() so coordinates never grow large.
import * as THREE from 'three';
import { G, StaticBatch, GLOW, makeEmissiveVertexMaterial } from '../utils/Geo.js';
import { mulberry32 } from '../utils/math.js';
import { canvasTexture, FONT } from '../utils/Labels.js';
import { RUN } from '../config/balance.js';
import { BIOMES, biomeIndexAt } from '../config/biomes.js';
import { buildChunk, CHUNK_KINDS, CAN_MIRROR } from './BiomeProps.js';
import { Scenery } from './Scenery.js';
import { sneakerOutlinePath } from './Posters.js';
import { TRACK_FORWARD, TRACK_UP, CHEVRON_AXIS, alignQuat, chevronGeometry } from './TrackFrame.js';

const LEN = RUN.chunkLength;
const HW = RUN.trackHalfWidth;
const LANES = RUN.laneX;

// Collision shapes (unchanged) + how many visual looks each type has.
const ITEM_TYPES = {
  coin:       { max: 420 },
  gem:        { max: 12 },
  hurdle:     { max: 48, halfW: 1.9, h: 0.85, looks: 2 },
  hurdleWide: { max: 16, halfW: HW, h: 0.85 },
  barrier:    { max: 48, halfW: 1.55, h: 2.3, looks: 3 },
  pad:        { max: 20, halfW: 1.6, len: 4 },
};
const PAD_ARROWS = 3;                 // chevrons per boost pad, chasing forward
const PAD_ARROW_SPACING = 1.25;
const PAD_COLORS = [0x39ff88, 0x5ff3ff, 0xeafcff].map((c) => new THREE.Color(c)); // back → front

function itemGeometry(type, look = 0) {
  const b = new StaticBatch(3 + look);
  const add = (geo, o) => b.add(geo, { ao: false, vary: 0.02, ...o });
  switch (type) {
    case 'gem':
      add(G.oct(), { sx: 0.7, sy: 1, sz: 0.7, color: 0x5ff3ff, emit: 0.8 });
      add(G.oct(), { sx: 0.4, sy: 0.6, sz: 0.4, color: 0xffffff, emit: 1 });
      break;
    case 'hurdle': {
      const w = ITEM_TYPES.hurdle.halfW * 2;
      if (look === 0) {
        // athletics hurdle: white posts, red/white striped top board
        for (const s of [-1, 1]) {
          add(G.box(), { x: s * (w / 2 - 0.08), y: 0.42, sx: 0.12, sy: 0.84, sz: 0.12, color: 0xf2f2f2 });
          add(G.box(), { x: s * (w / 2 - 0.08), y: 0.03, sx: 0.14, sy: 0.06, sz: 0.9, color: 0x2b2f3a });
        }
        const n = Math.round(w / 0.6);
        for (let i = 0; i < n; i++) add(G.box(), { x: -w / 2 + (i + 0.5) * (w / n), y: 0.76, sx: w / n, sy: 0.2, sz: 0.1, color: i % 2 ? 0xffffff : 0xff3d3d, emit: 0.2 });
      } else {
        // low sawhorse barricade: yellow/black board on A-frame legs
        for (const s of [-1, 1]) for (const dz of [-1, 1]) add(G.box(), { x: s * (w / 2 - 0.25), y: 0.38, z: dz * 0.18, rx: dz * 0.38, sx: 0.1, sy: 0.82, sz: 0.1, color: 0x8a5a34 });
        const n = 6;
        for (let i = 0; i < n; i++) add(G.box(), { x: -w / 2 + (i + 0.5) * (w / n), y: 0.72, sx: w / n, sy: 0.26, sz: 0.12, color: i % 2 ? 0x1b1d26 : 0xffc21a, emit: 0.15 });
        for (const s of [-1, 1]) add(G.sphere(6, 4), { x: s * (w / 2 - 0.25), y: 0.92, s: 0.16, color: 0xff7a1a, emit: 1 });
      }
      break;
    }
    case 'hurdleWide': {
      const w = HW * 2 - 0.4;
      for (const x of [-w / 2 + 0.08, -w / 6, w / 6, w / 2 - 0.08]) {
        add(G.box(), { x, y: 0.42, sx: 0.12, sy: 0.84, sz: 0.12, color: 0xf2f2f2 });
        add(G.box(), { x, y: 0.03, sx: 0.14, sy: 0.06, sz: 0.9, color: 0x2b2f3a });
      }
      const n = Math.round(w / 0.6);
      for (let i = 0; i < n; i++) add(G.box(), { x: -w / 2 + (i + 0.5) * (w / n), y: 0.76, sx: w / n, sy: 0.2, sz: 0.1, color: i % 2 ? 0xffffff : 0xff3d3d, emit: 0.2 });
      break;
    }
    case 'barrier': {
      const w = ITEM_TYPES.barrier.halfW * 2, h = ITEM_TYPES.barrier.h;
      if (look === 0) {
        // striped block barrier
        add(G.cboxBase(0.2), { sx: w, sy: h, sz: 0.8, color: 0xffb21a });
        for (let i = 0; i < 4; i++) add(G.box(), { x: -w / 2 + 0.4 + i * (w - 0.8) / 3, y: 1.3, z: -0.41, rz: 0.6, sx: 0.25, sy: 1.6, sz: 0.02, color: 0x1b1d26 });
        add(G.box(), { y: h - 0.25, z: -0.42, sx: w * 0.9, sy: 0.14, sz: 0.02, color: 0xff3d3d, emit: 1 });
      } else if (look === 1) {
        // construction barrier: three orange/white panels on legs, warning lamps
        for (const s of [-1, 1]) {
          add(G.box(), { x: s * (w / 2 - 0.15), y: h / 2, sx: 0.14, sy: h, sz: 0.14, color: 0x5a5f6a });
          add(G.cbox(0.1), { x: s * (w / 2 - 0.15), y: 0.06, sx: 0.5, sy: 0.12, sz: 0.9, color: 0x2b2f3a });
          add(G.sphere(7, 5), { x: s * (w / 2 - 0.15), y: h + 0.12, s: 0.26, color: 0xffb21a, emit: 1 });
        }
        for (const [y, sy] of [[0.55, 0.5], [1.25, 0.5], [1.95, 0.5]]) {
          const n = 6;
          for (let i = 0; i < n; i++) add(G.box(), { x: -w / 2 + 0.25 + (i + 0.5) * ((w - 0.5) / n), y, sx: (w - 0.5) / n, sy, sz: 0.1, color: (i + Math.round(y)) % 2 ? 0xffffff : 0xff6a1a, emit: 0.12 });
        }
      } else {
        // road block: concrete jersey barrier with a red/white chevron board on top
        add(G.cboxBase(0.08), { sx: w, sy: 0.4, sz: 0.95, color: 0xc4c8cf });
        add(G.cboxBase(0.08), { y: 0.38, sx: w, sy: 0.72, sz: 0.5, color: 0xd2d5db });
        add(G.box(), { y: 0.62, z: -0.26, sx: w * 0.98, sy: 0.16, sz: 0.02, color: 0xffb21a, emit: 0.3 });
        add(G.box(), { y: 1.7, z: -0.05, sx: w, sy: 1.15, sz: 0.1, color: 0xffffff });
        for (let i = 0; i < 5; i++) add(G.box(), { x: -w / 2 + 0.35 + i * ((w - 0.7) / 4), y: 1.7, z: -0.11, rz: 0.7, sx: 0.24, sy: 1.25, sz: 0.02, color: 0xe0242e, emit: 0.2 });
        add(G.box(), { y: h - 0.02, sx: w, sy: 0.1, sz: 0.14, color: 0xe0242e, emit: 0.6 });
      }
      break;
    }
    case 'pad': {
      // dark metallic plate with raised rails, a recessed lane and lit side strips
      add(G.cbox(0.08), { y: 0.03, sx: 3.3, sy: 0.07, sz: 4.3, color: 0x2a2e38 });
      add(G.box(), { y: 0.065, sx: 2.5, sy: 0.02, sz: 3.9, color: 0x0d0f15 });
      for (const s of [-1, 1]) {
        add(G.box(), { x: s * 1.5, y: 0.09, sx: 0.22, sy: 0.08, sz: 4.1, color: 0x8f97a8 });
        add(G.box(), { x: s * 1.36, y: 0.08, sx: 0.06, sy: 0.04, sz: 3.8, color: 0x5ff3ff, emit: 1 });
      }
      for (const dz of [-2.12, 2.12]) add(G.box(), { y: 0.06, z: dz, sx: 3.1, sy: 0.04, sz: 0.08, color: 0x39ff88, emit: 0.8 });
      break;
    }
  }
  return b.geometry();
}

/** Thick bevelled coin with an embossed star on both faces (smooth normals for the metal look). */
function coinGeometry() {
  const b = new StaticBatch(5);
  let body = new THREE.LatheGeometry([[0, 0.1], [0.3, 0.1], [0.34, 0.125], [0.45, 0.125], [0.5, 0.075], [0.5, -0.075], [0.45, -0.125], [0.34, -0.125], [0.3, -0.1], [0, -0.1]]
    .map(([r, h]) => new THREE.Vector2(r, h)).reverse(), 18);
  body.deleteAttribute('uv');
  body.computeVertexNormals();
  body = body.toNonIndexed();
  b.add(body, { rx: Math.PI / 2, sx: 0.95, sz: 0.95, sy: 0.9, color: 0xffc21a, ao: false, vary: 0 });
  b.add(G.star(), { rx: Math.PI / 2, sx: 0.5, sz: 0.5, sy: 0.22, color: 0xffe27a, ao: false, vary: 0 });
  return b.geometry();
}

function glowTexture() {
  // soft halo hugging the plate's outline (plate 3.3 × 4.3 inside a 4.6 × 6.4 quad); the plate itself stays dark
  const { canvas, ctx, texture } = canvasTexture(128, 192);
  const ix = 128 * (1.3 / 2 / 4.6), iy = 192 * (2.1 / 2 / 6.4);
  ctx.shadowColor = 'rgba(80,255,225,1)';
  for (const [blur, w, a] of [[26, 10, 0.55], [10, 5, 0.6]]) {
    ctx.shadowBlur = blur; ctx.lineWidth = w; ctx.strokeStyle = `rgba(80,255,225,${a})`;
    ctx.beginPath(); ctx.roundRect?.(ix, iy, 128 - ix * 2, 192 - iy * 2, 10); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(80,255,225,0.035)';
  ctx.fillRect(ix, iy, 128 - ix * 2, 192 - iy * 2);
  texture.needsUpdate = true;
  return texture;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color(), _v = new THREE.Vector3();
/** Rotation that makes the chevron geometry point down the track (derived, never hard-coded). */
const ARROW_Q = alignQuat(new THREE.Quaternion(), TRACK_FORWARD, CHEVRON_AXIS);
const FLAT_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // plane → floor
const hash = (a, b) => {
  let h = Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 2246822519);
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
};

const ADS = [
  { title: 'LACE UP', sub: 'EVERY KM COUNTS', bg: ['#ff3d7f', '#ffb21a'], fg: '#ffffff', shoe: true },
  { title: 'RUSH FUEL', sub: 'ENERGY FOR RUNNERS', bg: ['#1b1d26', '#3d6fd9'], fg: '#5ff3ff' },
  { title: 'PAW PALS', sub: 'HATCH A BUDDY TODAY', bg: ['#39ff88', '#2fa86b'], fg: '#14121f' },
  { title: 'GO FASTER', sub: 'BOOST PADS AHEAD', bg: ['#5ff3ff', '#3d6fd9'], fg: '#14121f', shoe: true },
  { title: 'SKY WORLD', sub: 'ONLY 50 KM AWAY', bg: ['#ff8ad8', '#b45cff'], fg: '#ffffff' },
  { title: 'SOLE CITY', sub: 'GRAND OPENING', bg: ['#ffe14d', '#ff6a1a'], fg: '#1b1d26', shoe: true },
];

export class RunTrack {
  constructor(scene, sky = null) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.mat = makeEmissiveVertexMaterial({ glow: 1.2 });
    this.variants = new Map();
    this.buildQueue = [];
    this.seed = 1;
    this.particles = null; // set by Game (boost-pad streaks)
    this.time = 0;

    // chunk pool: each chunk is a near mesh (road + roadside, casts/receives shadows) and a far mesh
    // (terrain and scenery beyond NEAR_X — skipped by the shadow pass, so only nearby chunks cost shadows)
    this.chunks = [];
    const n = RUN.chunksAhead + RUN.chunksBehind + 2;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      const far = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      for (const m of [mesh, far]) { m.visible = false; m.matrixAutoUpdate = false; this.group.add(m); }
      this.chunks.push({ mesh, far, z: 0, active: false, biome: 0, kind: 'normal' });
    }

    // item pools — one InstancedMesh per (type, look)
    this.inst = {};
    const itemMat = makeEmissiveVertexMaterial({ glow: 1.3, shininess: 50 });
    this.coinMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.28, emissive: 0xff9a00, emissiveIntensity: 0.22 });
    // Live instances are kept packed in [0, count): only those are drawn (and shadow-rendered).
    const pool = (key, geo, mat, max, def) => {
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.inst[key] = { mesh, max, count: 0, owners: new Array(max).fill(null), def, dirty: true };
      return this.inst[key];
    };
    for (const [type, def] of Object.entries(ITEM_TYPES)) {
      for (let look = 0; look < (def.looks || 1); look++) {
        const geo = type === 'coin' ? coinGeometry() : itemGeometry(type, look);
        const p = pool(poolKey(type, look), geo, type === 'coin' ? this.coinMat : itemMat, def.max, def);
        p.mesh.castShadow = type !== 'pad';
        p.mesh.receiveShadow = type === 'pad';
      }
    }
    // boost pad extras: forward-chasing chevrons (per-instance colour) + a soft additive glow
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.arrows = pool('padArrow', chevronGeometry(), arrowMat, ITEM_TYPES.pad.max * PAD_ARROWS, null);
    this.arrows.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ITEM_TYPES.pad.max * PAD_ARROWS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.arrows.colors = true;
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7, toneMapped: false });
    this.padGlow = pool('padGlow', new THREE.PlaneGeometry(4.6, 6.4), glowMat, ITEM_TYPES.pad.max, null);
    this.padGlow.mesh.renderOrder = 2;
    this.items = [];

    // biome gate arches (pool of 2) + distance markers (pool of 6) + roadside billboards (pool of 4)
    this.arches = [0, 1].map(() => this.makeArch());
    this.markers = [0, 1, 2, 3, 4, 5].map(() => this.makeMarker());
    this.billboards = [0, 1, 2, 3].map(() => this.makeBillboard());
    this.scenery = sky ? new Scenery(this.group, sky) : null;
    this.stats = { chunksSpawned: 0, itemsSpawned: 0, events: 0, evicted: 0 };
  }

  // ----------------------------------------------------------------- pools --
  makeArch() {
    const b = new StaticBatch(9);
    const add = (geo, o) => b.add(geo, { ao: false, ...o });
    for (const s of [-1, 1]) {
      add(G.cboxBase(0.15), { x: s * (HW + 1.6), sx: 1.4, sy: 9, sz: 1.4, color: 0x1b1d26 });
      add(G.box(), { x: s * (HW + 0.85), y: 4.5, sx: 0.1, sy: 8.6, sz: 0.1, color: 0xffffff, emit: 1 });
    }
    add(G.cbox(0.15), { y: 9.4, sx: HW * 2 + 4.6, sy: 1.6, sz: 1.6, color: 0x1b1d26 });
    const mesh = new THREE.Mesh(b.geometry(), this.mat);
    mesh.castShadow = true;
    const { ctx, canvas, texture } = canvasTexture(1024, 256);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + 4, (HW * 2 + 4) / 4), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, fog: false, side: THREE.DoubleSide }));
    sign.position.set(0, 12.2, 0);
    sign.rotation.y = Math.PI;
    const group = new THREE.Group();
    group.add(mesh, sign);
    group.visible = false;
    this.group.add(group);
    return { group, ctx, canvas, texture, z: 0, active: false };
  }

  drawArch(a, title, sub, color) {
    const { ctx, canvas, texture } = a;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(12,10,30,0.85)';
    ctx.beginPath(); ctx.roundRect?.(8, 8, canvas.width - 16, canvas.height - 16, 40); ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 24; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `110px ${FONT}`; ctx.fillStyle = '#ffffff';
    ctx.fillText(title, canvas.width / 2, sub ? 104 : 128);
    if (sub) { ctx.shadowBlur = 0; ctx.font = `52px ${FONT}`; ctx.fillStyle = color; ctx.fillText(sub, canvas.width / 2, 196); }
    ctx.shadowBlur = 0;
    texture.needsUpdate = true;
  }

  makeMarker() {
    const { ctx, canvas, texture } = canvasTexture(256, 128);
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), new THREE.MeshLambertMaterial({ color: 0x2b2f3a }));
    post.position.y = 1.5;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide, transparent: true }));
    board.position.y = 3.2;
    board.rotation.y = Math.PI;
    g.add(post, board);
    g.visible = false;
    this.group.add(g);
    return { group: g, ctx, canvas, texture, z: 0, active: false };
  }

  drawMarker(mk, meters) {
    const { ctx, canvas, texture } = mk;
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect?.(4, 4, 248, 120, 18); ctx.fill();
    ctx.fillStyle = '#1b1d26';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const t = meters >= 1000 ? `${+(meters / 1000).toFixed(2)} KM` : `${meters} M`;
    let size = 64;
    ctx.font = `${size}px ${FONT}`;
    while (ctx.measureText(t).width > 230) { size -= 4; ctx.font = `${size}px ${FONT}`; }
    ctx.fillText(t, 128, 68);
    texture.needsUpdate = true;
  }

  makeBillboard() {
    if (!this.billboardGeo) {
      const b = new StaticBatch(17);
      const add = (geo, o) => b.add(geo, { ao: false, vary: 0.03, ...o });
      for (const s of [-1, 1]) add(G.box(), { x: s * 3.2, y: 3, sx: 0.35, sy: 6, sz: 0.35, color: 0x5a5f6a, mat: 'metal' });
      add(G.box(), { y: 7.3, sx: 9.2, sy: 4.6, sz: 0.3, z: 0.12, color: 0x2b2f3a });
      add(G.box(), { y: 4.9, z: -0.5, sx: 9, sy: 0.12, sz: 1, color: 0x5a5f6a });
      for (const x of [-3, 0, 3]) add(G.box(), { x, y: 5.05, z: -0.85, sx: 0.5, sy: 0.18, sz: 0.3, color: 0xfff6d8, emit: 1 });
      this.billboardGeo = b.geometry();
    }
    const { ctx, canvas, texture } = canvasTexture(512, 256);
    const g = new THREE.Group();
    const frame = new THREE.Mesh(this.billboardGeo, this.mat);
    frame.castShadow = true;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 4.3), new THREE.MeshLambertMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.35 }));
    board.position.set(0, 7.3, -0.04);
    board.rotation.y = Math.PI; // faces the incoming runner (−TRACK_FORWARD)
    g.add(frame, board);
    g.visible = false;
    this.group.add(g);
    return { group: g, ctx, canvas, texture, z: 0, active: false };
  }

  drawBillboard(bb, ad) {
    const { ctx, canvas, texture } = bb;
    const W = canvas.width, H = canvas.height;
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, ad.bg[0]); grd.addColorStop(1, ad.bg[1]);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * 110 - 60, H); ctx.lineTo(i * 110 + 20, 0); ctx.lineTo(i * 110 + 60, 0); ctx.lineTo(i * 110 - 20, H); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (ad.shoe) { ctx.fillStyle = ad.fg; sneakerOutlinePath(ctx, W - 210, 70, 180, 110); ctx.fill(); }
    ctx.fillStyle = ad.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `86px ${FONT}`; ctx.fillText(ad.title, 28, 100, ad.shoe ? W - 250 : W - 56);
    ctx.font = `34px ${FONT}`; ctx.fillText(ad.sub, 30, 182, W - 60);
    texture.needsUpdate = true;
  }

  // -------------------------------------------------------------- variants --
  getVariant(bi, kind = 'normal', v = 0) {
    const key = `${bi}:${kind}:${v}`;
    let g = this.variants.get(key);
    if (!g) {
      const b = new StaticBatch(1000 + bi * 100 + v);
      buildChunk(b, BIOMES[bi], mulberry32(7919 * (bi * 100 + v + 1) + kind.length * 104729), kind);
      const [near, far] = splitByX(b.geometry(), NEAR_X);
      g = { near, far, biome: bi };
      this.variants.set(key, g);
    }
    return g;
  }

  /** Queue background construction of a biome's variants (one per frame). */
  prewarm(bi) {
    if (bi < 0 || bi >= BIOMES.length) return;
    const want = [];
    for (let v = 0; v < RUN.variantsPerBiome; v++) want.push([bi, 'normal', v]);
    for (const k of CHUNK_KINDS[BIOMES[bi].id] || []) want.push([bi, k, 0]);
    for (const w of want) {
      const key = w.join(':');
      if (!this.variants.has(key) && !this.buildQueue.some((q) => q.join(':') === key)) this.buildQueue.push(w);
    }
    this.scenery?.prewarm(bi);
  }

  /** Dispose variants outside [bi − 1, bi + 1] (city is always kept, every run starts there). */
  evict(bi) {
    for (const [key, g] of this.variants) {
      const b = g.biome;
      if (b === 0 || (b >= bi - 1 && b <= bi + 1)) continue;
      if (this.chunks.some((c) => c.active && c.mesh.geometry === g.near)) continue;
      g.near.dispose();
      g.far.dispose();
      this.variants.delete(key);
      this.stats.evicted++;
    }
    this.buildQueue = this.buildQueue.filter(([b]) => b === 0 || (b >= bi - 1 && b <= bi + 1));
  }

  // ------------------------------------------------------------------ run --
  reset(meters, ratio, seed = 1) {
    this.seed = seed;
    this.group.visible = true;
    for (const c of this.chunks) { c.active = false; c.mesh.visible = c.far.visible = false; }
    for (const it of this.items) this.freeItem(it);
    this.items.length = 0;
    for (const a of this.arches) { a.active = false; a.group.visible = false; }
    for (const m of this.markers) { m.active = false; m.group.visible = false; }
    for (const bb of this.billboards) { bb.active = false; bb.group.visible = false; }
    this.chunkCounter = 0;
    this.sinceEvent = 0;
    this.lastKind = 'normal';
    this.nextZ = -LEN;
    this.lastBiome = biomeIndexAt(meters);
    this.markerNext = null;
    this.evict(this.lastBiome);
    this.prewarm(this.lastBiome);
    this.scenery?.reset(this.lastBiome);
    // start gate
    const a = this.arches[0];
    a.active = true; a.z = 4; a.group.position.set(0, 0, 4); a.group.visible = true;
    this.drawArch(a, meters > 0 ? BIOMES[this.lastBiome].name : 'GO!', meters > 0 ? '' : 'RUN AS FAR AS YOU CAN', '#5ff3ff');
    this.update(0, 0, meters, ratio);
  }

  hide() { this.group.visible = false; }

  update(dt, playerZ, meters, ratio) {
    this.time += dt;
    // build at most one queued variant per frame
    if (this.buildQueue.length) {
      const [bi, kind, v] = this.buildQueue.shift();
      this.getVariant(bi, kind, v);
    }
    // recycle chunks behind
    for (const c of this.chunks) {
      if (c.active && c.z + LEN < playerZ - RUN.chunksBehind * LEN) { c.active = false; c.mesh.visible = c.far.visible = false; }
    }
    // spawn ahead
    while (this.nextZ < playerZ + RUN.chunksAhead * LEN) {
      const c = this.chunks.find((x) => !x.active);
      if (!c) break;
      this.spawnChunk(c, playerZ, meters, ratio);
    }
    // free items behind
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.z < playerZ - 12) { this.freeItem(it); this.items.splice(i, 1); }
    }
    for (const a of this.arches) if (a.active && a.z < playerZ - 30) { a.active = false; a.group.visible = false; }
    for (const m of this.markers) if (m.active && m.z < playerZ - 20) { m.active = false; m.group.visible = false; }
    for (const bb of this.billboards) if (bb.active && bb.z < playerZ - 30) { bb.active = false; bb.group.visible = false; }
    this.scenery?.update(dt, playerZ, biomeIndexAt(meters));

    // coins & gems: slow spin and bob · pads: chevrons light up back → front, streaks fly forward
    this.spin = (this.spin || 0) + dt * 1.9;
    const glow = GLOW.factor;
    for (const it of this.items) {
      if (it.type === 'coin' || it.type === 'gem') {
        _q.setFromAxisAngle(_up, this.spin + it.z * 0.15);
        _p.set(it.x, it.y + Math.sin(this.spin * 1.6 + it.z) * 0.1, it.z);
        _s.setScalar(it.type === 'gem' ? 0.9 : 1);
        this.inst[it.pool].mesh.setMatrixAt(it.slot, _m.compose(_p, _q, _s));
        this.inst[it.pool].dirty = true;
      } else if (it.type === 'pad' && it.arrows) {
        for (let k = 0; k < PAD_ARROWS; k++) {
          const ph = (((this.time * 2.4 - k / PAD_ARROWS) % 1) + 1) % 1;   // wave travels toward the front
          const lit = 0.28 + 0.72 * Math.pow(1 - ph, 2.2);
          _c.copy(PAD_COLORS[k]).multiplyScalar(lit * (0.75 + 0.25 * glow));
          this.arrows.mesh.setColorAt(it.arrows[k], _c);
        }
        this.arrows.mesh.instanceColor.needsUpdate = true;
        const near = it.z > playerZ - 4 && it.z < playerZ + 70;
        if (near && this.particles && Math.random() < dt * 14) {
          const lat = (Math.random() - 0.5) * 2.6, back = (Math.random() - 0.5) * 3.6;
          _v.copy(TRACK_FORWARD).multiplyScalar(back).addScaledVector(TRACK_UP, 0.12).add(_p.set(it.x + lat, 0, it.z));
          const sp = 7 + Math.random() * 5;
          this.particles.emit(_v.x, _v.y, _v.z, TRACK_FORWARD.x * sp, 0.35 + Math.random() * 0.4, TRACK_FORWARD.z * sp, Math.random() < 0.5 ? 0x5ff3ff : 0xeafcff, 0.16, 0.45, 0, 0.97);
        }
      }
    }
    this.padGlow.mesh.material.opacity = 0.6 + 0.25 * Math.sin(this.time * 5);
    for (const t of Object.values(this.inst)) {
      if (t.dirty) { t.mesh.instanceMatrix.needsUpdate = true; t.dirty = false; }
    }
  }

  /** Road event for this chunk, or 'normal'. Never on the start straight or on a biome gate. */
  pickKind(idx, bi, gate) {
    const kinds = CHUNK_KINDS[BIOMES[bi].id] || [];
    const r = mulberry32((this.seed * 131 + idx * 7919) >>> 0);
    if (gate || idx < 3 || this.sinceEvent < 3 || !kinds.length || r() > 0.3) { this.sinceEvent++; return 'normal'; }
    let k = kinds[Math.floor(r() * kinds.length)];
    if (k === this.lastKind) k = kinds[(kinds.indexOf(k) + 1) % kinds.length];
    this.sinceEvent = 0;
    this.lastKind = k;
    this.stats.events++;
    return k;
  }

  spawnChunk(c, playerZ, meters, ratio) {
    const idx = this.chunkCounter++;
    const z0 = this.nextZ;
    this.nextZ += LEN;
    const m0 = Math.max(0, meters + (z0 - playerZ) * ratio);
    const m1 = Math.max(0, meters + (z0 + LEN - playerZ) * ratio);
    const bi = biomeIndexAt(m0);
    const gate = bi !== this.lastBiome;
    // prewarm the next biome once we are within ~2 km (in metres) or 12 chunks of it
    const next = BIOMES[bi + 1];
    if (next && (next.from - m1 < Math.max(2000, ratio * LEN * 12))) this.prewarm(bi + 1);
    const kind = this.pickKind(idx, bi, gate);
    const v = kind === 'normal' ? hash(idx, this.seed) % RUN.variantsPerBiome : 0;
    const mirror = CAN_MIRROR(BIOMES[bi]) && (hash(idx, this.seed + 3) & 1) === 1;
    const g = this.getVariant(bi, kind, v);
    c.mesh.geometry = g.near;
    c.far.geometry = g.far;
    c.z = z0;
    c.biome = bi;
    c.kind = kind;
    c.active = true;
    for (const m of [c.mesh, c.far]) {
      m.visible = true;
      m.position.set(0, 0, z0);
      m.scale.set(mirror ? -1 : 1, 1, 1);
      m.updateMatrix();
    }
    this.stats.chunksSpawned++;

    // biome gate
    if (gate) {
      this.lastBiome = bi;
      this.evict(bi);
      const a = this.arches.find((x) => !x.active) || this.arches[0];
      a.active = true; a.z = z0 + 2;
      a.group.position.set(0, 0, a.z);
      a.group.visible = true;
      const b = BIOMES[bi];
      this.drawArch(a, b.name, `${b.from >= 1000 ? b.from / 1000 + ' KM' : b.from + ' M'}`, '#' + new THREE.Color(b.trackLine).getHexString());
    }

    // roadside billboard now and then (towns, desert, neon)
    const bid = BIOMES[bi].id;
    if (kind === 'normal' && ['city', 'suburbs', 'desert', 'neon'].includes(bid) && (hash(idx, this.seed + 11) % 100) < 30) {
      const bb = this.billboards.find((x) => !x.active);
      if (bb) {
        const side = hash(idx, this.seed + 5) & 1 ? 1 : -1;
        bb.active = true; bb.z = z0 + 20 + (hash(idx, 9) % 20);
        bb.group.position.set(side * (bid === 'suburbs' ? 16.5 : bid === 'desert' ? 13 : 11.6), bid === 'neon' || bid === 'city' ? 0.15 : 0, bb.z);
        bb.group.rotation.y = side * 0.32; // turned slightly toward the road
        bb.group.visible = true;
        this.drawBillboard(bb, ADS[hash(idx, this.seed + 13) % ADS.length]);
      }
    }

    // distance markers: every "nice" interval that keeps ~50 world units between signs
    const step = [100, 250, 500, 1000, 2500, 5000, 10000].find((s) => s / ratio >= 45) || 10000;
    let mk = Math.ceil(m0 / step) * step;
    let side = 1;
    while (mk < m1) {
      if (mk > 0) {
        const marker = this.markers.find((x) => !x.active);
        if (marker) {
          const z = z0 + (mk - m0) / ratio;
          marker.active = true; marker.z = z;
          marker.group.position.set(side * (HW + 2.3), 0, z);
          marker.group.visible = true;
          this.drawMarker(marker, mk);
          side = -side;
        }
      }
      mk += step;
    }

    this.populate(idx, z0, m0, bi);
  }

  // ------------------------------------------------------------------ items --
  populate(idx, z0, m, bi) {
    const rnd = mulberry32((this.seed * 7349 + idx * 92821) >>> 0);
    const safe = z0 + LEN < RUN.safeStart;
    const difficulty = Math.min(0.78, 0.32 + 0.11 * Math.log10(1 + m / 150));
    const look = (type, rz) => hash(idx * 4 + rz, bi) % (ITEM_TYPES[type].looks || 1);
    for (const rz of [8, 23, 38, 53]) {
      const z = z0 + rz;
      if (z < 6) continue;
      const r = rnd();
      if (safe || r > difficulty) {
        // a 6-coin pattern — always some reward on the track
        if (rnd() < 0.85) this.coinPattern(Math.floor(rnd() * 3), rnd(), z);
        if (rnd() < 0.05) this.addItem('gem', LANES[Math.floor(rnd() * 3)], 1.2, z + 6);
        continue;
      }
      const kind = rnd();
      if (kind < 0.33) {
        // hurdles in 1–2 lanes, coin arc over one of them
        const lanes = shuffle([0, 1, 2], rnd).slice(0, rnd() < 0.5 ? 1 : 2);
        for (const l of lanes) this.addItem('hurdle', LANES[l], 0, z, look('hurdle', rz));
        const l = lanes[0];
        for (let k = -2; k <= 2; k++) this.addItem('coin', LANES[l], 1.1 + (1 - (k * k) / 4) * 1.1, z + k * 2.4);
      } else if (kind < 0.6) {
        // barriers — always leave at least one free lane
        const lanes = shuffle([0, 1, 2], rnd).slice(0, rnd() < 0.55 ? 1 : 2);
        for (const l of lanes) this.addItem('barrier', LANES[l], 0, z, look('barrier', rz));
        const free = [0, 1, 2].find((l) => !lanes.includes(l));
        for (let k = 0; k < 4; k++) this.addItem('coin', LANES[free], 1.0, z - 3 + k * 2.2);
      } else if (kind < 0.75 && m > 250) {
        this.addItem('hurdleWide', 0, 0, z);
        for (let k = -1; k <= 1; k++) this.addItem('coin', 0, 2.1 - Math.abs(k) * 0.5, z + k * 2.4);
      } else if (kind < 0.9) {
        const l = Math.floor(rnd() * 3);
        this.addItem('pad', LANES[l], 0, z);
        for (let k = 1; k < 6; k++) this.addItem('coin', LANES[l], 1.0, z + 3 + k * 2.4);
      } else {
        // mixed: barrier + hurdle
        const lanes = shuffle([0, 1, 2], rnd);
        this.addItem('barrier', LANES[lanes[0]], 0, z, look('barrier', rz));
        this.addItem('hurdle', LANES[lanes[1]], 0, z, look('hurdle', rz));
        this.addItem('coin', LANES[lanes[2]], 1, z);
        if (rnd() < 0.15) this.addItem('gem', LANES[lanes[2]], 1.2, z + 3);
      }
    }
  }

  /**
   * Six coins starting in `lane`: straight line, smooth zig-zag, lane change or a hop arc.
   * Same coin count and spacing as before — only the shape varies, every coin stays reachable.
   */
  coinPattern(lane, r, z) {
    const other = lane === 2 ? 1 : lane === 0 ? 1 : (r * 10) % 1 < 0.5 ? 0 : 2;
    const a = LANES[lane], b = LANES[other];
    for (let k = 0; k < 6; k++) {
      let x = a, y = 1.0;
      if (r < 0.32) { /* straight */ }
      else if (r < 0.56) x = a + (b - a) * (0.5 - 0.5 * Math.cos((k / 5) * Math.PI * 2));      // out and back
      else if (r < 0.8) { const t = Math.min(1, Math.max(0, (k - 1) / 3)); x = a + (b - a) * t * t * (3 - 2 * t); } // lane change
      else y = 1.0 + Math.sin((k / 5) * Math.PI) * 1.3;                                          // arc
      this.addItem('coin', x, y, z + k * 2.2);
    }
  }

  /** Take the next packed slot of a pool for `owner` (ref: 'slot' | 'glow' | arrow index). */
  alloc(pool, owner, ref) {
    const slot = pool.count++;
    pool.owners[slot] = [owner, ref];
    pool.mesh.count = pool.count;
    pool.dirty = true;
    return slot;
  }

  /** Release a slot: the last live instance moves into the hole so [0, count) stays packed. */
  release(pool, slot) {
    const last = --pool.count;
    if (slot !== last) {
      pool.mesh.getMatrixAt(last, _m);
      pool.mesh.setMatrixAt(slot, _m);
      if (pool.colors) { pool.mesh.getColorAt(last, _c); pool.mesh.setColorAt(slot, _c); pool.mesh.instanceColor.needsUpdate = true; }
      const [o, ref] = (pool.owners[slot] = pool.owners[last]);
      if (ref === 'slot') o.slot = slot; else if (ref === 'glow') o.glow = slot; else o.arrows[ref] = slot;
    }
    pool.owners[last] = null;
    pool.mesh.count = pool.count;
    pool.dirty = true;
  }

  addItem(type, x, y, z, look = 0) {
    const key = poolKey(type, look);
    const pool = this.inst[key];
    if (pool.count >= pool.max) return null;
    if (type === 'pad' && (this.arrows.count + PAD_ARROWS > this.arrows.max || this.padGlow.count >= this.padGlow.max)) return null;
    const it = { type, pool: key, x, y, z, slot: 0, alive: true, used: false };
    it.slot = this.alloc(pool, it, 'slot');
    if (type === 'pad') {
      it.arrows = [];
      for (let k = 0; k < PAD_ARROWS; k++) it.arrows.push(this.alloc(this.arrows, it, k));
      it.glow = this.alloc(this.padGlow, it, 'glow');
    }
    this.items.push(it);
    this.writeMatrix(it);
    this.stats.itemsSpawned++;
    return it;
  }

  writeMatrix(it) {
    _q.identity();
    _p.set(it.x, it.y, it.z);
    _s.setScalar(1);
    const pool = this.inst[it.pool];
    pool.mesh.setMatrixAt(it.slot, _m.compose(_p, _q, _s));
    pool.dirty = true;
    if (it.arrows) {
      // chevrons laid along the track's forward vector, nose pointing the way you run
      _s.set(1.5, 0.03, 1.15);
      for (let k = 0; k < PAD_ARROWS; k++) {
        _p.set(it.x, 0.075, it.z).addScaledVector(TRACK_FORWARD, (k - (PAD_ARROWS - 1) / 2) * PAD_ARROW_SPACING);
        this.arrows.mesh.setMatrixAt(it.arrows[k], _m.compose(_p, ARROW_Q, _s));
      }
      this.arrows.dirty = true;
      this.padGlow.mesh.setMatrixAt(it.glow, _m.compose(_p.set(it.x, 0.11, it.z), _q.copy(ARROW_Q).multiply(FLAT_Q), _s.setScalar(1)));
      this.padGlow.dirty = true;
    }
  }

  freeItem(it) {
    if (!it.alive) return;
    it.alive = false;
    this.release(this.inst[it.pool], it.slot);
    if (it.arrows) {
      // release highest slots first so the moved-in instances never belong to this pad
      for (const s of [...it.arrows].sort((a, b) => b - a)) this.release(this.arrows, s);
      this.release(this.padGlow, it.glow);
      it.arrows = null;
    }
  }

  /** Remove an item immediately (collected / smashed). */
  removeItem(it) {
    this.freeItem(it);
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
  }

  /**
   * Swept collision between the player's previous and current z.
   * cb(type, item, outcome) with outcome: 'collect' | 'hit' | 'cleared' | 'boost'
   */
  collide(prevZ, z, x, y, cb) {
    const r = 0.38;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.alive || it.z < prevZ - 1.5 || it.z > z + 1.5) continue;
      const dx = Math.abs(x - it.x);
      const crossed = it.z >= prevZ - 0.4 && it.z <= z + 0.4;
      switch (it.type) {
        case 'coin': case 'gem':
          if (dx < 1.45 && Math.abs(y + 0.9 - it.y) < 1.7 && crossed) cb(it.type, it, 'collect');
          break;
        case 'hurdle': case 'hurdleWide': {
          const d = ITEM_TYPES[it.type];
          if (!it.used && crossed && dx < d.halfW + r) {
            it.used = true;
            cb(it.type, it, y > d.h - 0.2 ? 'cleared' : 'hit');
          }
          break;
        }
        case 'barrier': {
          if (!it.used && crossed && dx < ITEM_TYPES.barrier.halfW + r && y < ITEM_TYPES.barrier.h) {
            it.used = true;
            cb('barrier', it, 'hit');
          }
          break;
        }
        case 'pad': {
          if (!it.used && it.z - 2 <= z && it.z + 2 >= prevZ && dx < ITEM_TYPES.pad.halfW + 0.2 && y < 0.6) {
            it.used = true;
            cb('pad', it, 'boost');
          }
          break;
        }
      }
    }
  }

  /** Floating origin: move everything by dz (negative). */
  shift(dz) {
    this.nextZ += dz;
    for (const c of this.chunks) if (c.active) { c.z += dz; for (const m of [c.mesh, c.far]) { m.position.z = c.z; m.updateMatrix(); } }
    for (const it of this.items) { it.z += dz; this.writeMatrix(it); }
    for (const a of this.arches) if (a.active) { a.z += dz; a.group.position.z = a.z; }
    for (const m of this.markers) if (m.active) { m.z += dz; m.group.position.z = m.z; }
    for (const bb of this.billboards) if (bb.active) { bb.z += dz; bb.group.position.z = bb.z; }
  }

  /** Teleport (debug): drop everything ahead and rebuild for the new distance. */
  rebuildAhead(playerZ, meters, ratio) {
    for (const c of this.chunks) { c.active = false; c.mesh.visible = c.far.visible = false; }
    for (const it of this.items) this.freeItem(it);
    this.items.length = 0;
    for (const m of this.markers) { m.active = false; m.group.visible = false; }
    for (const bb of this.billboards) { bb.active = false; bb.group.visible = false; }
    for (const a of this.arches) { a.active = false; a.group.visible = false; }
    this.nextZ = playerZ - LEN;
    this.lastBiome = biomeIndexAt(meters);
    this.evict(this.lastBiome);
    const a = this.arches[0];
    a.active = true; a.z = playerZ + 10; a.group.position.set(0, 0, a.z); a.group.visible = true;
    this.drawArch(a, BIOMES[this.lastBiome].name, '', '#ffd23f');
    this.update(0, playerZ, meters, ratio);
  }

  debugInfo() {
    return {
      chunks: this.chunks.filter((c) => c.active).length,
      pool: this.chunks.length,
      variants: this.variants.size,
      items: this.items.length,
      spawned: this.stats.chunksSpawned,
      events: this.stats.events,
      evicted: this.stats.evicted,
      kinds: this.chunks.filter((c) => c.active).map((c) => c.kind[0] + (c.mesh.scale.x < 0 ? "'" : '')).join(''),
      ...(this.scenery?.debugInfo() || {}),
    };
  }
}

function poolKey(type, look) { return look ? `${type}#${look}` : type; }

const NEAR_X = 34; // triangles whose centre is within this distance of the track centre cast shadows

/** Split a non-indexed batch geometry into triangles near the track (|x| < limit) and the rest. */
function splitByX(g, limit) {
  const names = Object.keys(g.attributes);
  const P = g.attributes.position.array, tris = P.length / 9;
  const nearTri = new Uint8Array(tris);
  let nn = 0;
  for (let t = 0; t < tris; t++) {
    const cx = (P[t * 9] + P[t * 9 + 3] + P[t * 9 + 6]) / 3;
    if (Math.abs(cx) < limit) { nearTri[t] = 1; nn++; }
  }
  const out = [nn, tris - nn].map((count) => {
    const geo = new THREE.BufferGeometry();
    for (const n of names) { const a = g.attributes[n]; geo.setAttribute(n, new THREE.BufferAttribute(new Float32Array(count * 3 * a.itemSize), a.itemSize)); }
    return geo;
  });
  const o = [0, 0];
  for (let t = 0; t < tris; t++) {
    const w = nearTri[t] ? 0 : 1;
    for (const n of names) {
      const src = g.attributes[n].array, sz = g.attributes[n].itemSize * 3;
      out[w].attributes[n].array.set(src.subarray(t * sz, t * sz + sz), o[w] * sz);
    }
    o[w]++;
  }
  g.dispose();
  for (const geo of out) geo.computeBoundingSphere();
  return out;
}

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

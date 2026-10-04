// Effectively endless running track.
//  • A small fixed pool of chunk meshes is recycled: chunks behind the player are moved ahead.
//  • Each biome has a few cached chunk-variant geometries (built lazily, never discarded) —
//    so memory is bounded no matter how far the player runs.
//  • Coins / gems / hurdles / barriers / boost pads are InstancedMeshes with free-lists (object pooling).
//  • Floating origin: RunController calls shift() so coordinates never grow large.
import * as THREE from 'three';
import { G, StaticBatch, makeEmissiveVertexMaterial } from '../utils/Geo.js';
import { mulberry32 } from '../utils/math.js';
import { canvasTexture, FONT } from '../utils/Labels.js';
import { RUN } from '../config/balance.js';
import { BIOMES, biomeIndexAt } from '../config/biomes.js';
import { buildChunk } from './BiomeProps.js';

const LEN = RUN.chunkLength;
const HW = RUN.trackHalfWidth;
const LANES = RUN.laneX;

const ITEM_TYPES = {
  coin:       { max: 420 },
  gem:        { max: 12 },
  hurdle:     { max: 48, halfW: 1.9, h: 0.85 },
  hurdleWide: { max: 16, halfW: HW, h: 0.85 },
  barrier:    { max: 48, halfW: 1.55, h: 2.3 },
  pad:        { max: 20, halfW: 1.6, len: 4 },
};

function itemGeometry(type) {
  const b = new StaticBatch(3);
  const add = (geo, o) => b.add(geo, { ao: false, vary: 0.02, ...o });
  switch (type) {
    case 'coin':
      add(G.cyl(16), { rx: Math.PI / 2, sx: 0.9, sz: 0.9, sy: 0.14, color: 0xffc93c, emit: 0.35 });
      add(G.cyl(16), { rx: Math.PI / 2, sx: 0.62, sz: 0.62, sy: 0.16, color: 0xffe27a, emit: 0.45 });
      add(G.box(), { sx: 0.12, sy: 0.4, sz: 0.18, color: 0xffb200, emit: 0.3 });
      break;
    case 'gem':
      add(G.oct(), { sx: 0.7, sy: 1, sz: 0.7, color: 0x5ff3ff, emit: 0.8 });
      add(G.oct(), { sx: 0.4, sy: 0.6, sz: 0.4, color: 0xffffff, emit: 1 });
      break;
    case 'hurdle': case 'hurdleWide': {
      const w = type === 'hurdle' ? ITEM_TYPES.hurdle.halfW * 2 : HW * 2 - 0.4;
      for (const s of [-1, 1]) {
        add(G.box(), { x: s * (w / 2 - 0.08), y: 0.42, sx: 0.12, sy: 0.84, sz: 0.12, color: 0xf2f2f2 });
        add(G.box(), { x: s * (w / 2 - 0.08), y: 0.03, sx: 0.14, sy: 0.06, sz: 0.9, color: 0x2b2f3a });
      }
      const n = Math.round(w / 0.6);
      for (let i = 0; i < n; i++) add(G.box(), { x: -w / 2 + (i + 0.5) * (w / n), y: 0.78, sx: w / n, sy: 0.16, sz: 0.1, color: i % 2 ? 0xffffff : 0xff3d3d, emit: 0.2 });
      break;
    }
    case 'barrier': {
      const w = ITEM_TYPES.barrier.halfW * 2;
      add(G.cboxBase(0.2), { sx: w, sy: 2.3, sz: 0.8, color: 0xffb21a });
      for (let i = 0; i < 4; i++) add(G.box(), { x: -w / 2 + 0.4 + i * (w - 0.8) / 3, y: 1.4, z: -0.41, rz: 0.6, sx: 0.25, sy: 1.6, sz: 0.02, color: 0x1b1d26 });
      add(G.box(), { y: 2.05, z: -0.42, sx: w * 0.9, sy: 0.14, sz: 0.02, color: 0xff3d3d, emit: 1 });
      break;
    }
    case 'pad': {
      add(G.box(), { y: 0.02, sx: 3.2, sy: 0.05, sz: 4, color: 0x14121f });
      for (let i = 0; i < 3; i++) {
        for (const s of [-1, 1]) add(G.box(), { x: s * 0.55, y: 0.06, z: -1.2 + i * 1.2, ry: s * 0.75, sx: 0.28, sy: 0.04, sz: 1.5, color: 0x39ff88, emit: 1 });
      }
      break;
    }
  }
  return b.geometry();
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class RunTrack {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.mat = makeEmissiveVertexMaterial({ glow: 1.2 });
    this.variants = new Map();
    this.buildQueue = [];
    this.seed = 1;

    // chunk pool
    this.chunks = [];
    const n = RUN.chunksAhead + RUN.chunksBehind + 2;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.chunks.push({ mesh, z: 0, active: false, biome: 0 });
    }

    // item pools
    this.inst = {};
    const itemMat = makeEmissiveVertexMaterial({ glow: 1.3, shininess: 50 });
    for (const [type, def] of Object.entries(ITEM_TYPES)) {
      const mesh = new THREE.InstancedMesh(itemGeometry(type), itemMat, def.max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < def.max; i++) mesh.setMatrixAt(i, ZERO);
      mesh.castShadow = type !== 'pad';
      mesh.receiveShadow = type === 'pad';
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.inst[type] = { mesh, free: Array.from({ length: def.max }, (_, i) => def.max - 1 - i), def, dirty: true };
    }
    this.items = [];

    // biome gate arches (pool of 2) + distance markers (pool of 6)
    this.arches = [0, 1].map(() => this.makeArch());
    this.markers = [0, 1, 2, 3, 4, 5].map(() => this.makeMarker());
    this.stats = { chunksSpawned: 0, itemsSpawned: 0 };
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

  // -------------------------------------------------------------- variants --
  variantKey(bi, v) { return bi * 100 + v; }

  getVariant(bi, v) {
    const key = this.variantKey(bi, v);
    let g = this.variants.get(key);
    if (!g) {
      const b = new StaticBatch(1000 + key);
      buildChunk(b, BIOMES[bi], mulberry32(7919 * (key + 1)));
      g = b.geometry();
      g.computeBoundingSphere();
      this.variants.set(key, g);
    }
    return g;
  }

  /** Queue background construction of a biome's variants (one per frame). */
  prewarm(bi) {
    if (bi < 0 || bi >= BIOMES.length) return;
    for (let v = 0; v < RUN.variantsPerBiome; v++) {
      const key = this.variantKey(bi, v);
      if (!this.variants.has(key) && !this.buildQueue.some((q) => q[0] === bi && q[1] === v)) this.buildQueue.push([bi, v]);
    }
  }

  // ------------------------------------------------------------------ run --
  reset(meters, ratio, seed = 1) {
    this.seed = seed;
    this.group.visible = true;
    for (const c of this.chunks) { c.active = false; c.mesh.visible = false; }
    for (const it of this.items) this.freeItem(it);
    this.items.length = 0;
    for (const a of this.arches) { a.active = false; a.group.visible = false; }
    for (const m of this.markers) { m.active = false; m.group.visible = false; }
    this.chunkCounter = 0;
    this.nextZ = -LEN;
    this.lastBiome = biomeIndexAt(meters);
    this.markerNext = null;
    this.prewarm(this.lastBiome);
    // start gate
    const a = this.arches[0];
    a.active = true; a.z = 4; a.group.position.set(0, 0, 4); a.group.visible = true;
    this.drawArch(a, meters > 0 ? BIOMES[this.lastBiome].name : 'GO!', meters > 0 ? '' : 'RUN AS FAR AS YOU CAN', '#5ff3ff');
    this.update(0, 0, meters, ratio);
  }

  hide() { this.group.visible = false; }

  update(dt, playerZ, meters, ratio) {
    // build at most one queued variant per frame
    if (this.buildQueue.length) {
      const [bi, v] = this.buildQueue.shift();
      this.getVariant(bi, v);
    }
    // recycle chunks behind
    for (const c of this.chunks) {
      if (c.active && c.z + LEN < playerZ - RUN.chunksBehind * LEN) { c.active = false; c.mesh.visible = false; }
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
    // spin coins & gems
    this.spin = (this.spin || 0) + dt * 3;
    for (const it of this.items) {
      if (it.type === 'coin' || it.type === 'gem') {
        _q.setFromAxisAngle(_up, this.spin + it.z * 0.15);
        _p.set(it.x, it.y + Math.sin(this.spin + it.z) * 0.12, it.z);
        _s.setScalar(it.type === 'gem' ? 0.9 : 1);
        this.inst[it.type].mesh.setMatrixAt(it.slot, _m.compose(_p, _q, _s));
        this.inst[it.type].dirty = true;
      }
    }
    for (const t of Object.values(this.inst)) {
      if (t.dirty) { t.mesh.instanceMatrix.needsUpdate = true; t.dirty = false; }
    }
  }

  spawnChunk(c, playerZ, meters, ratio) {
    const idx = this.chunkCounter++;
    const z0 = this.nextZ;
    this.nextZ += LEN;
    const m0 = Math.max(0, meters + (z0 - playerZ) * ratio);
    const m1 = Math.max(0, meters + (z0 + LEN - playerZ) * ratio);
    const bi = biomeIndexAt(m0);
    // prewarm the next biome once we are within ~2 km (in metres) or 12 chunks of it
    const next = BIOMES[bi + 1];
    if (next && (next.from - m1 < Math.max(2000, ratio * LEN * 12))) this.prewarm(bi + 1);
    const v = (Math.imul(idx + 1, 2654435761) >>> 0) % RUN.variantsPerBiome;
    c.mesh.geometry = this.getVariant(bi, v);
    c.z = z0;
    c.biome = bi;
    c.active = true;
    c.mesh.visible = true;
    c.mesh.position.set(0, 0, z0);
    c.mesh.updateMatrix();
    this.stats.chunksSpawned++;

    // biome gate
    if (bi !== this.lastBiome) {
      this.lastBiome = bi;
      const a = this.arches.find((x) => !x.active) || this.arches[0];
      a.active = true; a.z = z0 + 2;
      a.group.position.set(0, 0, a.z);
      a.group.visible = true;
      const b = BIOMES[bi];
      this.drawArch(a, b.name, `${b.from >= 1000 ? b.from / 1000 + ' KM' : b.from + ' M'}`, '#' + new THREE.Color(b.trackLine).getHexString());
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
    for (const rz of [8, 23, 38, 53]) {
      const z = z0 + rz;
      if (z < 6) continue;
      const r = rnd();
      if (safe || r > difficulty) {
        // coin line (sometimes zig-zag) — always some reward on the track
        if (rnd() < 0.85) {
          const lane = Math.floor(rnd() * 3);
          const zig = rnd() < 0.3;
          for (let k = 0; k < 6; k++) {
            const l = zig ? Math.max(0, Math.min(2, lane + (k % 4 < 2 ? 0 : (lane === 2 ? -1 : 1)))) : lane;
            this.addItem('coin', LANES[l], 1.0, z + k * 2.2);
          }
        }
        if (rnd() < 0.05) this.addItem('gem', LANES[Math.floor(rnd() * 3)], 1.2, z + 6);
        continue;
      }
      const kind = rnd();
      if (kind < 0.33) {
        // hurdles in 1–2 lanes, coin arc over one of them
        const lanes = shuffle([0, 1, 2], rnd).slice(0, rnd() < 0.5 ? 1 : 2);
        for (const l of lanes) this.addItem('hurdle', LANES[l], 0, z);
        const l = lanes[0];
        for (let k = -2; k <= 2; k++) this.addItem('coin', LANES[l], 1.1 + (1 - (k * k) / 4) * 1.1, z + k * 2.4);
      } else if (kind < 0.6) {
        // barriers — always leave at least one free lane
        const lanes = shuffle([0, 1, 2], rnd).slice(0, rnd() < 0.55 ? 1 : 2);
        for (const l of lanes) this.addItem('barrier', LANES[l], 0, z);
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
        this.addItem('barrier', LANES[lanes[0]], 0, z);
        this.addItem('hurdle', LANES[lanes[1]], 0, z);
        this.addItem('coin', LANES[lanes[2]], 1, z);
        if (rnd() < 0.15) this.addItem('gem', LANES[lanes[2]], 1.2, z + 3);
      }
    }
  }

  addItem(type, x, y, z) {
    const pool = this.inst[type];
    if (!pool.free.length) return null;
    const slot = pool.free.pop();
    const it = { type, x, y, z, slot, alive: true, used: false };
    this.items.push(it);
    this.writeMatrix(it);
    this.stats.itemsSpawned++;
    return it;
  }

  writeMatrix(it) {
    _q.identity();
    _p.set(it.x, it.y, it.z);
    _s.setScalar(1);
    this.inst[it.type].mesh.setMatrixAt(it.slot, _m.compose(_p, _q, _s));
    this.inst[it.type].dirty = true;
  }

  freeItem(it) {
    if (!it.alive) return;
    it.alive = false;
    const pool = this.inst[it.type];
    pool.mesh.setMatrixAt(it.slot, ZERO);
    pool.dirty = true;
    pool.free.push(it.slot);
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
    for (const c of this.chunks) if (c.active) { c.z += dz; c.mesh.position.z = c.z; c.mesh.updateMatrix(); }
    for (const it of this.items) { it.z += dz; this.writeMatrix(it); }
    for (const a of this.arches) if (a.active) { a.z += dz; a.group.position.z = a.z; }
    for (const m of this.markers) if (m.active) { m.z += dz; m.group.position.z = m.z; }
  }

  /** Teleport (debug): drop everything ahead and rebuild for the new distance. */
  rebuildAhead(playerZ, meters, ratio) {
    for (const c of this.chunks) { c.active = false; c.mesh.visible = false; }
    for (const it of this.items) this.freeItem(it);
    this.items.length = 0;
    for (const m of this.markers) { m.active = false; m.group.visible = false; }
    this.nextZ = playerZ - LEN;
    this.lastBiome = biomeIndexAt(meters);
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
    };
  }
}

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

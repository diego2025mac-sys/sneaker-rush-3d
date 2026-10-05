// Distant backdrop for the run: one cheap merged mesh per biome (mountain ranges, skylines, mesas,
// planets…) that travels with the runner, so it reads as "very far away" like a skybox with depth.
// It ignores fog and instead blends toward the sky's horizon colour with distance (aerial perspective),
// so it sits in the haze without the hard cut-off fog would give at that range.
// Only the current and the next biome's layers exist at once; older ones are disposed.
import * as THREE from 'three';
import { G, StaticBatch, GLOW } from '../utils/Geo.js';
import { mulberry32, damp } from '../utils/math.js';
import { BIOMES } from '../config/biomes.js';

const NEON = [0xff2bd6, 0x5ff3ff, 0x39ff88, 0xffe14d, 0xb45cff];

function hazeMaterial(haze) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
  mat.userData.uniforms = { uHaze: { value: haze }, uFade: { value: 0 }, uGlow: { value: 1 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float emit;\nvarying float vEmit;\nvarying float vHaze;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvEmit = emit;\nvHaze = clamp((length(mvPosition.xyz) - 180.0) / 620.0, 0.0, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHaze;\nuniform float uFade;\nuniform float uGlow;\nvarying float vEmit;\nvarying float vHaze;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vEmit * uGlow;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, uHaze, clamp(0.25 + vHaze * 0.6 * (1.0 - vEmit * 0.6) + uFade, 0.0, 1.0));\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'scenery-haze';
  return mat;
}

/** Polar placement in front of / beside the runner: angle 0 = straight ahead. */
const polar = (r, a) => [Math.sin(a) * r, Math.cos(a) * r];

export class Scenery {
  constructor(parent, sky) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.sky = sky;
    this.layers = new Map(); // biome index → { mesh, fade }
    this.current = -1;
  }

  layer(bi) {
    let L = this.layers.get(bi);
    if (!L) {
      const b = new StaticBatch(4242 + bi);
      build(b, BIOMES[bi], mulberry32(911 + bi * 31));
      const mat = hazeMaterial(this.sky.uniforms.horizon.value);
      const mesh = new THREE.Mesh(b.geometry(), mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = -5;
      mesh.visible = false;
      this.group.add(mesh);
      L = { mesh, mat, fade: 1 };
      this.layers.set(bi, L);
    }
    return L;
  }

  /** Build the next biome's layer ahead of time (called while prewarming chunks). */
  prewarm(bi) { if (bi >= 0 && bi < BIOMES.length && bi <= this.current + 1) this.layer(bi); }

  reset(bi) {
    for (const [i, L] of this.layers) { L.fade = 1; L.mesh.visible = false; if (i !== bi) this.drop(i); }
    this.current = bi;
    const L = this.layer(bi);
    L.fade = 0;
    L.mesh.visible = true;
  }

  drop(i) {
    const L = this.layers.get(i);
    if (!L) return;
    this.group.remove(L.mesh);
    L.mesh.geometry.dispose();
    L.mat.dispose();
    this.layers.delete(i);
  }

  update(dt, playerZ, bi) {
    if (bi !== this.current) {
      this.current = bi;
      this.layer(bi).mesh.visible = true;
    }
    for (const [i, L] of this.layers) {
      const target = i === this.current ? 0 : 1;
      L.fade = damp(L.fade, target, 1.6, dt);
      if (target === 1 && L.fade > 0.97) {
        L.mesh.visible = false;
        if (i < this.current) this.drop(i); // behind us for good
        continue;
      }
      L.mesh.position.z = playerZ;
      L.mesh.position.y = -L.fade * 40;
      L.mat.userData.uniforms.uFade.value = L.fade;
      L.mat.userData.uniforms.uGlow.value = GLOW.factor;
    }
  }

  debugInfo() { return { layers: this.layers.size }; }
}

// ================================================================ build ===
function build(b, biome, rnd) {
  const add = (geo, o) => b.add(geo, { vary: 0.05, ao: false, ...o });
  const range = (n, r0, r1, a0, a1, fn) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (i + rnd() * 0.8) * ((a1 - a0) / n), r = r0 + rnd() * (r1 - r0);
      const [x, z] = polar(r, a);
      fn(x, z, r, a, i);
    }
  };
  const both = (fn) => { fn(-1); fn(1); };
  const mountainsRange = (n, r0, r1, h0, h1, col, snow, a0 = 0.15, a1 = 1.9) => both((s) => range(n, r0, r1, a0, a1, (x, z) => {
    const h = h0 + rnd() * (h1 - h0), w = h * (1.3 + rnd() * 0.8);
    add(G.cone(6 + Math.floor(rnd() * 3)), { x: s * x, y: -8, z, sx: w, sy: h, sz: w * (0.8 + rnd() * 0.4), ry: rnd() * 3, color: col });
    if (snow) add(G.cone(7), { x: s * x, y: -8 + h * 0.62, z, sx: w * 0.39, sy: h * 0.385, sz: w * 0.39 * (0.8 + rnd() * 0.4), ry: rnd() * 3, color: 0xf4f8ff });
  }));
  const hills = (n, r0, r1, col) => both((s) => range(n, r0, r1, 0.2, 1.8, (x, z) => {
    const w = 90 + rnd() * 120;
    add(G.sphere(10, 5), { x: s * x, y: -6, z, sx: w, sy: 20 + rnd() * 30, sz: w * 0.7, color: col });
  }));

  switch (biome.id) {
    case 'city': {
      both((s) => range(26, 300, 420, 0.25, 1.75, (x, z) => {
        const h = 30 + Math.pow(rnd(), 1.6) * 110, w = 14 + rnd() * 20;
        add(G.boxBase(), { x: s * x, y: -4, z, sx: w, sy: h, sz: w, ry: rnd() * 1.5, color: [0x8ea2bd, 0x7d93ad, 0x9fb0c6, 0x6f86a3][Math.floor(rnd() * 4)] });
        if (rnd() < 0.3) add(G.cylBase(6), { x: s * x, y: h - 4, z, sx: 1.2, sz: 1.2, sy: 14, color: 0xd8dce4 });
      }));
      range(14, 420, 520, -0.5, 0.5, (x, z) => { const h = 50 + rnd() * 130; add(G.boxBase(), { x, y: -4, z, sx: 18 + rnd() * 18, sy: h, sz: 18, color: 0x8ea2bd }); });
      hills(5, 520, 640, 0x7f9ab0);
      break;
    }
    case 'suburbs': {
      hills(7, 260, 420, 0x6aa457);
      mountainsRange(6, 520, 680, 80, 150, 0x7f9ab0, false);
      both((s) => range(4, 300, 360, 0.4, 1.4, (x, z) => {
        add(G.cylBase(8), { x: s * x, y: 10, z, sx: 2, sz: 2, sy: 18, color: 0xd8dce4 });
        add(G.sphere(10, 6), { x: s * x, y: 30, z, sx: 12, sy: 9, sz: 12, color: 0x9fd6ff });
      }));
      break;
    }
    case 'desert': {
      both((s) => range(10, 260, 460, 0.2, 1.8, (x, z) => {
        const h = 30 + rnd() * 60, w = 40 + rnd() * 70;
        add(G.taper(0.75, 7), { x: s * x, y: -6, z, sx: w, sy: h, sz: w * 0.7, ry: rnd() * 3, color: [0xd9824a, 0xc0784a, 0xe8995a][Math.floor(rnd() * 3)] });
        add(G.box(), { x: s * x, y: -6 + h * 0.5, z, sx: w * 0.92, sy: 3, sz: w * 0.64, ry: rnd() * 3, color: 0xb8643a });
        if (rnd() < 0.5) add(G.taper(0.5, 5), { x: s * x + 30, y: -6, z: z + 20, sx: 10, sy: h * 1.3, sz: 10, color: 0xc0784a });
      }));
      // canyon rim: a long broken wall of layered rock
      both((s) => { for (let i = 0; i < 9; i++) { const [x, z] = polar(560 + rnd() * 50, 0.2 + i * 0.18); add(G.box(), { x: s * x, y: 0, z, sx: 90, sy: 50 + rnd() * 40, sz: 60, ry: -s * (0.2 + i * 0.18), color: i % 2 ? 0xc0784a : 0xd28a55 }); } });
      break;
    }
    case 'forest': {
      mountainsRange(9, 480, 680, 110, 230, 0x5f7f8f, true);
      hills(6, 300, 430, 0x3f7a40);
      // giant conifers rising above the canopy
      both((s) => range(16, 220, 320, 0.3, 1.7, (x, z) => {
        const h = 40 + rnd() * 35;
        add(G.cylBase(5), { x: s * x, y: -2, z, sx: 3, sz: 3, sy: h * 0.4, color: 0x4a3020 });
        for (let k = 0; k < 3; k++) add(G.cone(6), { x: s * x, y: -2 + h * (0.25 + k * 0.22), z, sx: h * (0.42 - k * 0.1), sy: h * 0.42, sz: h * (0.42 - k * 0.1), ry: rnd() * 3, color: [0x2a6b3a, 0x2f7a3a, 0x356f34][k] });
      }));
      // a railway viaduct between two hills, off to one side
      { const s = rnd() < 0.5 ? -1 : 1, [x, z] = polar(360, 0.75), len = 150;
        add(G.box(), { x: s * x, y: 38, z, ry: s * 0.75 + Math.PI / 2, sx: len, sy: 4, sz: 7, color: 0x9a8f80 });
        for (let i = 0; i < 7; i++) { const t = (i / 6 - 0.5) * len; add(G.boxBase(), { x: s * x + Math.cos(s * 0.75 + Math.PI / 2) * t, y: -4, z: z - Math.sin(s * 0.75 + Math.PI / 2) * t, ry: s * 0.75 + Math.PI / 2, sx: 6, sy: 42, sz: 8, color: 0x8a8070 }); } }
      break;
    }
    case 'mountains': {
      mountainsRange(10, 420, 680, 160, 320, 0x6f7f9f, true, 0.0, 1.9);
      mountainsRange(7, 300, 380, 80, 140, 0x7d8aa8, true, 0.3, 1.6);
      // a switchback road scratched into one peak (cliff road)
      { const [x, z] = polar(380, 0.5);
        for (let k = 0; k < 6; k++) add(G.box(), { x: x + (k % 2 ? 18 : -18), y: 10 + k * 14, z: z - k * 6, ry: 0.5 + (k % 2 ? 0.3 : -0.3), sx: 48, sy: 1.5, sz: 4, color: 0x4c5260 }); }
      break;
    }
    case 'neon': {
      both((s) => range(30, 260, 420, 0.2, 1.8, (x, z) => {
        const h = 60 + Math.pow(rnd(), 1.5) * 170, w = 14 + rnd() * 18, c = NEON[Math.floor(rnd() * 5)];
        add(G.boxBase(), { x: s * x, y: -4, z, sx: w, sy: h, sz: w, ry: rnd() * 1.5, color: 0x1b1530 });
        add(G.box(), { x: s * x, y: h * 0.5, z: z - w / 2 - 0.5, sx: 1, sy: h * 0.9, sz: 1, color: c, emit: 1 });
        for (let k = 12; k < h; k += 18) add(G.box(), { x: s * x, y: k, z: z - w / 2 - 0.3, sx: w * 0.8, sy: 1.2, sz: 0.6, color: rnd() < 0.5 ? c : 0x5ff3ff, emit: 0.8 });
        if (rnd() < 0.25) add(G.cylBase(5), { x: s * x, y: h - 4, z, sx: 1, sz: 1, sy: 30, color: c, emit: 1 });
      }));
      range(8, 440, 520, -0.4, 0.4, (x, z) => { const h = 150 + rnd() * 140; add(G.boxBase(), { x, y: -4, z, sx: 24, sy: h, sz: 24, color: 0x1b1530 }); add(G.box(), { x, y: h * 0.6, z: z - 12.5, sx: 2, sy: h * 0.8, sz: 1, color: NEON[Math.floor(rnd() * 5)], emit: 1 }); });
      break;
    }
    case 'sky': {
      both((s) => range(14, 260, 520, 0.1, 1.9, (x, z) => {
        const sc = 18 + rnd() * 30;
        for (let k = 0; k < 4; k++) add(G.ico(1), { x: s * x + (rnd() - 0.5) * sc * 2, y: -40 + rnd() * 30, z: z + (rnd() - 0.5) * sc, s: sc * (1 + rnd()), color: 0xffffff, emit: 0.2 });
      }));
      both((s) => range(4, 300, 420, 0.4, 1.4, (x, z) => {
        const r = 20 + rnd() * 20, y = 30 + rnd() * 60;
        add(G.cone(7), { x: s * x, y, z, sx: r * 2, sy: r * 1.6, sz: r * 2, rx: Math.PI, color: 0xb08a6b });
        add(G.cyl(8), { x: s * x, y, z, sx: r * 2, sz: r * 2, sy: 3, color: 0x7ad85a });
      }));
      break;
    }
    case 'space': default: {
      const planet = (x, y, z, r, c, ring) => {
        add(G.sphere(18, 12), { x, y, z, s: r, color: c, emit: 0.35 });
        if (ring) add(G.torus(r * 0.85, r * 0.07, 3, 36), { x, y, z, rx: 1.25, ry: 0.4, color: 0xffe9b0, emit: 0.4 });
      };
      planet(-260, 140, 520, 150, 0xff7a3d, true);
      planet(330, 90, 430, 70, 0x3fa9ff, false);
      planet(120, 230, 640, 45, 0xb45cff, true);
      // floating structures: station rings and pyramids
      both((s) => range(5, 260, 420, 0.3, 1.6, (x, z) => {
        const y = 20 + rnd() * 90;
        if (rnd() < 0.5) {
          add(G.torus(14, 1.6, 5, 24), { x: s * x, y, z, rx: rnd() * 1.5, ry: rnd() * 3, color: 0x8a84b8 });
          add(G.cyl(8), { x: s * x, y, z, sx: 4, sy: 30, sz: 4, rz: Math.PI / 2, color: 0x5ff3ff, emit: 0.8 });
        } else {
          add(G.cone(4), { x: s * x, y, z, sx: 30, sy: 26, sz: 30, color: 0x3a2c7a });
          add(G.cone(4), { x: s * x, y, z, sx: 30, sy: 18, sz: 30, rx: Math.PI, color: 0x2a1f5a });
          add(G.oct(), { x: s * x, y: y + 34, z, s: 6, color: NEON[Math.floor(rnd() * 5)], emit: 1 });
        }
      }));
      both((s) => range(10, 200, 380, 0.2, 1.8, (x, z) => add(G.rock(Math.floor(rnd() * 4)), { x: s * x, y: -30 + rnd() * 120, z, s: 6 + rnd() * 16, rx: rnd() * 6, ry: rnd() * 6, color: 0x5a5470 })));
      break;
    }
  }
}

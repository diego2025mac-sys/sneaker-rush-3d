// PBR material presets + preparation of imported materials.
//  • presets: rubber, fabric, leather, plastic, metal, glass, concrete, neon, foliage, wood
//  • prepare(): applied to every imported model — colour spaces, env-map intensity, shadow flags and
//    gentle tuning by material-name keywords (an artist naming a material "sole_rubber" or "eyelet_metal"
//    gets sensible roughness/metalness even if the exporter lost them)
//  • finish(): shared material variants for pet finishes (golden, diamond, crystal, neon, cosmic, shadow)
import * as THREE from 'three';
import { RENDER } from '../config/balance.js';

export const PRESETS = {
  rubber:   { roughness: 0.92, metalness: 0.0 },
  fabric:   { roughness: 0.96, metalness: 0.0 },
  leather:  { roughness: 0.55, metalness: 0.0 },
  plastic:  { roughness: 0.42, metalness: 0.0 },
  metal:    { roughness: 0.28, metalness: 1.0 },
  glass:    { roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.35 },
  concrete: { roughness: 0.95, metalness: 0.0 },
  neon:     { roughness: 0.4, metalness: 0.0, emissiveIntensity: 2.5 },
  foliage:  { roughness: 0.85, metalness: 0.0 },
  wood:     { roughness: 0.7, metalness: 0.0 },
};

const KEYWORDS = [
  [/(rubber|sole|outsole|tread|tire|tyre)/, 'rubber'],
  [/(fabric|mesh|knit|canvas|cloth|lace|sock)/, 'fabric'],
  [/(leather|suede)/, 'leather'],
  [/(metal|steel|chrome|eyelet|aglet|iron|alu)/, 'metal'],
  [/(glass|window|visor)/, 'glass'],
  [/(concrete|stone|asphalt|pavement)/, 'concrete'],
  [/(neon|glow|emissive|light_?strip)/, 'neon'],
  [/(leaf|leaves|foliage|grass|bush)/, 'foliage'],
  [/(wood|bark|plank)/, 'wood'],
  [/(plastic|foam|midsole|tpu)/, 'plastic'],
];

const FINISHES = {
  golden:  (m, c) => { m.color.set(0xffc93c); m.metalness = 1; m.roughness = 0.26; },
  diamond: (m) => { m.color.set(0xc8f4ff); m.metalness = 0.15; m.roughness = 0.04; m.transparent = true; m.opacity = 0.86; m.envMapIntensity = 2; },
  crystal: (m, c) => { m.color.set(c[0]); m.emissive?.set(c[1]); m.emissiveIntensity = 0.45; m.roughness = 0.08; m.transparent = true; m.opacity = 0.82; },
  neon:    (m, c) => { m.color.multiplyScalar(0.35); m.emissive?.set(c[1]); m.emissiveIntensity = 0.9; },
  cosmic:  (m, c) => { m.color.set(c[0]); m.emissive?.set(c[1]); m.emissiveIntensity = 0.5; m.roughness = 0.35; },
  shadow:  (m, c) => { m.color.set(0x0b0718); m.emissive?.set(c[1]); m.emissiveIntensity = 0.35; },
};

export class MaterialLibrary {
  constructor() {
    this.envIntensity = RENDER.envIntensity;
    this.emissiveFactor = 1;
    this.shared = new Map();      // preset name → material
    this.finishCache = new Map(); // source uuid + finish → material
    this.prepared = new Set();
  }

  /** A shared MeshStandardMaterial for a preset (for future props / fallbacks). */
  preset(name, color = 0xffffff) {
    const key = name + ':' + color;
    if (!this.shared.has(key)) {
      const p = PRESETS[name] || PRESETS.plastic;
      const m = new THREE.MeshStandardMaterial({ color, ...p });
      if (name === 'neon') m.emissive.set(color);
      m.envMapIntensity = this.envIntensity;
      this.shared.set(key, m);
    }
    return this.shared.get(key);
  }

  /** Prepare an imported model in place (idempotent per material). */
  prepare(root, { castShadow = true, receiveShadow = true, minShadowSize = 0.25 } = {}) {
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      // selective shadows: tiny decorative parts don't cast
      box.setFromObject(o).getSize(size);
      o.castShadow = castShadow && Math.max(size.x, size.y, size.z) >= minShadowSize;
      o.receiveShadow = receiveShadow;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) this.prepareMaterial(m);
    });
  }

  prepareMaterial(m) {
    if (!m || this.prepared.has(m.uuid)) return;
    this.prepared.add(m.uuid);
    // colour textures are sRGB, data textures linear (GLTFLoader already does this; enforce for safety)
    for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].colorSpace = THREE.SRGBColorSpace;
    for (const k of ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (m[k]) m[k].colorSpace = THREE.NoColorSpace;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = 4;
    if ('envMapIntensity' in m) m.envMapIntensity = this.envIntensity;
    // keyword tuning only when the exporter left default values
    const name = (m.name || '').toLowerCase();
    const hit = KEYWORDS.find(([re]) => re.test(name));
    if (hit && m.isMeshStandardMaterial) {
      const p = PRESETS[hit[1]];
      if (!m.roughnessMap && m.roughness === 1) m.roughness = p.roughness;
      if (!m.metalnessMap && hit[1] === 'metal' && m.metalness === 0) m.metalness = 1;
      if (hit[1] === 'glass' && !m.transparent) { m.transparent = true; m.opacity = PRESETS.glass.opacity; }
    }
    if (m.emissiveIntensity !== undefined) m.userData.baseEmissive = m.emissiveIntensity;
  }

  /** Quality presets scale emissive strength (HIGH feeds the subtle bloom). */
  setEmissiveFactor(f) {
    this.emissiveFactor = f;
    for (const m of this.allPrepared()) if (m.userData.baseEmissive !== undefined) m.emissiveIntensity = m.userData.baseEmissive * f;
  }

  setEnvIntensity(v) {
    this.envIntensity = v;
    for (const m of this.allPrepared()) if ('envMapIntensity' in m) m.envMapIntensity = v;
  }

  *allPrepared() {
    for (const m of this.shared.values()) yield m;
    for (const m of this.finishCache.values()) yield m;
    for (const m of this._registry || []) yield m;
  }

  track(root) {
    this._registry ||= new Set();
    root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) this._registry.add(m); });
  }

  /** Swap materials of a cloned model to a cached finish variant (golden dog, neon fox…). */
  applyFinish(root, finish, colors = []) {
    const fn = FINISHES[finish];
    if (!fn) return;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const swap = (src) => {
        const key = src.uuid + ':' + finish;
        if (!this.finishCache.has(key)) {
          const m = src.clone();
          if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return src;
          fn(m, colors);
          m.userData.baseEmissive = m.emissiveIntensity;
          this.finishCache.set(key, m);
        }
        return this.finishCache.get(key);
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
  }
}

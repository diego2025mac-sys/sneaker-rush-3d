// PBR material presets + preparation of imported materials.
//  • presets: rubber, fabric, leather, plastic, metal, glass, concrete, neon, foliage, wood
//  • prepare(): applied to every imported model — colour spaces, env-map intensity, shadow flags and
//    gentle tuning by material-name keywords (an artist naming a material "sole_rubber" or "eyelet_metal"
//    gets sensible roughness/metalness even if the exporter lost them)
//  • applyPetLook(): pet variants repaint the channel swatches of the species atlas (config/petLooks.js)
import * as THREE from 'three';
import { RENDER } from '../config/balance.js';
import { finishLook, CH, ATLAS } from '../config/petLooks.js';

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

  /**
   * Pet variants: repaint only the channel swatches of the species atlas (see config/petLooks.js) and
   * build a matching emissive map, so a Golden Dog is the Dog model with gold fur but the same eyes.
   * Cached per source material + pet id; the clone keeps the original geometry and animations.
   */
  applyPetLook(root, def, speciesGlow = []) {
    const look = finishLook(def.finish, def.colors) || { colors: {}, glow: [], mat: null };
    const glow = new Set([...look.glow, ...speciesGlow]);
    if (!Object.keys(look.colors).length && !glow.size) return;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const swap = (src) => {
        if (!src.map?.image || !src.isMeshStandardMaterial) return src;
        const key = src.uuid + ':' + def.id;
        if (!this.finishCache.has(key)) {
          const m = src.clone();
          const [map, emissiveMap] = petLookTextures(src.map, look, glow);
          m.map = map;
          m.emissiveMap = emissiveMap;
          m.emissive.set(0xffffff);
          m.emissiveIntensity = 1;
          if (look.mat) { m.metalness = look.mat.metalness; m.roughness = look.mat.roughness; }
          m.envMapIntensity = this.envIntensity;
          m.userData.baseEmissive = 1;
          m.emissiveIntensity = this.emissiveFactor;
          this.finishCache.set(key, m);
        }
        return this.finishCache.get(key);
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
  }
}

const _lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** Recoloured atlas + emissive mask for a pet look (canvas work on the 10 channel swatches only). */
function petLookTextures(srcMap, look, glow) {
  const img = srcMap.image, W = img.width, H = img.height;
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const base = make(), emis = make();
  const ctx = base.getContext('2d', { willReadFrequently: true }), ectx = emis.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, H);
  const cw = Math.round((W * ATLAS.cellW) / ATLAS.size), chH = Math.round((H * ATLAS.cellH) / ATLAS.size);
  // the channel band is the top band of the PNG; a flipped ImageBitmap has it at the bottom
  const top = ctx.getImageData(0, 0, cw, chH).data, bottom = ctx.getImageData(0, H - chH, cw, chH).data;
  const sum = (d) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s; };
  const y0 = sum(top) >= sum(bottom) ? 0 : H - chH;
  const strength = look.mat?.emissive ?? 0;
  for (const [name, ch] of Object.entries(CH)) {
    const x0 = ch * cw, cell = ctx.getImageData(x0, y0, cw, chH), d = cell.data;
    const target = look.colors[name];
    if (target !== undefined && target !== null) {
      let ref = 1;
      for (let i = 0; i < d.length; i += 4) ref = Math.max(ref, _lum(d[i], d[i + 1], d[i + 2]));
      const tr = (target >> 16) & 255, tg = (target >> 8) & 255, tb = target & 255;
      for (let i = 0; i < d.length; i += 4) {
        const k = Math.max(0.62, Math.min(1, _lum(d[i], d[i + 1], d[i + 2]) / ref));
        d[i] = tr * k; d[i + 1] = tg * k; d[i + 2] = tb * k;
      }
      ctx.putImageData(cell, x0, y0);
    }
    const e = glow.has(name) ? 1 : strength;
    if (e > 0) {
      const ed = new ImageData(new Uint8ClampedArray(d), cw, chH);
      for (let i = 0; i < ed.data.length; i += 4) { ed.data[i] *= e; ed.data[i + 1] *= e; ed.data[i + 2] *= e; }
      ectx.putImageData(ed, x0, y0);
    }
  }
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.flipY = srcMap.flipY; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    t.magFilter = srcMap.magFilter; t.minFilter = srcMap.minFilter; t.wrapS = srcMap.wrapS; t.wrapT = srcMap.wrapT;
    return t;
  };
  return [tex(base), tex(emis)];
}

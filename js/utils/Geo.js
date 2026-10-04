// Procedural low-poly geometry helpers + a static batcher that merges
// thousands of props into a handful of draw calls.
import * as THREE from 'three';
import { mulberry32 } from './math.js';

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) {
    let g = make();
    g.deleteAttribute('uv');
    if (g.index) g = g.toNonIndexed();
    g.computeVertexNormals();
    cache.set(key, g);
  }
  return cache.get(key);
}

/** Unit-sized primitives (centered unless noted). Scale them via the batcher. */
export const G = {
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1)),
  /** box with its base at y=0 */
  boxBase: () => cached('boxBase', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  /** chamfered (bevelled) unit box – reads far less "primitive" than a raw box */
  cbox: (b = 0.12) => cached('cbox' + b, () => chamferBox(b)),
  cboxBase: (b = 0.12) => cached('cboxBase' + b, () => chamferBox(b).translate(0, 0.5, 0)),
  cyl: (seg = 8) => cached('cyl' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg)),
  cylBase: (seg = 8) => cached('cylBase' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg).translate(0, 0.5, 0)),
  taper: (top = 0.35, seg = 7) => cached('taper' + top + '_' + seg, () => new THREE.CylinderGeometry(0.5 * top, 0.5, 1, seg).translate(0, 0.5, 0)),
  /** centered tapered cylinder (for limbs): top radius ratio, centered on its length */
  taperC: (top = 0.8, seg = 7) => cached('taperC' + top + '_' + seg, () => new THREE.CylinderGeometry(0.5 * top, 0.5, 1, seg)),
  cone: (seg = 7) => cached('cone' + seg, () => new THREE.ConeGeometry(0.5, 1, seg).translate(0, 0.5, 0)),
  ico: (detail = 0) => cached('ico' + detail, () => new THREE.IcosahedronGeometry(0.5, detail)),
  sphere: (w = 8, h = 6) => cached('sph' + w + '_' + h, () => new THREE.SphereGeometry(0.5, w, h)),
  hemi: (w = 10, h = 4) => cached('hemi' + w + '_' + h, () => new THREE.SphereGeometry(0.5, w, h, 0, Math.PI * 2, 0, Math.PI / 2)),
  torus: (r = 0.4, t = 0.1, rs = 6, ts = 12) => cached(`tor${r}_${t}_${rs}_${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts)),
  oct: () => cached('oct', () => new THREE.OctahedronGeometry(0.5, 0)),
  dodec: () => cached('dodec', () => new THREE.DodecahedronGeometry(0.5, 0)),
  /** bulged barrel body, base at y=0, height 1, max radius 0.5 */
  barrel: (seg = 10) => cached('barrel' + seg, () => new THREE.LatheGeometry(
    [[0, 0], [0.4, 0], [0.45, 0.12], [0.5, 0.5], [0.45, 0.88], [0.4, 1], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)), seg)),
  /** plastic bottle silhouette, base at y=0, height 1 */
  bottle: (seg = 8) => cached('bottle' + seg, () => new THREE.LatheGeometry(
    [[0, 0], [0.3, 0], [0.33, 0.06], [0.33, 0.55], [0.2, 0.72], [0.12, 0.78], [0.12, 0.92], [0.14, 0.94], [0.14, 1], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)), seg)),
  /** grain sack / pouch */
  sack: (seg = 8) => cached('sack' + seg, () => new THREE.LatheGeometry(
    [[0, 0], [0.42, 0.02], [0.5, 0.3], [0.44, 0.7], [0.18, 0.88], [0.22, 1], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)), seg)),
  /** clay jar */
  jar: (seg = 9) => cached('jar' + seg, () => new THREE.LatheGeometry(
    [[0, 0], [0.3, 0], [0.48, 0.35], [0.42, 0.75], [0.26, 0.86], [0.3, 1], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)), seg)),
  /** triangular prism (tent / roof), ridge along Z, base at y=0, width 1, height 1, depth 1 */
  prism: () => cached('prism', () => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 1); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  }),
  /** arrow-shaped sign board pointing +X, centred, depth 1 */
  arrow: () => cached('arrow', () => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.5, -0.25); sh.lineTo(0.22, -0.25); sh.lineTo(0.22, -0.45); sh.lineTo(0.5, 0);
    sh.lineTo(0.22, 0.45); sh.lineTo(0.22, 0.25); sh.lineTo(-0.5, 0.25); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  }),
  /** 5-point star (starfish / emblems), flat in XZ, thickness 1 */
  star: () => cached('star', () => {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.2 : 0.5;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5).rotateX(-Math.PI / 2);
  }),
  /** drooping, V-folded palm frond; starts at origin, extends along +Z, length 1 */
  frond: (droop = 0.55) => cached('frond' + droop, () => {
    const seg = 6, pos = [];
    const pt = (t, side) => {
      const w = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.16 + 0.015;
      const z = t;
      const y = -droop * t * t + 0.12 * t;
      return [side * w, y - Math.abs(side) * w * 0.35, z];
    };
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      const c0 = pt(t0, 0), c1 = pt(t1, 0);
      for (const side of [-1, 1]) {
        const e0 = pt(t0, side), e1 = pt(t1, side);
        const tri = side < 0 ? [c0, e0, e1, c0, e1, c1] : [c0, e1, e0, c0, c1, e1];
        for (const v of tri) pos.push(...v);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }),
  /** irregular rock; a few deterministic variants */
  rock: (variant = 0) => cached('rock' + variant, () => {
    const g = new THREE.IcosahedronGeometry(0.5, 1);
    const rnd = mulberry32(1000 + variant * 77);
    const pos = g.attributes.position;
    const offsets = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!offsets.has(key)) offsets.set(key, 0.72 + rnd() * 0.5);
      const s = offsets.get(key);
      // flatten the bottom so rocks sit on the ground
      const y = pos.getY(i) * s * 0.85;
      pos.setXYZ(i, pos.getX(i) * s, Math.max(y, -0.22), pos.getZ(i) * s);
    }
    return g;
  }),
};

function chamferBox(b) {
  const h = 0.5 - b;
  const sh = new THREE.Shape();
  sh.moveTo(-h, -h); sh.lineTo(h, -h); sh.lineTo(h, h); sh.lineTo(-h, h); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1 - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(1 - 2 * b) / 2);
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

export function makeMatrix(o) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'YXZ');
  _q.setFromEuler(_e);
  _p.set(o.x || 0, o.y || 0, o.z || 0);
  const s = o.s ?? 1;
  _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
  return _m.compose(_p, _q, _s);
}

/** Shared material set for batched props: matte (wood/cloth/stone/foliage), metal, glow. */
export function makeBatchMaterials() {
  return {
    // double-sided so thin parts (fronds, flags, awnings) read from both sides
    lit: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
    flat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
    metal: new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 55, specular: 0x8a8a8a }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}

/**
 * Material whose per-vertex `emit` attribute (0..1) makes parts self-illuminated with their own
 * vertex colour – lets one InstancedMesh have both matte and glowing parts (crystals, screens…).
 */
const GLOW_UNIFORM = { value: 1 };
/** Global emissive multiplier (quality presets raise it on HIGH so neon feeds the bloom pass). */
export const GLOW = {
  get factor() { return GLOW_UNIFORM.value; },
  set factor(v) { GLOW_UNIFORM.value = v; },
};

export function makeEmissiveVertexMaterial({ glow = 1, base = 0, color = 0x000000, shininess = 0 } = {}) {
  const mat = shininess
    ? new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess, specular: 0x777777, emissive: color, emissiveIntensity: base })
    : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: color, emissiveIntensity: base });
  mat.userData.glow = { value: glow };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = mat.userData.glow;
    sh.uniforms.uGlowFactor = GLOW_UNIFORM;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float emit;\nvarying float vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmit;\nuniform float uGlow;\nuniform float uGlowFactor;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vEmit * uGlow * uGlowFactor;');
  };
  mat.customProgramCacheKey = () => 'emitv' + (shininess ? 'p' : 'l');
  return mat;
}

/** Collects static geometry and bakes it into a few merged meshes. */
export class StaticBatch {
  constructor(seed = 1) {
    this.buckets = {};
    this.rnd = mulberry32(seed);
  }

  /**
   * @param {THREE.BufferGeometry} geo  non-indexed geometry (use G.*)
   * @param {object} o  {x,y,z,rx,ry,rz,s|sx,sy,sz,color,glow,mat,shadow,vary,parent,emit,ao,aoH}
   *   mat: 'metal' for shiny metal parts · glow: unlit · emit: 0..1 self-illumination (emissive materials)
   *   ao: fake ambient occlusion – darkens vertices near the prop's base (default on)
   * `parent` (a Matrix4) lets compound props be built in local space.
   */
  add(geo, o) {
    const key = o.glow ? 'glow' : o.mat === 'metal' ? 'metal' : o.shadow === false ? 'flat' : 'lit';
    const b = (this.buckets[key] ||= { pos: [], nor: [], col: [], emit: [] });
    const m = makeMatrix(o).clone();
    if (o.parent) m.premultiply(o.parent);
    _n.getNormalMatrix(m);
    const P = geo.attributes.position, N = geo.attributes.normal;
    _c.set(o.color ?? 0xffffff);
    const vary = o.vary ?? 0.06;
    const emit = o.emit ?? 0;
    const useAO = !o.glow && o.ao !== false;
    const baseY = o.aoBase ?? (o.parent ? o.parent.elements[13] : (o.y ?? 0) - 0.5 * (o.sy ?? o.s ?? 1));
    const aoH = o.aoH ?? 1.6;
    for (let i = 0; i < P.count; i += 3) {
      const f = 1 + (this.rnd() - 0.5) * 2 * vary;
      for (let k = 0; k < 3; k++) {
        const j = i + k;
        _v.set(P.getX(j), P.getY(j), P.getZ(j)).applyMatrix4(m);
        b.pos.push(_v.x, _v.y, _v.z);
        const ao = useAO ? 0.68 + 0.32 * Math.min(1, Math.max(0, (_v.y - baseY) / aoH)) : 1;
        _v.set(N.getX(j), N.getY(j), N.getZ(j)).applyMatrix3(_n).normalize();
        b.nor.push(_v.x, _v.y, _v.z);
        const g = f * ao;
        b.col.push(Math.min(1, _c.r * g), Math.min(1, _c.g * g), Math.min(1, _c.b * g));
        b.emit.push(emit);
      }
    }
  }

  /** Helper: build a parent matrix for compound props. */
  frame(x, y, z, ry = 0, s = 1) {
    return makeMatrix({ x, y, z, ry, s }).clone();
  }

  /** Merge one bucket (or all of them) into a single geometry. */
  geometry(keys = null) {
    let pos = [], nor = [], col = [], emit = [];
    for (const key of keys || Object.keys(this.buckets)) {
      const b = this.buckets[key];
      if (!b) continue;
      pos = pos.concat(b.pos); nor = nor.concat(b.nor); col = col.concat(b.col); emit = emit.concat(b.emit);
    }
    this.buckets = {};
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('emit', new THREE.Float32BufferAttribute(emit, 1));
    g.computeBoundingSphere();
    return g;
  }

  build(materials) {
    const out = [];
    for (const key of Object.keys(this.buckets)) {
      const b = this.buckets[key];
      if (!b.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, materials[key] || materials.lit);
      mesh.castShadow = key === 'lit' || key === 'metal';
      mesh.receiveShadow = key !== 'glow';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      out.push(mesh);
    }
    this.buckets = {};
    return out;
  }
}

/** Canvas-texture text label (for signs/pads). Returns {texture, canvas, ctx, draw}. */
export function makeLabelTexture(w = 512, h = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx, texture };
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

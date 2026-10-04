// Procedural stylised low-poly sneakers.
//
// Instead of stacking boxes, every shoe is built from a real footprint:
//   • the SOLE (outsole + midsole) is a loft of rounded-rectangle sections that follows the
//     footprint outline, with toe spring and heel bevel;
//   • the UPPER is a loft of arch sections whose height follows a side profile
//     (heel counter → collar → throat → vamp → toe box);
//   • overlays, eyestays, laces, tongue, collar padding and stripes are placed ON that
//     upper surface with surfacePoint(u, φ), so they always hug the shoe.
// u = 0 heel … 1 toe along the length, φ = −π/2 (left base) … 0 (top centre) … +π/2 (right base).
//
// Shoe frame: origin = ground under the ankle, +Z = toe, +Y = up. One builder feeds the
// character's feet, the lobby displays and the UI thumbnails.
import * as THREE from 'three';
import { G, StaticBatch, makeEmissiveVertexMaterial } from '../utils/Geo.js';
import { SNEAKER_BY_ID } from '../config/sneakers.js';
import { mulberry32 } from '../utils/math.js';

const SEG = 14;    // sections along the length
const ARCH = 11;   // segments across the upper
const LOOP = 10;   // segments around a sole section
const ANKLE_U = 0.27;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const sm = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
function keyed(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, v0] = keys[i], [u1, v1] = keys[i + 1];
    if (u <= u1) return lerp(v0, v1, sm((u - u0) / (u1 - u0)));
  }
  return keys[keys.length - 1][1];
}
const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();

// ------------------------------------------------------------------ designs --
// profile: low | runner | court | high | chunky | future
//   len/wid  footprint scale · out/mid  sole thicknesses · toe  toe spring
//   top      upper height keys (metres above the midsole) from heel to toe
//   side     lateral design: none | speedline | wing | bolt | cage | dots | panels
const LOW_TOP = (hc, hv, ht) => [[0, hc * 0.92], [0.1, hc], [0.24, hc * 0.96], [0.42, hv * 1.18], [0.62, hv], [0.86, ht], [1, ht * 0.62]];
const HIGH_TOP = (hc, hv, ht) => [[0, hc * 0.9], [0.08, hc], [0.3, hc * 0.97], [0.38, hc * 0.8], [0.5, hv * 1.2], [0.66, hv], [0.88, ht], [1, ht * 0.62]];

const DESIGNS = {
  canvas:  { len: 1.0, wid: 1.0, out: 0.012, mid: 0.026, toe: 0.012, top: LOW_TOP(0.072, 0.052, 0.04), side: 'none', toeCap: true, foxing: true, heelLabel: true, laces: 5 },
  runner:  { len: 1.03, wid: 0.96, out: 0.009, mid: 0.03, toe: 0.022, top: LOW_TOP(0.07, 0.05, 0.034), side: 'speedline', heelCounter: true, pullTab: true, laces: 5, sculpt: true },
  high:    { high: true, len: 1.0, wid: 1.0, out: 0.012, mid: 0.026, toe: 0.012, top: HIGH_TOP(0.15, 0.054, 0.04), side: 'wing', mudguard: true, heelCounter: true, eyestay: true, collarPad: true, laces: 7 },
  court:   { len: 1.0, wid: 1.02, out: 0.01, mid: 0.034, toe: 0.008, top: LOW_TOP(0.074, 0.054, 0.042), side: 'dots', mudguard: true, heelTab: true, cupsole: true, laces: 5 },
  dunk:    { len: 1.0, wid: 1.03, out: 0.012, mid: 0.028, toe: 0.012, top: LOW_TOP(0.085, 0.056, 0.042), side: 'panels', mudguard: true, heelCounter: true, eyestay: true, collarPad: true, laces: 6 },
  air:     { len: 1.05, wid: 0.96, out: 0.009, mid: 0.034, toe: 0.024, top: LOW_TOP(0.07, 0.048, 0.034), side: 'speedline', heelCounter: true, airWindow: true, pullTab: true, laces: 5, sculpt: true },
  knit:    { len: 1.05, wid: 0.95, out: 0.009, mid: 0.038, toe: 0.026, top: LOW_TOP(0.088, 0.05, 0.034), side: 'cage', collarPad: true, heelCounter: true, glowLine: true, laces: 5, sculpt: true },
  neon:    { len: 1.05, wid: 0.95, out: 0.009, mid: 0.036, toe: 0.026, top: LOW_TOP(0.072, 0.048, 0.033), side: 'bolt', heelCounter: true, glowLine: true, glowLaces: true, laces: 5, sculpt: true },
  carbon:  { len: 1.07, wid: 0.93, out: 0.008, mid: 0.042, toe: 0.04, top: LOW_TOP(0.066, 0.046, 0.032), side: 'speedline', plate: true, heelGlow: true, pullTab: true, laces: 5, sculpt: true },
  chunky:  { len: 1.04, wid: 1.04, out: 0.012, mid: 0.05, toe: 0.02, top: LOW_TOP(0.076, 0.052, 0.038), side: 'cage', bubbles: true, glowLine: true, heelCounter: true, laces: 5 },
  plasma:  { len: 1.06, wid: 0.97, out: 0.009, mid: 0.042, toe: 0.03, top: LOW_TOP(0.08, 0.05, 0.035), side: 'bolt', segmented: true, heelGlow: true, glowLaces: true, laces: 5, sculpt: true },
  cosmic:  { len: 1.06, wid: 0.97, out: 0.009, mid: 0.042, toe: 0.03, top: LOW_TOP(0.082, 0.05, 0.035), side: 'speedline', segmented: true, heelGlow: true, stars: true, glowLaces: true, laces: 5, sculpt: true },
  galaxy:  { high: true, len: 1.02, wid: 1.0, out: 0.011, mid: 0.036, toe: 0.018, top: HIGH_TOP(0.13, 0.054, 0.04), side: 'bolt', heelCounter: true, segmented: true, strap: true, stars: true, collarPad: true, heelGlow: true, laces: 6 },
  quantum: { len: 1.07, wid: 0.96, out: 0.009, mid: 0.036, toe: 0.032, top: LOW_TOP(0.08, 0.05, 0.034), side: 'cage', floating: true, segmented: true, heelCounter: true, stars: true, heelGlow: true, glowLaces: true, glowLine: true, laces: 5, sculpt: true },
};

// ---------------------------------------------------------------- the shoe --
class ShoeShape {
  constructor(def) {
    const d = DESIGNS[def.style] || DESIGNS.canvas;
    this.d = d;
    this.L = 0.31 * d.len;
    this.W = 0.118 * d.wid;
    this.gap = d.floating ? 0.016 : 0;
    this.soleTop0 = d.out + this.gap + d.mid; // midsole top before toe spring
  }
  z(u) { return (u - ANKLE_U) * this.L; }
  /** Half width of the footprint, with rounded heel and toe. */
  halfW(u) {
    const base = keyed([[0, 0.76], [0.3, 0.7], [0.64, 1], [0.86, 0.9], [1, 0.72]], u) * this.W * 0.5;
    const eh = 0.09, et = 0.16;
    let cap = 1;
    if (u < eh) cap = Math.sqrt(1 - Math.pow(1 - u / eh, 2));
    else if (u > 1 - et) cap = Math.sqrt(1 - Math.pow(1 - (1 - u) / et, 2));
    return base * Math.max(0.0001, cap);
  }
  /** Toe spring + tiny heel bevel. */
  lift(u) { return this.d.toe * Math.pow(sm((u - 0.68) / 0.32), 1.6) + 0.004 * sm((0.08 - u) / 0.08); }
  topH(u) { return keyed(this.d.top, u); }
  /** Point on the upper surface. inf > 1 floats the point outward (overlays, laces). */
  surface(u, phi, inf = 1, out = new THREE.Vector3()) {
    const hw = this.halfW(u) * (1 + (inf - 1) * 0.8);
    const h = this.topH(u) * (1 + (inf - 1) * 1.6) + (inf - 1) * 0.02;
    const s = Math.sin(phi), c = Math.cos(phi);
    const yUp = h * Math.pow(Math.abs(c), 0.55);
    // the upper narrows toward the top; tall sections become a snug ankle shaft
    const narrowTop = (1 - 0.16 * Math.abs(c)) * lerp(1, 0.74, sm((yUp - 0.055) / 0.09));
    const base = this.soleTop0 + this.lift(u) - 0.004;
    return out.set(hw * spow(s, 0.72) * narrowTop, base + yUp, this.z(u));
  }
  /** Rounded-rectangle sole section. */
  soleRing(u, y0, h, widen = 1) {
    const hw = this.halfW(u) * widen, ly = this.lift(u);
    const pts = [];
    for (let j = 0; j < LOOP; j++) {
      const t = (j / LOOP) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      pts.push(new THREE.Vector3(hw * spow(c, 0.38), y0 + ly + h * (0.5 + 0.5 * spow(s, 0.38)), this.z(u)));
    }
    return pts;
  }
}

const uAt = (i, n, u0 = 0, u1 = 1) => u0 + (u1 - u0) * (0.5 - 0.5 * Math.cos((Math.PI * i) / n));

/** Triangulate a grid of sections (each an array of Vector3). */
function loft(sections, closed, caps = false) {
  const pos = [];
  const n = sections[0].length;
  const segN = closed ? n : n - 1;
  const P = (v) => pos.push(v.x, v.y, v.z);
  for (let i = 0; i < sections.length - 1; i++) {
    const A = sections[i], B = sections[i + 1];
    for (let j = 0; j < segN; j++) {
      const a = A[j], b = A[(j + 1) % n], c = B[(j + 1) % n], d = B[j];
      P(a); P(b); P(c); P(a); P(c); P(d);
    }
  }
  if (caps) {
    for (const S of [sections[0], sections[sections.length - 1]]) {
      const ctr = S.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(1 / S.length);
      for (let j = 0; j < (closed ? n : n - 1); j++) { P(ctr); P(S[j]); P(S[(j + 1) % n]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Square tube along a path (laces, piping, glow lines). */
function tube(path, r, closed = false) {
  const sections = [];
  const up = new THREE.Vector3(0, 1, 0), tan = new THREE.Vector3(), side = new THREE.Vector3(), nrm = new THREE.Vector3();
  const pts = closed ? [...path, path[0]] : path;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    tan.subVectors(b, a).normalize();
    side.crossVectors(tan, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    nrm.crossVectors(side, tan).normalize();
    const p = pts[i];
    sections.push([0, 1, 2, 3].map((k) => {
      const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
      return p.clone().addScaledVector(side, Math.cos(ang) * r).addScaledVector(nrm, Math.sin(ang) * r);
    }));
  }
  return loft(sections, true);
}

/**
 * Emit all parts of one shoe through add(geo, opts) (StaticBatch.add signature).
 * @param parent Matrix4 placing the shoe frame.  side = -1 left / 1 right.
 */
export function buildSneaker(add, def, parent, side = 1) {
  const S = new ShoeShape(def);
  const d = S.d;
  const glow = def.glow;
  const put = (geo, color, emit = 0) => { add(geo, { parent, color, emit, vary: 0.015, ao: false }); geo.dispose(); };
  const putG = (geo, o) => add(geo, { parent, vary: 0.015, ao: false, ...o });
  const rnd = mulberry32(def.index * 31 + 7);

  // ------------------------------------------------------------- sole --
  const soleSections = (y0, h, widen, u0 = 0, u1 = 1, n = SEG) => {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(S.soleRing(uAt(i, n, u0, u1), y0, h, widen));
    return out;
  };
  // outsole (with a slightly darker tread band)
  put(loft(soleSections(0, d.out, 1.03), true), def.sole);
  put(loft(soleSections(-0.0005, d.out * 0.45, 1.035), true), shade(def.sole, 0.72));
  const midY = d.out + S.gap;
  if (d.segmented) {
    // futuristic segmented midsole with a glowing core showing through the gaps
    put(loft(soleSections(midY + d.mid * 0.2, d.mid * 0.6, 0.93), true), glow || def.accent, 1);
    const cuts = [0, 0.2, 0.39, 0.58, 0.78, 1];
    for (let k = 0; k < cuts.length - 1; k++) {
      put(loft(soleSections(midY, d.mid, 1.04, cuts[k] + (k ? 0.012 : 0), cuts[k + 1] - (k < cuts.length - 2 ? 0.012 : 0), 5), true, true), def.mid === glow ? shade(def.sole, 1.6) : def.mid);
    }
  } else {
    put(loft(soleSections(midY, d.mid, 1.04), true), def.mid);
    if (d.cupsole) put(loft(soleSections(midY + d.mid * 0.62, d.mid * 0.12, 1.05), true), shade(def.mid, 0.86));
  }
  if (d.floating) put(loft(soleSections(d.out - 0.002, S.gap + 0.004, 0.82), true), glow, 1);
  if (d.plate) put(loft(soleSections(midY + d.mid * 0.42, d.mid * 0.16, 1.055), true), 0x1d2026);
  if (d.glowLine && glow) put(loft(soleSections(midY + d.mid * 0.48, d.mid * 0.1, 1.055), true), glow, 1);
  if (d.foxing) put(loft(soleSections(midY + d.mid * 0.62, d.mid * 0.16, 1.05), true), def.accent);
  if (d.bubbles) {
    for (let i = 0; i < 6; i++) {
      const u = 0.1 + i * 0.15;
      for (const sx of [-1, 1]) putG(G.sphere(7, 5), { x: sx * S.halfW(u) * 1.0, y: midY + d.mid * 0.5 + S.lift(u), z: S.z(u), sx: 0.01, sy: d.mid * 0.55, sz: 0.05, color: i % 2 ? def.panel : def.accent, emit: glow ? 0.15 : 0 });
    }
  }
  if (d.airWindow) {
    for (const sx of [-1, 1]) putG(G.sphere(10, 6), { x: sx * S.halfW(0.17) * 1.03, y: midY + d.mid * 0.5, z: S.z(0.17), sx: 0.012, sy: d.mid * 0.62, sz: 0.07, color: glow || 0x9fe8ff, emit: 0.7 });
  }

  // ------------------------------------------------------------ upper --
  const upperSections = (u0, u1, n, phi0, phi1, inf) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const u = uAt(i, n, u0, u1);
      const row = [];
      for (let j = 0; j <= ARCH; j++) row.push(S.surface(u, lerp(phi0, phi1, j / ARCH), inf));
      out.push(row);
    }
    return out;
  };
  put(loft(upperSections(0, 1, SEG, -Math.PI / 2, Math.PI / 2, 1), false), def.upper);

  // overlay on the sides only, up to coverage(u) ∈ [0..1] of the height (sloped panels)
  const sidePanel = (u0, u1, cover, color, inf = 1.035, emit = 0, n = 8) => {
    for (const sgn of [-1, 1]) {
      const sections = [];
      for (let i = 0; i <= n; i++) {
        const u = uAt(i, n, u0, u1);
        const c = Math.min(0.999, Math.max(0.02, cover(u)));
        const phiTop = Math.acos(Math.pow(c, 1 / 0.55));
        const row = [];
        for (let j = 0; j <= 5; j++) row.push(S.surface(u, sgn * lerp(Math.PI / 2, phiTop, j / 5), inf));
        sections.push(row);
      }
      put(loft(sections, false), color, emit);
    }
  };
  const fullPanel = (u0, u1, color, inf = 1.04, emit = 0, cover = null) => {
    if (cover) { sidePanel(u0, u1, cover, color, inf, emit); return; }
    put(loft(upperSections(u0, u1, 6, -Math.PI / 2, Math.PI / 2, inf), false), color, emit);
  };

  // toe protection
  if (d.toeCap) {
    fullPanel(0.8, 1, def.mid, 1.05, 0, null);
  } else if (d.mudguard) {
    sidePanel(0.62, 1, (u) => lerp(0.32, 0.55, sm((u - 0.62) / 0.38)), def.panel, 1.035);
    fullPanel(0.9, 1, def.panel, 1.04);
  } else {
    fullPanel(0.86, 1, shade(def.upper, 0.9), 1.03);
  }
  // heel counter
  if (d.heelCounter || d.toeCap) sidePanel(0, 0.24, (u) => lerp(0.82, 0.45, sm(u / 0.24)), d.toeCap ? shade(def.upper, 0.93) : def.panel, 1.04);
  if (d.sculpt) sidePanel(0.2, 0.9, (u) => 0.16 + 0.06 * Math.sin(u * 12), shade(def.upper, 0.82), 1.025);

  // lateral designs (original shapes — no real-brand marks)
  const strip = (pts, w, color, inf, emit = 0) => {
    // pts: [[u,phi],...] — a band of half-width w (in phi) laid on the surface
    const a = [], b = [];
    for (const [u, phi] of pts) { a.push(S.surface(u, phi - w * Math.sign(phi || 1), inf)); b.push(S.surface(u, phi + w * Math.sign(phi || 1), inf)); }
    put(loft(a.map((p, i) => [p, b[i]]), false), color, emit);
  };
  const glowOr = (c) => (glow ? glow : c);
  const ge = glow ? 0.9 : 0;
  for (const sgn of [-1, 1]) {
    const P = (u, f) => [u, sgn * f];
    switch (d.side) {
      case 'speedline': // two parallel diagonal bands rising toward the heel
        for (const off of [0, 0.14]) strip([P(0.62 - off, 1.15), P(0.48 - off, 0.98), P(0.34 - off, 0.8)], 0.07, off ? def.panel : def.accent, 1.05, off ? 0 : ge * 0.6);
        break;
      case 'wing': // broad wing panel from the eyestay down to the heel
        sidePanel(0.14, 0.62, (u) => 0.28 + 0.42 * sm((0.62 - u) / 0.48), def.panel, 1.045);
        break;
      case 'panels': // colour-blocked overlays
        sidePanel(0.26, 0.7, (u) => 0.38 + 0.25 * sm((u - 0.26) / 0.44), def.panel, 1.045);
        strip([P(0.3, 1.2), P(0.42, 1.05), P(0.55, 0.92)], 0.08, def.accent, 1.06);
        break;
      case 'bolt': // lightning zig-zag
        strip([P(0.62, 1.25), P(0.5, 0.95), P(0.42, 1.12), P(0.28, 0.82)], 0.055, glowOr(def.accent), 1.05, ge);
        break;
      case 'cage': // runner cage straps from sole to eyestay
        for (const u of [0.38, 0.48, 0.58]) strip([P(u - 0.03, 1.4), P(u, 1.0), P(u + 0.02, 0.62)], 0.05, glowOr(def.accent), 1.045, ge * 0.7);
        break;
      case 'dots': // perforated toe + side panel line
        for (let i = 0; i < 6; i++) putG(G.sphere(4, 3), { ...pos(S.surface(0.78 + (i % 3) * 0.06, sgn * (0.35 + Math.floor(i / 3) * 0.3), 1.03)), s: 0.006, color: shade(def.upper, 0.6) });
        strip([P(0.28, 1.1), P(0.45, 1.05), P(0.62, 1.1)], 0.05, def.accent, 1.05);
        break;
    }
  }
  // eyestays (lace rails)
  if (d.eyestay || d.glowLaces) for (const sgn of [-1, 1]) strip([[0.46, sgn * 0.6], [0.62, sgn * 0.58], [0.78, sgn * 0.52]], 0.12, d.glowLaces ? def.panel : def.accent, 1.045);

  // collar: padded rim around the opening + dark lining inside
  const rim = [];
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const u = (d.high ? 0.17 : 0.215) + (d.high ? 0.15 : 0.17) * Math.cos(a);
    const phi = 0.98 * Math.sin(a);
    const p = S.surface(u, phi, 1.01);
    p.y += 0.004;
    rim.push(p);
  }
  put(tube(rim, d.collarPad ? 0.011 : 0.008, true), d.collarPad ? def.panel : shade(def.upper, 0.9));
  // dark lining: a decal laid over the opening so it reads as the foot hole
  {
    const rings = [];
    for (const k of [1, 0.7, 0.4, 0.12]) {
      const ring = [];
      for (let j = 0; j < 20; j++) {
        const a = (j / 20) * Math.PI * 2;
        const p = S.surface((d.high ? 0.17 : 0.215) + (d.high ? 0.15 : 0.17) * k * Math.cos(a), 0.98 * k * Math.sin(a), 1.0);
        p.y += 0.0035;
        ring.push(p);
      }
      rings.push(ring);
    }
    put(loft(rings, true, true), 0x24222c);
  }

  // sock collar (knit runners) — snug stretch cuff around the ankle
  if (d.sockCollar) {
    const cz = S.z(0.19), y0 = S.soleTop0 + S.topH(0.12) - 0.008;
    const ring = (y, r) => Array.from({ length: 12 }, (_, j) => { const a = (j / 12) * Math.PI * 2; return new THREE.Vector3(Math.sin(a) * r, y, cz + Math.cos(a) * r * 1.1); });
    put(loft([ring(y0, 0.05), ring(y0 + 0.014, 0.046), ring(y0 + 0.022, 0.044)], true), def.panel);
  }

  // tongue: a padded tab rising from the throat over the collar
  {
    const sections = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const u = lerp(d.high ? 0.42 : 0.5, d.high ? 0.12 : 0.29, t);
      const base = S.surface(u, 0, 1.03);
      base.y += 0.004 + Math.pow(t, 1.6) * 0.008;
      base.z -= t * 0.006;
      const w = lerp(0.024, 0.03, t), th = 0.006;
      sections.push([
        new THREE.Vector3(base.x - w, base.y, base.z), new THREE.Vector3(base.x + w, base.y, base.z),
        new THREE.Vector3(base.x + w, base.y + th, base.z), new THREE.Vector3(base.x - w, base.y + th, base.z),
      ]);
    }
    put(loft(sections, true, true), d.glowLaces ? def.panel : shade(def.upper, 1.04));
    // tongue tag
    const tip = S.surface(d.high ? 0.13 : 0.3, 0, 1.03);
    putG(G.cbox(0.3), { x: tip.x, y: tip.y + 0.012, z: tip.z - 0.002, rx: -0.35, sx: 0.02, sy: 0.014, sz: 0.004, color: def.accent, emit: glow ? 0.6 : 0 });
  }

  // laces: criss-cross tubes over the throat
  {
    const n = d.laces || 5;
    const laceEmit = d.glowLaces && glow ? 1 : 0;
    const laceCol = d.glowLaces && glow ? glow : def.laces;
    for (let k = 0; k < n; k++) {
      const u = lerp(0.74, d.high ? 0.36 : 0.48, k / Math.max(1, n - 1));
      const du = 0.022;
      const path = [];
      for (let j = 0; j <= 4; j++) {
        const t = j / 4;
        path.push(S.surface(u + (t - 0.5) * du * (k % 2 ? 1 : -1), lerp(-0.5, 0.5, t), 1.075));
      }
      put(tube(path, 0.0042), laceCol, laceEmit);
    }
    // bow loops on the top lace
    const top = S.surface(d.high ? 0.36 : 0.47, 0, 1.09);
    for (const sx of [-1, 1]) putG(G.torus(0.011, 0.0035, 3, 8), { x: top.x + sx * 0.013, y: top.y + 0.002, z: top.z, rx: Math.PI / 2 - 0.3, rz: sx * 0.5, color: laceCol, emit: laceEmit });
  }

  // heel details
  if (d.pullTab || d.heelTab || d.heelLabel) {
    const p = S.surface(0.012, 0, 1.03);
    putG(G.cbox(0.3), { x: 0, y: p.y + (d.pullTab ? 0.012 : -0.012), z: p.z - 0.004, sx: d.heelLabel ? 0.03 : 0.022, sy: d.pullTab ? 0.032 : 0.026, sz: 0.008, color: def.accent, emit: glow ? 0.5 : 0 });
  }
  if (d.heelGlow && glow) {
    const path = [];
    for (let k = 0; k <= 10; k++) path.push(S.surface(0.05 + 0.03 * Math.abs(k - 5) / 5, lerp(-1.3, 1.3, k / 10), 1.05));
    put(tube(path, 0.006), glow, 1);
  }
  if (d.strap) {
    for (const sgn of [-1, 1]) strip([[0.3, sgn * 0.2], [0.3, sgn * 0.85], [0.32, sgn * 1.35]], 0.18, glow || def.accent, 1.06, glow ? 0.7 : 0);
  }
  if (d.stars && glow) {
    for (let i = 0; i < 7; i++) {
      const p = S.surface(0.15 + rnd() * 0.65, (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.75), 1.05);
      putG(G.oct(), { x: p.x, y: p.y, z: p.z, s: 0.008 + rnd() * 0.005, color: i % 2 ? glow : def.accent, emit: 1 });
    }
  }
}

const pos = (v) => ({ x: v.x, y: v.y, z: v.z });

// ------------------------------------------------------- standalone models --
const geoCache = new Map();
let sharedMat = null;
export function sneakerMaterial() {
  if (!sharedMat) {
    sharedMat = makeEmissiveVertexMaterial({ glow: 1.3, shininess: 38 });
    sharedMat.side = THREE.DoubleSide;
  }
  return sharedMat;
}

/** Merged geometry of a single (right) shoe for displays and thumbnails. Cached. */
export function sneakerGeometry(id) {
  if (geoCache.has(id)) return geoCache.get(id);
  const def = SNEAKER_BY_ID[id];
  const b = new StaticBatch(7);
  buildSneaker((geo, o) => b.add(geo, o), def, new THREE.Matrix4(), 1);
  const g = b.geometry();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  geoCache.set(id, g);
  return g;
}

export function makeSneakerMesh(id) {
  const m = new THREE.Mesh(sneakerGeometry(id), sneakerMaterial());
  m.castShadow = true;
  return m;
}

/** Silhouette material for not-yet-unlocked display shoes. */
export const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0x1b1d26, side: THREE.DoubleSide });

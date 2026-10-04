// Canvas-drawn lobby artwork: sneaker ads for fictional brands, running-event posters and a
// neon sneaker-outline sign. Shoe images are real renders of the game's own sneaker models.
// All brands and marks are original (no real logos).
import * as THREE from 'three';
import { FONT } from '../utils/Labels.js';
import { roundRect } from '../utils/Geo.js';

const BODY = '"Nunito", system-ui, sans-serif';

export const POSTERS = [
  { kind: 'brand', name: 'VELOX', tag: 'BUILT FOR SPEED', c1: '#ff3d7f', c2: '#3a0d6b', shoe: 'airsprint', mark: 'chevron', badge: 'NEW DROP' },
  { kind: 'event', title: 'RUSH CITY', big: '42K', sub: 'MARATHON • SUNRISE START', c1: '#1b1440', c2: '#ffd23f' },
  { kind: 'brand', name: 'STRIDE', tag: 'EVERY STEP COUNTS', c1: '#2ec4f1', c2: '#0b2a5e', shoe: 'street', mark: 'orbit' },
  { kind: 'brand', name: 'AIRFLOW', tag: 'LIGHT AS AIR', c1: '#bff5ff', c2: '#3d6fd9', shoe: 'velocity', mark: 'wave', dark: true },
  { kind: 'brand', name: 'RUSH', tag: 'RUN FURTHER', c1: '#ffd23f', c2: '#ff5a1f', shoe: 'dunk', mark: 'bolt', badge: 'LIMITED', dark: true },
  { kind: 'brand', name: 'NOVA', tag: 'BEYOND THE STARS', c1: '#b45cff', c2: '#120826', shoe: 'cosmic', mark: 'star' },
  { kind: 'event', title: 'NEON NIGHT', big: 'RUN', sub: 'GLOW TRACK • 10 KM', c1: '#0b0620', c2: '#ff2bd6' },
  { kind: 'brand', name: 'HYPER', tag: 'MAXIMUM BOUNCE', c1: '#39ff88', c2: '#0c3b2a', shoe: 'hyper', mark: 'hex', badge: 'NEW' },
  { kind: 'brand', name: 'VELOX', tag: 'RACE MODE', c1: '#ff4d4d', c2: '#1d2026', shoe: 'carbon', mark: 'chevron' },
  { kind: 'event', title: 'SPEED LAB', big: '900', sub: 'KM/H • TESTED ON THE COSMIC TRACK', c1: '#06121f', c2: '#5ff3ff' },
];

/** Draw one poster into a canvas. getShoe(id) returns a canvas with a transparent shoe render. */
export function drawPoster(ctx, w, h, p, getShoe) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (p.kind === 'event') drawEvent(ctx, w, h, p, getShoe);
  else drawBrand(ctx, w, h, p, getShoe);
  ctx.restore();
}

function drawBrand(ctx, w, h, p, getShoe) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, p.c1);
  g.addColorStop(1, p.c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // speed streaks
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 9; i++) {
    const y = 30 + i * 36, len = 120 + ((i * 73) % 200);
    ctx.beginPath();
    ctx.moveTo(w - len - (i % 3) * 40, y);
    ctx.lineTo(w, y - 6);
    ctx.lineTo(w, y + 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // big ghost brand name in the background
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  ctx.font = `200px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(p.name, -10, h * 0.62);
  ctx.restore();
  // the sneaker
  const shoe = getShoe(p.shoe);
  if (shoe) {
    ctx.save();
    ctx.translate(w * 0.6, h * 0.56);
    ctx.rotate(-0.12);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 14;
    const sw = h * 1.15, sh = sw * (shoe.height / shoe.width);
    ctx.drawImage(shoe, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
  const ink = p.dark ? '#14112a' : '#ffffff';
  // brand mark + wordmark (slanted for speed)
  ctx.save();
  ctx.translate(26, 30);
  drawMark(ctx, p.mark, 0, 0, 46, ink);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  ctx.fillStyle = ink;
  ctx.font = `76px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(p.name, 60, -4);
  ctx.restore();
  // tagline
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.9;
  ctx.font = `900 22px ${BODY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(p.tag, 30, h - 30);
  ctx.globalAlpha = 1;
  // underline accent
  ctx.fillStyle = ink;
  ctx.fillRect(30, h - 22, 70, 5);
  if (p.badge) {
    ctx.save();
    ctx.translate(w - 92, 34);
    ctx.rotate(0.12);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, -50, -18, 100, 36, 18);
    ctx.fill();
    ctx.fillStyle = p.c2;
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.badge, 0, 2);
    ctx.restore();
  }
}

function drawEvent(ctx, w, h, p, getShoe) {
  ctx.fillStyle = p.c1;
  ctx.fillRect(0, 0, w, h);
  // perspective running-track lanes
  ctx.save();
  ctx.strokeStyle = p.c2;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 3;
  const vx = w * 0.72, vy = h * 0.38;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx + i * 120, h + 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.25;
  for (let k = 1; k < 6; k++) {
    const t = Math.pow(k / 6, 1.8);
    ctx.beginPath();
    ctx.moveTo(0, vy + (h - vy) * t);
    ctx.lineTo(w, vy + (h - vy) * t);
    ctx.stroke();
  }
  ctx.restore();
  // glow sun / horizon
  const rg = ctx.createRadialGradient(vx, vy, 4, vx, vy, 160);
  rg.addColorStop(0, p.c2);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  // text
  ctx.fillStyle = '#ffffff';
  ctx.font = `34px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(p.title, 28, 24);
  ctx.save();
  ctx.shadowColor = p.c2;
  ctx.shadowBlur = 28;
  ctx.fillStyle = p.c2;
  ctx.font = `150px ${FONT}`;
  ctx.transform(1, 0, -0.15, 1, 0, 0);
  ctx.fillText(p.big, 50, 58);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 19px ${BODY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(p.sub, 30, h - 28);
  // finisher medal
  ctx.save();
  ctx.translate(w - 70, h - 78);
  ctx.strokeStyle = p.c2;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-18, -60); ctx.lineTo(0, -20); ctx.lineTo(18, -60); ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b87800';
  ctx.font = `22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 0, 1);
  ctx.restore();
}

/** Original geometric brand marks. */
function drawMark(ctx, kind, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.14;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'chevron':
      for (const o of [0, s * 0.38]) { ctx.beginPath(); ctx.moveTo(o + s * 0.1, s * 0.15); ctx.lineTo(o + s * 0.42, s * 0.5); ctx.lineTo(o + s * 0.1, s * 0.85); ctx.stroke(); }
      break;
    case 'orbit':
      ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.5, s * 0.42, s * 0.2, -0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.14, 0, Math.PI * 2); ctx.fill();
      break;
    case 'wave':
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) { const px = (k / 12) * s, py = s * (0.35 + i * 0.32) + Math.sin(k * 0.9) * s * 0.08; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke();
      }
      break;
    case 'bolt':
      ctx.beginPath(); ctx.moveTo(s * 0.62, 0); ctx.lineTo(s * 0.2, s * 0.56); ctx.lineTo(s * 0.48, s * 0.56); ctx.lineTo(s * 0.34, s); ctx.lineTo(s * 0.82, s * 0.4); ctx.lineTo(s * 0.54, s * 0.4); ctx.closePath(); ctx.fill();
      break;
    case 'star':
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? s * 0.14 : s * 0.5; const px = s * 0.5 + Math.cos(a) * r, py = s * 0.5 + Math.sin(a) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fill();
      break;
    case 'hex':
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, px = s * 0.5 + Math.cos(a) * s * 0.45, py = s * 0.5 + Math.sin(a) * s * 0.45; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.12, 0, Math.PI * 2); ctx.fill();
      break;
  }
  ctx.restore();
}

/** Side-profile sneaker outline (original), drawn into a w×h box. */
export function sneakerOutlinePath(ctx, x, y, w, h) {
  const P = (u, v) => [x + u * w, y + v * h];
  ctx.beginPath();
  ctx.moveTo(...P(0.04, 0.86));
  ctx.lineTo(...P(0.86, 0.86));
  ctx.quadraticCurveTo(...P(1.0, 0.86), ...P(0.98, 0.66));
  ctx.quadraticCurveTo(...P(0.94, 0.5), ...P(0.72, 0.42));
  ctx.lineTo(...P(0.46, 0.18));
  ctx.quadraticCurveTo(...P(0.4, 0.1), ...P(0.33, 0.14));
  ctx.quadraticCurveTo(...P(0.24, 0.22), ...P(0.14, 0.12));
  ctx.quadraticCurveTo(...P(0.04, 0.12), ...P(0.03, 0.4));
  ctx.closePath();
}

/** Glowing neon sign plane with a sneaker outline + speed lines. */
export function neonSneakerSign(width, color = '#5ff3ff', accent = '#ff3d7f') {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const glowStroke = (col, lw) => {
    for (const [blur, a] of [[26, 0.9], [10, 1]]) {
      ctx.shadowColor = col; ctx.shadowBlur = blur; ctx.globalAlpha = a;
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw * 0.35; ctx.stroke();
  };
  sneakerOutlinePath(ctx, 150, 40, 320, 170);
  glowStroke(color, 9);
  // sole line + lace marks
  ctx.beginPath(); ctx.moveTo(165, 176); ctx.lineTo(452, 176); glowStroke(color, 6);
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(300 + i * 26, 92 + i * 18); ctx.lineTo(318 + i * 26, 84 + i * 18); glowStroke(accent, 6); }
  // speed lines behind
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(30 + i * 20, 90 + i * 34); ctx.lineTo(120 + i * 6, 90 + i * 34); glowStroke(accent, 7); }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, fog: false, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, width / 2), mat);
}

// Canvas-texture text: neon signs, floating sprite labels, big screens.
import * as THREE from 'three';
import { roundRect } from './Geo.js';

export const FONT = '"Lilita One", "Arial Black", "Trebuchet MS", system-ui, sans-serif';

export function canvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx, texture };
}

/** Glowing neon sign plane. */
export function neonSign(text, { width = 8, color = '#ff3d7f', bg = 'rgba(10,8,24,0.85)', sub = null, subColor = '#ffffff', px = 512 } = {}) {
  const h = sub ? px * 0.36 : px * 0.25;
  const { canvas, ctx, texture } = canvasTexture(px, Math.round(h));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, 6, 6, canvas.width - 12, canvas.height - 12, 28);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = px * 0.12;
  ctx.font = `${size}px ${FONT}`;
  while (ctx.measureText(text).width > canvas.width * 0.88 && size > 10) { size -= 2; ctx.font = `${size}px ${FONT}`; }
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#ffffff';
  const ty = sub ? canvas.height * 0.4 : canvas.height / 2;
  ctx.fillText(text, canvas.width / 2, ty);
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.fillText(text, canvas.width / 2, ty);
  ctx.globalAlpha = 1;
  if (sub) {
    ctx.shadowBlur = 0;
    ctx.font = `${px * 0.06}px ${FONT}`;
    ctx.fillStyle = subColor;
    ctx.fillText(sub, canvas.width / 2, canvas.height * 0.74);
  }
  texture.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * (canvas.height / canvas.width)), mat);
  return mesh;
}

/** Camera-facing floating label (sprite). Returns { sprite, set(text, sub) }. */
export function floatingLabel(text, { color = '#ffd23f', scale = 3.2, sub = '' } = {}) {
  const { canvas, ctx, texture } = canvasTexture(512, 192);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale * (192 / 512), 1);
  sprite.renderOrder = 4;
  const set = (t, s = '', c = color) => {
    ctx.clearRect(0, 0, 512, 192);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 70;
    ctx.font = `${size}px ${FONT}`;
    while (ctx.measureText(t).width > 480 && size > 20) { size -= 4; ctx.font = `${size}px ${FONT}`; }
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(15,12,35,0.9)';
    ctx.strokeText(t, 256, s ? 70 : 96);
    ctx.fillStyle = c;
    ctx.fillText(t, 256, s ? 70 : 96);
    if (s) {
      ctx.font = `44px ${FONT}`;
      ctx.lineWidth = 10;
      ctx.strokeText(s, 256, 144);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(s, 256, 144);
    }
    texture.needsUpdate = true;
  };
  set(text, sub);
  return { sprite, set };
}

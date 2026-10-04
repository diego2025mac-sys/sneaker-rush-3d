// Soft contact-shadow blobs under the character and pets. They ground objects visually at a
// tiny cost (one transparent quad each, shared texture/material) and work on every quality
// level — including LOW where real shadow maps are off.
import * as THREE from 'three';

let TEX = null;
function texture() {
  if (TEX) return TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(0,0,0,0.85)');
  r.addColorStop(0.45, 'rgba(0,0,0,0.45)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  TEX = new THREE.CanvasTexture(c);
  return TEX;
}

export class ContactShadows {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.free = [];
  }

  create(radius = 0.5) {
    const m = this.free.pop() || new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ map: texture(), transparent: true, depthWrite: false, opacity: 0.5, fog: false, toneMapped: false }));
    m.renderOrder = 1;
    m.scale.set(radius * 2, 1, radius * 2);
    m.visible = true;
    this.scene.add(m);
    return m;
  }

  release(m) {
    m.removeFromParent();
    this.free.push(m);
  }

  /** opacity shrinks / fades with height above the ground. */
  place(m, x, z, radius, opacity, y = 0.025) {
    m.position.set(x, y, z);
    m.scale.set(radius * 2, 1, radius * 2);
    m.material.opacity = opacity;
  }
}

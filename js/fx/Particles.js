// One pooled GPU point cloud for every particle effect in the game (single draw call).
import * as THREE from 'three';
import { QUALITY } from '../config/balance.js';

export class Particles {
  constructor(scene, max = QUALITY.maxParticles, additive = true) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.cursor = 0;
    this.alive = 0;
    this.budget = 1;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: window.innerHeight / 2 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float uScale;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.1, d) * vAlpha;
          gl_FragColor = vec4(vColor * (1.0 + (0.25 - d) * 1.5), a);
          #include <colorspace_fragment>
        }`,
    });
    this.material = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  resize() { this.material.uniforms.uScale.value = window.innerHeight / 2; }

  emit(x, y, z, vx, vy, vz, color, size = 0.3, life = 0.8, grav = 0, drag = 1) {
    if (this.budget < 1 && Math.random() > this.budget) return; // quality preset particle budget
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this._c.set(color);
    this.col[i3] = this._c.r; this.col[i3 + 1] = this._c.g; this.col[i3 + 2] = this._c.b;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.alpha[i] = 1;
  }

  burst(p, { count = 16, color = 0xffffff, speed = 4, up = 3, life = 0.7, size = 0.35, gravity = 9, spread = 1, colors = null } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6) * spread;
      this.emit(p.x, p.y, p.z, Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s,
        colors ? colors[i % colors.length] : color, size * (0.6 + Math.random() * 0.6), life * (0.7 + Math.random() * 0.6), gravity, 0.985);
    }
  }

  ring(p, color = 0x7dff6a, count = 28, radius = 0.5, speed = 6) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.emit(p.x + Math.cos(a) * radius, p.y + 0.2, p.z + Math.sin(a) * radius, Math.cos(a) * speed, 0.6, Math.sin(a) * speed, color, 0.45, 0.6, 0, 0.93);
    }
  }

  sparkle(p, color, spread = 0.8, count = 1) {
    for (let i = 0; i < count; i++) {
      this.emit(p.x + (Math.random() - 0.5) * spread, p.y + Math.random() * spread, p.z + (Math.random() - 0.5) * spread,
        0, 1 + Math.random() * 1.5, 0, color, 0.18 + Math.random() * 0.2, 0.9, -0.5, 0.98);
    }
  }

  smoke(p, color = 0x777777, size = 1.5, rise = 2) {
    this.emit(p.x + (Math.random() - 0.5), p.y, p.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.6, rise, (Math.random() - 0.5) * 0.6, color, size, 3, -0.2, 0.99);
  }

  /** Floating-origin support: move every particle along Z. */
  shiftZ(dz) {
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 2] += dz;
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; }
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i3] *= d; this.vel[i3 + 1] *= d; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 2);
      this.size[i] = this.baseSize[i] * (0.4 + t * 0.6);
    }
    this.alive = alive;
    const a = this.geo.attributes;
    a.position.needsUpdate = true;
    a.color.needsUpdate = true;
    a.size.needsUpdate = true;
    a.alpha.needsUpdate = true;
  }
}

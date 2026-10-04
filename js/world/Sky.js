// Gradient sky dome + star field + lights. Colours are blended by the run track as biomes change.
import * as THREE from 'three';
import { mulberry32 } from '../utils/math.js';

const _ca = new THREE.Color(), _cb = new THREE.Color();

export class Sky {
  constructor(scene, renderer, mobile) {
    this.scene = scene;
    this.uniforms = {
      top: { value: new THREE.Color(0x4aa8ff) },
      bottom: { value: new THREE.Color(0xcfeaff) },
      stars: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y * 1.4 + 0.15, 0.0, 1.0);
          vec3 c = mix(bottom, top, pow(h, 0.8));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // stars (visible in neon / space)
    const rnd = mulberry32(99);
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = 800;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * s * r; pos[i * 3 + 1] = Math.abs(u) * r * 0.9 + 20; pos[i * 3 + 2] = Math.sin(a) * s * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // lights
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a8070, 1.15);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    this.sunOffset = new THREE.Vector3(18, 32, 12);
    this.sun.castShadow = true;
    const sz = mobile ? 512 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    const c = this.sun.shadow.camera;
    c.left = -22; c.right = 22; c.top = 22; c.bottom = -22; c.near = 1; c.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog(0xbfe0ff, 90, 430);
  }

  /** Apply a palette object ({skyTop, skyBottom, fog, fogNear, fogFar, sun, sunI, hemiSky, hemiGround, hemiI, stars}). */
  apply(p) {
    this.uniforms.top.value.set(p.skyTop);
    this.uniforms.bottom.value.set(p.skyBottom);
    this.scene.fog.color.set(p.fog);
    this.scene.fog.near = p.fogNear;
    this.scene.fog.far = p.fogFar;
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunI;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiI;
    this.starMat.opacity = p.stars;
    this.stars.visible = p.stars > 0.01;
  }

  /** Blend between two palettes (t: 0..1). */
  blend(a, b, t) {
    const L = (x, y) => x + (y - x) * t;
    const C = (x, y) => _ca.set(x).lerp(_cb.set(y), t);
    this.uniforms.top.value.copy(C(a.skyTop, b.skyTop));
    this.uniforms.bottom.value.copy(C(a.skyBottom, b.skyBottom));
    this.scene.fog.color.copy(C(a.fog, b.fog));
    this.scene.fog.near = L(a.fogNear, b.fogNear);
    this.scene.fog.far = L(a.fogFar, b.fogFar);
    this.sun.color.copy(C(a.sun, b.sun));
    this.sun.intensity = L(a.sunI, b.sunI);
    this.hemi.color.copy(C(a.hemiSky, b.hemiSky));
    this.hemi.groundColor.copy(C(a.hemiGround, b.hemiGround));
    this.hemi.intensity = L(a.hemiI, b.hemiI);
    this.starMat.opacity = L(a.stars, b.stars);
    this.stars.visible = this.starMat.opacity > 0.01;
  }

  follow(target) {
    this.dome.position.copy(target);
    this.stars.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
    this.sun.target.position.copy(target);
  }
}

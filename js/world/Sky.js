// Gradient sky dome + star field + lights. Colours are blended by the run track as biomes change.
// Run palettes add a horizon haze band, a soft glow toward the sun and softer shadows; palettes without
// those fields (the lobby) render exactly as before.
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
      horizon: { value: new THREE.Color(0xcfeaff) },
      horizonMix: { value: 0 },
      sunDir: { value: new THREE.Vector3(18, 32, 12).normalize() },
      sunColor: { value: new THREE.Color(0xffffff) },
      sunGlow: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon; uniform float horizonMix;
        uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y * 1.4 + 0.15, 0.0, 1.0);
          vec3 c = mix(bottom, top, pow(h, 0.8));
          // haze band hugging the horizon (and filling everything below it)
          float band = d.y < 0.0 ? 1.0 : exp(-d.y * 9.0);
          c = mix(c, horizon, horizonMix * band);
          // broad warm glow toward the sun's azimuth, strongest near the horizon
          vec2 az = normalize(d.xz + 1e-4), saz = normalize(sunDir.xz);
          float toward = pow(max(dot(az, saz), 0.0), 3.0);
          c += sunColor * sunGlow * toward * (0.35 * band + 0.25 * pow(max(dot(d, sunDir), 0.0), 24.0));
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
    this.uniforms.horizon.value.set(p.horizon ?? p.skyBottom);
    this.uniforms.horizonMix.value = p.horizon !== undefined ? 1 : 0;
    this.uniforms.sunColor.value.set(p.sun);
    this.uniforms.sunGlow.value = p.horizon !== undefined ? 0.22 : 0;
    this.sun.shadow.intensity = p.shadowI ?? 1;
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
    this.uniforms.horizon.value.copy(C(a.horizon ?? a.skyBottom, b.horizon ?? b.skyBottom));
    this.uniforms.horizonMix.value = L(a.horizon !== undefined ? 1 : 0, b.horizon !== undefined ? 1 : 0);
    this.uniforms.sunColor.value.copy(this.sun.color);
    this.uniforms.sunGlow.value = 0.22 * this.uniforms.horizonMix.value;
    this.sun.shadow.intensity = L(a.shadowI ?? 1, b.shadowI ?? 1);
  }

  /** Keep the sky, stars and the shadow frustum around `target`; `lead` shifts the shadow area ahead (runs). */
  follow(target, lead = 0) {
    this.dome.position.copy(target);
    this.stars.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
    this.sun.target.position.copy(target);
    if (lead) { this.sun.position.z += lead; this.sun.target.position.z += lead; }
  }
}

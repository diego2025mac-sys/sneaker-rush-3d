// Rendering setup in one place: colour management, tone mapping/exposure, quality presets,
// image-based lighting, shadow settings and the optional post-processing stack.
//
//   LOW    no shadows maps, no environment, no post — contact blobs only
//   MEDIUM 1024 shadows, generated RoomEnvironment for reflections, direct render
//   HIGH   2048 soft shadows, HDR environment (assets/textures/env, else RoomEnvironment),
//          EffectComposer: MSAA → subtle UnrealBloom (HDR threshold, neon only) → vignette → OutputPass
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RENDER, QUALITY_PRESETS } from '../config/balance.js';
import { GLOW } from '../utils/Geo.js';

// Multiplicative edge darkening. (The stock VignetteShader mixes toward flat grey, which in a
// linear HDR buffer lifts the shadows and makes the whole frame look washed out.)
const Vignette = {
  uniforms: { tDiffuse: { value: null }, offset: { value: 1 }, darkness: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float offset; uniform float darkness; varying vec2 vUv;
    void main(){ vec4 t = texture2D(tDiffuse, vUv); float d = length((vUv - 0.5) * offset);
      gl_FragColor = vec4(t.rgb * (1.0 - darkness * smoothstep(0.38, 0.85, d)), t.a); }`,
};

const TONE = { ACES: THREE.ACESFilmicToneMapping, AgX: THREE.AgXToneMapping, Neutral: THREE.NeutralToneMapping, None: THREE.NoToneMapping };

export class RenderPipeline {
  constructor(renderer, scene, camera, { sky, assets, materials, mobile }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sky = sky;
    this.assets = assets;
    this.materials = materials;
    this.mobile = mobile;
    this.autoScale = 1;
    this.composer = null;
    this.envs = {};
    this.qualityName = null;
    // colour management (single source of truth)
    THREE.ColorManagement.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = TONE[RENDER.toneMapping] ?? THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = RENDER.exposure;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  /** 'auto' → high on desktop, medium on touch devices (adaptive FPS can lower it). */
  resolve(setting) {
    if (setting && setting !== 'auto' && QUALITY_PRESETS[setting]) return setting;
    return this.autoLevel || (this.mobile ? 'medium' : 'high');
  }

  async apply(setting) {
    const name = this.resolve(setting);
    const q = QUALITY_PRESETS[name];
    this.qualityName = name;
    this.preset = q;
    const r = this.renderer;
    r.setPixelRatio(Math.max(0.75, Math.min(window.devicePixelRatio || 1, q.pixelRatio) * this.autoScale));
    // shadows
    r.shadowMap.enabled = q.shadows;
    const sun = this.sky.sun;
    sun.castShadow = q.shadows;
    if (sun.shadow.mapSize.x !== q.shadowMap) {
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = q.shadowMap >= 2048 ? 0.018 : 0.03;
    sun.shadow.radius = 3;
    // emissive strength (feeds bloom on HIGH)
    GLOW.factor = q.emissive;
    this.materials.setEmissiveFactor(q.emissive);
    // environment
    const env = await this.environment(q.env);
    this.scene.environment = env;
    this.envName = !env ? 'none' : env === this.envs.hdr ? 'hdr' : 'room';
    // post
    if (q.post) this.buildComposer(); else this.disposeComposer();
    this.resize();
    return name;
  }

  async environment(kind) {
    if (kind === 'none') return null;
    if (kind === 'hdr') {
      if (this.envs.hdr === undefined) {
        const hdr = await this.assets.loadHDR(RENDER.hdrEnvironment);
        this.envs.hdr = hdr ? this.pmrem.fromEquirectangular(hdr).texture : null;
      }
      if (this.envs.hdr) return this.envs.hdr;
    }
    if (!this.envs.room) this.envs.room = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    return this.envs.room;
  }

  buildComposer() {
    if (this.composer) return;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(r, target);
    c.addPass(new RenderPass(this.scene, this.camera));
    const b = RENDER.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), b.strength, b.radius, b.threshold);
    c.addPass(this.bloom);
    const v = new ShaderPass(Vignette);
    v.uniforms.offset.value = RENDER.vignette.offset;
    v.uniforms.darkness.value = RENDER.vignette.darkness;
    c.addPass(v);
    c.addPass(new OutputPass()); // tone mapping + sRGB conversion
    this.composer = c;
  }

  disposeComposer() {
    if (!this.composer) return;
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.composer = null;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

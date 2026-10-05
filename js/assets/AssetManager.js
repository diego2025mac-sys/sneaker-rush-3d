// Loads and caches imported assets (GLB/GLTF, HDR). Each file is fetched at most once;
// callers clone the cached result. Supports Draco + Meshopt geometry and KTX2 (Basis) textures.
// Only files listed in <root>/manifest.json are requested, so missing optional assets
// never trigger 404s — they just resolve to null and the game uses its fallback model.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ASSET_ROOT } from '../config/assets.js';
import { bus } from '../core/EventBus.js';

const DECODERS = 'lib/addons/libs/';

export class AssetManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.root = ASSET_ROOT;
    this.files = new Map();   // path → bytes
    this.cache = new Map();   // path → Promise<result|null>
    this.done = new Map();    // path → result (resolved, for synchronous access)
    this.failed = new Set();  // paths whose request or parse failed
    this.stats = { requested: 0, loaded: 0, failed: 0, bytes: 0, ms: 0, log: [] };
    this._gltf = null;
  }

  /** Read the manifest. `root` can be switched (e.g. to test fixtures) before init. */
  async init(root = this.root) {
    this.root = root.endsWith('/') ? root : root + '/';
    try {
      const res = await fetch(this.root + 'manifest.json', { cache: 'no-cache' });
      if (res.ok) {
        const m = await res.json();
        for (const f of m.files || []) this.files.set(f.path, f.bytes || 0);
      }
    } catch (e) {
      console.info('[Assets] no manifest — using fallback models only');
    }
    console.info(`[Assets] ${this.files.size} asset file(s) available in ${this.root}`);
    return this;
  }

  has(path) { return this.files.has(path); }
  get(path) { return this.done.get(path) || null; }

  get gltfLoader() {
    if (!this._gltf) {
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath(DECODERS + 'draco/gltf/');
      loader.setDRACOLoader(draco);
      loader.setMeshoptDecoder(MeshoptDecoder);
      try {
        const ktx2 = new KTX2Loader();
        ktx2.setTranscoderPath(DECODERS + 'basis/');
        ktx2.detectSupport(this.renderer);
        loader.setKTX2Loader(ktx2);
      } catch (e) {
        console.info('[Assets] KTX2 unavailable', e?.message);
      }
      this._gltf = loader;
    }
    return this._gltf;
  }

  /** Load a GLB/GLTF once. Resolves to the gltf object, or null if missing/broken. */
  loadGLTF(path) {
    if (!this.has(path)) return Promise.resolve(null);
    if (this.cache.has(path)) return this.cache.get(path);
    this.stats.requested++;
    const t0 = performance.now();
    const p = new Promise((resolve) => {
      this.gltfLoader.load(this.root + path, (gltf) => {
        const ms = performance.now() - t0;
        this.stats.loaded++;
        this.stats.bytes += this.files.get(path) || 0;
        this.stats.ms += ms;
        this.stats.log.push({ path, ms: Math.round(ms), kb: Math.round((this.files.get(path) || 0) / 1024) });
        this.done.set(path, gltf);
        bus.emit('assets:loaded', { path });
        resolve(gltf);
      }, undefined, (err) => {
        this.stats.failed++;
        this.failed.add(path);
        console.warn(`[Assets] failed to load ${path} — using fallback`, err?.message || err);
        resolve(null);
      });
    });
    this.cache.set(path, p);
    return p;
  }

  /** Equirectangular .hdr environment (returns a DataTexture or null). */
  loadHDR(path) {
    if (!this.has(path)) return Promise.resolve(null);
    if (this.cache.has(path)) return this.cache.get(path);
    const p = new Promise((resolve) => {
      new RGBELoader().load(this.root + path, (tex) => { this.done.set(path, tex); resolve(tex); }, undefined, () => resolve(null));
    });
    this.cache.set(path, p);
    return p;
  }

  /** Load several in parallel, with an optional overall timeout so a slow file never blocks boot. */
  async preload(paths, { timeoutMs = 15000, onProgress } = {}) {
    const list = paths.filter((p) => this.has(p));
    let n = 0;
    const jobs = list.map((p) => (p.endsWith('.hdr') ? this.loadHDR(p) : this.loadGLTF(p)).then((r) => { onProgress?.(++n / list.length); return r; }));
    await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeoutMs))]);
  }
}

// Renders real 3D models (sneakers, pets, eggs) into small PNG data-URLs for the UI cards.
// Uses the main renderer + one reusable render target; results are cached forever.
import * as THREE from 'three';
import { silhouetteMaterial } from '../player/SneakerModel.js';
import { eggGeometry, eggMaterial } from '../pets/EggModel.js';
import { PETS, EGG_BY_ID } from '../config/pets.js';

const W = 224, H = 168; // 4:3 cards
const SHOE_VIEW = { ry: -1.2, rx: 0.32, pad: 1.08 };

export class Thumbnails {
  constructor(renderer, library) {
    this.renderer = renderer;
    this.library = library; // visuals come from the ModelLibrary (GLB when available)
    this.cache = new Map();
    this.scene = new THREE.Scene();
    // studio lighting: soft sky fill, warm key from top-left, cool rim from behind
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6488, 1.5));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    key.position.set(-2, 4, 4);
    const rim = new THREE.DirectionalLight(0x9ad8ff, 1.8);
    rim.position.set(3, 2, -4);
    this.scene.add(key, rim);
    this.canvasCache = new Map();
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 50);
    this.target = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.pixels = new Uint8Array(W * H * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(W, H);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    this.scene.add(this.mesh);
  }

  /** Render a model to a transparent canvas (cached). */
  renderCanvas(key, geometry, material, opts) {
    if (this.canvasCache.has(key)) return this.canvasCache.get(key);
    this.render(key, geometry, material, opts);
    return this.canvasCache.get(key) || null;
  }

  render(key, geometry, material, opts) {
    if (this.cache.has(key)) return this.cache.get(key);
    this.mesh.geometry = geometry;
    this.mesh.material = material;
    return this.renderObject(key, this.mesh, opts, false);
  }

  /** Render any Object3D (imported or procedural) with the shared studio setup. */
  renderObject(key, obj, { ry = 0.6, rx = 0.25, pad = 1.15 } = {}, temporary = true) {
    if (this.cache.has(key)) return this.cache.get(key);
    let url = '';
    const holder = new THREE.Group();
    holder.add(obj);
    this.scene.add(holder);
    if (this.mesh !== obj) this.mesh.visible = false;
    try {
      const m = holder;
      m.rotation.set(rx, ry, 0);
      m.position.set(0, 0, 0);
      m.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m);
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      m.position.sub(c);
      // fit the projected width and height into the 4:3 frame (nothing gets clipped)
      const t = Math.tan((this.camera.fov * Math.PI) / 360);
      const half = Math.max(s.y / 2, s.x / 2 / this.camera.aspect) * pad;
      this.camera.position.set(0, 0, half / t + s.z / 2);
      this.camera.near = this.camera.position.z * 0.1;
      this.camera.far = this.camera.position.z * 4;
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
      const r0 = this.renderer;
      const prevTarget = r0.getRenderTarget();
      const prevClear = r0.getClearAlpha();
      const prevColor = r0.getClearColor(new THREE.Color());
      r0.setRenderTarget(this.target);
      r0.setClearColor(0x000000, 0);
      r0.clear();
      r0.render(this.scene, this.camera);
      r0.readRenderTargetPixels(this.target, 0, 0, W, H, this.pixels);
      r0.setRenderTarget(prevTarget);
      r0.setClearColor(prevColor, prevClear);
      // flip Y
      const d = this.img.data;
      for (let y = 0; y < H; y++) {
        const src = (H - 1 - y) * W * 4;
        d.set(this.pixels.subarray(src, src + W * 4), y * W * 4);
      }
      this.ctx.putImageData(this.img, 0, 0);
      url = this.canvas.toDataURL('image/png');
      const copy = document.createElement('canvas');
      copy.width = W;
      copy.height = H;
      copy.getContext('2d').drawImage(this.canvas, 0, 0);
      this.canvasCache.set(key, copy);
    } catch (e) {
      console.warn('[Thumbnails] render failed', e);
    }
    this.scene.remove(holder);
    if (!temporary) { holder.remove(obj); this.scene.add(obj); obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); }
    this.mesh.visible = true;
    this.cache.set(key, url);
    return url;
  }

  // Every sneaker uses the same three-quarter view: toe toward the viewer's left, lateral side
  // facing the camera, seen slightly from above. The bounding box fit gives a consistent scale.
  sneakerKey(id, locked) { return 's:' + id + ':' + (this.library.isSneakerReady(id) ? 'glb' : 'proc') + (locked ? ':l' : ''); }

  sneaker(id, locked = false) {
    const key = this.sneakerKey(id, locked);
    if (this.cache.has(key)) return this.cache.get(key);
    const obj = this.library.createSneaker(id);
    if (locked) obj.traverse((o) => { if (o.isMesh) o.material = silhouetteMaterial; });
    return this.renderObject(key, obj, SHOE_VIEW);
  }

  sneakerCanvas(id) {
    this.sneaker(id);
    return this.canvasCache.get(this.sneakerKey(id, false)) || null;
  }

  pet(id) {
    const key = 'p:' + id + ':' + (this.library.templates.has('pet:' + PETS[id].species) ? 'glb' : 'proc');
    if (this.cache.has(key)) return this.cache.get(key);
    return this.renderObject(key, this.library.createPet(id).object, { ry: 0.5, rx: 0.15 });
  }

  egg(id) {
    return this.render('e:' + id, eggGeometry(EGG_BY_ID[id]), eggMaterial(), { ry: 0.3, rx: 0.1 });
  }
}

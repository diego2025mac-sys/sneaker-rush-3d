// One place where the game asks for visual models. Every request returns something usable:
// the imported GLB (normalised + cloned from a cached template) when it exists, otherwise the
// procedural prototype model. Gameplay never depends on which one it got.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SNEAKER_FILES, SNEAKER_SPEC, PET_FILES, PET_SPEC, PROPS, CHARACTER, ASSET_OVERRIDES } from '../config/assets.js';
import { PETS } from '../config/pets.js';
import { SNEAKER_BY_ID } from '../config/sneakers.js';
import { sneakerGeometry, sneakerMaterial } from '../player/SneakerModel.js';
import { makePetMesh } from '../pets/PetModel.js';
import { bus } from '../core/EventBus.js';

const _box = new THREE.Box3(), _size = new THREE.Vector3(), _ctr = new THREE.Vector3();

/** Wrap a model so its bounding box matches a target size and sits on y = 0. */
function normalise(scene, { length, height, alongZ = true, anchorZ = null }, override = {}) {
  const inner = scene;
  if (override.rotateY) inner.rotation.y += THREE.MathUtils.degToRad(override.rotateY);
  inner.updateMatrixWorld(true);
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  wrapper.updateMatrixWorld(true);
  _box.setFromObject(inner, true).getSize(_size);
  let s = 1;
  if (length) s = length / Math.max(alongZ ? _size.z : Math.max(_size.x, _size.z), 1e-6);
  else if (height) s = height / Math.max(_size.y, 1e-6);
  s *= override.scale || 1;
  inner.scale.multiplyScalar(s);
  wrapper.updateMatrixWorld(true);
  _box.setFromObject(inner, true);
  _box.getCenter(_ctr);
  inner.position.x -= _ctr.x;
  inner.position.y -= _box.min.y;
  inner.position.z -= anchorZ === null ? _ctr.z : _box.min.z + (_box.max.z - _box.min.z) * anchorZ;
  if (override.offset) inner.position.add(new THREE.Vector3(...override.offset));
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

export class ModelLibrary {
  constructor(assets, materials) {
    this.assets = assets;
    this.materials = materials;
    this.templates = new Map(); // key → { root, animations }
  }

  // ------------------------------------------------------------ generic --
  async template(key, path, fit) {
    if (this.templates.has(key)) return this.templates.get(key);
    const gltf = await this.assets.loadGLTF(path);
    if (!gltf) return null;
    if (this.templates.has(key)) return this.templates.get(key);
    const root = normalise(gltf.scene, fit, ASSET_OVERRIDES[path] || {});
    this.materials.prepare(root);
    this.materials.track(root);
    const t = { root, animations: gltf.animations || [], path };
    this.templates.set(key, t);
    bus.emit('models:ready', { key });
    return t;
  }

  cloneOf(t) { return SkeletonUtils.clone(t.root); }

  // ----------------------------------------------------------- sneakers --
  sneakerPath(id) { return `sneakers/${SNEAKER_FILES[id]}.glb`; }
  hasSneakerAsset(id) { return this.assets.has(this.sneakerPath(id)); }
  isSneakerReady(id) { return this.templates.has('sneaker:' + id); }
  loadSneaker(id) {
    return this.template('sneaker:' + id, this.sneakerPath(id), { length: SNEAKER_SPEC.length, alongZ: true, anchorZ: SNEAKER_SPEC.ankleU });
  }
  /** Sneaker object for feet, shelves and thumbnails. side −1 = left (mirrored). */
  createSneaker(id, side = 1) {
    const t = this.templates.get('sneaker:' + id);
    let obj;
    if (t) {
      obj = this.cloneOf(t);
      obj.userData.source = 'glb';
    } else {
      obj = new THREE.Mesh(sneakerGeometry(SNEAKER_BY_ID[id] ? id : 'starter'), sneakerMaterial());
      obj.castShadow = true;
      obj.userData.source = 'procedural';
    }
    if (side < 0) obj.scale.x *= -1;
    return obj;
  }
  /** Preload every sneaker file (called lazily when the shop opens). */
  preloadSneakers() {
    return Promise.all(Object.keys(SNEAKER_FILES).map((id) => this.loadSneaker(id)));
  }

  // --------------------------------------------------------------- pets --
  petPath(id) {
    const sp = PETS[id]?.species;
    return `pets/${PET_FILES[sp] || sp}.glb`;
  }
  loadPet(id) {
    const sp = PETS[id]?.species;
    return this.template('pet:' + sp, this.petPath(id), { height: PET_SPEC.height, anchorZ: null });
  }
  /** { object, mixer? } — GLB species model with its finish, or the procedural pet. */
  createPet(id) {
    const def = PETS[id];
    const t = this.templates.get('pet:' + def.species);
    if (!t) {
      const m = makePetMesh(id);
      m.userData.source = 'procedural';
      return { object: m, mixer: null };
    }
    const object = this.cloneOf(t);
    object.userData.source = 'glb';
    if (def.finish && def.finish !== 'normal') this.materials.applyFinish(object, def.finish, def.colors.map((c) => new THREE.Color(c)));
    let mixer = null;
    const clip = pickClip(t.animations, ['idle', 'float', 'fly', 'hover', 'walk']);
    if (clip) {
      mixer = new THREE.AnimationMixer(object);
      mixer.clipAction(clip).play();
    }
    return { object, mixer };
  }

  // -------------------------------------------------------------- props --
  loadProp(name) {
    const p = PROPS[name];
    return p ? this.template('prop:' + name, p.file, { ...p.fit, alongZ: false }) : Promise.resolve(null);
  }
  hasPropReady(name) { return this.templates.has('prop:' + name); }
  createProp(name) {
    const t = this.templates.get('prop:' + name);
    return t ? this.cloneOf(t) : null;
  }

  // ---------------------------------------------------------- character --
  loadCharacter() {
    return this.template('character', CHARACTER.file, { height: CHARACTER.height, anchorZ: null });
  }
  characterTemplate() { return this.templates.get('character') || null; }
}

/** Find the first animation clip whose name matches one of the aliases (case-insensitive). */
export function pickClip(clips, aliases) {
  if (!clips?.length) return null;
  const norm = (s) => s.toLowerCase().replace(/^.*\|/, '').trim();
  for (const a of aliases) {
    const exact = clips.find((c) => norm(c.name) === a);
    if (exact) return exact;
  }
  for (const a of aliases) {
    const partial = clips.find((c) => norm(c.name).includes(a));
    if (partial) return partial;
  }
  return null;
}

// Egg hatch sequence rendered as a 3D overlay on top of the world:
// egg drops in → shakes → cracks → flash → pet pops out with rarity rays. ~2 s (≈0.9 s in fast mode).
import * as THREE from 'three';
import { makeEggMesh } from '../pets/EggModel.js';
import { Particles } from './Particles.js';
import { RARITY_COLORS } from '../config/sneakers.js';
import { rarityIndex } from '../systems/Economy.js';

export class HatchScene {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 1.4, 6.2);
    this.camera.lookAt(0, 1.1, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5cff, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.5);
    d.position.set(2, 4, 5);
    this.scene.add(d);
    // dim backdrop
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ color: 0x0a0618, transparent: true, opacity: 0, depthWrite: false }));
    this.backdrop.position.set(0, 1, -6);
    this.scene.add(this.backdrop);
    // rays
    const rayGeo = new THREE.BufferGeometry();
    const pos = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = a0 + 0.12;
      pos.push(0, 0, 0, Math.cos(a0) * 9, Math.sin(a0) * 9, 0, Math.cos(a1) * 9, Math.sin(a1) * 9, 0);
    }
    rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.rays = new THREE.Mesh(rayGeo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.rays.position.set(0, 1.1, -1.5);
    this.scene.add(this.rays);
    this.particles = new Particles(this.scene, 300);
    this.ui = document.getElementById('hatch-ui');
    this.active = false;
    this.queue = [];
    this.egg = null;
    this.pet = null;
    this.ui.addEventListener('click', (e) => {
      const b = e.target.closest('[data-h]');
      if (!b) { if (this.phase === 'reveal' && this.t > 0.5) this.next(); return; }
      e.stopPropagation();
      if (b.dataset.h === 'skip') this.skip();
      if (b.dataset.h === 'again') this.game.hatchAgain();
      if (b.dataset.h === 'ok') this.next();
    });
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  /** results: [{ egg, def, autoEquipped }] */
  play(results) {
    this.queue.push(...results);
    if (!this.active) {
      this.active = true;
      this.start(this.queue.shift());
    }
  }

  start(r) {
    this.cur = r;
    this.t = 0;
    this.phase = 'shake';
    this.fast = this.game.state.settings.fastHatch || this.queue.length > 0;
    this.dur = this.fast ? 0.75 : 1.45;
    this.shakes = 0;
    if (this.egg) this.scene.remove(this.egg);
    if (this.pet) this.scene.remove(this.pet);
    this.egg = makeEggMesh(r.egg);
    this.egg.position.set(0, 0.2, 0);
    this.scene.add(this.egg);
    const { object, mixer } = this.game.library.createPet(r.def.id);
    this.pet = object;
    this.petMixer = mixer;
    this.pet.visible = false;
    this.pet.position.set(0, 0.9, 0);
    this.scene.add(this.pet);
    this.rank = rarityIndex(r.def.rarity);
    this.color = RARITY_COLORS[r.def.rarity];
    this.rays.material.color.set(this.color);
    this.rays.material.opacity = 0;
    const canSkip = this.game.state.stats.eggsHatched > 3 && !this.fast;
    this.ui.innerHTML = canSkip ? '<button class="btn small gray h-skip" data-h="skip" style="color:#fff">SKIP ⏩</button>' : '';
    this.ui.classList.remove('hidden');
  }

  skip() { if (this.phase === 'shake') this.t = this.dur; }

  reveal() {
    this.phase = 'reveal';
    this.t = 0;
    this.egg.visible = false;
    this.pet.visible = true;
    this.pet.scale.setScalar(0.01);
    const col = new THREE.Color(this.color).getHex();
    this.particles.burst(new THREE.Vector3(0, 1, 0), { count: 40 + this.rank * 15, colors: [col, 0xffffff, 0xffd23f], speed: 5, up: 4, life: 1.1, size: 0.25, gravity: 4 });
    this.game.hud.flash();
    this.game.audio.play('reveal', { rarity: this.rank });
    if (this.rank >= 4) this.game.platform.happytime();
    const d = this.cur.def;
    const words = ['COMMON', 'UNCOMMON', 'RARE!', 'EPIC!', 'LEGENDARY!!', 'MYTHIC!!!', 'SECRET!!!'];
    const again = this.queue.length === 0 && this.game.state.money >= this.cur.egg.price;
    this.ui.innerHTML = `
      <div class="h-rarity" style="color:${this.color}">${words[this.rank]}</div>
      <div class="h-name">${d.name.toUpperCase()}</div>
      <div class="h-mult">x${d.mult.toFixed(2)} MONEY</div>
      <div class="h-note">${this.cur.autoEquipped ? '✔ Equipped — it will follow you!' : 'Added to your pets (weaker than your equipped ones)'}</div>
      ${this.queue.length ? '' : `<div class="h-buttons"><button class="btn green" data-h="ok">AWESOME!</button>${again ? `<button class="btn gold" data-h="again">HATCH AGAIN</button>` : ''}</div>`}`;
  }

  next() {
    if (this.queue.length) this.start(this.queue.shift());
    else this.end();
  }

  end() {
    this.active = false;
    this.phase = null;
    this.ui.classList.add('hidden');
    this.ui.innerHTML = '';
    if (this.egg) { this.scene.remove(this.egg); this.egg = null; }
    if (this.pet) { this.scene.remove(this.pet); this.pet = null; }
    this.backdrop.material.opacity = 0;
    this.game.onHatchDone();
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.backdrop.material.opacity = Math.min(0.72, this.backdrop.material.opacity + dt * 3);
    if (this.phase === 'shake') {
      const k = this.t / this.dur;
      const drop = Math.min(1, this.t / 0.25);
      this.egg.position.y = 0.2 + (1 - drop) * 2.5;
      const intensity = Math.max(0, k - 0.15) * 1.2;
      this.egg.rotation.z = Math.sin(this.t * 38) * 0.25 * intensity;
      this.egg.rotation.y += dt * 0.8;
      this.egg.scale.setScalar(1.15 + Math.sin(this.t * 20) * 0.03 * intensity);
      const shakeIdx = Math.floor(k * 4);
      if (shakeIdx > this.shakes && shakeIdx <= 3) {
        this.shakes = shakeIdx;
        this.game.audio.play(shakeIdx === 3 ? 'crack' : 'shake', { i: shakeIdx });
        this.particles.burst(new THREE.Vector3(0, 0.9, 0.2), { count: 6, color: 0xffffff, speed: 2, up: 2, life: 0.4, size: 0.12, gravity: 6 });
      }
      if (this.t >= this.dur) this.reveal();
    } else if (this.phase === 'reveal') {
      const s = Math.min(1, this.t / 0.35);
      const pop = 1 + Math.sin(s * Math.PI) * 0.35;
      this.pet.scale.setScalar(1.7 * s * pop);
      this.pet.rotation.y = this.t * 1.5;
      this.pet.position.y = 0.9 + Math.sin(this.t * 3) * 0.08;
      this.petMixer?.update(dt);
      this.rays.material.opacity = Math.min(0.25 + this.rank * 0.08, this.t * 2);
      this.rays.rotation.z += dt * (0.4 + this.rank * 0.15);
      if (this.rank >= 3 && Math.random() < dt * 30) this.particles.sparkle(this.pet.position, new THREE.Color(this.color).getHex(), 1.6, 1);
      const autoClose = this.queue.length ? 1.1 : 3.2;
      if (this.t > autoClose) this.next();
    }
    this.particles.update(dt);
  }

  render(renderer) {
    if (!this.active) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}

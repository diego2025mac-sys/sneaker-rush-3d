// Game orchestrator: owns the renderer, scene, systems and the LOBBY ⇄ RUN loop.
import * as THREE from 'three';
import { CAMERA, QUALITY, LOBBY, MOUSE_LOOK, SAVE } from '../config/balance.js';
import { SNEAKERS, SNEAKER_BY_ID } from '../config/sneakers.js';
import { PETS, EGGS, EGG_BY_ID } from '../config/pets.js';
import { BOOSTS } from '../config/balance.js';
import { bus } from './EventBus.js';
import { Input } from './Input.js';
import { AudioManager } from './AudioManager.js';
import { Progression } from '../systems/Progression.js';
import * as E from '../systems/Economy.js';
import { Sky } from '../world/Sky.js';
import { Lobby, LOBBY_PALETTE, fmtDist } from '../world/Lobby.js';
import { RunTrack } from '../world/RunTrack.js';
import { Character } from '../player/Character.js';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera.js';
import { LobbyController } from '../player/LobbyController.js';
import { RunController } from '../player/RunController.js';
import { PetFollower } from '../pets/PetFollower.js';
import { Particles } from '../fx/Particles.js';
import { SpeedFX } from '../fx/SpeedFX.js';
import { HatchScene } from '../fx/HatchScene.js';
import { HUD } from '../ui/HUD.js';
import { Panels } from '../ui/Panels.js';
import { Thumbnails } from '../ui/Thumbnails.js';
import { MobileControls } from '../ui/MobileControls.js';
import { formatMoney } from '../utils/math.js';
import { NetAdapter } from '../net/NetAdapter.js';
import { AssetManager } from '../assets/AssetManager.js';
import { MaterialLibrary } from '../assets/MaterialLibrary.js';
import { ModelLibrary } from '../assets/ModelLibrary.js';
import { CHARACTER, PROPS } from '../config/assets.js';
import { RenderPipeline } from './RenderPipeline.js';
import { GLBCharacter } from '../player/GLBCharacter.js';
import { ContactShadows } from '../fx/ContactShadows.js';
import { PETS as PET_DEFS } from '../config/pets.js';
import { QUALITY_PRESETS } from '../config/balance.js';

const _v = new THREE.Vector3();

export class Game {
  constructor({ canvas, platform, save, debug, onProgress }) {
    this.canvas = canvas;
    this.platform = platform;
    this.saveManager = save;
    this.debug = debug;
    this.onProgress = onProgress || (() => {});
    this.mode = 'boot';
    this.timeScale = 1;
    this.zone = null;
    this.hatching = false;
    this.fpsAvg = 60;
    this.lowFpsTime = 0;
    this.camHintTime = 0;
  }

  async init() {
    const step = (p, t) => { this.onProgress(p, t); return new Promise((r) => setTimeout(r, 0)); };
    this.saveManager.useCrazyGames(this.platform);
    this.state = this.saveManager.load();
    this.progression = new Progression(this.state);
    this.input = new Input(this.canvas);
    this.mobile = this.input.isTouch;

    await step(0.15, 'Warming up the engine…');
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.mobile, powerPreference: 'high-performance' });
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 1200);

    // ---- asset pipeline: manifest first, then ONLY the lobby essentials
    // (character, equipped sneaker, equipped pets, lobby props). Shop/egg assets load lazily.
    this.assets = new AssetManager(r);
    const prod = typeof __PRODUCTION__ !== 'undefined' && __PRODUCTION__;
    const assetRoot = !prod && new URLSearchParams(location.search).get('assets') === 'fixtures' ? 'test/fixtures/assets/' : undefined;
    await this.assets.init(assetRoot);
    this.materials = new MaterialLibrary();
    this.library = new ModelLibrary(this.assets, this.materials);
    await step(0.2, 'Loading models…');
    const t0 = performance.now();
    const equippedPets = this.state.pets.equipped.map((u) => this.state.pets.list.find((p) => p.uid === u)?.id).filter(Boolean);
    await Promise.race([
      Promise.all([
        this.library.loadCharacter(),
        this.library.loadSneaker(this.state.sneakers.equipped),
        ...equippedPets.map((id) => this.library.loadPet(id)),
        ...Object.keys(PROPS).map((name) => this.library.loadProp(name)), // lobby + shop props (only files in the manifest are requested)
      ]),
      new Promise((res) => setTimeout(res, 15000)),
    ]);
    this.assets.stats.bootMs = Math.round(performance.now() - t0);

    // signs and posters are drawn into canvases: make sure the display fonts are ready first
    try {
      await Promise.race([
        Promise.all(['64px "Lilita One"', '900 20px "Nunito"'].map((f) => document.fonts.load(f))),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch {}
    await step(0.3, 'Building the sneaker hub…');
    this.sky = new Sky(this.scene, r, this.mobile);
    this.particles = new Particles(this.scene, QUALITY.maxParticles);
    this.lobby = new Lobby(this.scene, this.library);
    await step(0.55, 'Laying the endless track…');
    this.track = new RunTrack(this.scene, this.sky);
    this.track.particles = this.particles;
    this.track.getVariant(0); // city variants ready for the first run
    this.track.prewarm(0);
    await step(0.7, 'Lacing up your sneakers…');
    // visual character: rigged GLB when provided, procedural prototype otherwise (same interface)
    const charTemplate = this.library.characterTemplate();
    this.character = charTemplate
      ? new GLBCharacter(this.scene, this.library, charTemplate, { sneaker: this.state.sneakers.equipped })
      : new Character(this.scene, { sneaker: this.state.sneakers.equipped }, this.library);
    this.logPlayerAsset(!!charTemplate);
    this.shadows = new ContactShadows(this.scene);
    this.charShadow = this.shadows.create(0.55);
    this.character.anim.onStep = (speed) => this.audio.play('step', { vol: Math.min(1.4, 0.5 + speed / 20) });
    this.pets = new PetFollower(this.scene, this.particles, this.library, this.shadows);
    this.pets.onUpgrade = () => this.syncPets();
    this.speedFx = new SpeedFX(this.scene, this.particles);
    this.cam = new ThirdPersonCamera(this.camera);
    this.lobbyCtl = new LobbyController(this);
    this.runCtl = new RunController(this);
    this.audio = new AudioManager();
    this.hud = new HUD(this);
    this.thumbs = new Thumbnails(r, this.library);
    this.pipeline = new RenderPipeline(r, this.scene, this.camera, { sky: this.sky, assets: this.assets, materials: this.materials, mobile: this.mobile });
    this.panels = new Panels(this);
    this.lobby.buildPosters(this.thumbs);
    this.hatch = new HatchScene(this);
    this.mobileControls = new MobileControls(this);
    this.net = new NetAdapter(this); // multiplayer-ready seam (offline no-op for now)
    this.buildTutorialArrow();
    this.bindEvents();
    await this.applySettings();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));

    await step(0.85, 'Hatching pets…');
    this.syncPets();
    this.recoverPendingRun();
    this.enterLobby(LOBBY.spawn, true);
    // compile shaders up-front to avoid first-run hitches
    try { r.compile(this.scene, this.camera); } catch {}
    // debug tools are compiled out of production bundles (__PRODUCTION__ is defined by tools/build.mjs)
    if (this.debug && (typeof __PRODUCTION__ === 'undefined' || !__PRODUCTION__)) {
      const { DebugPanel } = await import('../debug/DebugPanel.js');
      this.debugPanel = new DebugPanel(this);
    }
    await step(0.95, 'Ready!');
  }

  /** Say in the console which player model is used and, for the fallback, why (never fall back silently). */
  logPlayerAsset(imported) {
    const url = this.assets.root + CHARACTER.file;
    if (imported) return console.info(`[Character] imported model: ${url}`);
    const why = !this.assets.has(CHARACTER.file) ? 'the file is not listed in the asset manifest (missing from assets/ or `npm run assets` not run)'
      : this.assets.failed.has(CHARACTER.file) ? 'the file failed to load (see the [Assets] warning above)'
      : 'the file was still loading when the boot timeout expired';
    console.warn(`[Character] procedural fallback — ${url}: ${why}`);
  }

  start() {
    this.last = performance.now();
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.platform.gameplayStart();
    const loop = (now) => {
      const raw = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      try { this.update(raw); this.render(); } catch (e) { console.error(e); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // after boot, fetch the remaining sneaker models in the background (only files listed in the
    // manifest are requested) so shop pedestals switch to the imported models via 'models:ready'
    this.library.preloadSneakers();
  }

  // --------------------------------------------------------------- events --
  bindEvents() {
    bus.on('money', ({ amount }) => { if (amount > 0) this.hud.bumpMoney(); this.panels.refresh(); });
    bus.on('sneaker:equipped', ({ id }) => {
      this.character.setSneaker(id);
      this.character.anim.triggerCelebrate(1.2);
      const p = this.character.position;
      this.particles.burst(_v.set(p.x, p.y + 0.2, p.z), { count: 26, colors: [SNEAKER_BY_ID[id].glow || 0xffffff, 0xffd23f, 0x5ff3ff], speed: 4, up: 3, life: 0.7, size: 0.3, gravity: 6 });
      this.lobby.refresh(this.state);
      this.panels.refresh();
    });
    bus.on('pets:changed', () => { this.syncPets(); this.panels.refresh(); this.lobby.refresh(this.state); });
    // an imported model finished loading: swap it in wherever it is shown
    bus.on('models:ready', ({ key }) => {
      if (key.startsWith('sneaker:')) { this.lobby.refresh(this.state); this.panels.refresh(); }
      if (key.startsWith('pet:')) { this.syncPets(); this.panels.refresh(); }
    });
    bus.on('mission:complete', ({ mission }) => {
      this.audio.play('mission');
      this.hud.toast(`🎯 Mission complete: ${mission.text} — claim it!`, 'good');
    });
    bus.on('achievement', ({ achievement: a }) => {
      this.audio.play('mission');
      this.hud.toast(`🏆 ${a.name} unlocked! +${a.gems} 💎`, 'gem');
    });
    bus.on('gems', ({ amount, source }) => {
      if (source === 'milestone') this.hud.toast(`First time! +${amount} 💎`, 'gem');
    });
    bus.on('boost:ended', ({ id }) => this.hud.toast(`${BOOSTS[id].name} ended`));

    // HTML buttons
    const btn = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { e.stopPropagation(); this.audio.unlock(); this.audio.play('click'); fn(); });
    btn('btn-cashout', () => this.cashOut());
    btn('btn-autorun', () => this.runCtl.toggleAutoRun());
    btn('btn-pets', () => this.togglePanel('pets'));
    btn('btn-missions', () => this.togglePanel('missions'));
    btn('btn-settings', () => this.togglePanel('settings'));
    document.getElementById('cashout-card').addEventListener('click', () => this.hud.hideCashout());

    bus.on('input:pointerlock', ({ locked }) => {
      if (locked) this.camHintTime = MOUSE_LOOK.hintSeconds;
      else this.camHintTime = 0;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.save(); this.platform.gameplayStop(); this.input.keys.clear(); }
      else if (!this.panels.isOpen || this.panels.current?.type !== 'settings') this.platform.gameplayStart();
    });
    window.addEventListener('pagehide', () => this.save());
  }

  togglePanel(type, arg) {
    if (this.panels.current?.type === type) this.panels.close();
    else {
      if (this.mode === 'run' && type !== 'settings') return;
      this.panels.open(type, arg);
    }
  }

  onPanelOpen(type, arg) {
    this.input.exitPointerLock();
    if (type === 'settings') this.platform.gameplayStop();
    // lazy asset loading: only when the player looks at them
    if (type === 'shop') this.library.preloadSneakers();
    if (type === 'egg') this.preloadEgg(arg);
    if (type === 'pets') for (const p of this.state.pets.list) this.library.loadPet(p.id);
  }

  preloadEgg(eggId) {
    const egg = EGG_BY_ID[eggId];
    if (egg) for (const e of egg.pets) this.library.loadPet(e.pet);
  }

  onPanelClose(type) {
    if (type === 'settings') this.platform.gameplayStart();
  }

  // ------------------------------------------------------------- settings --
  async applySettings() {
    const s = this.state.settings;
    this.audio.setMusic(s.music);
    this.audio.setSound(s.sound);
    this.cam.sensitivity = s.sensitivity;
    this.cam.invertY = s.invertY;
    // visual quality (gameplay is identical on every preset)
    const p = this.pipeline;
    p.autoScale = this.autoScale || 1;
    const name = await p.apply(s.quality);
    const q = QUALITY_PRESETS[name];
    this.lobby.setLightsEnabled(q.lights);
    this.particles.budget = q.particles;
    this.thumbs.scene.environment = this.scene.environment;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.pipeline ? this.pipeline.resize() : this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.baseFov = w / h < 1 ? CAMERA.fovPortrait : CAMERA.fov;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.particles.resize();
    this.hatch?.resize(w, h);
    document.getElementById('rotate-hint').classList.toggle('hidden', !(this.mobile && h > w));
  }

  // ---------------------------------------------------------------- modes --
  enterLobby(spawn, instant = false) {
    this.mode = 'lobby';
    this.lobby.setVisible(true);
    this.track.hide();
    this.speedFx.stop();
    this.character.timeScaleBoost = 1;
    this.sky.apply(LOBBY_PALETTE);
    this.cam.setRunMode(false);
    this.pets.runMode = false;
    this.lobbyCtl.teleport(spawn.x, spawn.z, spawn.yaw);
    this.cam.snap(this.character.position, spawn.yaw + Math.PI);
    this.pets.snap(this.character);
    this.hud.setMode('lobby');
    this.audio.setMode('lobby');
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.lobby.refresh(this.state);
    this.lobby.drawMissions(this.state.missions.active, this.progression.dailyAvailable());
    this.zone = null;
    for (const z of this.lobby.zones) z.inside = false;
  }

  startRun() {
    if (this.mode !== 'lobby') return;
    this.panels.close();
    this.audio.play('portal');
    this.hud.flash();
    this.mode = 'run';
    this.lobby.setVisible(false);
    this.runCtl.start();
    this.pets.runMode = true;
    this.cam.setRunMode(true);
    this.cam.snap(this.character.position, Math.PI);
    this.pets.snap(this.character);
    this.speedFx.start(this.character);
    this.hud.setMode('run');
    this.audio.setMode('run');
    this.mobileControls.setUseVisible(false);
    this.hud.prompt('');
    if (this.state.tutorial.step === 0) this.state.tutorial.step = 1;
    this.net.send('run:start');
  }

  cashOut() {
    if (this.mode !== 'run') return;
    const run = this.runCtl;
    const r = this.progression.cashOut(run.meters, run.coins);
    run.stop();
    this.mode = 'cashout';
    this.cashoutTimer = 0.55;
    this.timeScale = 0.25;
    this.hud.showCashout(r);
    this.audio.play('cashout');
    this.character.anim.triggerCelebrate(2);
    const p = this.character.position;
    this.particles.burst(_v.set(p.x, p.y + 1.5, p.z), { count: 60, colors: [0xffd23f, 0x7dff6a, 0xffffff], speed: 7, up: 7, life: 1.2, size: 0.4, gravity: 10 });
    if (r.newBest && r.meters >= 1000) this.platform.happytime();
    if (this.state.tutorial.step === 1) this.state.tutorial.step = 2;
    this.save();
    this.net.send('run:cashout', { meters: r.meters });
  }

  finishCashout() {
    this.timeScale = 1;
    this.enterLobby(LOBBY.returnSpawn);
    this.hud.flash();
    this.character.anim.triggerCelebrate(1.4);
    const p = this.character.position;
    this.particles.burst(_v.set(p.x, p.y + 1.2, p.z), { count: 50, colors: [0xffd23f, 0x7dff6a], speed: 6, up: 8, life: 1.1, size: 0.4, gravity: 12 });
  }

  // ------------------------------------------------------------- shopping --
  buySneaker(id) {
    const r = this.progression.buySneaker(id);
    if (r.ok && r.bought) {
      this.audio.play('buy');
      const d = SNEAKER_BY_ID[id];
      this.hud.toast(`👟 ${d.name} equipped! ${Math.round(E.kmh(d.speed))} km/h`, 'good');
      if (d.index >= 8) this.platform.happytime();
      if (this.state.tutorial.step <= 2) this.state.tutorial.step = 3;
    } else if (!r.ok) this.audio.play('error');
    this.save();
  }

  buyEggs(eggId, n = 1) {
    const results = [];
    for (let i = 0; i < n; i++) {
      const r = this.progression.buyEgg(eggId);
      if (!r.ok) {
        if (!results.length) { this.audio.play('error'); this.hud.toast(r.reason === 'full' ? 'Pet inventory full — delete some pets' : 'Not enough money', 'bad'); }
        break;
      }
      results.push({ egg: EGG_BY_ID[eggId], def: r.def, autoEquipped: r.autoEquipped });
    }
    if (!results.length) return;
    this.lastEgg = eggId;
    this.panels.close();
    this.hatching = true;
    this.hatch.play(results);
    if (this.state.tutorial.step <= 3) this.state.tutorial.step = 4;
    this.save();
  }

  hatchAgain() {
    if (!this.lastEgg) return;
    const r = this.progression.buyEgg(this.lastEgg);
    if (!r.ok) { this.audio.play('error'); return; }
    this.hatch.play([{ egg: EGG_BY_ID[this.lastEgg], def: r.def, autoEquipped: r.autoEquipped }]);
    this.hatch.next();
    this.save();
  }

  onHatchDone() {
    this.hatching = false;
    this.syncPets();
    // still standing at the egg? reopen it for a quick re-buy
    if (this.zone?.id?.startsWith('egg:')) this.panels.open('egg', this.zone.id.slice(4));
  }

  claimMission(id) {
    const r = this.progression.claimMission(id);
    if (!r.ok) return;
    const m = r.mission;
    this.audio.play('buy');
    const parts = [m.reward.money ? formatMoney(m.reward.money) : '', m.reward.gems ? `${m.reward.gems} 💎` : '', m.reward.boost ? BOOSTS[m.reward.boost].name : ''].filter(Boolean);
    this.hud.toast(`Reward: ${parts.join(' + ')}`, 'good');
    this.lobby.drawMissions(this.state.missions.active, this.progression.dailyAvailable());
  }

  claimDaily() {
    const r = this.progression.claimDaily();
    if (!r.ok) return;
    this.audio.play('buy');
    this.hud.toast(`🎁 Day ${r.streak}: +${formatMoney(r.money)} +${r.gems} 💎${r.boost ? ' + ' + BOOSTS[r.boost].name : ''}`, 'good');
    this.lobby.drawMissions(this.state.missions.active, false);
  }

  doRebirth() {
    const r = this.progression.rebirth();
    if (!r.ok) return;
    this.audio.play('rebirth');
    this.hud.flash();
    this.hud.banner('REBORN!', `+${r.tokens} TOKENS — spend them on permanent perks`, '#ff8ad8');
    this.platform.happytime();
    this.lobby.refresh(this.state);
    this.save();
  }

  resetProgress() {
    this.saveManager.wipe();
    this.saveManager.disabled = true;
    location.reload();
  }

  recoverPendingRun() {
    const pr = this.state.pendingRun;
    this.state.pendingRun = null;
    if (pr && pr.meters > 1) {
      const r = this.progression.cashOut(pr.meters, pr.coins || 0);
      setTimeout(() => this.hud.toast(`Recovered your unfinished run: ${fmtDist(r.meters)} → +${formatMoney(r.total)}`, 'good'), 1500);
    }
  }

  syncPets() {
    const byUid = new Map(this.state.pets.list.map((p) => [p.uid, p]));
    this.pets.sync(this.state.pets.equipped.map((u) => byUid.get(u)).filter(Boolean), this.character);
  }

  save() {
    if (this.mode === 'run' && this.runCtl.active) this.state.pendingRun = { meters: this.runCtl.meters, coins: this.runCtl.coins };
    this.saveManager.save(this.state);
  }

  // -------------------------------------------------------------- helpers --
  floatAt(worldPos, text, color) {
    _v.copy(worldPos).project(this.camera);
    if (_v.z > 1) return;
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth, y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    this.hud.floatText(text, x, y, color);
  }

  toast(t, k) { this.hud.toast(t, k); }

  buildTutorialArrow() {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 4), m);
    cone.rotation.x = Math.PI;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.4), m);
    shaft.position.y = 1;
    g.add(cone, shaft);
    g.visible = false;
    this.scene.add(g);
    this.arrow = g;
  }

  updateTutorial(dt) {
    const s = this.state;
    const step = s.tutorial.step;
    let text = '', target = null;
    const touch = this.mobile;
    if (this.mode === 'lobby' && !this.hatching && !this.panels.isOpen) {
      const next = E.nextSneaker(s);
      if (step === 0) { text = '▲ Walk into the glowing RUN portal to start running!'; target = [0, 7, 25]; }
      else if (step === 2 || step === 3) {
        if (step === 2 && next && s.money >= next.price) { text = '👟 Buy faster sneakers at the SNEAKER SHOP (left)!'; target = [-14.3, 4.2, 0]; }
        else if (step === 3 && s.money >= EGGS[0].price) { text = '🥚 Buy an egg at the PET HATCHERY (right) — pets multiply your money!'; target = [18.8, 4.6, -8]; }
        else { text = '▲ Run again — the farther you run, the MORE you earn!'; target = [0, 7, 25]; }
      }
    } else if (this.mode === 'run' && step === 1) {
      const m = this.runCtl.meters;
      if (m < 40) text = touch ? 'Push the joystick UP to run • ⤒ to jump • steer left/right' : 'Hold W to run • A/D to dodge • SPACE to jump';
      else if (m > 110) text = touch ? '💰 Tap CASH OUT whenever you want to bank your money!' : '💰 Press CASH OUT (C) whenever you want to bank your money!';
    }
    this.hud.tutorial(text);
    this.arrow.visible = !!target;
    if (target) {
      this.arrow.position.set(target[0], target[1] + Math.sin(performance.now() / 250) * 0.4, target[2]);
      this.arrow.rotation.y += dt * 2;
    }
  }

  // --------------------------------------------------------------- update --
  update(rawDt) {
    const dt = rawDt * this.timeScale;
    const s = this.state;
    s.stats.playTime += rawDt;
    this.progression.tickBoosts(rawDt);
    this.audio.update(rawDt);
    this.audio.intensity = this.mode === 'run' ? Math.min(1, E.kmh(this.runCtl.currentSpeed) / 400) : 0;

    if (this.input.pressed('menu')) {
      if (this.hatching) this.hatch.skip();
      else if (this.panels.isOpen) this.panels.close();
      else this.panels.open('settings');
    }

    switch (this.mode) {
      case 'lobby': this.updateLobby(dt); break;
      case 'run': this.updateRun(dt); break;
      case 'cashout':
        this.cashoutTimer -= rawDt;
        this.character.update(dt, 0, true);
        this.pets.update(dt, this.character, 0);
        this.cam.update(dt, this.character.position, null, 0, 0);
        if (this.cashoutTimer <= 0) this.finishCashout();
        break;
    }

    this.sky.follow(this.character.position, this.mode === 'run' ? 10 : 0);
    // contact shadow under the runner (fades while airborne)
    const cp = this.character.position;
    this.shadows.place(this.charShadow, cp.x, cp.z, 0.55 - Math.min(0.25, cp.y * 0.12), Math.max(0.15, 0.55 - cp.y * 0.18));
    this.particles.update(dt);
    this.hatch.update(rawDt);
    this.updateTutorial(rawDt);
    this.updateCamHint(rawDt);
    this.saveManager.update(rawDt, s);
    this.debugPanel?.update(rawDt);
    this.net.update(rawDt);

    // adaptive resolution (auto quality only)
    this.fpsAvg += (1 / Math.max(rawDt, 1e-3) - this.fpsAvg) * 0.05;
    if (s.settings.quality === 'auto') {
      if (this.fpsAvg < 38) this.lowFpsTime += rawDt; else this.lowFpsTime = Math.max(0, this.lowFpsTime - rawDt);
      if (this.lowFpsTime > 4) {
        this.lowFpsTime = 0;
        if (this.pipeline.qualityName === 'high') this.pipeline.autoLevel = 'medium';      // drop post/HDR first
        else if ((this.autoScale || 1) > 0.6) this.autoScale = (this.autoScale || 1) * 0.85; // then resolution
        else if (this.pipeline.qualityName === 'medium') this.pipeline.autoLevel = 'low';
        this.applySettings();
      }
    }
  }

  updateLobby(dt) {
    const input = this.input;
    if (!this.hatching) {
      if (input.pressed('pets')) this.togglePanel('pets');
      if (input.pressed('missions')) this.togglePanel('missions');
      this.lobbyCtl.update(dt, this.cam.yaw);
    } else {
      this.character.update(dt, 0, true);
    }
    input.pressed('cashout'); // ignore in lobby
    this.lobby.update(dt);
    this.pets.update(dt, this.character, this.lobbyCtl.speed);
    this.cam.update(dt, this.character.position, this.panels.isOpen || this.hatching ? null : input, this.character.yaw, this.lobbyCtl.speed);
    this.hud.updateLobby(dt);

    // interaction zones (auto-open on enter, close on leave)
    const p = this.character.position;
    const z = this.lobby.zoneAt(p);
    if (z !== this.zone) {
      if (this.zone) {
        this.zone.inside = false;
        if (this.panels.isOpen && this.zoneOwnsPanel(this.zone)) this.panels.close();
      }
      this.zone = z;
      if (z) { z.inside = true; if (!this.hatching) this.openZone(z); }
    }
    const pressedUse = input.pressed('interact');
    if (z && pressedUse && !this.panels.isOpen && !this.hatching) this.openZone(z);
    this.mobileControls.setUseVisible(!!z && !this.panels.isOpen && !this.hatching);
    this.hud.prompt(z && !this.panels.isOpen && !this.hatching && !this.mobile ? `Press E — ${z.title}` : '');
    if (this.lobby.inPortal(p) && !this.hatching) this.startRun();
    this.lobbyMissionsTimer = (this.lobbyMissionsTimer || 0) + dt;
    if (this.lobbyMissionsTimer > 2) {
      this.lobbyMissionsTimer = 0;
      this.lobby.drawMissions(this.state.missions.active, this.progression.dailyAvailable());
    }
  }

  zoneOwnsPanel(zone) {
    const t = this.panels.current?.type;
    if (zone.id === 'shop') return t === 'shop';
    if (zone.id.startsWith('egg:')) return t === 'egg';
    return t === zone.id;
  }

  openZone(z) {
    if (z.id === 'shop') this.panels.open('shop');
    else if (z.id.startsWith('egg:')) this.panels.open('egg', z.id.slice(4));
    else this.panels.open(z.id);
  }

  updateRun(dt) {
    const run = this.runCtl;
    if (this.input.pressed('cashout')) { this.cashOut(); return; }
    const steps = this.turbo || 1; // debug fast-forward for long-run testing
    for (let i = 0; i < steps && run.active; i++) run.update(dt);
    if (this.mode !== 'run') return;
    this.pets.update(dt, this.character, run.worldV);
    this.cam.lag = this.speedFx.intensity;
    this.cam.update(dt, this.character.position, this.panels.isOpen ? null : this.input, 0, run.worldV);
    const sneaker = SNEAKER_BY_ID[this.state.sneakers.equipped];
    const fov = this.speedFx.update(dt, this.character, this.character, E.kmh(run.currentSpeed), run.worldV, sneaker.trail, sneaker.glow);
    this.character.timeScaleBoost = 1 + 0.25 * this.speedFx.intensity; // stride rate climbs with the speed tier
    run.fxLevel = this.speedFx.level.lines * 0.6 + this.speedFx.level.t2 * 0.2 + run.boostVis * 0.5;
    const target = this.baseFov + fov * CAMERA.maxFovBoost + run.boostVis * 6;
    if (Math.abs(this.camera.fov - target) > 0.05) {
      this.camera.fov += (target - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
    this.hud.updateRun(dt, run);
  }

  updateCamHint(dt) {
    if (this.mobile) return;
    const locked = this.input.isPointerLocked;
    let text = '';
    if (!this.panels.isOpen && !this.hatching && (this.mode === 'lobby' || this.mode === 'run')) {
      if (!locked) text = '🖱️ Click the game to look around with the mouse';
      else if (this.camHintTime > 0) text = '🖱️ Move the mouse to look • Z releases the cursor';
    }
    this.camHintTime = Math.max(0, this.camHintTime - dt);
    this.hud.camHint(text);
  }

  render() {
    this.pipeline.render();
    this.hatch.render(this.renderer);
  }
}

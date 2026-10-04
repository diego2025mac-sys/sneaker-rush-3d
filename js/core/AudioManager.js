// Fully procedural audio (Web Audio API) — no audio files to download.
// SFX + a generative music loop with a calmer lobby mix and an energetic run layer.
import { bus } from './EventBus.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.soundOn = true;
    this.platformMuted = false;
    this.adMuted = false;
    this.hidden = false;
    this.lastPlay = {};
    this.coinChain = 0;
    this.coinChainTimer = 0;
    this.mode = 'lobby';     // 'lobby' | 'run'
    this.intensity = 0;      // 0..1 during runs (speed)
    this.music = { nextTime: 0, step: 0, timer: null };
    bus.on('platform:mute', (m) => { this.platformMuted = m; this.applyVolumes(); });
    bus.on('platform:ad', ({ playing }) => { this.adMuted = playing; this.applyVolumes(); });
    document.addEventListener('visibilitychange', () => { this.hidden = document.hidden; this.applyVolumes(); });
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.mus = this.ctx.createGain();
    this.mus.connect(this.master);
    this.runBus = this.ctx.createGain(); // energetic layer, faded in during runs
    this.runBus.gain.value = 0;
    this.runBus.connect(this.mus);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startMusic();
  }

  setMusic(on) { this.musicOn = on; this.applyVolumes(); }
  setSound(on) { this.soundOn = on; this.applyVolumes(); }
  setMode(mode) {
    this.mode = mode;
    if (!this.ctx) return;
    this.runBus.gain.setTargetAtTime(mode === 'run' ? 1 : 0, this.ctx.currentTime, 0.4);
  }

  get globallyMuted() { return this.platformMuted || this.adMuted || this.hidden; }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.globallyMuted ? 0 : 1, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.soundOn ? 0.5 : 0, t, 0.05);
    this.mus.gain.setTargetAtTime(this.musicOn ? 0.14 : 0, t, 0.2);
  }

  // ------------------------------------------------------------ primitives --
  tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, slide = 0, delay = 0, dest = null, filter = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst({ dur = 0.1, vol = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0, dest = null, sweep = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  throttle(name, sec) {
    const now = performance.now() / 1000;
    if (this.lastPlay[name] && now - this.lastPlay[name] < sec) return false;
    this.lastPlay[name] = now;
    return true;
  }

  // ------------------------------------------------------------------ sfx ---
  play(name, opt = {}) {
    if (!this.ctx || !this.soundOn) return;
    switch (name) {
      case 'click':
        this.tone({ freq: NOTE(84), type: 'sine', dur: 0.05, vol: 0.08 });
        break;
      case 'hover':
        if (!this.throttle('hover', 0.05)) return;
        this.tone({ freq: NOTE(91), type: 'sine', dur: 0.03, vol: 0.03 });
        break;
      case 'open':
        this.tone({ freq: NOTE(72), type: 'triangle', dur: 0.09, vol: 0.1 });
        this.tone({ freq: NOTE(79), type: 'triangle', dur: 0.12, vol: 0.1, delay: 0.05 });
        break;
      case 'close':
        this.tone({ freq: NOTE(79), type: 'triangle', dur: 0.08, vol: 0.08 });
        this.tone({ freq: NOTE(72), type: 'triangle', dur: 0.1, vol: 0.08, delay: 0.04 });
        break;
      case 'buy':
        [67, 71, 74, 79, 83].forEach((n, i) => this.tone({ freq: NOTE(n), type: 'square', dur: 0.14, vol: 0.08, delay: i * 0.05, filter: 3200 }));
        this.tone({ freq: NOTE(91), type: 'sine', dur: 0.4, vol: 0.12, delay: 0.25 });
        this.noiseBurst({ dur: 0.3, vol: 0.08, freq: 6000, type: 'highpass', delay: 0.2 });
        break;
      case 'equip':
        this.tone({ freq: NOTE(76), type: 'triangle', dur: 0.1, vol: 0.14 });
        this.tone({ freq: NOTE(83), type: 'triangle', dur: 0.16, vol: 0.14, delay: 0.06 });
        break;
      case 'error':
        if (!this.throttle('error', 0.25)) return;
        this.tone({ freq: 170, type: 'square', dur: 0.1, vol: 0.07, filter: 900 });
        this.tone({ freq: 125, type: 'square', dur: 0.14, vol: 0.07, delay: 0.09, filter: 900 });
        break;
      case 'coin': {
        if (!this.throttle('coin', 0.03)) return;
        this.coinChain = Math.min(this.coinChain + 1, 14);
        this.coinChainTimer = 0.9;
        const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];
        const n = 79 + scale[this.coinChain];
        this.tone({ freq: NOTE(n), type: 'square', dur: 0.06, vol: 0.05, filter: 5000 });
        this.tone({ freq: NOTE(n + 7), type: 'sine', dur: 0.12, vol: 0.1, delay: 0.04 });
        break;
      }
      case 'gem':
        [88, 92, 95, 100].forEach((n, i) => this.tone({ freq: NOTE(n), type: 'sine', dur: 0.2, vol: 0.1, delay: i * 0.04 }));
        break;
      case 'step':
        this.noiseBurst({ dur: 0.05, vol: 0.045 * (opt.vol ?? 1), freq: 900 + Math.random() * 300, q: 0.9 });
        break;
      case 'jump':
        this.tone({ freq: 320, type: 'sine', dur: 0.14, vol: 0.08, slide: 2 });
        this.noiseBurst({ dur: 0.08, vol: 0.05, freq: 2000 });
        break;
      case 'land':
        this.noiseBurst({ dur: 0.09, vol: 0.08, freq: 500 });
        break;
      case 'hurdle':
        this.tone({ freq: NOTE(84), type: 'triangle', dur: 0.08, vol: 0.08 });
        this.tone({ freq: NOTE(91), type: 'triangle', dur: 0.12, vol: 0.08, delay: 0.05 });
        break;
      case 'stumble':
        this.noiseBurst({ dur: 0.25, vol: 0.22, freq: 300, type: 'lowpass' });
        this.tone({ freq: 220, type: 'sawtooth', dur: 0.25, vol: 0.06, slide: 0.4, filter: 1200 });
        break;
      case 'boost':
        this.noiseBurst({ dur: 0.7, vol: 0.18, freq: 400, sweep: 8, type: 'bandpass', q: 2 });
        this.tone({ freq: 180, type: 'sawtooth', dur: 0.5, vol: 0.06, slide: 4, filter: 3000 });
        break;
      case 'portal':
        this.tone({ freq: 160, type: 'sine', dur: 0.8, vol: 0.18, slide: 6 });
        this.noiseBurst({ dur: 0.8, vol: 0.12, freq: 600, sweep: 8 });
        break;
      case 'countdown':
        this.tone({ freq: NOTE(opt.go ? 84 : 72), type: 'square', dur: opt.go ? 0.35 : 0.12, vol: 0.09, filter: 3000 });
        break;
      case 'milestone': {
        const big = opt.big;
        [72, 76, 79, 84].forEach((n, i) => this.tone({ freq: NOTE(n + (big ? 3 : 0)), type: 'triangle', dur: 0.25, vol: 0.16, delay: i * 0.06 }));
        this.tone({ freq: NOTE(big ? 99 : 96), type: 'sine', dur: 0.6, vol: 0.1, delay: 0.24 });
        if (big) this.noiseBurst({ dur: 0.9, vol: 0.14, freq: 500, sweep: 10, type: 'lowpass' });
        break;
      }
      case 'biome':
        this.noiseBurst({ dur: 1.4, vol: 0.18, freq: 300, sweep: 10, type: 'lowpass' });
        [60, 64, 67, 72, 76].forEach((n, i) => this.tone({ freq: NOTE(n), type: 'sawtooth', dur: 1.3, vol: 0.05, attack: 0.15, delay: 0.1 + i * 0.06, filter: 2500 }));
        break;
      case 'cashout':
        this.tone({ freq: 120, type: 'sine', dur: 0.5, vol: 0.25, slide: 0.5 });
        for (let i = 0; i < 12; i++) this.tone({ freq: NOTE(84 + ((i * 5) % 14)), type: 'square', dur: 0.07, vol: 0.05, delay: 0.25 + i * 0.045, filter: 5000 });
        [72, 76, 79, 84, 88].forEach((n, i) => this.tone({ freq: NOTE(n), type: 'triangle', dur: 0.35, vol: 0.15, delay: 0.3 + i * 0.07 }));
        break;
      case 'tick':
        if (!this.throttle('tick', 0.035)) return;
        this.tone({ freq: NOTE(96 + Math.floor(Math.random() * 3)), type: 'square', dur: 0.04, vol: 0.035, filter: 6000 });
        break;
      case 'shake':
        this.noiseBurst({ dur: 0.09, vol: 0.12, freq: 700 + (opt.i || 0) * 120, q: 2 });
        this.tone({ freq: 200 + (opt.i || 0) * 30, type: 'triangle', dur: 0.08, vol: 0.06 });
        break;
      case 'crack':
        this.noiseBurst({ dur: 0.18, vol: 0.25, freq: 3000, q: 1.5 });
        this.tone({ freq: 900, type: 'square', dur: 0.05, vol: 0.05, filter: 4000 });
        break;
      case 'reveal': {
        const r = opt.rarity ?? 0; // 0..6
        this.noiseBurst({ dur: 0.6, vol: 0.16, freq: 6000, type: 'highpass' });
        const base = 67 + r * 2;
        const chord = r >= 4 ? [0, 4, 7, 11, 14, 19] : r >= 2 ? [0, 4, 7, 12] : [0, 4, 7];
        chord.forEach((n, i) => this.tone({ freq: NOTE(base + n), type: 'triangle', dur: 0.5 + r * 0.1, vol: 0.13, delay: i * 0.05 }));
        if (r >= 4) {
          this.tone({ freq: 60, type: 'sine', dur: 1.2, vol: 0.35, slide: 0.5 });
          chord.forEach((n, i) => this.tone({ freq: NOTE(base + 12 + n), type: 'sine', dur: 0.4, vol: 0.06, delay: 0.4 + i * 0.07 }));
        }
        break;
      }
      case 'mission':
        [72, 76, 79].forEach((n, i) => this.tone({ freq: NOTE(n), type: 'triangle', dur: 0.2, vol: 0.16, delay: i * 0.08 }));
        this.tone({ freq: NOTE(84), type: 'triangle', dur: 0.45, vol: 0.16, delay: 0.24 });
        break;
      case 'rebirth':
        this.noiseBurst({ dur: 2, vol: 0.2, freq: 200, sweep: 20, type: 'lowpass' });
        [48, 55, 60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone({ freq: NOTE(n), type: 'sine', dur: 1.2, vol: 0.12, delay: i * 0.1 }));
        break;
      default:
        break;
    }
  }

  update(dt) {
    if (this.coinChainTimer > 0) {
      this.coinChainTimer -= dt;
      if (this.coinChainTimer <= 0) this.coinChain = 0;
    }
  }

  // ---------------------------------------------------------------- music ---
  startMusic() {
    if (!this.ctx) return;
    this.music.nextTime = this.ctx.currentTime + 0.2;
    const schedule = () => {
      if (!this.ctx) return;
      const bpm = this.mode === 'run' ? 124 : 104;
      while (this.music.nextTime < this.ctx.currentTime + 0.25) {
        this.scheduleStep(this.music.step, this.music.nextTime);
        this.music.nextTime += 60 / bpm / 2;
        this.music.step++;
      }
    };
    this.music.timer = setInterval(schedule, 60);
  }

  scheduleStep(step, t) {
    if (!this.musicOn || this.globallyMuted) return;
    const ctx = this.ctx;
    const bar = Math.floor(step / 8) % 8;
    const s = step % 8;
    // vi – IV – I – V in C (urban, upbeat)
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const chord = prog[bar];
    const vt = Math.max(0, t - ctx.currentTime);
    const play = (freq, type, dur, vol, filter, dest = this.mus) => this.tone({ freq, type, dur, vol, delay: vt, dest, filter });
    // lobby bed: soft bass + mellow keys
    if (s === 0 || s === 3 || s === 6) play(NOTE(chord[0] - 24), 'triangle', 0.3, 0.45);
    if (s === 2 || s === 6) chord.forEach((n) => play(NOTE(n + 12), 'triangle', 0.25, 0.05, 2400));
    const penta = [69, 72, 74, 76, 79, 81];
    const seed = (bar * 13 + s * 7 + Math.floor(step / 64) * 5) % 11;
    if ((s === 0 || s === 3 || s === 5) && seed % 3 !== 1) play(NOTE(penta[(seed + bar) % penta.length]), 'sine', 0.22, 0.12);
    // kick + hats
    if (s % 4 === 0) this.kick(t, 0.4, this.mus);
    if (s % 2 === 1) this.noiseBurst({ dur: 0.03, vol: 0.07, freq: 8000, type: 'highpass', delay: vt, dest: this.mus });
    // ---- run layer (faded in by runBus): driving kicks, claps, arps; denser at high intensity
    const rb = this.runBus;
    if (s % 2 === 0) this.kick(t, 0.45, rb);
    if (s === 4) this.noiseBurst({ dur: 0.12, vol: 0.22, freq: 1500, q: 0.8, delay: vt, dest: rb });
    this.noiseBurst({ dur: 0.025, vol: 0.06, freq: 9000, type: 'highpass', delay: vt, dest: rb });
    const arp = [0, 7, 12, 7, 4, 12, 7, 16];
    play(NOTE(chord[0] + arp[s]), 'square', 0.1, 0.035 + this.intensity * 0.03, 2200 + this.intensity * 3000, rb);
    if (this.intensity > 0.5 && s % 2 === 1) play(NOTE(chord[2] + 24), 'sawtooth', 0.08, 0.02, 3500, rb);
    play(NOTE(chord[0] - 12), 'sawtooth', 0.14, 0.06, 600, rb);
  }

  kick(t, vol, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.2);
  }
}

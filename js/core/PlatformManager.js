// Thin wrapper around the CrazyGames SDK v3.
// Every call is safe when the SDK is missing (offline, other portals, file blocked...).
import { PLATFORM } from '../config/balance.js';
import { bus } from './EventBus.js';

export class PlatformManager {
  constructor() {
    this.sdk = null;
    this.available = false;
    this.environment = 'none';
    this.gameplayActive = false;
    this.muteAudio = false;
    this.adPlaying = false;
    this.lastMidgame = 0;
    this.adblock = false;
  }

  /** Ads UI only exists in Full Launch, and only when the SDK can serve ads. */
  get adsEnabled() {
    return PLATFORM.launchMode === 'full' && this.available && this.environment !== 'disabled' && !this.adblock;
  }

  async init() {
    // ?nosdk=1 (dev builds only) simulates a portal without the SDK
    const prod = typeof __PRODUCTION__ !== 'undefined' && __PRODUCTION__;
    const noSdk = !prod && new URLSearchParams(location.search).has('nosdk');
    if (!PLATFORM.loadCrazyGamesSDK || noSdk) {
      console.info('[Platform] CrazyGames SDK disabled – running standalone.');
      return this;
    }
    try {
      await this.loadScript(PLATFORM.sdkUrl, PLATFORM.sdkTimeoutMs);
      const sdk = window.CrazyGames?.SDK;
      if (!sdk) throw new Error('SDK global missing');
      await Promise.race([
        sdk.init(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('SDK init timeout')), PLATFORM.sdkTimeoutMs)),
      ]);
      this.sdk = sdk;
      this.environment = sdk.environment || 'unknown';
      this.available = this.environment !== 'disabled';
      if (this.available) {
        this.muteAudio = !!sdk.game?.settings?.muteAudio;
        sdk.game?.addSettingsChangeListener?.((settings) => {
          this.muteAudio = !!settings.muteAudio;
          bus.emit('platform:mute', this.muteAudio);
        });
        if (PLATFORM.launchMode === 'full') {
          try { this.adblock = !!(await sdk.ad.hasAdblock()); } catch { this.adblock = false; }
        }
      }
      console.info(`[Platform] CrazyGames SDK ready (env: ${this.environment})`);
    } catch (e) {
      console.info('[Platform] CrazyGames SDK unavailable – running standalone.', e?.message || e);
      this.sdk = null;
      this.available = false;
    }
    return this;
  }

  loadScript(src, timeout) {
    return new Promise((resolve, reject) => {
      if (window.CrazyGames?.SDK) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      const t = setTimeout(() => reject(new Error('script timeout')), timeout);
      s.onload = () => { clearTimeout(t); resolve(); };
      s.onerror = () => { clearTimeout(t); reject(new Error('script load error')); };
      document.head.appendChild(s);
    });
  }

  call(fn) {
    if (!this.available || !this.sdk) return;
    try { fn(this.sdk); } catch (e) { console.warn('[Platform] SDK call failed', e); }
  }

  loadingStart() { this.call((s) => s.game.loadingStart?.()); }
  loadingStop() { this.call((s) => s.game.loadingStop?.()); }

  gameplayStart() {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    this.call((s) => s.game.gameplayStart());
  }

  gameplayStop() {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    this.call((s) => s.game.gameplayStop());
  }

  happytime() {
    // rate-limited: only for genuinely great moments
    const now = performance.now();
    if (now - (this.lastHappy || -1e9) < 20000) return;
    this.lastHappy = now;
    this.call((s) => s.game.happytime());
  }

  /** Rewarded ad. Resolves true only if the ad finished. Never required for progress. */
  requestRewarded() {
    return new Promise((resolve) => {
      if (!this.adsEnabled) return resolve(false);
      this.runAd('rewarded', resolve);
    });
  }

  /** Midgame ad at natural breaks (e.g. after an area unlock). Full launch only. */
  requestMidgame() {
    return new Promise((resolve) => {
      if (!this.adsEnabled) return resolve(false);
      const now = performance.now() / 1000;
      if (now - this.lastMidgame < PLATFORM.midgameAdCooldown) return resolve(false);
      this.lastMidgame = now;
      this.runAd('midgame', resolve);
    });
  }

  runAd(type, resolve) {
    const wasActive = this.gameplayActive;
    const done = (ok) => {
      this.adPlaying = false;
      bus.emit('platform:ad', { playing: false });
      if (wasActive) this.gameplayStart();
      resolve(ok);
    };
    try {
      this.sdk.ad.requestAd(type, {
        adStarted: () => {
          this.adPlaying = true;
          this.gameplayStop();
          bus.emit('platform:ad', { playing: true });
        },
        adFinished: () => done(true),
        adError: (err) => { console.info('[Platform] ad error', err); done(false); },
      });
    } catch (e) {
      done(false);
    }
  }
}

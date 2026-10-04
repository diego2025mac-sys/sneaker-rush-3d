// Save system with a pluggable storage backend.
// LocalStorageAdapter is used by default; PlatformManager swaps in the
// CrazyGames Data Module adapter when the SDK is available.
import { SAVE } from '../config/balance.js';
import { createDefaultState, migrateState } from './GameState.js';

export class LocalStorageAdapter {
  constructor() {
    this.name = 'localStorage';
    try {
      const k = '__sr3d_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      this.ok = true;
    } catch {
      this.ok = false;
      this.mem = {};
    }
  }
  getItem(key) {
    if (!this.ok) return this.mem[key] ?? null;
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  setItem(key, value) {
    if (!this.ok) { this.mem[key] = value; return; }
    try { window.localStorage.setItem(key, value); } catch (e) { console.warn('[Save] localStorage write failed', e); }
  }
  removeItem(key) {
    if (!this.ok) { delete this.mem[key]; return; }
    try { window.localStorage.removeItem(key); } catch {}
  }
}

/** CrazyGames SDK v3 Data Module (synchronous localStorage-like API, cloud-synced). */
export class CrazyGamesDataAdapter {
  constructor(sdk) {
    this.name = 'crazygames-data';
    this.sdk = sdk;
  }
  getItem(key) {
    try { return this.sdk.data.getItem(key); } catch { return null; }
  }
  setItem(key, value) {
    try { this.sdk.data.setItem(key, value); } catch (e) { console.warn('[Save] CG data write failed', e); }
  }
  removeItem(key) {
    try { this.sdk.data.removeItem(key); } catch {}
  }
}

export class SaveManager {
  constructor() {
    this.adapter = new LocalStorageAdapter();
    this.key = SAVE.key;
    this.timer = 0;
    this.dirty = false;
  }

  setAdapter(adapter) {
    this.adapter = adapter;
  }

  load() {
    const raw = this.adapter.getItem(this.key);
    if (!raw) {
      // A CG account might be new while localStorage has progress: fall back.
      if (this.adapter.name !== 'localStorage') {
        const local = new LocalStorageAdapter().getItem(this.key);
        if (local) return this.parse(local);
      }
      return createDefaultState();
    }
    return this.parse(raw);
  }

  parse(raw) {
    try {
      return migrateState(JSON.parse(raw));
    } catch (e) {
      console.warn('[Save] corrupt save, starting fresh', e);
      return createDefaultState();
    }
  }

  save(state) {
    if (this.disabled) return;
    state.lastSaved = Date.now();
    const raw = JSON.stringify(state);
    this.adapter.setItem(this.key, raw);
    // Always keep a local mirror so offline reloads keep progress.
    if (this.adapter.name !== 'localStorage') new LocalStorageAdapter().setItem(this.key, raw);
    this.dirty = false;
  }

  /** Data Module: when available, CrazyGames cloud data is used (progress follows the account). */
  useCrazyGames(platform) {
    if (platform?.available && platform.sdk?.data) {
      this.setAdapter(new CrazyGamesDataAdapter(platform.sdk));
      console.info('[Save] using CrazyGames Data Module');
    }
  }

  wipe() {
    this.adapter.removeItem(this.key);
    new LocalStorageAdapter().removeItem(this.key);
  }

  update(dt, state) {
    this.timer += dt;
    if (this.timer >= SAVE.autosaveInterval) {
      this.timer = 0;
      this.save(state);
    }
  }
}

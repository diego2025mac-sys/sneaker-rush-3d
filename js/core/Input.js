// Unified input: keyboard + Pointer Lock mouse-look on desktop,
// written into by MobileControls on touch devices.
import { bus } from './EventBus.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.oneShot = new Set();
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.joy = { x: 0, y: 0, active: false };
    this.enabled = true;
    // Pointer Lock state (desktop only). Only true once the browser confirms the lock.
    this.isPointerLocked = false;
    this.lockRequested = false;
    this.lastUnlockTime = 0;
    this.lookInputTime = 0; // performance.now() of last manual camera input
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); });

    // ---- Pointer Lock mouse-look (desktop) ----
    // Only clicks that land on the canvas itself request the lock. HUD buttons sit above the
    // canvas, so clicking them never reaches this handler.
    canvas.addEventListener('click', (e) => {
      if (this.isTouch || e.pointerType === 'touch') return;
      if (!this.isPointerLocked) this.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked === this.isPointerLocked) return;
      this.isPointerLocked = locked;
      this.lockRequested = false;
      if (!locked) this.lastUnlockTime = performance.now();
      this.look.dx = this.look.dy = 0; // never carry stale motion across a mode switch
      bus.emit('input:pointerlock', { locked });
    });
    document.addEventListener('pointerlockerror', () => {
      // e.g. Chrome refuses a re-lock for ~1s after ESC. Stay in cursor mode; next click retries.
      this.isPointerLocked = false;
      this.lockRequested = false;
      bus.emit('input:pointerlock', { locked: false, error: true });
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return; // free cursor: mouse movement never rotates the camera
      const dx = e.movementX || 0, dy = e.movementY || 0;
      // Some browsers report a bogus huge jump right after locking: ignore it.
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      this.addLook(dx, dy);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom += Math.sign(e.deltaY);
    }, { passive: false });
  }

  get pointerLockSupported() {
    return !this.isTouch && typeof this.canvas.requestPointerLock === 'function';
  }

  requestPointerLock() {
    if (!this.pointerLockSupported || this.isPointerLocked || this.lockRequested) return;
    this.lockRequested = true;
    try {
      const r = this.canvas.requestPointerLock({ unadjustedMovement: false });
      // Newer browsers return a Promise; a rejection is also reported via pointerlockerror.
      if (r && typeof r.catch === 'function') r.catch(() => { this.lockRequested = false; });
    } catch {
      this.lockRequested = false;
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  addLook(dx, dy) {
    this.look.dx += dx;
    this.look.dy += dy;
    this.lookInputTime = performance.now();
  }

  onKey(e, down) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.code;
    if (!this.enabled && down) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (down) {
      if (!this.keys.has(k)) {
        if (k === 'KeyE' || k === 'KeyF') this.oneShot.add('interact');
        if (k === 'Space') this.oneShot.add('jump');
        if (k === 'KeyC' || k === 'Enter') this.oneShot.add('cashout');
        if (k === 'KeyR') this.oneShot.add('autorun');
        if (k === 'KeyI' || k === 'Tab') { e.preventDefault(); this.oneShot.add('pets'); }
        // Z: leave camera mode and free the cursor (it does NOT re-lock; a canvas click does).
        if (k === 'KeyZ' && this.isPointerLocked) this.exitPointerLock();
        // ESC while locked is consumed by the browser to release the lock. Don't also open the
        // menu if this keydown arrives right after that release.
        if (k === 'Escape' && !this.isPointerLocked && performance.now() - this.lastUnlockTime > 300) this.oneShot.add('menu');
        if (k === 'KeyP') this.oneShot.add('menu');
        if (k === 'KeyM') this.oneShot.add('missions');
        if (k === 'Backquote') this.oneShot.add('debug');
      }
      this.keys.add(k);
    } else {
      this.keys.delete(k);
    }
  }

  trigger(action) { this.oneShot.add(action); }

  pressed(action) {
    if (this.oneShot.has(action)) {
      this.oneShot.delete(action);
      return true;
    }
    return false;
  }

  /** Movement intent in camera space: x = right, y = forward. Magnitude 0..1. */
  getMove() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (this.joy.active) {
      x += this.joy.x;
      y += this.joy.y;
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  get walkHeld() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0;
    this.look.dy = 0;
    return l;
  }

  consumeZoom() {
    const z = this.zoom;
    this.zoom = 0;
    return z;
  }

  clearOneShots() { this.oneShot.clear(); }
}

// Touch controls: floating virtual joystick (left), drag-to-look (right), jump & open buttons.
// (Cash out / auto-run are regular HTML buttons that work for touch and mouse.)
export class MobileControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.root = document.getElementById('mobile-controls');
    this.joyZone = document.getElementById('joy-zone');
    this.lookZone = document.getElementById('look-zone');
    this.base = document.getElementById('joy-base');
    this.knob = document.getElementById('joy-knob');
    this.useBtn = document.getElementById('btn-use');
    this.joyId = null;
    this.lookId = null;
    this.lookLast = null;
    this.pinch = null;
    this.radius = 52;
    this.enabled = this.input.isTouch;
    if (!this.enabled) return;
    document.body.classList.add('touch');
    this.root.classList.remove('hidden');
    this.defaultPos = null;

    const opts = { passive: false };
    this.joyZone.addEventListener('touchstart', (e) => this.joyStart(e), opts);
    this.lookZone.addEventListener('touchstart', (e) => this.lookStart(e), opts);
    window.addEventListener('touchmove', (e) => this.move(e), opts);
    window.addEventListener('touchend', (e) => this.end(e), opts);
    window.addEventListener('touchcancel', (e) => this.end(e), opts);

    const press = (el, action) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.input.trigger(action); game.audio.unlock(); }, opts);
      el.addEventListener('click', (e) => { e.preventDefault(); this.input.trigger(action); });
    };
    press(document.getElementById('btn-jump'), 'jump');
    press(this.useBtn, 'interact');
    // block double-tap zoom & context menus
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  joyStart(e) {
    e.preventDefault();
    this.game.audio.unlock();
    if (this.joyId !== null) return;
    const t = e.changedTouches[0];
    this.joyId = t.identifier;
    const zr = this.joyZone.getBoundingClientRect();
    // floating joystick: centre where the thumb lands
    this.cx = t.clientX;
    this.cy = t.clientY;
    this.base.style.left = `${t.clientX - zr.left - 62}px`;
    this.base.style.top = `${t.clientY - zr.top - 62}px`;
    this.base.style.bottom = 'auto';
    this.setKnob(0, 0);
    this.input.joy.active = true;
  }

  lookStart(e) {
    e.preventDefault();
    this.game.audio.unlock();
    for (const t of e.changedTouches) {
      if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      } else if (!this.pinch) {
        const a = this.lookLast;
        this.pinch = { id: t.identifier, d: Math.hypot(t.clientX - a.x, t.clientY - a.y), other: { x: t.clientX, y: t.clientY } };
      }
    }
  }

  move(e) {
    let handled = false;
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        handled = true;
        let dx = t.clientX - this.cx, dy = t.clientY - this.cy;
        const d = Math.hypot(dx, dy);
        if (d > this.radius) { dx = (dx / d) * this.radius; dy = (dy / d) * this.radius; }
        this.setKnob(dx, dy);
        const nx = dx / this.radius, ny = -dy / this.radius;
        const mag = Math.hypot(nx, ny);
        const dead = 0.12;
        const k = mag < dead ? 0 : (mag - dead) / (1 - dead) / Math.max(mag, 1e-4);
        this.input.joy.x = nx * k;
        this.input.joy.y = ny * k;
      } else if (t.identifier === this.lookId) {
        handled = true;
        if (this.pinch) {
          // pinch zoom with the second finger
          const o = this.pinch.other;
          const d = Math.hypot(t.clientX - o.x, t.clientY - o.y);
          const delta = this.pinch.d - d;
          if (Math.abs(delta) > 18) { this.input.zoom += Math.sign(delta); this.pinch.d = d; }
          this.lookLast = { x: t.clientX, y: t.clientY };
        } else {
          this.input.addLook(t.clientX - this.lookLast.x, t.clientY - this.lookLast.y);
          this.lookLast = { x: t.clientX, y: t.clientY };
        }
      } else if (this.pinch && t.identifier === this.pinch.id) {
        handled = true;
        const a = this.lookLast;
        const d = Math.hypot(t.clientX - a.x, t.clientY - a.y);
        const delta = this.pinch.d - d;
        if (Math.abs(delta) > 18) { this.input.zoom += Math.sign(delta); this.pinch.d = d; }
        this.pinch.other = { x: t.clientX, y: t.clientY };
      }
    }
    if (handled) e.preventDefault();
  }

  end(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        this.joyId = null;
        this.input.joy.active = false;
        this.input.joy.x = this.input.joy.y = 0;
        this.setKnob(0, 0);
        this.base.style.left = '';
        this.base.style.top = '';
        this.base.style.bottom = '';
      }
      if (t.identifier === this.lookId) { this.lookId = null; this.pinch = null; }
      if (this.pinch && t.identifier === this.pinch.id) this.pinch = null;
    }
  }

  setKnob(dx, dy) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  setUseVisible(v, label = 'OPEN') {
    if (!this.enabled) return;
    this.useBtn.classList.toggle('hidden', !v);
    if (this.useBtn.textContent !== label) this.useBtn.textContent = label;
  }
}

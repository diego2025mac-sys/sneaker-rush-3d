// HUD: lobby bar, run HUD, toasts, floating texts, banners, milestones, cash-out card, mission tracker.
import { formatMoney, formatNumber, formatTime, damp } from '../utils/math.js';
import { BOOSTS } from '../config/balance.js';
import * as E from '../systems/Economy.js';
import { fmtDist } from '../world/Lobby.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      lobby: $('hud-lobby'), run: $('hud-run'), money: $('money'), gems: $('gems'), speedStat: $('speed-stat'), petStat: $('pet-stat'),
      boosts: $('boosts'), tracker: $('mission-tracker'), missionsBadge: $('missions-badge'), petsBadge: $('pets-badge'),
      kmh: $('run-kmh'), momentum: $('momentum-fill'), runBoost: $('run-boost'), biome: $('run-biome'), distance: $('run-distance'),
      reward: $('run-reward'), bonus: $('run-bonus'), petmult: $('run-petmult'), boostMoney: $('run-boostmoney'), next: $('run-next'),
      cashoutSub: $('cashout-sub'), autorun: $('btn-autorun'), milestone: $('milestone'), banner: $('banner'), toasts: $('toasts'),
      floating: $('floating'), flash: $('flash'), tutorial: $('tutorial'), camHint: $('cam-hint'), prompt: $('prompt'), card: $('cashout-card'),
      vignette: $('speed-vignette'),
    };
    this.shownMoney = game.state.money;
    this.el.money.textContent = formatMoney(this.shownMoney); // show the saved balance immediately (updateLobby only redraws on change)
    this.shownReward = 0;
    this.lastTrackerKey = '';
    this.lastBoostKey = '';
    this.timers = {};
    this.moneyChip = document.querySelector('.money-chip');
  }

  setMode(mode) {
    this.el.lobby.classList.toggle('hidden', mode !== 'lobby');
    this.el.run.classList.toggle('hidden', mode !== 'run');
    if (mode === 'run') this.shownReward = 0;
  }

  // ------------------------------------------------------------- lobby --
  updateLobby(dt) {
    const s = this.game.state;
    const prev = this.shownMoney;
    this.shownMoney = Math.abs(s.money - this.shownMoney) < 1 ? s.money : damp(this.shownMoney, s.money, 6, dt);
    if (Math.floor(prev) !== Math.floor(this.shownMoney)) this.el.money.textContent = formatMoney(this.shownMoney);
    this.setText(this.el.gems, formatNumber(s.gems));
    this.setText(this.el.speedStat, `${Math.round(E.kmh(E.runSpeed(s)))} km/h`);
    this.setText(this.el.petStat, `x${E.petMultiplier(s).toFixed(2)} money`);
    // boosts
    const bkey = Object.entries(s.boosts).filter(([, v]) => v > 0).map(([k, v]) => k + Math.ceil(v)).join(',');
    if (bkey !== this.lastBoostKey) {
      this.lastBoostKey = bkey;
      this.el.boosts.innerHTML = Object.entries(s.boosts).filter(([, v]) => v > 0)
        .map(([k, v]) => `<div class="chip boost-chip">${BOOSTS[k].icon} ${BOOSTS[k].name} ${formatTime(v)}</div>`).join('');
    }
    // badges
    const claim = this.game.progression.claimableMissions + (this.game.progression.dailyAvailable() ? 1 : 0);
    this.el.missionsBadge.classList.toggle('hidden', claim === 0);
    this.setText(this.el.missionsBadge, String(claim));
    // mission tracker
    const key = s.missions.active.map((m) => m.id + ':' + Math.floor(m.progress) + (m.complete ? 'c' : '')).join('|');
    if (key !== this.lastTrackerKey) {
      this.lastTrackerKey = key;
      this.el.tracker.innerHTML = s.missions.active.map((m) => `
        <div class="mt-item ${m.complete ? 'done' : ''}" data-mid="${m.id}">${m.complete ? '✅ ' : '🎯 '}${m.text}${m.complete ? ' — <b style="color:var(--green)">CLAIM!</b>' : ''}
          <div class="mt-bar"><div style="width:${Math.min(100, (m.progress / m.target) * 100)}%"></div></div></div>`).join('');
      this.el.tracker.querySelectorAll('.mt-item').forEach((n) => n.addEventListener('click', () => this.game.panels.open('missions')));
    }
  }

  bumpMoney() {
    this.moneyChip.classList.remove('bump');
    void this.moneyChip.offsetWidth;
    this.moneyChip.classList.add('bump');
  }

  setText(el, t) { if (el.textContent !== t) el.textContent = t; }

  // --------------------------------------------------------------- run --
  updateRun(dt, run) {
    const s = this.game.state;
    const r = E.rewardBreakdown(s, run.meters, run.coins);
    this.shownReward = r.total < this.shownReward ? r.total : damp(this.shownReward, r.total, 10, dt);
    this.setText(this.el.distance, fmtDist(run.meters));
    this.setText(this.el.reward, formatMoney(this.shownReward));
    this.setText(this.el.cashoutSub, formatMoney(this.shownReward));
    this.setText(this.el.bonus, `DISTANCE BONUS x${r.distMult.toFixed(2)}`);
    this.setText(this.el.kmh, String(Math.round(E.kmh(run.currentSpeed))));
    this.el.momentum.style.width = `${Math.round(run.momentumRatio * 100)}%`;
    this.setText(this.el.runBoost, run.boostTime > 0 ? '⚡ BOOST!' : run.momentumRatio > 0.99 ? '🔥 MAX MOMENTUM' : '');
    this.setText(this.el.petmult, `x${r.pet.toFixed(2)}`);
    this.setText(this.el.boostMoney, [r.rebirth > 1 ? `♻️ x${r.rebirth.toFixed(2)}` : '', r.boost > 1 ? '💵 x2 BOOST' : ''].filter(Boolean).join(' '));
    this.setText(this.el.biome, run.biomeName);
    this.setText(this.el.next, run.nextText);
    this.el.autorun.classList.toggle('on', run.autoRun);
    this.el.vignette.style.opacity = Math.min(0.9, run.fxLevel).toFixed(2);
  }

  // ------------------------------------------------------------ popups --
  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2300);
    setTimeout(() => t.remove(), 2700);
  }

  floatText(text, x, y, color) {
    const f = document.createElement('div');
    f.className = 'float-text';
    f.textContent = text;
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    if (color) f.style.color = color;
    this.el.floating.appendChild(f);
    if (this.el.floating.children.length > 24) this.el.floating.firstChild.remove();
    setTimeout(() => f.remove(), 950);
  }

  milestone(big, sub, color = '#ffd23f') {
    const el = this.el.milestone;
    el.innerHTML = `<div class="ms-big" style="text-shadow:0 6px 0 rgba(0,0,0,.35),0 0 40px ${color}">${big}</div>${sub ? `<div class="ms-sub">${sub}</div>` : ''}`;
    el.classList.remove('hidden');
    clearTimeout(this.timers.ms);
    this.timers.ms = setTimeout(() => el.classList.add('hidden'), 1900);
  }

  banner(title, sub = '', color = '#5ff3ff') {
    const el = this.el.banner;
    el.innerHTML = `<div class="b-title" style="color:#fff;text-shadow:0 0 24px ${color}">${title}</div>${sub ? `<div class="b-sub" style="color:${color}">${sub}</div>` : ''}`;
    el.classList.remove('hidden');
    clearTimeout(this.timers.banner);
    this.timers.banner = setTimeout(() => el.classList.add('hidden'), 2400);
  }

  flash() {
    const f = this.el.flash;
    f.classList.add('on');
    clearTimeout(this.timers.flash);
    this.timers.flash = setTimeout(() => f.classList.remove('on'), 40);
  }

  tutorial(text) {
    this.el.tutorial.classList.toggle('hidden', !text);
    if (text) this.setText(this.el.tutorial, text);
  }

  prompt(text) {
    this.el.prompt.classList.toggle('hidden', !text);
    if (text) this.setText(this.el.prompt, text);
  }

  camHint(text) {
    this.el.camHint.classList.toggle('hidden', !text);
    if (text) this.setText(this.el.camHint, text);
  }

  // ---------------------------------------------------------- cash out --
  showCashout(r) {
    const el = this.el.card;
    const rows = [
      ['DISTANCE', fmtDist(r.meters)],
      ['BASE REWARD', formatMoney(r.distanceMoney)],
      ['DISTANCE BONUS', `x${r.distMult.toFixed(2)} (incl.)`],
      r.coins > 0 ? ['COINS', '+' + formatMoney(r.coins)] : null,
      ['PET BONUS', `x${r.pet.toFixed(2)}`],
      r.rebirth > 1 ? ['REBIRTH BONUS', `x${r.rebirth.toFixed(2)}`] : null,
      r.boost > 1 ? ['2X MONEY BOOST', 'x2'] : null,
    ].filter(Boolean);
    el.innerHTML = `<div class="co-title">RUN COMPLETE!</div>
      ${r.newBest ? '<div class="co-best">⭐ NEW BEST DISTANCE! ⭐</div>' : ''}
      <div class="co-rows">${rows.map(([k, v], i) => `<div class="co-row" style="animation-delay:${i * 0.07}s"><span>${k}</span><span>${v}</span></div>`).join('')}</div>
      <div style="font-family:var(--title);color:var(--muted);letter-spacing:2px">TOTAL</div>
      <div class="co-total" id="co-total">$0</div>
      <div class="co-tap">tap to continue</div>`;
    el.classList.remove('hidden', 'out');
    const total = r.total;
    const start = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / 900);
      const v = total * (1 - Math.pow(1 - k, 3));
      const n = document.getElementById('co-total');
      if (n) n.textContent = formatMoney(v);
      if (k < 1 && !el.classList.contains('hidden')) {
        this.game.audio.play('tick');
        setTimeout(tick, 33);
      }
    };
    setTimeout(tick, 33);
    clearTimeout(this.timers.card);
    this.timers.card = setTimeout(() => this.hideCashout(), 2600);
  }

  hideCashout() {
    const el = this.el.card;
    if (el.classList.contains('hidden')) return;
    el.classList.add('out');
    clearTimeout(this.timers.card2);
    this.timers.card2 = setTimeout(() => el.classList.add('hidden'), 350);
  }
}

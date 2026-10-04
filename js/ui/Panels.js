// HTML panels: Sneaker Shop, Eggs, My Pets, Missions (+daily, gem boosts), Records, Rebirth, Settings.
// Rendered with innerHTML + one delegated click handler (data-act attributes).
import { SNEAKERS, SNEAKER_BY_ID, RARITY_COLORS } from '../config/sneakers.js';
import { PETS, EGGS, EGG_BY_ID, RARITIES } from '../config/pets.js';
import { ACHIEVEMENTS } from '../config/missions.js';
import { BOOSTS, PET_SLOTS, REBIRTH, GAME_VERSION } from '../config/balance.js';
import * as E from '../systems/Economy.js';
import { formatMoney, formatNumber, formatTime } from '../utils/math.js';
import { fmtDist } from '../world/Lobby.js';

const kmhTxt = (s) => `${Math.round(E.kmh(s))} km/h`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Panels {
  constructor(game) {
    this.game = game;
    this.wrap = document.getElementById('panel-wrap');
    this.el = document.getElementById('panel');
    this.current = null;   // { type, arg }
    this.sort = 'mult';
    this.confirm = null;
    this.wrap.addEventListener('pointerdown', (e) => { if (e.target === this.wrap) this.close(); });
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => this.onInput(e));
    this.el.addEventListener('change', (e) => this.onInput(e));
  }

  get isOpen() { return !!this.current; }
  get state() { return this.game.state; }
  get prog() { return this.game.progression; }
  get thumbs() { return this.game.thumbs; }

  open(type, arg = null) {
    const was = this.current?.type;
    this.current = { type, arg };
    this.confirm = null;
    this.wrap.classList.remove('hidden');
    this.render();
    if (was !== type) this.game.audio.play('open');
    this.game.onPanelOpen?.(type, arg);
  }

  close() {
    if (!this.current) return;
    const t = this.current.type;
    this.current = null;
    this.wrap.classList.add('hidden');
    this.el.innerHTML = '';
    this.game.audio.play('close');
    this.game.onPanelClose?.(t);
  }

  refresh() { if (this.current) this.render(); }

  head(title, sub = '', extra = '') {
    return `<div class="p-head"><div class="p-title">${title}${sub ? `<small>${sub}</small>` : ''}</div>${extra}<button class="p-close" data-act="close">✕</button></div>`;
  }

  render() {
    const c = this.current;
    if (!c) return;
    const scroll = this.el.querySelector('.p-body')?.scrollTop || 0;
    let html = '';
    switch (c.type) {
      case 'shop': html = this.shopHTML(); break;
      case 'egg': html = this.eggHTML(c.arg); break;
      case 'pets': html = this.petsHTML(); break;
      case 'missions': html = this.missionsHTML(); break;
      case 'stats': html = this.statsHTML(); break;
      case 'rebirth': html = this.rebirthHTML(); break;
      case 'settings': html = this.settingsHTML(); break;
    }
    this.el.innerHTML = html;
    const body = this.el.querySelector('.p-body');
    if (body) body.scrollTop = scroll;
  }

  // ------------------------------------------------------------------ shop --
  shopHTML() {
    const s = this.state;
    const eq = SNEAKER_BY_ID[s.sneakers.equipped];
    const next = E.nextSneaker(s);
    const cards = SNEAKERS.map((d) => {
      const owned = s.sneakers.owned.includes(d.id);
      const equipped = s.sneakers.equipped === d.id;
      const afford = s.money >= d.price;
      const gain = ((d.speed / eq.speed - 1) * 100);
      const cmp = equipped
        ? `<div class="cmp">SPEED ${d.speed}</div>`
        : `<div class="cmp">SPEED ${eq.speed} <span class="arrow">→</span> <span style="color:${d.speed > eq.speed ? 'var(--green)' : 'var(--pink)'}">${d.speed}</span></div>
           <div class="cmp"><span class="gain" style="color:${gain >= 0 ? 'var(--green)' : 'var(--pink)'}">${gain >= 0 ? '+' : ''}${Math.round(gain)}% ${gain >= 0 ? 'faster' : 'slower'}</span></div>`;
      let btn;
      if (equipped) btn = `<button class="btn green small" disabled style="background:linear-gradient(#5dff9a,#1fc463);color:#053">EQUIPPED</button>`;
      else if (owned) btn = `<button class="btn small" data-act="equip-sneaker" data-id="${d.id}">EQUIP</button>`;
      else if (afford) btn = `<button class="btn gold" data-act="buy-sneaker" data-id="${d.id}">BUY ${formatMoney(d.price)}</button>`;
      else btn = `<button class="btn gray small" disabled>NEED ${formatMoney(d.price - s.money)}</button>`;
      return `<div class="card ${equipped ? 'equipped' : ''} ${next === d && !owned ? 'next' : ''}">
        ${equipped ? '<span class="tag">EQUIPPED</span>' : owned ? '<span class="tag">OWNED</span>' : next === d ? '<span class="tag y">NEXT</span>' : ''}
        <img src="${this.thumbs.sneaker(d.id)}" alt="">
        <div class="c-name">${esc(d.name)}</div>
        <div class="c-rarity" style="color:${RARITY_COLORS[d.rarity]}">${d.rarity} • tier ${d.index + 1}</div>
        ${cmp}
        <div class="c-speed" style="font-size:12px;color:var(--muted)">${kmhTxt(d.speed)}</div>
        ${owned ? '' : `<div class="c-price">${d.price === 0 ? 'FREE' : formatMoney(d.price)}</div>`}
        ${btn}
      </div>`;
    }).join('');
    return this.head('👟 SNEAKER SHOP', 'Sneakers = SPEED. Faster sneakers → farther runs → way more money.', `<div class="p-money">${formatMoney(s.money)}</div>`)
      + `<div class="p-body"><div class="grid">${cards}</div></div>`;
  }

  // ------------------------------------------------------------------ eggs --
  eggHTML(id) {
    const s = this.state;
    const egg = EGG_BY_ID[id] || EGGS[0];
    const luck = E.totalLuck(s);
    const odds = E.eggOdds(egg, luck);
    const owned = (pid) => s.pets.list.filter((p) => p.id === pid).length;
    const afford1 = s.money >= egg.price, afford3 = s.money >= egg.price * 3;
    const full = s.pets.list.length >= PET_SLOTS.maxInventory;
    const nav = EGGS.map((e) => `<button class="btn small ${e.id === egg.id ? 'gold' : 'gray'}" style="${e.id === egg.id ? '' : 'color:#fff'}" data-act="egg-tab" data-id="${e.id}">${e.name}</button>`).join('');
    const items = odds.map((o) => {
      const p = PETS[o.pet];
      const col = RARITY_COLORS[p.rarity];
      return `<div class="odd" style="border-color:${col}55">
        <img src="${this.thumbs.pet(o.pet)}" alt="">
        <div class="o-name">${esc(p.name)}</div>
        <div class="c-rarity" style="color:${col}">${p.rarity}</div>
        <div class="o-mult">x${p.mult.toFixed(2)} MONEY</div>
        <div class="o-chance" style="color:${col}">${fmtChance(o.chance)}</div>
        <div style="font-size:11px;font-weight:800;color:var(--muted)">owned: ${owned(o.pet)}</div>
      </div>`;
    }).join('');
    return this.head('🥚 PET HATCHERY', 'Pets multiply your CASH-OUT money (they never change speed).', `<div class="p-money">${formatMoney(s.money)}</div>`)
      + `<div class="p-body">
        <div class="egg-nav">${nav}</div>
        <div class="egg-layout">
          <div class="egg-left">
            <img src="${this.thumbs.egg(egg.id)}" alt="">
            <div class="c-name" style="font-family:var(--title);font-size:24px">${egg.name}</div>
            <div class="egg-price">${formatMoney(egg.price)}</div>
            <div class="egg-buttons">
              ${full ? `<button class="btn gray" disabled>INVENTORY FULL</button><button class="btn small pink" data-act="open-pets">MANAGE PETS</button>` : `
              <button class="btn ${afford1 ? 'gold' : 'gray'}" ${afford1 ? '' : 'disabled'} data-act="buy-egg" data-id="${egg.id}" data-n="1">${afford1 ? 'HATCH 1' : 'NEED ' + formatMoney(egg.price - s.money)}</button>
              <button class="btn small ${afford3 ? 'purple' : 'gray'}" ${afford3 ? '' : 'disabled'} data-act="buy-egg" data-id="${egg.id}" data-n="3">HATCH 3 (${formatMoney(egg.price * 3)})</button>`}
            </div>
          </div>
          <div class="egg-right">
            <div class="odds-title">EXACT CHANCES ${luck > 0 ? '(LUCK INCLUDED)' : ''}</div>
            <div class="odds">${items}</div>
            <div class="luck-line">${luck > 0 ? `🍀 Luck +${Math.round(luck * 100)}% is active — the percentages above already include it.` : '🍀 Luck: none. Get Luck from rebirth perks or the Lucky Clover boost.'}</div>
          </div>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------------ pets --
  petsHTML() {
    const s = this.state;
    const slots = E.petSlots(s);
    const byUid = new Map(s.pets.list.map((p) => [p.uid, p]));
    const eqSet = new Set(s.pets.equipped);
    let slotHtml = '';
    for (let i = 0; i < slots; i++) {
      const p = byUid.get(s.pets.equipped[i]);
      slotHtml += p
        ? `<div class="slot filled" style="border-color:${RARITY_COLORS[PETS[p.id].rarity]}" data-act="toggle-pet" data-uid="${p.uid}" title="${esc(PETS[p.id].name)} — click to unequip"><img src="${this.thumbs.pet(p.id)}" alt=""><span class="s-mult">x${PETS[p.id].mult}</span></div>`
        : `<div class="slot" title="Empty slot">＋</div>`;
    }
    const up = PET_SLOTS.upgrades[s.pets.extraSlots || 0];
    if (up) slotHtml += `<div class="slot buy" data-act="buy-slot">+1 SLOT<br>${formatMoney(up.cost)}</div>`;
    const list = [...s.pets.list].sort((a, b) => {
      if (this.sort === 'rarity') return E.rarityIndex(PETS[b.id].rarity) - E.rarityIndex(PETS[a.id].rarity) || PETS[b.id].mult - PETS[a.id].mult;
      if (this.sort === 'new') return b.uid - a.uid;
      return PETS[b.id].mult - PETS[a.id].mult;
    });
    const cards = list.map((p) => {
      const d = PETS[p.id];
      const col = RARITY_COLORS[d.rarity];
      const eq = eqSet.has(p.uid);
      const confirming = this.confirm === 'del:' + p.uid;
      return `<div class="pet-card ${eq ? 'eq' : ''}" style="border-color:${eq ? 'var(--green)' : col + '66'}" data-act="toggle-pet" data-uid="${p.uid}">
        ${eq ? '<span class="pc-eq">EQUIPPED</span>' : `<button class="pc-del" data-act="del-pet" data-uid="${p.uid}" title="Delete" style="${confirming ? 'background:var(--pink);width:auto;padding:0 6px' : ''}">${confirming ? 'DELETE?' : '🗑'}</button>`}
        <img src="${this.thumbs.pet(p.id)}" alt="">
        <div class="pc-name">${esc(d.name)}</div>
        <div class="c-rarity" style="color:${col};font-size:11px">${d.rarity}</div>
        <div class="pc-mult">x${d.mult.toFixed(2)}</div>
      </div>`;
    }).join('');
    const total = E.petMultiplier(s);
    return this.head('🐾 MY PETS', `${s.pets.list.length}/${PET_SLOTS.maxInventory} pets • bonuses ADD together: Dog x1.2 + Fox x1.5 = x1.7`)
      + `<div class="p-body">
        <div class="pet-top">
          <div class="total-mult">x${total.toFixed(2)} MONEY<small>total pet bonus on every cash out</small></div>
          <div class="slots">${slotHtml}</div>
        </div>
        <div class="pet-top">
          <button class="btn small green" data-act="equip-best">⭐ EQUIP BEST</button>
          <button class="btn small ${this.confirm === 'dupes' ? 'pink' : 'gray'}" style="color:#fff" data-act="del-dupes">${this.confirm === 'dupes' ? 'TAP AGAIN TO CONFIRM' : '🗑 DELETE DUPLICATES'}</button>
          <div class="sort-row">SORT:
            ${['mult', 'rarity', 'new'].map((k) => `<button class="btn small ${this.sort === k ? '' : 'gray'}" data-act="sort" data-k="${k}">${{ mult: 'MULTIPLIER', rarity: 'RARITY', new: 'NEWEST' }[k]}</button>`).join('')}
          </div>
        </div>
        ${list.length ? `<div class="pet-grid">${cards}</div>` : `<div style="text-align:center;padding:30px;font-weight:900;color:var(--muted)">No pets yet — buy an egg at the PET HATCHERY! 🥚</div>`}
      </div>`;
  }

  // -------------------------------------------------------------- missions --
  missionsHTML() {
    const s = this.state;
    const p = this.prog;
    const rows = s.missions.active.map((m) => {
      const pct = Math.min(1, m.progress / m.target);
      const rew = [m.reward.money ? formatMoney(m.reward.money) : '', m.reward.gems ? `💎${m.reward.gems}` : '', m.reward.boost ? BOOSTS[m.reward.boost].icon + ' boost' : ''].filter(Boolean).join(' + ');
      return `<div class="m-row ${m.complete ? 'done' : ''}">
        <div class="m-text">${esc(m.text)}<div class="mt-bar"><div style="width:${pct * 100}%"></div></div></div>
        <div class="m-rew">${rew}</div>
        ${m.complete ? `<button class="btn green small" data-act="claim" data-id="${m.id}">CLAIM</button>` : `<div style="font-family:var(--title);min-width:46px;text-align:right">${Math.floor(pct * 100)}%</div>`}
      </div>`;
    }).join('');
    const daily = p.dailyAvailable();
    const boosts = Object.entries(BOOSTS).map(([id, b]) => {
      const left = s.boosts[id] || 0;
      return `<div class="card">
        <div style="font-size:32px">${b.icon}</div>
        <div class="c-name">${b.name}</div>
        <div style="font-size:13px;font-weight:800;color:var(--muted)">${b.desc}</div>
        ${left > 0 ? `<div style="font-family:var(--title);color:var(--green)">ACTIVE ${formatTime(left)}</div>` : ''}
        <button class="btn small ${s.gems >= b.gems ? 'purple' : 'gray'}" ${s.gems >= b.gems ? '' : 'disabled'} data-act="boost" data-id="${id}">💎 ${b.gems}${left > 0 ? ' (+5 min)' : ''}</button>
      </div>`;
    }).join('');
    return this.head('🎯 MISSIONS', 'Complete missions for money, gems and boosts.', `<div class="p-money" style="color:var(--cyan)">💎 ${s.gems}</div>`)
      + `<div class="p-body">
        <div class="m-row ${daily ? 'done' : ''}">
          <div class="m-text">🎁 Daily reward <span style="color:var(--muted);font-size:13px">streak: ${s.daily.streak} day${s.daily.streak === 1 ? '' : 's'}</span></div>
          ${daily ? `<button class="btn gold small" data-act="daily">CLAIM</button>` : `<div style="font-weight:900;color:var(--muted)">Come back tomorrow!</div>`}
        </div>
        <div class="section-title">ACTIVE MISSIONS</div>
        <div class="m-list">${rows}</div>
        <div class="section-title">GEM BOOSTS <span style="font-size:13px;color:var(--muted);font-family:var(--body)">(optional — gems come from missions, milestones & achievements)</span></div>
        <div class="boost-grid">${boosts}</div>
      </div>`;
  }

  // ----------------------------------------------------------------- stats --
  statsHTML() {
    const s = this.state, st = s.stats;
    const box = (k, v) => `<div class="stat-box"><div class="s-k">${k}</div><div class="s-v">${v}</div></div>`;
    const ach = ACHIEVEMENTS.map((a) => {
      const got = s.achievements.includes(a.id);
      return `<div class="ach ${got ? 'got' : ''}"><div class="a-ico">${got ? a.icon : '🔒'}</div><div><div class="a-name">${a.name}</div><div class="a-desc">${a.desc} • 💎${a.gems}</div></div></div>`;
    }).join('');
    return this.head('🏆 RECORDS', 'Your personal bests (online rankings coming soon)')
      + `<div class="p-body">
        <div class="stats-grid">
          ${box('BEST DISTANCE', fmtDist(st.bestDistance))}
          ${box('TOTAL DISTANCE', fmtDist(st.totalDistance))}
          ${box('BIGGEST CASH OUT', formatMoney(st.biggestCashout))}
          ${box('TOTAL EARNED', formatMoney(st.totalEarned))}
          ${box('TOP SPEED', Math.round(st.topSpeed) + ' km/h')}
          ${box('RUNS', formatNumber(st.runs))}
          ${box('EGGS HATCHED', formatNumber(st.eggsHatched))}
          ${box('COINS COLLECTED', formatNumber(st.coins))}
          ${box('HURDLES JUMPED', formatNumber(st.hurdles))}
          ${box('SNEAKERS OWNED', `${s.sneakers.owned.length}/14`)}
          ${box('REBIRTHS', s.rebirth.count)}
          ${box('PLAY TIME', formatTime(st.playTime))}
        </div>
        <div class="section-title">ACHIEVEMENTS (${s.achievements.length}/${ACHIEVEMENTS.length})</div>
        <div class="ach-grid">${ach}</div>
      </div>`;
  }

  // --------------------------------------------------------------- rebirth --
  rebirthHTML() {
    const s = this.state;
    const pv = this.prog.rebirthPreview();
    const need = SNEAKERS[REBIRTH.minSneakerIndex];
    const hasTier = s.sneakers.owned.some((id) => SNEAKER_BY_ID[id].index >= REBIRTH.minSneakerIndex);
    const perks = Object.entries(REBIRTH.perks).map(([id, p]) => {
      const lvl = s.rebirth.perks[id] || 0;
      const max = lvl >= p.max;
      const cost = p.cost(lvl);
      const can = !max && s.rebirth.tokens >= cost;
      const cur = id === 'start' ? `start with ${formatMoney(REBIRTH.startMoney(lvl))}` : `+${Math.round(p.per * lvl * 100)}%`;
      return `<div class="card"><div style="font-size:30px">${p.icon}</div><div class="c-name">${p.name}</div>
        <div style="font-size:12px;font-weight:800;color:var(--muted)">${p.desc}</div>
        <div style="font-family:var(--title);color:var(--cyan)">LV ${lvl}/${p.max} • ${cur}</div>
        <button class="btn small ${can ? 'purple' : 'gray'}" ${can ? '' : 'disabled'} data-act="perk" data-id="${id}">${max ? 'MAXED' : `♻️ ${cost} TOKEN${cost > 1 ? 'S' : ''}`}</button></div>`;
    }).join('');
    const confirming = this.confirm === 'rebirth';
    return this.head('♻️ REBIRTH', 'Reset to get Tokens for permanent bonuses', `<div class="p-money" style="color:#ff8ad8">♻️ ${s.rebirth.tokens} tokens</div>`)
      + `<div class="p-body">
        <div class="rb-hero">
          ${pv.can ? `<div class="odds-title">REBIRTH NOW FOR</div><div class="rb-tokens">♻️ ${pv.tokens} TOKENS</div>` : `<div class="odds-title">REBIRTH LOCKED</div>`}
          <div class="rb-list">
            ${hasTier ? '✅' : '❌'} Own <b style="color:#fff">${need.name}</b> sneakers<br>
            ${s.earnedThisLife >= REBIRTH.minEarned ? '✅' : '❌'} Earn ${formatMoney(REBIRTH.minEarned)} since your last rebirth (${formatMoney(s.earnedThisLife)})<br>
            <span style="color:var(--pink)">Resets:</span> money & sneakers. &nbsp; <span style="color:var(--green)">Keeps:</span> pets, gems, records, achievements, perks.
          </div>
          ${pv.can ? `<button class="btn ${confirming ? 'pink' : 'purple'}" style="margin-top:12px;font-size:22px" data-act="rebirth">${confirming ? 'TAP AGAIN TO REBIRTH' : '♻️ REBIRTH'}</button>` : ''}
        </div>
        <div class="section-title">PERMANENT PERKS</div>
        <div class="perk-grid">${perks}</div>
      </div>`;
  }

  // -------------------------------------------------------------- settings --
  settingsHTML() {
    const st = this.state.settings;
    const tog = (k, label) => `<div class="set-row">${label}<button class="toggle ${st[k] ? 'on' : ''}" data-act="toggle" data-k="${k}"></button></div>`;
    const touch = this.game.input.isTouch;
    return this.head('⚙️ SETTINGS', `Sneaker Rush 3D v${GAME_VERSION}`)
      + `<div class="p-body">
        ${tog('music', '🎵 Music')}
        ${tog('sound', '🔊 Sound effects')}
        <div class="set-row">🖱️ Camera sensitivity <input type="range" min="0.3" max="2.5" step="0.1" value="${st.sensitivity}" data-k="sensitivity"></div>
        ${tog('invertY', '↕️ Invert camera Y')}
        ${tog('fastHatch', '⏩ Fast egg hatching')}
        <div class="set-row">🖥️ Graphics quality
          <div>${['auto', 'low', 'medium', 'high'].map((q) => `<button class="btn small ${st.quality === q ? '' : 'gray'}" data-act="quality" data-q="${q}">${q.toUpperCase()}</button>`).join(' ')}</div>
        </div>
        <div class="controls-help">
          ${touch ? `Left thumb: <b>move</b> • Right side: <b>drag to look</b> • <b>⤒</b> jump • <b>CASH OUT</b> to bank your run • <b>AUTO RUN</b> keeps running for you` :
          `<b>W A S D</b> move • <b>Mouse</b> look (click the game to capture the cursor, <b>Z</b> to release it) • <b>Space</b> jump<br>
           <b>C</b> / <b>Enter</b> cash out • <b>R</b> auto-run • <b>E</b> open nearby shop • <b>I</b> pets • <b>M</b> missions • <b>Esc</b> settings`}
        </div>
        <div class="controls-help" style="font-size:12px">
          <b>Credits</b> 3D models: character, Shiba Inu, tree, bench and street light by Quaternius (CC0) ·
          "Cat" by Poly by Google, licensed under CC-BY 3.0 · via poly.pizza
        </div>
        <div class="set-row" style="border:none;margin-top:12px">
          <span style="color:var(--pink)">Reset all progress</span>
          <button class="btn small ${this.confirm === 'reset' ? 'pink' : 'gray'}" style="color:#fff" data-act="reset">${this.confirm === 'reset' ? 'TAP AGAIN — THIS DELETES EVERYTHING' : 'RESET'}</button>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------- events --
  onInput(e) {
    const t = e.target;
    if (t.dataset.k === 'sensitivity') {
      this.state.settings.sensitivity = Number(t.value);
      this.game.applySettings();
    }
  }

  onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    e.stopPropagation();
    const g = this.game, p = this.prog, a = t.dataset.act;
    const keepConfirm = ['del-pet', 'del-dupes', 'rebirth', 'reset'].includes(a);
    const prevConfirm = this.confirm;
    if (!keepConfirm) this.confirm = null;
    g.audio.play('click');
    switch (a) {
      case 'close': this.close(); return;
      case 'buy-sneaker': g.buySneaker(t.dataset.id); break;
      case 'equip-sneaker': p.equipSneaker(t.dataset.id); g.audio.play('equip'); break;
      case 'egg-tab': this.current.arg = t.dataset.id; g.preloadEgg(t.dataset.id); break;
      case 'buy-egg': g.buyEggs(t.dataset.id, Number(t.dataset.n)); return;
      case 'open-pets': this.open('pets'); return;
      case 'toggle-pet': {
        const uid = Number(t.dataset.uid);
        if (this.state.pets.equipped.includes(uid)) p.unequipPet(uid);
        else if (!p.equipPet(uid).ok) g.toast('All pet slots are full — unequip one first', 'bad');
        else g.audio.play('equip');
        break;
      }
      case 'del-pet': {
        const uid = Number(t.dataset.uid);
        if (prevConfirm === 'del:' + uid) { p.deletePet(uid); this.confirm = null; } else this.confirm = 'del:' + uid;
        break;
      }
      case 'del-dupes':
        if (prevConfirm === 'dupes') { const r = p.deleteWeakDuplicates(); g.toast(`Deleted ${r.removed} duplicate pet${r.removed === 1 ? '' : 's'}`); this.confirm = null; } else this.confirm = 'dupes';
        break;
      case 'equip-best': p.equipBest(); g.audio.play('equip'); break;
      case 'buy-slot': {
        const r = p.buyPetSlot();
        if (r.ok) { g.audio.play('buy'); g.toast('New pet slot unlocked!', 'good'); } else g.audio.play('error');
        break;
      }
      case 'sort': this.sort = t.dataset.k; break;
      case 'claim': g.claimMission(t.dataset.id); break;
      case 'daily': g.claimDaily(); break;
      case 'boost': {
        const r = p.buyBoost(t.dataset.id);
        if (r.ok) { g.audio.play('buy'); g.toast(`${BOOSTS[t.dataset.id].name} activated!`, 'good'); }
        break;
      }
      case 'perk': if (p.buyPerk(t.dataset.id).ok) g.audio.play('buy'); break;
      case 'rebirth':
        if (prevConfirm === 'rebirth') { this.confirm = null; g.doRebirth(); } else this.confirm = 'rebirth';
        break;
      case 'toggle': this.state.settings[t.dataset.k] = !this.state.settings[t.dataset.k]; g.applySettings(); break;
      case 'quality': this.state.settings.quality = t.dataset.q; g.applySettings(); break;
      case 'reset':
        if (prevConfirm === 'reset') { g.resetProgress(); return; }
        this.confirm = 'reset';
        break;
    }
    g.save();
    this.render();
  }
}

function fmtChance(c) {
  const p = c * 100;
  if (p >= 10) return p.toFixed(1) + '%';
  if (p >= 1) return p.toFixed(2) + '%';
  return p.toFixed(3) + '%';
}

export { RARITIES };

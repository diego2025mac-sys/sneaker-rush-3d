// All player actions that change the save state (buy, equip, hatch, cash out, missions, rebirth…).
// No DOM / three.js: the UI calls these and reacts to the events they emit.
// Every method returns { ok, reason?, ... } and never throws on bad input.
import { bus } from '../core/EventBus.js';
import { MILESTONES, PET_SLOTS, REBIRTH, BOOSTS, DAILY } from '../config/balance.js';
import { SNEAKERS, SNEAKER_BY_ID } from '../config/sneakers.js';
import { PETS, EGG_BY_ID, RARITIES } from '../config/pets.js';
import { MISSIONS, PROCEDURAL_MISSIONS, ACHIEVEMENTS } from '../config/missions.js';
import { createDefaultState } from '../core/GameState.js';
import * as E from './Economy.js';

const dayNumber = (t = Date.now()) => Math.floor((t - new Date().getTimezoneOffset() * 60000) / 86400000);

export class Progression {
  constructor(state, rnd = Math.random) {
    this.state = state;
    this.rnd = rnd;
    this.forceRarity = null; // debug
    this.ensureMissions();
  }

  // ------------------------------------------------------------- money --
  addMoney(amount, source = 'other') {
    if (!(amount > 0)) return;
    const s = this.state;
    s.money += amount;
    s.earnedThisLife += amount;
    s.stats.totalEarned += amount;
    bus.emit('money', { amount, source });
    this.checkAchievements();
  }

  spend(amount) {
    if (this.state.money < amount) return false;
    this.state.money -= amount;
    bus.emit('money', { amount: -amount });
    return true;
  }

  addGems(n, source = 'other') {
    if (!(n > 0)) return;
    this.state.gems += n;
    bus.emit('gems', { amount: n, source });
  }

  // ----------------------------------------------------------- sneakers --
  buySneaker(id) {
    const s = this.state;
    const def = SNEAKER_BY_ID[id];
    if (!def) return { ok: false, reason: 'unknown' };
    if (s.sneakers.owned.includes(id)) return this.equipSneaker(id);
    if (!this.spend(def.price)) return { ok: false, reason: 'money' };
    s.sneakers.owned.push(id);
    s.stats.sneakersBought++;
    this.progress('sneakers', 1);
    s.sneakers.equipped = id;
    bus.emit('sneaker:bought', { id });
    bus.emit('sneaker:equipped', { id });
    this.checkAchievements();
    return { ok: true, bought: true };
  }

  equipSneaker(id) {
    if (!this.state.sneakers.owned.includes(id)) return { ok: false, reason: 'not-owned' };
    this.state.sneakers.equipped = id;
    bus.emit('sneaker:equipped', { id });
    return { ok: true };
  }

  // --------------------------------------------------------------- eggs --
  buyEgg(eggId) {
    const s = this.state;
    const egg = EGG_BY_ID[eggId];
    if (!egg) return { ok: false, reason: 'unknown' };
    if (s.pets.list.length >= PET_SLOTS.maxInventory) return { ok: false, reason: 'full' };
    if (!this.spend(egg.price)) return { ok: false, reason: 'money' };
    const petId = E.rollEgg(egg, E.totalLuck(s), this.rnd, this.forceRarity);
    this.forceRarity = null;
    const pet = { uid: s.pets.nextUid++, id: petId, t: Date.now() };
    s.pets.list.push(pet);
    s.stats.eggsHatched++;
    s.stats.bestRarity = Math.max(s.stats.bestRarity, E.rarityIndex(PETS[petId].rarity));
    // auto-equip into a free slot, or replace the weakest equipped pet if this one is better
    const autoEquipped = this.autoEquip(pet.uid);
    this.progress('eggs', 1);
    bus.emit('pet:hatched', { egg: eggId, pet, def: PETS[petId], autoEquipped });
    this.checkAchievements();
    return { ok: true, pet, def: PETS[petId], autoEquipped };
  }

  addPet(petId) {
    const s = this.state;
    if (!PETS[petId]) return null;
    const pet = { uid: s.pets.nextUid++, id: petId, t: Date.now() };
    s.pets.list.push(pet);
    s.stats.bestRarity = Math.max(s.stats.bestRarity, E.rarityIndex(PETS[petId].rarity));
    bus.emit('pets:changed');
    return pet;
  }

  autoEquip(uid) {
    const s = this.state;
    const slots = E.petSlots(s);
    if (s.pets.equipped.length < slots) {
      s.pets.equipped.push(uid);
      this.afterPetChange();
      return true;
    }
    const mult = (u) => PETS[s.pets.list.find((p) => p.uid === u)?.id]?.mult || 0;
    let worst = null;
    for (const u of s.pets.equipped) if (worst === null || mult(u) < mult(worst)) worst = u;
    if (worst !== null && mult(uid) > mult(worst)) {
      s.pets.equipped[s.pets.equipped.indexOf(worst)] = uid;
      this.afterPetChange();
      return true;
    }
    return false;
  }

  equipPet(uid) {
    const s = this.state;
    if (!s.pets.list.some((p) => p.uid === uid)) return { ok: false, reason: 'unknown' };
    if (s.pets.equipped.includes(uid)) return { ok: true };
    if (s.pets.equipped.length >= E.petSlots(s)) return { ok: false, reason: 'slots' };
    s.pets.equipped.push(uid);
    this.afterPetChange();
    return { ok: true };
  }

  unequipPet(uid) {
    const s = this.state;
    s.pets.equipped = s.pets.equipped.filter((u) => u !== uid);
    this.afterPetChange();
    return { ok: true };
  }

  /** Equip the best pets automatically. */
  equipBest() {
    const s = this.state;
    const sorted = [...s.pets.list].sort((a, b) => PETS[b.id].mult - PETS[a.id].mult);
    s.pets.equipped = sorted.slice(0, E.petSlots(s)).map((p) => p.uid);
    this.afterPetChange();
    return { ok: true };
  }

  deletePet(uid) {
    const s = this.state;
    const i = s.pets.list.findIndex((p) => p.uid === uid);
    if (i < 0) return { ok: false };
    s.pets.list.splice(i, 1);
    s.pets.equipped = s.pets.equipped.filter((u) => u !== uid);
    this.afterPetChange();
    return { ok: true };
  }

  /** Delete every unequipped pet whose multiplier is not better than any equipped pet. */
  deleteWeakDuplicates() {
    const s = this.state;
    const eq = new Set(s.pets.equipped);
    const seen = new Set();
    let removed = 0;
    // keep one copy of every species (collection), delete extra unequipped copies
    for (const uid of s.pets.equipped) seen.add(s.pets.list.find((p) => p.uid === uid)?.id);
    s.pets.list = s.pets.list.filter((p) => {
      if (eq.has(p.uid)) return true;
      if (!seen.has(p.id)) { seen.add(p.id); return true; }
      removed++;
      return false;
    });
    this.afterPetChange();
    return { ok: true, removed };
  }

  buyPetSlot() {
    const s = this.state;
    const next = PET_SLOTS.upgrades[s.pets.extraSlots || 0];
    if (!next) return { ok: false, reason: 'max' };
    if (!this.spend(next.cost)) return { ok: false, reason: 'money' };
    s.pets.extraSlots = (s.pets.extraSlots || 0) + 1;
    this.afterPetChange();
    return { ok: true };
  }

  afterPetChange() {
    const n = this.state.pets.equipped.length;
    this.setStateProgress('equip', n);
    bus.emit('pets:changed');
  }

  // ---------------------------------------------------------------- run --
  /** Called continuously during a run (metres, speed m/s). */
  runProgress(meters, speedMs) {
    const s = this.state;
    const k = E.kmh(speedMs);
    if (k > s.stats.topSpeed) {
      s.stats.topSpeed = k;
      this.setMaxProgress('speed', k);
    }
    this.setMaxProgress('run', meters);
    // first-time milestone gems
    for (const ms of MILESTONES) {
      if (meters >= ms.m && !s.milestones.includes(ms.m)) {
        s.milestones.push(ms.m);
        this.addGems(ms.gems, 'milestone');
      }
    }
  }

  cashOut(meters, coins) {
    const s = this.state;
    const r = E.rewardBreakdown(s, meters, coins);
    s.stats.runs++;
    s.stats.cashouts++;
    s.stats.totalDistance += meters;
    const newBest = meters > s.stats.bestDistance;
    if (newBest) s.stats.bestDistance = meters;
    s.stats.biggestCashout = Math.max(s.stats.biggestCashout, r.total);
    s.pendingRun = null;
    this.addMoney(r.total, 'cashout');
    this.progress('cashouts', 1);
    this.progress('cashout', r.total);
    this.progress('distance', meters);
    this.setMaxProgress('run', meters);
    bus.emit('run:cashout', { ...r, newBest });
    this.checkAchievements();
    return { ...r, newBest };
  }

  stat(name, n = 1) {
    this.state.stats[name] = (this.state.stats[name] || 0) + n;
    this.progress(name, n);
  }

  // ------------------------------------------------------------ boosts --
  buyBoost(id) {
    const def = BOOSTS[id];
    if (!def) return { ok: false };
    if (this.state.gems < def.gems) return { ok: false, reason: 'gems' };
    this.state.gems -= def.gems;
    this.grantBoost(id);
    return { ok: true };
  }

  grantBoost(id, seconds = BOOSTS[id]?.duration || 300) {
    this.state.boosts[id] = (this.state.boosts[id] || 0) + seconds;
    bus.emit('boost', { id });
  }

  tickBoosts(dt) {
    for (const k of Object.keys(this.state.boosts)) {
      if (this.state.boosts[k] > 0) {
        this.state.boosts[k] = Math.max(0, this.state.boosts[k] - dt);
        if (this.state.boosts[k] === 0) bus.emit('boost:ended', { id: k });
      }
    }
  }

  // ------------------------------------------------------------- daily --
  dailyAvailable() {
    return this.state.daily.lastDay !== dayNumber();
  }

  claimDaily() {
    const s = this.state;
    const today = dayNumber();
    if (s.daily.lastDay === today) return { ok: false };
    s.daily.streak = s.daily.lastDay === today - 1 ? s.daily.streak + 1 : 1;
    s.daily.lastDay = today;
    const r = DAILY.rewards[(s.daily.streak - 1) % DAILY.rewards.length];
    const money = Math.max(200, Math.round(E.typicalRunMoney(s) * r.moneyRuns));
    this.addGems(r.gems, 'daily');
    this.addMoney(money, 'daily');
    if (r.boost) this.grantBoost(r.boost);
    return { ok: true, gems: r.gems, money, boost: r.boost, streak: s.daily.streak };
  }

  // ----------------------------------------------------------- missions --
  ensureMissions() {
    const m = this.state.missions;
    while (m.active.length < 3) {
      const def = this.makeMission(m.index++);
      if (!def) break;
      m.active.push(def);
    }
    // state-based missions may already be complete
    this.setStateProgress('equip', this.state.pets.equipped.length);
    this.checkRarityMissions();
  }

  makeMission(i) {
    const s = this.state;
    if (i < MISSIONS.length) {
      const d = MISSIONS[i];
      return { id: d.id, type: d.type, target: d.target ?? 1, rarity: d.rarity, text: d.text, reward: { ...d.reward }, progress: 0 };
    }
    const p = PROCEDURAL_MISSIONS[i % PROCEDURAL_MISSIONS.length];
    const cycle = Math.floor((i - MISSIONS.length) / PROCEDURAL_MISSIONS.length) + 1;
    let target;
    if (p.type === 'run') target = Math.max(1000, Math.round((s.stats.bestDistance * p.mult) / 100) * 100);
    else target = p.base * cycle;
    const label = p.type === 'run' ? (target >= 1000 ? `${(target / 1000).toFixed(1)} km` : `${target} m`) : target.toLocaleString('en-US');
    const money = Math.max(500, Math.round(E.typicalRunMoney(s) * p.rewardRuns));
    return { id: 'p' + i, type: p.type, target, text: p.text(label), reward: { money, gems: p.gems }, progress: 0 };
  }

  progress(type, n) {
    for (const m of this.state.missions.active) {
      if (m.type === type && !m.complete) {
        m.progress = Math.min(m.target, m.progress + n);
        this.checkMission(m);
      }
    }
  }

  setMaxProgress(type, v) {
    for (const m of this.state.missions.active) {
      if (m.type === type && !m.complete && v > m.progress) {
        m.progress = Math.min(m.target, v);
        this.checkMission(m);
      }
    }
  }

  setStateProgress(type, v) {
    for (const m of this.state.missions.active) {
      if (m.type === type && !m.complete) {
        m.progress = Math.min(m.target, v);
        this.checkMission(m);
      }
    }
    if (type === 'equip') this.checkRarityMissions();
  }

  checkRarityMissions() {
    const best = this.state.pets.list.reduce((a, p) => Math.max(a, E.rarityIndex(PETS[p.id].rarity)), -1);
    for (const m of this.state.missions.active) {
      if (m.type === 'rarity' && !m.complete) {
        m.progress = best >= RARITIES.indexOf(m.rarity) ? 1 : 0;
        m.target = 1;
        this.checkMission(m);
      }
    }
  }

  checkMission(m) {
    if (!m.complete && m.progress >= m.target) {
      m.complete = true;
      bus.emit('mission:complete', { mission: m });
    }
  }

  claimMission(id) {
    const ms = this.state.missions;
    const i = ms.active.findIndex((m) => m.id === id && m.complete);
    if (i < 0) return { ok: false };
    const m = ms.active[i];
    ms.active.splice(i, 1);
    ms.done++;
    if (m.reward.money) this.addMoney(m.reward.money, 'mission');
    if (m.reward.gems) this.addGems(m.reward.gems, 'mission');
    if (m.reward.boost) this.grantBoost(m.reward.boost);
    this.ensureMissions();
    bus.emit('mission:claimed', { mission: m });
    return { ok: true, mission: m };
  }

  get claimableMissions() {
    return this.state.missions.active.filter((m) => m.complete).length;
  }

  // ------------------------------------------------------- achievements --
  checkAchievements() {
    const s = this.state;
    if (this.state.pets) this.checkRarityMissions();
    for (const a of ACHIEVEMENTS) {
      if (!s.achievements.includes(a.id) && a.check(s)) {
        s.achievements.push(a.id);
        this.addGems(a.gems, 'achievement');
        bus.emit('achievement', { achievement: a });
      }
    }
  }

  // ------------------------------------------------------------ rebirth --
  rebirthPreview() {
    return { can: E.canRebirth(this.state), tokens: E.rebirthTokens(this.state.earnedThisLife) };
  }

  rebirth() {
    const s = this.state;
    if (!E.canRebirth(s)) return { ok: false, reason: 'locked' };
    const tokens = E.rebirthTokens(s.earnedThisLife);
    s.rebirth.count++;
    s.rebirth.tokens += tokens;
    // reset: money, sneakers, boosts stay, pets stay (collection), missions continue
    s.money = REBIRTH.startMoney(s.rebirth.perks.start || 0);
    s.earnedThisLife = 0;
    s.sneakers = { owned: ['starter'], equipped: 'starter' };
    bus.emit('rebirth', { tokens });
    bus.emit('sneaker:equipped', { id: 'starter' });
    this.checkAchievements();
    return { ok: true, tokens };
  }

  buyPerk(id) {
    const def = REBIRTH.perks[id];
    const s = this.state;
    if (!def) return { ok: false };
    const lvl = s.rebirth.perks[id] || 0;
    if (lvl >= def.max) return { ok: false, reason: 'max' };
    const cost = def.cost(lvl);
    if (s.rebirth.tokens < cost) return { ok: false, reason: 'tokens' };
    s.rebirth.tokens -= cost;
    s.rebirth.perks[id] = lvl + 1;
    bus.emit('perk', { id });
    return { ok: true };
  }

  // -------------------------------------------------------------- debug --
  unlockAllSneakers() {
    this.state.sneakers.owned = SNEAKERS.map((s) => s.id);
    bus.emit('sneaker:equipped', { id: this.state.sneakers.equipped });
  }

  reset() {
    const fresh = createDefaultState();
    for (const k of Object.keys(this.state)) delete this.state[k];
    Object.assign(this.state, fresh);
    this.ensureMissions();
  }
}

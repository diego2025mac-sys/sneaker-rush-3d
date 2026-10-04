// The single serialisable save state + migration. Everything the player owns lives here.
import { ECONOMY, GAME_VERSION } from '../config/balance.js';
import { SNEAKER_BY_ID } from '../config/sneakers.js';
import { PETS } from '../config/pets.js';

export const STATE_VERSION = 1;

export function createDefaultState() {
  return {
    v: STATE_VERSION,
    gameVersion: GAME_VERSION,
    money: ECONOMY.startMoney,
    gems: 0,
    earnedThisLife: 0,
    sneakers: { owned: ['starter'], equipped: 'starter' },
    pets: { list: [], equipped: [], nextUid: 1, extraSlots: 0 },
    stats: {
      runs: 0, cashouts: 0, bestDistance: 0, totalDistance: 0, totalEarned: 0, biggestCashout: 0,
      eggsHatched: 0, sneakersBought: 0, coins: 0, hurdles: 0, pads: 0, topSpeed: 0, bestRarity: -1, playTime: 0,
    },
    missions: { index: 0, active: [], done: 0 },
    achievements: [],
    milestones: [],          // metres of milestones ever reached (first-time gem rewards)
    rebirth: { count: 0, tokens: 0, perks: { earn: 0, speed: 0, luck: 0, start: 0, slot: 0 } },
    boosts: { money: 0, speed: 0, luck: 0 }, // seconds remaining
    daily: { lastDay: -1, streak: 0 },
    settings: { music: true, sound: true, sensitivity: 1, invertY: false, quality: 'auto', fastHatch: false, autoRun: false },
    tutorial: { step: 0 },
    pendingRun: null,        // { meters, coins } — recovered if the tab closed mid-run
    lastSession: Date.now(),
    lastSaved: 0,
  };
}

/** Make any older / partial / corrupted save safe to use. */
export function migrateState(raw) {
  const def = createDefaultState();
  if (!raw || typeof raw !== 'object') return def;
  const s = deepMerge(def, raw);
  // sanitise
  const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
  s.money = num(s.money);
  s.gems = Math.floor(num(s.gems));
  s.earnedThisLife = num(s.earnedThisLife);
  s.sneakers.owned = [...new Set((s.sneakers.owned || []).filter((id) => SNEAKER_BY_ID[id]))];
  if (!s.sneakers.owned.includes('starter')) s.sneakers.owned.unshift('starter');
  if (!s.sneakers.owned.includes(s.sneakers.equipped)) s.sneakers.equipped = 'starter';
  s.pets.list = (s.pets.list || []).filter((p) => p && PETS[p.id] && Number.isFinite(p.uid));
  const uids = new Set(s.pets.list.map((p) => p.uid));
  s.pets.equipped = [...new Set((s.pets.equipped || []).filter((u) => uids.has(u)))];
  s.pets.nextUid = Math.max(s.pets.nextUid || 1, ...s.pets.list.map((p) => p.uid + 1), 1);
  for (const k of Object.keys(s.boosts)) s.boosts[k] = num(s.boosts[k]);
  s.v = STATE_VERSION;
  s.gameVersion = GAME_VERSION;
  return s;
}

function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (over && typeof over === 'object' && !Array.isArray(over)) {
      for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
  }
  return over === undefined || over === null ? base : typeof over === typeof base || base === null ? over : base;
}

// Pure economy formulas — no DOM, no three.js. Used by the game, the node simulator and tests.
// Change balance values in /js/config, not here.
import { ECONOMY, SPEED, REBIRTH, BOOSTS, PET_SLOTS } from '../config/balance.js';
import { SNEAKERS, SNEAKER_BY_ID } from '../config/sneakers.js';
import { PETS, RARITIES } from '../config/pets.js';

// ------------------------------------------------------------- distance $ --
export const distanceBonus = (m) => Math.pow(1 + Math.max(0, m) / ECONOMY.bonusScale, ECONOMY.bonusExponent);
export const baseReward = (m) => Math.max(0, m) * ECONOMY.distanceValue;
/** Value of one track coin at the current run distance (before pet/rebirth multipliers). */
export const coinValue = (m) => ECONOMY.coinMeters * ECONOMY.distanceValue * distanceBonus(m);

// ------------------------------------------------------------------- pets --
/** Additive pet multiplier: 1 + Σ(mult − 1). */
export function petMultiplierFromIds(petIds) {
  let bonus = 0;
  for (const id of petIds) {
    const p = PETS[id];
    if (p) bonus += p.mult - 1;
  }
  return 1 + bonus;
}

export function equippedPetIds(state) {
  const byUid = new Map(state.pets.list.map((p) => [p.uid, p.id]));
  return state.pets.equipped.map((uid) => byUid.get(uid)).filter(Boolean);
}

export const petMultiplier = (state) => petMultiplierFromIds(equippedPetIds(state));

export function petSlots(state) {
  return PET_SLOTS.base + (state.pets.extraSlots || 0) + (state.rebirth.perks.slot || 0);
}

export const rarityIndex = (r) => Math.max(0, RARITIES.indexOf(r));

// ---------------------------------------------------------------- rebirth --
export const rebirthEarnMult = (state) => 1 + REBIRTH.perks.earn.per * (state.rebirth.perks.earn || 0);
export const rebirthSpeedMult = (state) => 1 + REBIRTH.perks.speed.per * (state.rebirth.perks.speed || 0);
export const rebirthTokens = (earned) => Math.floor(Math.pow(Math.max(0, earned) / REBIRTH.tokenDivisor, REBIRTH.tokenExponent));

export function canRebirth(state) {
  const tierOk = state.sneakers.owned.some((id) => SNEAKER_BY_ID[id]?.index >= REBIRTH.minSneakerIndex);
  return tierOk && state.earnedThisLife >= REBIRTH.minEarned;
}

// ------------------------------------------------------------------ boosts --
export const boostActive = (state, id) => (state.boosts[id] || 0) > 0;
export const boostMoneyMult = (state) => (boostActive(state, 'money') ? 2 : 1);
export const boostSpeedMult = (state) => (boostActive(state, 'speed') ? BOOSTS.speed.mult : 1);

// ------------------------------------------------------------------- luck --
export function totalLuck(state) {
  return REBIRTH.perks.luck.per * (state.rebirth.perks.luck || 0) + (boostActive(state, 'luck') ? BOOSTS.luck.luck : 0);
}

/**
 * Final egg odds after Luck. Rarer pets (later in the list) get weight × (1 + luck)^rank,
 * then everything is normalised. These exact numbers are shown before purchase.
 */
export function eggOdds(egg, luck = 0) {
  const sorted = [...egg.pets].sort((a, b) => rarityIndex(PETS[a.pet].rarity) - rarityIndex(PETS[b.pet].rarity));
  const ws = sorted.map((e, rank) => e.w * Math.pow(1 + luck, rank));
  const total = ws.reduce((a, b) => a + b, 0);
  return sorted.map((e, i) => ({ pet: e.pet, chance: ws[i] / total }));
}

export function rollEgg(egg, luck = 0, rnd = Math.random, forceRarity = null) {
  const odds = eggOdds(egg, luck);
  if (forceRarity) {
    const forced = odds.filter((o) => rarityIndex(PETS[o.pet].rarity) >= rarityIndex(forceRarity));
    if (forced.length) return forced[0].pet;
    return odds[odds.length - 1].pet;
  }
  let r = rnd();
  for (const o of odds) {
    r -= o.chance;
    if (r <= 0) return o.pet;
  }
  return odds[odds.length - 1].pet;
}

// ------------------------------------------------------------------ speed --
/** Distance speed (m/s) from sneakers + permanent bonuses + boosts. */
export function runSpeed(state) {
  const s = SNEAKER_BY_ID[state.sneakers.equipped] || SNEAKERS[0];
  const override = state.debugSpeed || 0;
  return (override || s.speed) * rebirthSpeedMult(state) * boostSpeedMult(state);
}

/** Physical world speed (units/s) for a distance speed — compressed so controls stay usable. */
export function worldSpeed(s) {
  if (s <= SPEED.linearUntil) return s;
  return Math.min(SPEED.worldMax, SPEED.linearUntil + SPEED.sqrtFactor * Math.sqrt(s - SPEED.linearUntil));
}

export const kmh = (ms) => ms * 3.6;

// ---------------------------------------------------------------- rewards --
/** Full cash-out breakdown. `coins` is the run's coin pot (already in $ before multipliers). */
export function rewardBreakdown(state, meters, coins = 0) {
  const base = baseReward(meters);
  const distMult = distanceBonus(meters);
  const distanceMoney = base * distMult;
  const pet = petMultiplier(state);
  const rebirth = rebirthEarnMult(state);
  const boost = boostMoneyMult(state);
  const subtotal = distanceMoney + coins;
  const total = Math.floor(subtotal * pet * rebirth * boost);
  return { meters, base, distMult, distanceMoney, coins, subtotal, pet, rebirth, boost, total };
}

export const potentialReward = (state, meters, coins = 0) => rewardBreakdown(state, meters, coins).total;

/** Typical money for a "standard" run of the given length at the player's current speed (for mission rewards). */
export function typicalRunMoney(state, seconds = 40) {
  const m = runSpeed(state) * seconds;
  return rewardBreakdown(state, m, 0).total;
}

export function nextSneaker(state) {
  return SNEAKERS.find((s) => !state.sneakers.owned.includes(s.id)) || null;
}

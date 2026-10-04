// Economy pacing simulator: plays the core loop with a simple "greedy" player and prints a timeline.
// Usage: node tools/sim.mjs [minutes=60] [runSeconds=auto]
import { createDefaultState } from '../js/core/GameState.js';
import { Progression } from '../js/systems/Progression.js';
import * as E from '../js/systems/Economy.js';
import { SPEED, PET_SLOTS } from '../js/config/balance.js';
import { SNEAKERS } from '../js/config/sneakers.js';
import { EGGS, PETS } from '../js/config/pets.js';

const minutes = Number(process.argv[2] || 60);
const fixedRun = Number(process.argv[3] || 0);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const state = createDefaultState();
const prog = new Progression(state, rnd);
let t = 0;
const log = (msg) => console.log(`${fmtT(t).padStart(6)}  ${msg}`);
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const $ = (n) => '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Math.floor(n));

/** Players run longer as the game goes on (and as distance becomes more lucrative). */
function runLength(runIdx) {
  if (fixedRun) return fixedRun;
  if (runIdx === 0) return 24;
  return Math.min(75, 28 + runIdx * 1.2);
}

function simulateRun(T) {
  const S = E.runSpeed(state);
  let m = 0, coins = 0;
  const dt = 0.1;
  for (let x = 0; x < T; x += dt) {
    const accel = Math.min(1, x / SPEED.accelTime);
    const mom = 1 + SPEED.momentumMax * Math.min(1, x / SPEED.momentumTime) * 0.8; // occasional stumbles
    m += S * accel * mom * dt * 0.97;
    if (rnd() < 0.055) coins += E.coinValue(m); // ~0.55 coins / s
  }
  prog.runProgress(m, S);
  return prog.cashOut(m, coins);
}

let runs = 0;
const firstOf = {};
while (t < minutes * 60) {
  const T = runLength(runs);
  t += 4; // walk to portal
  const r = simulateRun(T);
  t += T + 3; // cash-out sequence
  runs++;
  if (runs <= 3 || runs % 10 === 0) log(`run #${runs} ${(r.meters / 1000).toFixed(2)} km -> ${$(r.total)} (pets x${r.pet.toFixed(2)})  money ${$(state.money)}`);
  // claim missions
  for (const m of [...state.missions.active]) if (m.complete) prog.claimMission(m.id);
  // shopping: sneakers first, then eggs when useful
  let bought = true, eggsThisVisit = 0;
  while (bought) {
    bought = false;
    const next = E.nextSneaker(state);
    if (next && state.money >= next.price) {
      prog.buySneaker(next.id);
      log(`>> SNEAKER ${next.name} (${next.speed} m/s, ${Math.round(E.kmh(next.speed))} km/h) for ${$(next.price)}`);
      t += 6; bought = true; continue;
    }
    // best egg we can afford that can improve our pets, keep ~40% of money for the next sneaker
    const reserve = next ? Math.min(state.money * 0.4, next.price * 0.6) : 0;
    for (let i = EGGS.length - 1; i >= 0 && eggsThisVisit < 4; i--) {
      const egg = EGGS[i];
      if (state.money - reserve < egg.price) continue;
      const weakest = Math.min(...E.equippedPetIds(state).map((id) => PETS[id].mult), E.petSlots(state) > state.pets.equipped.length ? 0 : 99);
      const best = Math.max(...egg.pets.map((p) => PETS[p.pet].mult));
      if (best <= weakest) continue;
      const res = prog.buyEgg(egg.id);
      if (!res.ok) { prog.deleteWeakDuplicates(); continue; }
      if (!firstOf[egg.id]) { firstOf[egg.id] = 1; log(`>> FIRST ${egg.name} (${$(egg.price)}) -> ${res.def.name} x${res.def.mult}`); }
      t += 3; eggsThisVisit++; bought = true; break;
    }
  }
  if (state.pets.extraSlots < 3 && E.canRebirth(state) === false) {
    const up = PET_SLOTS.upgrades[state.pets.extraSlots].cost;
    if (state.money > up * 2) { prog.buyPetSlot(); log(`>> PET SLOT ${E.petSlots(state)}`); }
  }
  if (E.canRebirth(state) && !firstOf.rebirth) { firstOf.rebirth = 1; log(`** rebirth available (${E.rebirthTokens(state.earnedThisLife)} tokens)`); }
}
log(`END: ${runs} runs, best ${(state.stats.bestDistance / 1000).toFixed(2)} km, sneaker ${state.sneakers.equipped}, pets x${E.petMultiplier(state).toFixed(2)}, eggs ${state.stats.eggsHatched}, gems ${state.gems}`);

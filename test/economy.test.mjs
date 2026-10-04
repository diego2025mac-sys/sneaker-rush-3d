// Pure-logic tests: economy formulas, eggs/odds, pets, progression, missions, rebirth, save migration, pacing.
// Run: npm test
import assert from 'node:assert/strict';
import { createDefaultState, migrateState } from '../js/core/GameState.js';
import { Progression } from '../js/systems/Progression.js';
import * as E from '../js/systems/Economy.js';
import { SNEAKERS } from '../js/config/sneakers.js';
import { EGGS, PETS } from '../js/config/pets.js';
import { MILESTONES, REBIRTH, PET_SLOTS } from '../js/config/balance.js';
import { BIOMES, biomeIndexAt } from '../js/config/biomes.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
};
const fresh = () => { const s = createDefaultState(); return { s, p: new Progression(s, seeded(1)) }; };
function seeded(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

console.log('Economy');
test('distance bonus is 1 at 0 m and grows', () => {
  assert.equal(E.distanceBonus(0), 1);
  assert.ok(E.distanceBonus(1000) > E.distanceBonus(250));
});
test('reward per metre grows with distance (long runs worth more), short runs still pay', () => {
  const s = createDefaultState();
  const perM = (m) => E.rewardBreakdown(s, m).total / m;
  assert.ok(perM(5000) > perM(1000) * 2);
  assert.ok(E.rewardBreakdown(s, 50).total > 0);
});
test('reward breakdown = (distance$ + coins) * pet * rebirth * boost', () => {
  const s = createDefaultState();
  s.rebirth.perks.earn = 2; s.boosts.money = 10;
  const r = E.rewardBreakdown(s, 1234, 100);
  const expect = Math.floor((1234 * E.distanceBonus(1234) + 100) * 1 * 1.3 * 2);
  assert.equal(r.total, expect);
});
test('pet multipliers are additive', () => {
  assert.equal(E.petMultiplierFromIds([]), 1);
  assert.ok(Math.abs(E.petMultiplierFromIds(['dog', 'fox', 'golden_dog']) - (1 + 0.1 + 0.8 + 0.75)) < 1e-9);
});
test('sneakers are strictly faster and pricier tier by tier', () => {
  for (let i = 1; i < SNEAKERS.length; i++) {
    assert.ok(SNEAKERS[i].speed > SNEAKERS[i - 1].speed, SNEAKERS[i].id);
    assert.ok(SNEAKERS[i].price > SNEAKERS[i - 1].price, SNEAKERS[i].id);
  }
  assert.equal(SNEAKERS[0].price, 0);
});
test('world speed is compressed, monotonic and capped', () => {
  let prev = 0;
  for (const sn of SNEAKERS) { const w = E.worldSpeed(sn.speed); assert.ok(w >= prev && w <= 50); prev = w; }
  assert.equal(E.worldSpeed(6), 6);
});

console.log('Eggs & pets');
test('egg odds sum to 1 for every egg, with and without luck', () => {
  for (const egg of EGGS) for (const luck of [0, 0.5, 3]) {
    const sum = E.eggOdds(egg, luck).reduce((a, o) => a + o.chance, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, egg.id);
  }
});
test('luck increases the chance of the rarest pet', () => {
  for (const egg of EGGS) {
    const a = E.eggOdds(egg, 0), b = E.eggOdds(egg, 1);
    assert.ok(b[b.length - 1].chance > a[a.length - 1].chance);
  }
});
test('displayed base odds match configured weights', () => {
  const o = E.eggOdds(EGGS[0], 0);
  assert.ok(Math.abs(o[0].chance - 0.5) < 1e-9 && Math.abs(o[3].chance - 0.05) < 1e-9);
});
test('rolled distribution matches displayed odds (100k rolls)', () => {
  const rnd = seeded(42), counts = {};
  const egg = EGGS[1];
  for (let i = 0; i < 100000; i++) { const id = E.rollEgg(egg, 0, rnd); counts[id] = (counts[id] || 0) + 1; }
  for (const o of E.eggOdds(egg, 0)) assert.ok(Math.abs(counts[o.pet] / 100000 - o.chance) < 0.01, o.pet);
});
test('buying an egg needs money, hatches a pet and auto-equips', () => {
  const { s, p } = fresh();
  assert.equal(p.buyEgg('basic').ok, false);
  s.money = 10000;
  const r = p.buyEgg('basic');
  assert.ok(r.ok && PETS[r.pet.id]);
  assert.equal(s.pets.equipped.length, 1);
  assert.equal(s.money, 10000 - EGGS[0].price);
});
test('pet slots: 3 base, equip refuses a 4th, slot upgrade allows it', () => {
  const { s, p } = fresh();
  for (let i = 0; i < 4; i++) p.addPet('dog');
  s.pets.equipped = [];
  for (const pet of s.pets.list.slice(0, 3)) assert.ok(p.equipPet(pet.uid).ok);
  assert.equal(p.equipPet(s.pets.list[3].uid).ok, false);
  s.money = PET_SLOTS.upgrades[0].cost;
  assert.ok(p.buyPetSlot().ok);
  assert.ok(p.equipPet(s.pets.list[3].uid).ok);
});
test('equip best + delete duplicates keep the best pets equipped', () => {
  const { s, p } = fresh();
  ['dog', 'dog', 'cat', 'golden_fox', 'fox', 'dog'].forEach((id) => p.addPet(id));
  p.equipBest();
  const eq = E.equippedPetIds(s).sort();
  assert.deepEqual(eq, ['cat', 'fox', 'golden_fox']);
  const r = p.deleteWeakDuplicates();
  assert.equal(r.removed, 2);
  assert.equal(E.equippedPetIds(s).length, 3);
});

console.log('Progression');
test('sneaker purchase: needs money, equips, cannot double-buy', () => {
  const { s, p } = fresh();
  assert.equal(p.buySneaker('street').ok, false);
  s.money = 1000;
  assert.ok(p.buySneaker('street').ok);
  assert.equal(s.sneakers.equipped, 'street');
  assert.equal(s.money, 1000 - SNEAKERS[1].price);
  p.buySneaker('street');
  assert.equal(s.money, 1000 - SNEAKERS[1].price);
  assert.ok(E.runSpeed(s) > SNEAKERS[0].speed);
});
test('cash out adds money, best distance and mission progress', () => {
  const { s, p } = fresh();
  const r = p.cashOut(250, 20);
  assert.equal(s.money, r.total);
  assert.equal(s.stats.bestDistance, 250);
  assert.ok(s.missions.active.find((m) => m.id === 'm1').complete);
  p.cashOut(100, 0);
  assert.equal(s.stats.bestDistance, 250);
});
test('first-time milestones grant gems once', () => {
  const { s, p } = fresh();
  p.runProgress(1200, 10);
  const g1 = s.gems;
  p.runProgress(1200, 10);
  assert.equal(s.gems, g1);
  assert.equal(g1, MILESTONES.filter((m) => m.m <= 1200).reduce((a, m) => a + m.gems, 0));
});
test('missions claim and refill to 3', () => {
  const { s, p } = fresh();
  p.cashOut(150, 0);
  const done = s.missions.active.filter((m) => m.complete);
  assert.ok(done.length >= 1);
  const before = s.money;
  assert.ok(p.claimMission(done[0].id).ok);
  assert.ok(s.money > before);
  assert.equal(s.missions.active.length, 3);
});
test('rebirth is gated and resets money/sneakers but keeps pets', () => {
  const { s, p } = fresh();
  p.addPet('fox');
  assert.equal(p.rebirth().ok, false);
  s.sneakers.owned = SNEAKERS.slice(0, REBIRTH.minSneakerIndex + 1).map((x) => x.id);
  s.earnedThisLife = REBIRTH.minEarned * 4;
  const r = p.rebirth();
  assert.ok(r.ok && r.tokens > 0);
  assert.deepEqual(s.sneakers.owned, ['starter']);
  assert.equal(s.pets.list.length, 1);
  assert.ok(p.buyPerk('earn').ok);
  assert.ok(E.rebirthEarnMult(s) > 1);
});
test('daily reward once per day', () => {
  const { p } = fresh();
  assert.ok(p.claimDaily().ok);
  assert.equal(p.claimDaily().ok, false);
});

console.log('Save');
test('migrateState survives garbage and partial saves', () => {
  for (const raw of [null, 42, 'x', {}, { money: -5, sneakers: { owned: ['nope'], equipped: 'nope' }, pets: { list: [{ uid: 1, id: 'ghost' }], equipped: [1, 9] } }]) {
    const s = migrateState(raw);
    assert.ok(s.money >= 0);
    assert.ok(s.sneakers.owned.includes('starter'));
    assert.equal(s.sneakers.equipped, 'starter');
    assert.deepEqual(s.pets.equipped, []);
  }
});
test('save round-trip keeps progress', () => {
  const { s, p } = fresh();
  s.money = 5000; p.buySneaker('retro'); p.buyEgg('basic'); p.cashOut(500, 0);
  const back = migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(back.money, s.money);
  assert.equal(back.sneakers.equipped, 'retro');
  assert.equal(back.pets.list.length, 1);
  assert.equal(back.stats.bestDistance, 500);
});

console.log('Biomes & pacing');
test('biomes are ordered and cover 0 m → 100 km+', () => {
  assert.equal(biomeIndexAt(0), 0);
  assert.equal(BIOMES[biomeIndexAt(150000)].id, 'space');
  for (let i = 1; i < BIOMES.length; i++) assert.ok(BIOMES[i].from > BIOMES[i - 1].from);
});
test('a 25 s first run pays for the first sneaker upgrade', () => {
  const s = createDefaultState();
  const meters = SNEAKERS[0].speed * 24;
  assert.ok(E.rewardBreakdown(s, meters).total >= SNEAKERS[1].price);
});

console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`);

// ============================================================================
//  PETS & EGGS — pets multiply CASH-OUT money (never speed).
//  Pet multipliers are ADDITIVE:  total = 1 + Σ(mult − 1)
//    e.g. Dog x1.2 (+20%) + Fox x1.5 (+50%) + Dragon x2 (+100%) = x2.7
//  Eggs are bought with gameplay money only. Chances are always shown before buying
//  (after Luck is applied).
//
//  species: dog | cat | bunny | bird | fox | robodog | tiger | dragon | unicorn | phoenix | bear | slime
//  finish : normal | golden | diamond | crystal | neon | cosmic | shadow
// ============================================================================

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];

export const PETS = {
  // ---- Basic Egg
  dog:          { name: 'Dog',           species: 'dog',     finish: 'normal',  mult: 1.10, rarity: 'Common',    colors: [0xc98a4b, 0xf2dcc0, 0x3a2516] },
  cat:          { name: 'Cat',           species: 'cat',     finish: 'normal',  mult: 1.20, rarity: 'Uncommon',  colors: [0x9aa3ad, 0xffffff, 0x2a2a2a] },
  bunny:        { name: 'Bunny',         species: 'bunny',   finish: 'normal',  mult: 1.35, rarity: 'Rare',      colors: [0xf7f2ee, 0xffb3c7, 0x2a2a2a] },
  golden_dog:   { name: 'Golden Dog',    species: 'dog',     finish: 'golden',  mult: 1.75, rarity: 'Epic',      colors: [0xffc93c, 0xfff0b0, 0x5a3a00] },
  // ---- City Egg
  pigeon:       { name: 'Pigeon',        species: 'bird',    finish: 'normal',  mult: 1.50, rarity: 'Uncommon',  colors: [0x8b93a8, 0x5fb3a8, 0xff9f1c] },
  fox:          { name: 'Fox',           species: 'fox',     finish: 'normal',  mult: 1.80, rarity: 'Rare',      colors: [0xff7a2f, 0xffffff, 0x2a1a10] },
  robodog:      { name: 'Robot Dog',     species: 'robodog', finish: 'normal',  mult: 2.20, rarity: 'Epic',      colors: [0xc7d0db, 0x3fa9ff, 0x2a2f36] },
  golden_fox:   { name: 'Golden Fox',    species: 'fox',     finish: 'golden',  mult: 3.00, rarity: 'Legendary', colors: [0xffc93c, 0xfff0b0, 0x5a3a00] },
  // ---- Luxury Egg
  tiger:        { name: 'Tiger',         species: 'tiger',   finish: 'normal',  mult: 2.50, rarity: 'Rare',      colors: [0xff9a2f, 0xffffff, 0x1d1d1d] },
  diamond_cat:  { name: 'Diamond Cat',   species: 'cat',     finish: 'diamond', mult: 3.00, rarity: 'Epic',      colors: [0xb8f3ff, 0xffffff, 0x3fa9ff] },
  golden_dragon:{ name: 'Golden Dragon', species: 'dragon',  finish: 'golden',  mult: 4.00, rarity: 'Legendary', colors: [0xffc93c, 0xff7a2f, 0x5a3a00] },
  crystal_dragon:{ name: 'Crystal Dragon', species: 'dragon', finish: 'crystal', mult: 5.00, rarity: 'Mythic',   colors: [0xc48cff, 0x7fe7ff, 0xffffff] },
  // ---- Neon Egg
  neon_fox:     { name: 'Neon Fox',      species: 'fox',     finish: 'neon',    mult: 4.50, rarity: 'Rare',      colors: [0x14121f, 0x39ff88, 0x39ff88] },
  cyber_cat:    { name: 'Cyber Cat',     species: 'cat',     finish: 'neon',    mult: 6.00, rarity: 'Epic',      colors: [0x14121f, 0xff2bd6, 0x5ff3ff] },
  neon_unicorn: { name: 'Neon Unicorn',  species: 'unicorn', finish: 'neon',    mult: 8.50, rarity: 'Legendary', colors: [0x1a1030, 0xff2bd6, 0x5ff3ff] },
  glitch_phoenix:{ name: 'Glitch Phoenix', species: 'phoenix', finish: 'neon',  mult: 13.0, rarity: 'Mythic',    colors: [0x1a1030, 0x39ff88, 0xff2bd6] },
  // ---- Cosmic Egg
  star_bunny:   { name: 'Star Bunny',    species: 'bunny',   finish: 'cosmic',  mult: 12.0, rarity: 'Epic',      colors: [0x2d1b69, 0xffe14d, 0x5ff3ff] },
  nebula_bear:  { name: 'Nebula Bear',   species: 'bear',    finish: 'cosmic',  mult: 16.0, rarity: 'Legendary', colors: [0x3a1f7a, 0xff5ac8, 0x5ff3ff] },
  galaxy_dragon:{ name: 'Galaxy Dragon', species: 'dragon',  finish: 'cosmic',  mult: 24.0, rarity: 'Mythic',    colors: [0x24104f, 0xff5ac8, 0xffe14d] },
  void_slime:   { name: 'Void Slime',    species: 'slime',   finish: 'shadow',  mult: 40.0, rarity: 'Secret',    colors: [0x0a0614, 0xb45cff, 0x00f0ff] },
};
for (const [id, p] of Object.entries(PETS)) p.id = id;

export const EGGS = [
  { id: 'basic',  name: 'Basic Egg',  price: 300,     color: 0xf4efe6, spots: 0x9ad8ff, pets: [
    { pet: 'dog', w: 50 }, { pet: 'cat', w: 30 }, { pet: 'bunny', w: 15 }, { pet: 'golden_dog', w: 5 } ] },
  { id: 'city',   name: 'City Egg',   price: 6000,   color: 0x8b93a8, spots: 0xffd23f, pets: [
    { pet: 'pigeon', w: 50 }, { pet: 'fox', w: 32 }, { pet: 'robodog', w: 15 }, { pet: 'golden_fox', w: 3 } ] },
  { id: 'luxury', name: 'Luxury Egg', price: 120000,  color: 0xffd76a, spots: 0xffffff, pets: [
    { pet: 'tiger', w: 55 }, { pet: 'diamond_cat', w: 30 }, { pet: 'golden_dragon', w: 13 }, { pet: 'crystal_dragon', w: 2 } ] },
  { id: 'neon',   name: 'Neon Egg',   price: 2.5e6,    color: 0x1a1030, spots: 0x39ff88, glow: 0xff2bd6, pets: [
    { pet: 'neon_fox', w: 55 }, { pet: 'cyber_cat', w: 30 }, { pet: 'neon_unicorn', w: 13 }, { pet: 'glitch_phoenix', w: 2 } ] },
  { id: 'cosmic', name: 'Cosmic Egg', price: 60e6,   color: 0x24104f, spots: 0xffe14d, glow: 0x5ff3ff, pets: [
    { pet: 'star_bunny', w: 60 }, { pet: 'nebula_bear', w: 29 }, { pet: 'galaxy_dragon', w: 10.5 }, { pet: 'void_slime', w: 0.5 } ] },
];
export const EGG_BY_ID = Object.fromEntries(EGGS.map((e) => [e.id, e]));

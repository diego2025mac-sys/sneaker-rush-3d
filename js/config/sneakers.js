// ============================================================================
//  SNEAKERS — determine RUNNING SPEED (metres of distance per second).
//  All names / designs are original. No real brands, logos or protected designs.
//
//  Visual params (read by player/SneakerModel.js):
//   style    silhouette: canvas | runner | high | court | dunk | air | knit | neon | carbon |
//            chunky | plasma | cosmic | galaxy | quantum
//   upper / panel / accent / sole / mid / laces  colours
//   glow     emissive accent colour (null = none)
//   trail    particle trail colour (null = none)
//   aura     floating ring effect around the ankle (top tiers)
// ============================================================================

export const RARITY_COLORS = {
  Common: '#b8c2cc',
  Uncommon: '#5fd068',
  Rare: '#3fa9ff',
  Epic: '#b45cff',
  Legendary: '#ffb200',
  Mythic: '#ff3d7f',
  Secret: '#00f0ff',
};

export const SNEAKERS = [
  { id: 'starter',  name: 'Starter Canvas',  price: 0,       speed: 6,   rarity: 'Common',
    style: 'canvas',  upper: 0xf3efe6, panel: 0xe8e2d4, accent: 0x2b4c7e, sole: 0xf7f4ec, mid: 0xf7f4ec, laces: 0xffffff, glow: null, trail: null },
  { id: 'street',   name: 'Street Runner',   price: 120,     speed: 8,   rarity: 'Common',
    style: 'runner',  upper: 0x5b6b7c, panel: 0x42505e, accent: 0xff7a2f, sole: 0x2a2f36, mid: 0xf2f2f2, laces: 0xf2f2f2, glow: null, trail: null },
  { id: 'retro',    name: 'Retro High',      price: 450,     speed: 11, rarity: 'Uncommon',
    style: 'high',    upper: 0xffffff, panel: 0xd7263d, accent: 0x111111, sole: 0xe9dcc0, mid: 0xffffff, laces: 0xffffff, glow: null, trail: null },
  { id: 'court',    name: 'Court Classic',   price: 1500,    speed: 15, rarity: 'Uncommon',
    style: 'court',   upper: 0xffffff, panel: 0x1e7a46, accent: 0x1e7a46, sole: 0xffffff, mid: 0xffffff, laces: 0xffffff, glow: null, trail: null },
  { id: 'dunk',     name: 'Urban Dunk',      price: 4500,    speed: 20,  rarity: 'Rare',
    style: 'dunk',    upper: 0xffd23f, panel: 0x6a2c91, accent: 0x6a2c91, sole: 0x6a2c91, mid: 0xffffff, laces: 0xffd23f, glow: null, trail: null },
  { id: 'airsprint', name: 'Air Sprint',     price: 13000,   speed: 27,  rarity: 'Rare',
    style: 'air',     upper: 0x2ec4f1, panel: 0xffffff, accent: 0xff3d7f, sole: 0x1b1f2a, mid: 0xffffff, laces: 0xffffff, glow: 0x7fe7ff, trail: null },
  { id: 'velocity', name: 'Velocity X',      price: 38000,  speed: 36,  rarity: 'Epic',
    style: 'knit',    upper: 0x1b1d24, panel: 0x2b2f3a, accent: 0xff4d1a, sole: 0xff4d1a, mid: 0xf4f4f4, laces: 0x1b1d24, glow: 0xff7a3d, trail: 0xff7a3d },
  { id: 'neon',     name: 'Neon Runner',     price: 110000,  speed: 48,  rarity: 'Epic',
    style: 'neon',    upper: 0x14121f, panel: 0x231c3a, accent: 0x39ff88, sole: 0x0d0c14, mid: 0x14121f, laces: 0x39ff88, glow: 0x39ff88, trail: 0x39ff88 },
  { id: 'carbon',   name: 'Carbon Racer',    price: 320000,   speed: 64,  rarity: 'Legendary',
    style: 'carbon',  upper: 0xe9edf2, panel: 0x2a2d33, accent: 0xff2a2a, sole: 0x2a2d33, mid: 0xff2a2a, laces: 0x2a2d33, glow: 0xff3b3b, trail: 0xff5a5a },
  { id: 'hyper',    name: 'Hyper Boost',     price: 950000,     speed: 85,  rarity: 'Legendary',
    style: 'chunky',  upper: 0xffffff, panel: 0x9ad8ff, accent: 0xff8ad8, sole: 0xffffff, mid: 0xfff2a8, laces: 0x9ad8ff, glow: 0xffe36b, trail: 0xffe36b },
  { id: 'plasma',   name: 'Plasma Kicks',    price: 2.8e6,    speed: 112,  rarity: 'Mythic',
    style: 'plasma',  upper: 0x1a0f3a, panel: 0x3a1f7a, accent: 0xff2bd6, sole: 0x0e0822, mid: 0x7a3cff, laces: 0xff2bd6, glow: 0xff2bd6, trail: 0xc23cff },
  { id: 'cosmic',   name: 'Cosmic Runner',   price: 8.5e6,    speed: 150, rarity: 'Mythic',
    style: 'cosmic',  upper: 0x0b1440, panel: 0x2d1b69, accent: 0x5ff3ff, sole: 0x060a20, mid: 0x5ff3ff, laces: 0xffffff, glow: 0x5ff3ff, trail: 0x8a7dff, aura: 0x5ff3ff },
  { id: 'galaxy',   name: 'Galaxy High',     price: 26e6,   speed: 200, rarity: 'Secret',
    style: 'galaxy',  upper: 0x24104f, panel: 0xff5ac8, accent: 0xffe14d, sole: 0x120826, mid: 0xffe14d, laces: 0xffe14d, glow: 0xffe14d, trail: 0xff5ac8, aura: 0xff5ac8 },
  { id: 'quantum',  name: 'Quantum Sneakers', price: 80e6,  speed: 260, rarity: 'Secret',
    style: 'quantum', upper: 0xf4fbff, panel: 0x00e5ff, accent: 0x00e5ff, sole: 0xf4fbff, mid: 0x00e5ff, laces: 0x00e5ff, glow: 0x00f0ff, trail: 0x00f0ff, aura: 0xffffff },
];

export const SNEAKER_BY_ID = Object.fromEntries(SNEAKERS.map((s, i) => [s.id, { ...s, index: i }]));
SNEAKERS.forEach((s, i) => { s.index = i; });

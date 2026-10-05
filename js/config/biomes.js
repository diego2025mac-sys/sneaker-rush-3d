// ============================================================================
//  RUN TRACK BIOMES — the environment changes as the run gets longer.
//  `from` is in metres of run distance. Colours are blended smoothly over `blend` metres.
//  Prop generation for each biome lives in world/BiomeProps.js, the far backdrop in world/Scenery.js.
//
//  Visual-only fields (no gameplay effect):
//   sky*/horizon/fog*  sky gradient, horizon haze band and distance fog (fog ≈ horizon, so the
//                      ground fades into the sky without a white seam)
//   sun/sunI/shadowI   key light colour, strength and shadow darkness (shadowI < 1 = softer)
//   asphalt/patch      road surface and repair-patch colours · track: accent paint · trackLine: lines
//   shoulder/curb      gravel shoulder and kerb stones · ground/groundAlt: terrain colours
//   far                base colour of the distant backdrop (mixed toward the horizon by Scenery)
// ============================================================================

export const BIOMES = [
  { id: 'city', name: 'CITY', from: 0,
    skyTop: 0x2a80dc, skyBottom: 0x86c0ee, horizon: 0xb7d3ea, fog: 0xb2cee6, fogNear: 70, fogFar: 420,
    sun: 0xffefd6, sunI: 2.9, shadowI: 0.82, hemiSky: 0xcfe4ff, hemiGround: 0x7a7266, hemiI: 1.0, stars: 0,
    asphalt: 0x4a4d55, patch: 0x3c3f46, track: 0xd9553b, trackLine: 0xffffff, shoulder: 0x8d8a86, curb: 0xe8e8e8,
    ground: 0x7a8088, groundAlt: 0x8c929a, far: 0x7d93ad },
  { id: 'suburbs', name: 'SUBURBS', from: 500,
    skyTop: 0x3290ea, skyBottom: 0x92cbf2, horizon: 0xc0dceb, fog: 0xb8d6e6, fogNear: 80, fogFar: 440,
    sun: 0xffeccc, sunI: 3.0, shadowI: 0.8, hemiSky: 0xd8f0ff, hemiGround: 0x5f8a46, hemiI: 1.05, stars: 0,
    asphalt: 0x50525a, patch: 0x42444b, track: 0xd9553b, trackLine: 0xffffff, shoulder: 0x9c9686, curb: 0xf0f0f0,
    ground: 0x6fb850, groundAlt: 0x86c45e, far: 0x6f9a7a },
  { id: 'desert', name: 'DESERT', from: 2000,
    skyTop: 0x2a78d0, skyBottom: 0x8cc0e8, horizon: 0xf0c493, fog: 0xebbd8a, fogNear: 70, fogFar: 420,
    sun: 0xffdcae, sunI: 3.3, shadowI: 0.86, hemiSky: 0xffe2bc, hemiGround: 0xb57a40, hemiI: 0.95, stars: 0,
    asphalt: 0x6b5a4c, patch: 0x5c4c40, track: 0xc84a2c, trackLine: 0xfff3d6, shoulder: 0xc9a06a, curb: 0xf3dcae,
    ground: 0xe3b066, groundAlt: 0xd69c55, far: 0xc77a4a },
  { id: 'forest', name: 'FOREST', from: 5000,
    skyTop: 0x3488cc, skyBottom: 0x93c8dc, horizon: 0xa9cfc0, fog: 0x9fc5b2, fogNear: 55, fogFar: 380,
    sun: 0xffeab8, sunI: 2.9, shadowI: 0.8, hemiSky: 0xcaead2, hemiGround: 0x34592c, hemiI: 1.05, stars: 0,
    asphalt: 0x46484c, patch: 0x393b3f, track: 0xd9693a, trackLine: 0xf5f0dc, shoulder: 0x7b6e58, curb: 0xd8d2c0,
    ground: 0x4a8a36, groundAlt: 0x5e9a3e, far: 0x3f6f5a },
  { id: 'mountains', name: 'MOUNTAINS', from: 10000,
    skyTop: 0x3f78d8, skyBottom: 0xa0c2ee, horizon: 0xcbdaef, fog: 0xc2d3ea, fogNear: 75, fogFar: 450,
    sun: 0xfff8ee, sunI: 3.0, shadowI: 0.8, hemiSky: 0xe6efff, hemiGround: 0x76869e, hemiI: 1.05, stars: 0,
    asphalt: 0x4c5260, patch: 0x404552, track: 0x3d6fd9, trackLine: 0xffffff, shoulder: 0x9aa2ae, curb: 0xffffff,
    ground: 0xe4ecf5, groundAlt: 0xcfdae6, far: 0x7f8fb0 },
  { id: 'neon', name: 'NEON CITY', from: 25000,
    skyTop: 0x0b0620, skyBottom: 0x2e0f48, horizon: 0x7a2479, fog: 0x34124f, fogNear: 55, fogFar: 380,
    sun: 0xc8b8ff, sunI: 1.9, shadowI: 0.75, hemiSky: 0x9a84ff, hemiGround: 0x3a1a55, hemiI: 1.4, stars: 0.6,
    asphalt: 0x17112a, patch: 0x211836, track: 0xff2bd6, trackLine: 0xff2bd6, shoulder: 0x231a3c, curb: 0x5ff3ff,
    ground: 0x120a1f, groundAlt: 0x1a1030, far: 0x1c1236 },
  { id: 'sky', name: 'SKY WORLD', from: 50000,
    skyTop: 0x5fb2ff, skyBottom: 0xffc6e6, horizon: 0xffd2ea, fog: 0xffd8ec, fogNear: 100, fogFar: 520,
    sun: 0xfff3e2, sunI: 2.9, shadowI: 0.75, hemiSky: 0xffffff, hemiGround: 0xffc0e0, hemiI: 1.25, stars: 0,
    asphalt: 0xf6f2fa, patch: 0xebe4f2, track: 0xff8ad8, trackLine: 0xff8ad8, shoulder: 0xffe6f4, curb: 0xffd23f,
    ground: null, groundAlt: null, far: 0xffffff },
  { id: 'space', name: 'COSMIC TRACK', from: 100000,
    skyTop: 0x02010a, skyBottom: 0x170a3a, horizon: 0x341866, fog: 0x0c0624, fogNear: 110, fogFar: 600,
    sun: 0xe0d8ff, sunI: 2.1, shadowI: 0.75, hemiSky: 0x8a7cff, hemiGround: 0x2a1a50, hemiI: 1.3, stars: 1,
    asphalt: 0x1b1440, patch: 0x241b52, track: 0x5ff3ff, trackLine: 0x5ff3ff, shoulder: 0x2a2060, curb: 0xffe14d,
    ground: null, groundAlt: null, far: 0x3a2c7a },
];

export const BIOME_BLEND = 150; // metres over which sky/fog/light colours blend

export function biomeIndexAt(m) {
  let idx = 0;
  for (let i = 0; i < BIOMES.length; i++) if (m >= BIOMES[i].from) idx = i;
  return idx;
}

// ============================================================================
//  RUN TRACK BIOMES — the environment changes as the run gets longer.
//  `from` is in metres of run distance. Colours are blended smoothly over `blend` metres.
//  Prop generation for each biome lives in world/BiomeProps.js.
// ============================================================================

export const BIOMES = [
  { id: 'city', name: 'CITY', from: 0,
    skyTop: 0x4aa8ff, skyBottom: 0xcfeaff, fog: 0xbfe0ff, fogNear: 90, fogFar: 430,
    sun: 0xfff4e0, sunI: 2.4, hemiSky: 0xcfe8ff, hemiGround: 0x8a8070, hemiI: 1.15, stars: 0,
    track: 0xd9553b, trackLine: 0xffffff, curb: 0xe8e8e8, ground: 0x7a8088 },
  { id: 'suburbs', name: 'SUBURBS', from: 500,
    skyTop: 0x5bb6ff, skyBottom: 0xe2f4ff, fog: 0xd2ecff, fogNear: 100, fogFar: 450,
    sun: 0xfff1d6, sunI: 2.5, hemiSky: 0xd8f0ff, hemiGround: 0x6f9a52, hemiI: 1.2, stars: 0,
    track: 0xd9553b, trackLine: 0xffffff, curb: 0xf0f0f0, ground: 0x78c25a },
  { id: 'desert', name: 'DESERT', from: 2000,
    skyTop: 0x3b8fe0, skyBottom: 0xffe2b0, fog: 0xffd9a0, fogNear: 90, fogFar: 420,
    sun: 0xffe2b8, sunI: 2.9, hemiSky: 0xffe9c8, hemiGround: 0xc98a4b, hemiI: 1.1, stars: 0,
    track: 0xc84a2c, trackLine: 0xfff3d6, curb: 0xf3dcae, ground: 0xe8b86a },
  { id: 'forest', name: 'FOREST', from: 5000,
    skyTop: 0x5aa7d8, skyBottom: 0xd6f0e0, fog: 0xb8dcc4, fogNear: 70, fogFar: 380,
    sun: 0xfff0c8, sunI: 2.2, hemiSky: 0xd0f0d8, hemiGround: 0x3e6b34, hemiI: 1.2, stars: 0,
    track: 0x9a5b3a, trackLine: 0xf5f0dc, curb: 0x8a7a5a, ground: 0x4f8f3a },
  { id: 'mountains', name: 'MOUNTAINS', from: 10000,
    skyTop: 0x6a9ee8, skyBottom: 0xeef4ff, fog: 0xdfe9f7, fogNear: 90, fogFar: 460,
    sun: 0xffffff, sunI: 2.5, hemiSky: 0xeaf2ff, hemiGround: 0x8090a8, hemiI: 1.25, stars: 0,
    track: 0x3d6fd9, trackLine: 0xffffff, curb: 0xffffff, ground: 0xe9f0f7 },
  { id: 'neon', name: 'NEON CITY', from: 25000,
    skyTop: 0x0b0620, skyBottom: 0x3a1252, fog: 0x2a0f45, fogNear: 60, fogFar: 380,
    sun: 0xc8b8ff, sunI: 1.7, hemiSky: 0x9a84ff, hemiGround: 0x3a1a55, hemiI: 1.45, stars: 0.6,
    track: 0x161028, trackLine: 0xff2bd6, curb: 0x5ff3ff, ground: 0x120a1f },
  { id: 'sky', name: 'SKY WORLD', from: 50000,
    skyTop: 0x7ac4ff, skyBottom: 0xffd6ec, fog: 0xffe6f4, fogNear: 110, fogFar: 520,
    sun: 0xfff6ea, sunI: 2.6, hemiSky: 0xffffff, hemiGround: 0xffc8e6, hemiI: 1.35, stars: 0,
    track: 0xffffff, trackLine: 0xff8ad8, curb: 0xffd23f, ground: null },
  { id: 'space', name: 'COSMIC TRACK', from: 100000,
    skyTop: 0x02010a, skyBottom: 0x170a3a, fog: 0x0c0624, fogNear: 120, fogFar: 600,
    sun: 0xe0d8ff, sunI: 1.9, hemiSky: 0x8a7cff, hemiGround: 0x2a1a50, hemiI: 1.35, stars: 1,
    track: 0x1b1440, trackLine: 0x5ff3ff, curb: 0xffe14d, ground: null },
];

export const BIOME_BLEND = 150; // metres over which sky/fog/light colours blend

export function biomeIndexAt(m) {
  let idx = 0;
  for (let i = 0; i < BIOMES.length; i++) if (m >= BIOMES[i].from) idx = i;
  return idx;
}

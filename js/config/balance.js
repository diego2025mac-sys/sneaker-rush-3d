// ============================================================================
//  SNEAKER RUSH 3D — central balancing / tuning values.
//  Everything a designer would want to tweak lives in /js/config.
//  This file is pure data (no three.js) so the node economy simulator can use it.
// ============================================================================

/** Developer tools (money, teleport, unlocks...). MUST be false in production.
 *  Can also be forced on locally with ?debug=1 when running on localhost (dev build only). */
export const DEBUG_MODE = false;

export const GAME_VERSION = '1.0.0';

// ---------------------------------------------------------------- platform --
export const PLATFORM = {
  /** Try to load the CrazyGames SDK v3 script at boot. The game works without it. */
  loadCrazyGamesSDK: true,
  sdkUrl: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  sdkTimeoutMs: 4000,
  /** 'basic' = CrazyGames Basic Launch: NO ad UI at all.  'full' = ads allowed (none are required). */
  launchMode: 'basic',
  midgameAdCooldown: 180,
};

export const SAVE = {
  key: 'sneakerrush3d_save_v1',
  autosaveInterval: 8, // seconds
};

export const QUALITY = {
  maxParticles: 700,
  maxPixelRatio: 2,
  maxPixelRatioMobile: 1.5,
  shadowMapSize: 1024,
  shadowMapSizeMobile: 512,
};

// ----------------------------------------------------------------- render --
/** Colour management + post-processing. Exposure / tone mapping are configured ONLY here. */
export const RENDER = {
  toneMapping: 'ACES',       // 'ACES' | 'AgX' | 'Neutral' | 'None'
  exposure: 1.0,
  bloom: { strength: 0.38, radius: 0.4, threshold: 3.6 }, // HDR threshold above any sunlit surface (~2.5): only neon blooms
  vignette: { offset: 1.0, darkness: 0.28 },
  envIntensity: 0.9,         // image-based lighting strength on PBR materials
  hdrEnvironment: 'textures/env/lobby_1k.hdr', // optional HDR (assets/…); RoomEnvironment fallback
};

/**
 * Visual quality presets. Gameplay is identical on every preset.
 *  env:      'none' | 'room' (generated, no download) | 'hdr' (assets/textures/env, falls back to room)
 *  post:     EffectComposer pipeline (MSAA + subtle bloom + vignette + tone mapping)
 *  lights:   intentional point/spot lights at the shop / hatchery / portal
 */
export const QUALITY_PRESETS = {
  low:    { pixelRatio: 1,    shadows: false, shadowMap: 512,  env: 'none', post: false, lights: false, particles: 0.5, emissive: 1.0 },
  medium: { pixelRatio: 1.5,  shadows: true,  shadowMap: 1024, env: 'room', post: false, lights: true,  particles: 0.8, emissive: 1.0 },
  high:   { pixelRatio: 2,    shadows: true,  shadowMap: 2048, env: 'hdr',  post: true,  lights: true,  particles: 1.0, emissive: 3.2 },
};

// ------------------------------------------------------------------ player --
export const PLAYER = {
  radius: 0.45,
  lobbyWalkSpeed: 5.5,  // m/s in the lobby (the same for every sneaker: speed only matters on the track)
  lobbyRunSpeed: 9.5,
  runAfter: 0.3,
  accel: 34,
  decel: 28,
  // facing: the character always turns toward its true movement direction (shortest angle)
  rotationSpeed: 13,         // base turn rate (exponential smoothing λ, 1/s)
  rotationSpeedPerMs: 0.35,  // extra turn rate per m/s of ground speed
  rotationSpeedMax: 26,
  runBackSpeed: 6,           // m/s when backing up on the track (no distance is earned going back)
  runBackLimit: 14,          // world units you may back up behind your furthest point
  gravity: 34,
  jumpVelocity: 11,
};

export const CAMERA = {
  distance: 6.2,
  runDistance: 7.2,
  minDistance: 3.5,
  maxDistance: 12,
  height: 1.5,
  pitch: 0.32,
  minPitch: 0.02,
  maxPitch: 1.25,
  touchSensitivity: 0.0065,
  followLambda: 14,
  rotateLambda: 14,
  autoAlignDelay: 1.0,
  autoAlignSpeed: 2.2,
  fov: 62,
  fovPortrait: 72,
  maxFovBoost: 18,     // extra degrees at "very high" speed
};

export const MOUSE_LOOK = {
  mouseSensitivity: 0.0022,
  invertY: false,
  minPitchDeg: -30,
  maxPitchDeg: 70,
  smoothing: 32,
  hintSeconds: 3.5,
};

// ----------------------------------------------------------------- economy --
//  finalReward = (distance * distanceValue * distanceBonus(distance) + coins)
//                * petMultiplier * rebirthMultiplier * boostMultiplier
//  distanceBonus(d) = (1 + d / bonusScale) ^ bonusExponent
//  -> 250 m ≈ x1.7, 1 km ≈ x3.6, 5 km ≈ x11, 25 km ≈ x40, 100 km ≈ x121
//  Long runs are worth far more per metre, but every metre always pays something.
export const ECONOMY = {
  distanceValue: 1.0,
  bonusScale: 250,
  bonusExponent: 0.8,
  coinMeters: 6,          // one coin is worth this many metres of (bonused) distance
  gemPickupGems: 1,
  startMoney: 0,
};

// ------------------------------------------------------------------- speed --
//  A sneaker's SPEED stat = metres of distance per second (km/h shown = speed * 3.6).
//  Physical world movement is compressed so the track never becomes uncontrollable:
//  world speed is linear up to `linearUntil`, then grows with a square root, capped.
//  Distance always advances at the *full* stat speed — visual effects sell the rest.
export const SPEED = {
  linearUntil: 12,
  sqrtFactor: 2.6,
  worldMax: 50,
  accelTime: 1.1,           // seconds to reach full speed from a standstill
  momentumMax: 0.25,        // +25% speed after running clean for momentumTime seconds
  momentumTime: 20,
  stumbleFactor: 0.3,       // speed multiplier right after hitting an obstacle
  stumbleRecover: 0.9,      // seconds to recover
  stumbleMomentumLoss: 0.6, // fraction of momentum lost on a hit
  boostPadMult: 1.5,
  boostPadTime: 2.2,
  lateralBase: 7,
  lateralPerWorldSpeed: 0.16,
  // km/h ranges over which the three visual speed tiers fade in (fx/SpeedFX.js) — visuals only
  fx: { tier1: [55, 130], tier2: [200, 320], tier3: [400, 540] },
};

// --------------------------------------------------------------------- run --
export const RUN = {
  chunkLength: 60,
  chunksAhead: 9,
  chunksBehind: 1,
  trackHalfWidth: 6.4,
  laneX: [-4.2, 0, 4.2],
  rebaseDistance: 600,       // floating origin: shift the world back every N world units
  variantsPerBiome: 4,        // normal road pieces per biome (road events are extra variants)
  safeStart: 70,             // world units without obstacles at the start
  autoCashoutIdle: 0,        // 0 = never (no punishment)
};

/** Distance milestones (metres). Each gives a celebration; the first time ever also gives gems. */
export const MILESTONES = [
  { m: 100, gems: 1 },
  { m: 250, gems: 1 },
  { m: 500, gems: 2 },
  { m: 1000, gems: 3 },
  { m: 2000, gems: 3 },
  { m: 5000, gems: 5 },
  { m: 10000, gems: 8 },
  { m: 25000, gems: 12 },
  { m: 42195, gems: 15, label: 'MARATHON!' },
  { m: 50000, gems: 15 },
  { m: 100000, gems: 25 },
  { m: 250000, gems: 40 },
  { m: 500000, gems: 60 },
  { m: 1000000, gems: 100 },
];

// ------------------------------------------------------------------- pets --
export const PET_SLOTS = {
  base: 3,
  upgrades: [
    { slots: 4, cost: 25000 },
    { slots: 5, cost: 3e6 },
    { slots: 6, cost: 150e6 },
  ],
  maxInventory: 60,
};

// ----------------------------------------------------------------- rebirth --
export const REBIRTH = {
  minSneakerIndex: 8,      // must own sneaker #9 (Carbon Racer) — index in SNEAKERS
  minEarned: 1500000,       // money earned since last rebirth
  tokenDivisor: 100000,
  tokenExponent: 0.5,      // tokens = floor((earnedThisLife / divisor) ^ exponent)
  perks: {
    earn:  { name: 'Cash Flow',     desc: '+15% money per level',      icon: '💰', per: 0.15, max: 50, cost: (l) => 1 + Math.floor(l * 0.75) },
    speed: { name: 'Fast Feet',     desc: '+6% running speed per level', icon: '⚡', per: 0.06, max: 30, cost: (l) => 1 + Math.floor(l * 0.9) },
    luck:  { name: 'Lucky Paws',    desc: '+15% egg luck per level',     icon: '🍀', per: 0.15, max: 20, cost: (l) => 2 + l },
    start: { name: 'Head Start',    desc: 'Start each rebirth with cash', icon: '🎁', per: 1, max: 10, cost: (l) => 1 + l * 2 },
  },
  startMoney: (lvl) => (lvl <= 0 ? 0 : Math.round(2500 * Math.pow(4, lvl - 1))),
};

// ------------------------------------------------------------------ boosts --
export const BOOSTS = {
  money: { name: '2x Money', icon: '💵', gems: 15, duration: 300, desc: 'Double cash-out rewards for 5 min' },
  speed: { name: 'Turbo Laces', icon: '⚡', gems: 12, duration: 300, desc: '+30% running speed for 5 min', mult: 1.3 },
  luck:  { name: 'Lucky Clover', icon: '🍀', gems: 10, duration: 300, desc: '+100% egg luck for 5 min', luck: 1 },
};

export const DAILY = {
  // reward for streak day 1..7 (loops on day 7)
  rewards: [
    { gems: 5, moneyRuns: 2 },
    { gems: 6, moneyRuns: 3 },
    { gems: 8, moneyRuns: 4, boost: 'speed' },
    { gems: 10, moneyRuns: 5 },
    { gems: 12, moneyRuns: 6, boost: 'luck' },
    { gems: 15, moneyRuns: 8 },
    { gems: 25, moneyRuns: 12, boost: 'money' },
  ],
};

// ------------------------------------------------------------------- lobby --
export const LOBBY = {
  spawn: { x: 0, z: 2, yaw: 0 },
  returnSpawn: { x: 0, z: 6, yaw: 0 },
  halfSize: 34,
};

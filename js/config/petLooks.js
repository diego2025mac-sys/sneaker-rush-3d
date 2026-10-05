// ============================================================================
//  PET LOOKS — visuals only (no gameplay data lives here; see config/pets.js).
//
//  Every species is a Kenney "Cube Pets" model (CC0) — the same family as Dog and Cat — prepared by
//  tools/build-pets.mjs. The build step re-targets each model's UVs onto ten "channel" swatches in the
//  unused top band of its colour atlas (fur, second fur, accent, feet, pattern, eye ink, eye light,
//  add-on A/B, glow), bakes the species' simple add-ons (horn, wings, flames…) into the model and
//  paints the species' base colours.
//
//  At runtime a variant (Golden Dog, Neon Fox, Galaxy Dragon…) is the SAME model with only those
//  channel swatches repainted (+ material settings and an optional tiny variant add-on), so variants
//  can never drift into a different species or style. Eyes keep their own channels in every finish.
// ============================================================================

/** Channel swatch index → cell (32 × 128 px) in the top band of the 512² atlas. */
export const CH = { FUR: 0, FUR2: 1, ACCENT: 2, FEET: 3, PATTERN: 4, INK: 5, EYE: 6, ADD_A: 7, ADD_B: 8, GLOW: 9 };
export const ATLAS = { size: 512, cellW: 32, cellH: 128 };

/**
 * Species bases. `src` = Kenney source model; `colors` = base channel colours (hex) — a channel that is
 * not listed keeps the Kenney swatch it was mapped from. Add-ons are built by tools/build-pets.mjs.
 */
export const SPECIES = {
  dog:     { file: 'dog',       src: 'animal-dog' },
  cat:     { file: 'cat',       src: 'animal-cat' },
  bunny:   { file: 'bunny',     src: 'animal-bunny', colors: { FUR: 0xf6f0ea, FUR2: 0xffb8cc, ACCENT: 0xff8fa8 } },
  bird:    { file: 'pigeon',    src: 'animal-chick', colors: { FUR: 0x6f7891, FUR2: 0x565e76, ADD_A: 0x2f9a86, ADD_B: 0x565e76 } },
  fox:     { file: 'fox',       src: 'animal-fox' },
  robodog: { file: 'robot_dog', src: 'animal-dog', colors: { FUR: 0x8692a6, FUR2: 0x5a6578, ACCENT: 0x3fa9ff, FEET: 0x3a414c, INK: 0x1b2028, EYE: 0x7ff6ff, ADD_A: 0x8c97a9, ADD_B: 0x3a414c, GLOW: 0x3fd0ff }, glow: ['EYE', 'GLOW'] },
  tiger:   { file: 'tiger',     src: 'animal-tiger' },
  dragon:  { file: 'dragon',    src: 'animal-cow', colors: { FUR: 0x5cc46c, FUR2: 0xc9eaa0, ACCENT: 0xfff1c8, FEET: 0x2f7a3e, PATTERN: 0x3d9a50, ADD_A: 0x8fe39a, ADD_B: 0xffd23f } },
  unicorn: { file: 'unicorn',   src: 'animal-deer', colors: { FUR: 0xf8f5ff, FUR2: 0xffc8e8, FEET: 0xc6b6ff, ADD_A: 0xff8ad8, ADD_B: 0xffd23f } },
  phoenix: { file: 'phoenix',   src: 'animal-parrot', colors: { FUR: 0xff6a2a, FUR2: 0xffb02a, ACCENT: 0xffe14d, FEET: 0xffc21a, ADD_A: 0xffd23f, ADD_B: 0xff8a2a, GLOW: 0xffe14d }, glow: ['GLOW'] },
  bear:    { file: 'bear',      src: 'animal-polar', colors: { FUR: 0x9a6a44, FUR2: 0xd8b48a } },
  slime:   { file: 'slime',     src: 'animal-fish', colors: { FUR: 0x6fe08a, FUR2: 0xb8ffc8, PATTERN: 0x4fc070, ADD_A: 0x6fe08a, ADD_B: 0x4fc070 } },
};

/** Variant add-ons baked (hidden) into the species model and shown only for that pet id. */
export const VARIANT_ADDONS = {
  diamond_cat: 'gem',
  star_bunny: 'stars',
  crystal_dragon: 'crystals',
  galaxy_dragon: 'stars',
  nebula_bear: 'stars',
  cyber_cat: 'visor',
  glitch_phoenix: 'glitch',
  void_slime: 'drips',
};

/**
 * Finish = channel colours + material. `colors` are the pet's [c0, c1, c2] from config/pets.js.
 * `mat.emissive` is the self-glow of ordinary channels; channels listed in `glow` shine at full strength.
 * Channels missing from the returned map keep the species colour. INK/EYE are only touched where the
 * finish deliberately makes eyes glow (neon / shadow), so faces stay readable on every variant.
 */
export function finishLook(finish, [c0, c1, c2] = []) {
  switch (finish) {
    case 'golden': return {
      colors: { FUR: 0xffc93c, FUR2: 0xfff0b0, ACCENT: 0xffe27a, FEET: 0xd9961f, PATTERN: 0xd9961f, ADD_A: 0xffe27a, ADD_B: 0xffd23f, INK: 0x3a2400 },
      mat: { metalness: 0.75, roughness: 0.3, emissive: 0.05 }, glow: [] };
    case 'diamond': return {
      colors: { FUR: 0xc6f4ff, FUR2: 0xffffff, ACCENT: 0x9fe7ff, FEET: 0x8fd8f0, PATTERN: 0x9fe7ff, ADD_A: 0xe8fbff, GLOW: 0x5ff3ff, INK: 0x1a3a5a },
      mat: { metalness: 0.15, roughness: 0.08, emissive: 0.12 }, glow: ['GLOW'] };
    case 'crystal': return {
      colors: { FUR: c0, FUR2: c1, ACCENT: c2, FEET: shade(c0, 0.7), PATTERN: shade(c0, 0.8), ADD_A: c1, ADD_B: c2, GLOW: c1 },
      mat: { metalness: 0.1, roughness: 0.1, emissive: 0.22 }, glow: ['GLOW', 'ADD_B'] };
    case 'neon': return {
      colors: { FUR: 0x1f1a3a, FUR2: c1, ACCENT: c2, FEET: 0x15122a, PATTERN: c1, INK: c2, ADD_A: c1, ADD_B: c2, GLOW: c2 },
      mat: { metalness: 0.2, roughness: 0.45, emissive: 0.04 }, glow: ['FUR2', 'ACCENT', 'PATTERN', 'INK', 'ADD_A', 'ADD_B', 'GLOW'] };
    case 'cosmic': return {
      colors: { FUR: c0, FUR2: c1, ACCENT: c2, FEET: shade(c0, 0.65), PATTERN: shade(c0, 1.35), ADD_A: c1, ADD_B: c2, GLOW: c2 },
      mat: { metalness: 0.25, roughness: 0.35, emissive: 0.2 }, glow: ['FUR2', 'ACCENT', 'GLOW', 'ADD_B'] };
    case 'shadow': return {
      colors: { FUR: 0x2a1650, FUR2: c1, ACCENT: c1, FEET: 0x150c26, PATTERN: 0x3a1f6a, INK: c2, EYE: 0xffffff, ADD_A: 0x2a1650, ADD_B: c1, GLOW: c2 },
      mat: { metalness: 0.2, roughness: 0.4, emissive: 0.05 }, glow: ['FUR2', 'ACCENT', 'INK', 'ADD_B', 'GLOW'] };
    default: return null;
  }
}

function shade(hex, k) {
  const r = Math.min(255, ((hex >> 16) & 255) * k), g = Math.min(255, ((hex >> 8) & 255) * k), b = Math.min(255, (hex & 255) * k);
  return (r << 16) | (g << 8) | b;
}

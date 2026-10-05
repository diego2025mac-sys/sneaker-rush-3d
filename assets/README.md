# Sneaker Rush 3D — asset slots & specifications

Drop `.glb` files into these folders. Then run:

```bash
npm run assets
```

That command regenerates `assets/manifest.json` (the game only requests files listed there) and prints an audit (triangles, materials, textures, skins, animations, over-budget warnings).
Any slot without a file keeps using the procedural prototype model, so the game always runs.

Slot names and per-file tuning live in `js/config/assets.js` (`SNEAKER_FILES`, `PET_FILES`, `PROPS`, `CHARACTER`, `ASSET_OVERRIDES`).

## Global rules (all models)

- **Art direction:** one KayKit-compatible "chunky toy" look for everything (`ART_DIRECTION.md`). Do not mix packs or styles.
- **Format:** binary glTF 2.0 (`.glb`), meshopt compression allowed (Draco, Meshopt and KTX2/Basis are all supported by the loader).
- **Units:** metres. **Up:** +Y. **Forward:** +Z. Origin on the ground. The auto-fit corrects scale and origin, and `ASSET_OVERRIDES` (in `js/config/assets.js`) can rotate a model that faces the wrong way.
- **Materials:** metallic-roughness, metalness 0, roughness 0.4–0.6. Colour from one gradient-swatch atlas (≤ 512², ≤ 1024² for the character) or vertex colours. **No photo textures, no normal/detail maps.** Emissive only for neon trims.
- **Licensing:** CC0, a commissioned work-for-hire, or a licence that allows commercial web distribution (plus attribution if required). No real brands, logos or copied trademarked shoe designs. Record every file in `CREDITS.md` before committing it.

## Current status

| Slot | State |
|---|---|
| `props/tree.glb`, `props/bench.glb`, `props/lamp.glb` | KayKit (CC0), shipped |
| `characters/runner.glb` | **Empty — Batch 1** (procedural runner shown) |
| `sneakers/starter_canvas.glb`, `sneakers/street_runner.glb` | **Empty — Batch 1** (procedural sneakers shown) |
| `pets/dog.glb`, `pets/cat.glb` | **Empty — Batch 1** (procedural pets shown) |
| `props/shop_*.glb` (shop display set) | **Empty — Batch 1** (procedural shop shown; placement code is wired when the files arrive) |

The previous off-style imports are kept for reference in `reference/retired-assets/` (not shipped).
**Batch 1 deliverables, sizes, budgets, bone/clip names and file names: [`../ASSET_SPEC_BATCH1.md`](../ASSET_SPEC_BATCH1.md).**

Optional:

| File | What |
|---|---|
| `textures/env/lobby_1k.hdr` | 1k equirectangular HDR (outdoor city/plaza, daylight) for reflections on the HIGH preset. Without it, a generated room environment is used. |

## Later slots (after Batch 1 is approved)

- **Sneakers:** `retro_high`, `court_classic`, `urban_dunk`, `air_sprint`, `velocity_x`, `neon_runner`, `carbon_racer`, `hyper_boost`, `plasma_kicks`, `cosmic_runner`, `galaxy_high`, `quantum_sneakers`.
- **Pets (species):** `bunny`, `pigeon`, `fox`, `robot_dog`, `tiger`, `dragon`, `unicorn`, `phoenix`, `bear`, `slime`.
- **Environment:** `sneaker_shop`, `pet_hatchery`, `run_portal`, `building_a/b/c`.
- **Props:** `planter`, `bollard`, `neon_sign`, `track_hurdle`, `traffic_barrier`, `egg`.

## Testing the pipeline without real assets

`npm run fixtures` exports the **procedural prototypes** as GLB files into `test/fixtures/assets/`.
Open the game with `?assets=fixtures` (dev only) to exercise loading, skinning, AnimationMixer, sneaker sockets, pet finishes and props.
These fixtures are pipeline tests, not art, and are never shipped.

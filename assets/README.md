# Sneaker Rush 3D — asset slots & specifications

Drop `.glb` files into these folders. Then run:

```bash
npm run assets
```

That command regenerates `assets/manifest.json` (the game only requests files listed there) and prints an audit (triangles, materials, textures, skins, animations, over-budget warnings).
Any slot without a file keeps using the procedural prototype model, so the game always runs.

Slot names and per-file tuning live in `js/config/assets.js` (`SNEAKER_FILES`, `PET_FILES`, `PROPS`, `CHARACTER`, `ASSET_OVERRIDES`).

## Global rules (all models)

- **Format:** binary glTF 2.0 (`.glb`). Optimize before committing:

  ```bash
  npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024
  ```

  Draco, Meshopt and KTX2/Basis are all supported by the loader.
- **Units:** metres. **Up:** +Y. **Forward:** +Z. The auto-fit corrects scale and origin, and `ASSET_OVERRIDES` can rotate a model that faces the wrong way.
- **Materials:** PBR metallic-roughness: baseColor (sRGB), normal, ORM/roughness/metalness (linear), emissive (sRGB).
  - Name materials by surface (`sole_rubber`, `upper_fabric`, `eyelet_metal`, `window_glass`, `trim_neon`…). The game tunes roughness and metalness from these keywords if the exporter loses them.
  - Share materials across meshes. Use a 1024² texture max (512² for pets and props) and texture atlases where possible.
- **One consistent art direction for every asset:** stylized, clean, slightly chunky proportions, saturated but not neon-everything. Think premium casual mobile/console simulator. Do not mix packs with different styles.
- **Licensing:** CC0 or a licence that allows commercial web distribution, plus attribution if required. No real brands, logos or copied trademarked shoe designs.

## First migration target (needed now)

| File | What | Spec |
|---|---|---|
| `characters/runner.glb` | Rigged stylized runner (gender-neutral or two variants later) | Humanoid rig. Must include the clips **Idle, Walk, Run** (Sprint, Celebrate/Victory, Jump, Stumble optional). Animations in place (root motion is stripped automatically). ~1.8 m tall, ≤ 30k tris, ≤ 2 materials. Foot bones named like `foot_l/foot_r`, `LeftFoot/RightFoot` or Mixamo `mixamorig:LeftFoot`. Its own shoe mesh should be a separate mesh named `shoes` (it gets hidden, because game sneakers attach to the feet). |
| `sneakers/starter_canvas.glb` | Classic canvas low-top (white canvas, vulcanized sole, rubber toe cap) | **One right shoe.** Toe → +Z, sole on the ground. Any scale: auto-fitted to 0.31 m long, with the origin under the ankle. ≤ 15k tris. Separate materials for sole rubber / midsole / upper / laces. Visible outsole, midsole, toe box, tongue, heel, laces, side panels, collar. |
| `sneakers/street_runner.glb` | Everyday low-profile runner (grey mesh upper, orange accents) | Same spec as above |
| `pets/dog.glb` | Stylized puppy | ≤ 12k tris, ~0.7 m tall (auto-fitted), faces +Z. Optional looping clip named `Idle` / `Float` / `Walk`. Golden Dog is generated from this model with a gold material variant. |
| `pets/cat.glb` | Stylized kitten | Same spec; Diamond Cat and Cyber Cat reuse it with finish variants |
| `props/tree.glb` | Stylized street tree (no planter, the planter stays) | Auto-fitted to 5.2 m tall, origin at trunk base, ≤ 8k tris |
| `props/bench.glb` | Modern urban bench | Auto-fitted to 2.6 m long (along X), ≤ 8k tris |
| `props/lamp.glb` | Modern street lamp (a neon accent ring is welcome) | Auto-fitted to 5.4 m tall, ≤ 8k tris, emissive lamp head |

Optional:

| File | What |
|---|---|
| `textures/env/lobby_1k.hdr` | 1k equirectangular HDR (outdoor city/plaza, daylight) for reflections on the HIGH preset. Without it, a generated room environment is used. |

## Later slots (already defined, wired in later steps)

- **Sneakers:** `retro_high`, `court_classic`, `urban_dunk`, `air_sprint`, `velocity_x`, `neon_runner`, `carbon_racer`, `hyper_boost`, `plasma_kicks`, `cosmic_runner`, `galaxy_high`, `quantum_sneakers`.
- **Pets (species):** `bunny`, `pigeon`, `fox`, `robot_dog`, `tiger`, `dragon`, `unicorn`, `phoenix`, `bear`, `slime`.
- **Environment:** `sneaker_shop`, `pet_hatchery`, `run_portal`, `building_a/b/c`.
- **Props:** `display_shelf`, `display_pedestal`, `planter`, `bollard`, `neon_sign`, `track_hurdle`, `traffic_barrier`, `egg`.

## Testing the pipeline without real assets

`npm run fixtures` exports the **procedural prototypes** as GLB files into `test/fixtures/assets/`.
Open the game with `?assets=fixtures` (dev only) to exercise loading, skinning, AnimationMixer, sneaker sockets, pet finishes and props.
These fixtures are pipeline tests, not art, and are never shipped.

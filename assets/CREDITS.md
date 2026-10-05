# Third-party asset credits

Unless the "Modifications" section below says otherwise, files were downloaded unmodified. Any adjustments (scale, origin, rotation, sockets, hidden meshes) are made at load time by the game, not in the files.

## Shipped assets (`assets/`, copied into `dist/`)

| Game file | Model | Author | Licence | Attribution required | Source page | File URL | Downloaded |
|---|---|---|---|---|---|---|---|
| `props/tree.glb` | tree_single_B (KayKit Medieval Hexagon Pack 1.0) | Kay Lousberg (KayKit) | CC0 1.0 (public domain) | No | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0/tree/main/addons/kaykit_medieval_hexagon_pack/Assets/gltf/decoration/nature (`tree_single_B.gltf`) | 2026-10-05 |
| `props/bench.glb` | bench (KayKit City Builder Bits 1.0) | Kay Lousberg (KayKit) | CC0 1.0 (public domain) | No | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/tree/main/addons/kaykit_city_builder_bits/Assets/gltf (`bench.gltf`) | 2026-10-05 |
| `props/lamp.glb` | streetlight (KayKit City Builder Bits 1.0) | Kay Lousberg (KayKit) | CC0 1.0 (public domain) | No | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/tree/main/addons/kaykit_city_builder_bits/Assets/gltf (`streetlight.gltf`) | 2026-10-05 |
| `characters/runner.glb` | Casual_Male (Ultimate Animated Character Pack, Nov 2019) | Quaternius | CC0 1.0 (public domain) | No | https://quaternius.com/packs/ultimatedanimatedcharacter.html — release folder copy in https://github.com/BMOxOMB/Proyecto_ProgramacionConPatrones (`Assets/Characters/Ultimate Animated Character Pack - Nov 2019/`, with the pack's `License.txt`) | `glTF/Casual_Male.gltf` | 2026-10-05 |
| `sneakers/starter_canvas.glb` | Original variant derived from `SK_CasualFeet` (Ultimate Modular Characters) | Quaternius (base mesh); variant made for Sneaker Rush 3D | CC0 1.0 (public domain) | No | https://quaternius.com/packs/ultimatemodularcharacters.html — OpenUSD copy in https://github.com/chibifire-stages/quaternius-stage (CC0) | `models/UltimateModularCharacters/SK_CasualFeet.usda` | 2026-10-05 |
| `sneakers/street_runner.glb` | Original variant derived from `SK_CasualFeet` (Ultimate Modular Characters) | Quaternius (base mesh); variant made for Sneaker Rush 3D | CC0 1.0 (public domain) | No | same as above | `models/UltimateModularCharacters/SK_CasualFeet.usda` | 2026-10-05 |
| `pets/dog.glb` | animal-dog (Cube Pets 2.0) | Kenney (www.kenney.nl) | CC0 1.0 (public domain) | No | https://kenney.nl/assets/cube-pets — pack copy with `License.txt` in https://github.com/series-ai/jam-ready-assets (`kenney-cube-pets/`) | `Models/GLB format/animal-dog.glb` + `Textures/colormap.png` | 2026-10-05 |
| `pets/cat.glb` | animal-cat (Cube Pets 2.0) | Kenney (www.kenney.nl) | CC0 1.0 (public domain) | No | same as above | `Models/GLB format/animal-cat.glb` + `Textures/colormap.png` | 2026-10-05 |
| `props/shop_counter.glb` | cash-register (Mini Market 1.0) | Kenney (www.kenney.nl) | CC0 1.0 (public domain) | No | https://kenney.nl/assets/mini-market — copy in https://github.com/series-ai/jam-ready-assets (`kenney-mini-market/`) | `Models/GLB format/cash-register.glb` + `Textures/colormap.png` | 2026-10-05 |
| `props/shop_bench.glb` | benchCushionLow (Furniture Kit 2.1) | Kenney (www.kenney.nl) | CC0 1.0 (public domain) | No | https://kenney.nl/assets/furniture-kit — copy in https://github.com/series-ai/jam-ready-assets (`kenney-furniture-kit/`) | `benchCushionLow.glb` | 2026-10-05 |
| `props/shop_plant.glb` | pottedPlant (Furniture Kit 2.1) | Kenney (www.kenney.nl) | CC0 1.0 (public domain) | No | same as above | `pottedPlant.glb` | 2026-10-05 |
| `props/shop_lamp.glb` | lampSquareFloor (Furniture Kit 2.1) | Kenney (www.kenney.nl) | CC0 1.0 (public domain) | No | same as above | `lampSquareFloor.glb` | 2026-10-05 |

Shown in-game under Settings → Credits (optional under CC0, given anyway): character and sneaker base mesh by Quaternius (CC0); pets and shop furniture by Kenney (CC0); tree, bench and street light by Kay Lousberg / KayKit (CC0).

The original source files are kept in `reference/sources/` (not shipped) and every game file above is rebuilt from them with `node tools/build-slice-assets.mjs` (sneaker base: `tools/usd-feet-to-gltf.py`, needs `pip install usd-core`).

### Modifications

`characters/runner.glb` (Quaternius): material colours only — the pack exports skin as near-black (0.013) with white eye shapes, so skin was set to a natural stylized tone (#e8b48f) and the eye/brow material to #1e1e26; outfit moved to the game palette (tee #2ec4f1, shorts #24304f, waistband #ff3d7f, hair #6b3f22). Geometry, rig (`Foot.L/Foot.R`) and animations (Idle, Walk, Run, Jump, Victory, RecieveHit, …) are unchanged. Packed from `.gltf` (embedded buffer) to `.glb`.

`sneakers/starter_canvas.glb`, `sneakers/street_runner.glb` (from Quaternius `SK_CasualFeet`): converted from OpenUSD (right shoe only, Y-up, toe +Z, sole on y = 0); the modular character's sock/ankle stump was removed; a footbed was added from the sole outline; new named material zones. **Starter Canvas** keeps the original flat sole and adds a natural canvas upper, white rubber toe cap and 3 lace bars. **Street Runner** reshapes the same last: 2.7× midsole with heel-to-toe drop, toe spring, wider flared heel, plus a coloured heel counter, toe overlay, heel clip, pull tab and 4 lace bars. Both are fictional designs without logos.

Kenney files (`pets/*`, `props/shop_*`): geometry and animations unchanged; external `Textures/colormap.png` embedded into the `.glb`; Furniture Kit materials changed from `KHR_materials_unlit` to lit (same base colours, roughness 0.8) so they are shaded like the rest of the scene; `asset.copyright` set. In-game sizing comes from `js/config/assets.js` (auto-fit + `ASSET_OVERRIDES`).


`props/tree.glb`, `props/bench.glb`, `props/lamp.glb` (KayKit): converted from the pack's `.gltf` + `.bin` + shared gradient atlas into single `.glb` files with glTF-Transform 4: geometry unchanged, atlas (`hexagons_medieval.png` / `citybits_texture.png`) resized from 1024² to 512² PNG and embedded, meshopt compression, `asset.copyright` set to the KayKit credit. Pack licence texts are in `licenses/KayKit-*-LICENSE.txt`.

They replaced the Quaternius tree / bench / street light (CC0, still in git history) to keep one art direction (see `ART_DIRECTION.md`).

## Third-party code

| Library | Version | Author | Licence | Licence text |
|---|---|---|---|---|
| three.js (bundled into `js/game.min.js`, decoders in `lib/addons/libs/`) | 0.170.0 | three.js authors | MIT | `licenses/three.js-MIT.txt` |

## Retired assets (kept in the repository for reference, **not shipped**)

These were removed from the game on 2026-10-05 because they do not match the KayKit-style art direction. They live in `reference/retired-assets/` (outside `assets/`, so they are not in the manifest and not copied into `dist/`). Their slots use the procedural fallback models until Batch 1 replacements exist (`ASSET_SPEC_BATCH1.md`). Credits and licences are kept because the files are still distributed with the source repository.

| Repository file | Former slot | Model | Author | Licence | Attribution required | Source page | File URL | Downloaded |
|---|---|---|---|---|---|---|---|---|
| `reference/retired-assets/characters/runner.glb` | `characters/runner.glb` | Hoodie Character | Quaternius | CC0 1.0 (public domain) | No | https://poly.pizza/m/gKLBoRsyKe | https://static.poly.pizza/bcd66ec5-5e81-4901-a222-47abc875fe2a.glb | 2026-10-04 |
| `reference/retired-assets/pets/dog.glb` | `pets/dog.glb` | Shiba Inu (Animated Animal Pack) | Quaternius | CC0 1.0 (public domain) | No | https://poly.pizza/m/y4wdQpg767 | https://static.poly.pizza/ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77.glb | 2026-10-04 |
| `reference/retired-assets/pets/cat.glb` | `pets/cat.glb` | Cat | Poly by Google | **CC-BY 3.0 — attribution required** | **Yes** | https://poly.pizza/m/6dM1J6f6pm9 | https://static.poly.pizza/5d32eb38-9546-4ce4-aa77-bcef9328ee61.glb | 2026-10-04 |
| `reference/retired-assets/sneakers/street_runner.glb` | `sneakers/street_runner.glb` | Materials Variants Shoe ("street" variant) | Shopify, Inc. | **CC-BY 4.0 — attribution required** | **Yes** | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/MaterialsVariantsShoe | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb | 2026-10-04 |

Required attributions (must be restored to the in-game credits if either file is ever shipped again):

> "Cat" by Poly by Google, licensed under CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/), via Poly Pizza.

> "Materials Variants Shoe" © 2021 Shopify, Inc., licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), via the Khronos glTF Sample Assets repository. Modified (see below).

### Modifications: `street_runner.glb` (retired)

Source: `MaterialsVariantsShoe.glb` (7.6 MB, 22,700 triangles, 3 colour variants). Processed with glTF-Transform 4 (`@gltf-transform/core`, `extensions`, `functions` + `meshoptimizer` + `sharp`):

1. Kept only the **"street"** colour variant (black knit, coral side overlays) as the default material; removed the "midnight" and "beach" variants and the `KHR_materials_variants` extension. Material renamed `street_runner_shoe`.
2. `weld` + `simplify` (meshoptimizer, ratio 0.6, error 0.0008) → 13,619 triangles.
3. Textures (base colour, normal, occlusion/roughness/metalness) resized to 1024² and re-encoded as WebP (quality 88).
4. `EXT_meshopt_compression` + `KHR_mesh_quantization`. Result: 515 KB.
5. glTF `asset.copyright` set to "© 2021 Shopify, Inc. CC BY 4.0 — modified for Sneaker Rush 3D".

The model's toe points +X (the game needed `rotateY: -90`). The licence excludes logos and trademarks; the model carries no brand logo (the midsole has a generic embossed "FOAM" texture detail). Licence file: `reference/retired-assets/licenses/MaterialsVariantsShoe-LICENSE.md`.

## Adding a new asset

Add one row per file **before** committing the model: game file, model name, author, licence, whether attribution is required, source page, direct file URL, download date.
If attribution is required, also add it to the in-game credits (Settings → Credits, `js/ui/Panels.js`). Never remove an existing attribution.
Put any licence text that must travel with the files in `assets/licenses/` (it is copied into `dist/` by the build).

# Third-party asset credits

Unless the "Modifications" section below says otherwise, files were downloaded unmodified. Any adjustments (scale, origin, rotation, sockets, hidden meshes) are made at load time by the game, not in the files.

| Game file | Model | Author | Licence | Attribution required | Source page | File URL | Downloaded |
|---|---|---|---|---|---|---|---|
| `characters/runner.glb` | Hoodie Character | Quaternius | CC0 1.0 (public domain) | No | https://poly.pizza/m/gKLBoRsyKe | https://static.poly.pizza/bcd66ec5-5e81-4901-a222-47abc875fe2a.glb | 2026-10-04 |
| `pets/dog.glb` | Shiba Inu (Animated Animal Pack) | Quaternius | CC0 1.0 (public domain) | No | https://poly.pizza/m/y4wdQpg767 | https://static.poly.pizza/ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77.glb | 2026-10-04 |
| `pets/cat.glb` | Cat | Poly by Google | **CC-BY 3.0 — attribution required** | **Yes** | https://poly.pizza/m/6dM1J6f6pm9 | https://static.poly.pizza/5d32eb38-9546-4ce4-aa77-bcef9328ee61.glb | 2026-10-04 |
| `props/tree.glb` | tree_single_B (KayKit Medieval Hexagon Pack 1.0) | Kay Lousberg (KayKit) | CC0 1.0 (public domain) | No | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0/tree/main/addons/kaykit_medieval_hexagon_pack/Assets/gltf/decoration/nature (`tree_single_B.gltf`) | 2026-10-05 |
| `props/bench.glb` | bench (KayKit City Builder Bits 1.0) | Kay Lousberg (KayKit) | CC0 1.0 (public domain) | No | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/tree/main/addons/kaykit_city_builder_bits/Assets/gltf (`bench.gltf`) | 2026-10-05 |
| `sneakers/street_runner.glb` | Materials Variants Shoe ("street" variant) | Shopify, Inc. | **CC-BY 4.0 — attribution required** | **Yes** | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/MaterialsVariantsShoe | https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb | 2026-10-04 |
| `props/lamp.glb` | streetlight (KayKit City Builder Bits 1.0) | Kay Lousberg (KayKit) | CC0 1.0 (public domain) | No | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/tree/main/addons/kaykit_city_builder_bits/Assets/gltf (`streetlight.gltf`) | 2026-10-05 |

Required attribution, shown in-game under Settings → Credits:

> "Cat" by Poly by Google, licensed under CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/), via Poly Pizza.

> "Materials Variants Shoe" © 2021 Shopify, Inc., licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), via the Khronos glTF Sample Assets repository. Modified (see below).

## Modifications

### `props/tree.glb`, `props/bench.glb`, `props/lamp.glb` (KayKit)

Converted from the pack's `.gltf` + `.bin` + shared gradient atlas into single `.glb` files with glTF-Transform 4: geometry unchanged, atlas (`hexagons_medieval.png` / `citybits_texture.png`) resized from 1024² to 512² PNG and embedded, meshopt compression, `asset.copyright` set to the KayKit credit. Pack licence texts are in `licenses/KayKit-*-LICENSE.txt`. Attribution is optional under CC0; it is given anyway.

The previous Quaternius tree / bench / street light (CC0) were replaced to keep one art direction (see `ART_DIRECTION.md` in the repository root).

### `sneakers/street_runner.glb`

Source: `MaterialsVariantsShoe.glb` (7.6 MB, 22,700 triangles, 3 colour variants). Processed with glTF-Transform 4 (`@gltf-transform/core`, `extensions`, `functions` + `meshoptimizer` + `sharp`):

1. Kept only the **"street"** colour variant (black knit, coral side overlays) as the default material; removed the "midnight" and "beach" variants and the `KHR_materials_variants` extension. Material renamed `street_runner_shoe`.
2. `weld` + `simplify` (meshoptimizer, ratio 0.6, error 0.0008) → 13,619 triangles.
3. Textures (base colour, normal, occlusion/roughness/metalness) resized to 1024² and re-encoded as WebP (quality 88).
4. `EXT_meshopt_compression` + `KHR_mesh_quantization`. Result: 515 KB.
5. glTF `asset.copyright` set to "© 2021 Shopify, Inc. CC BY 4.0 — modified for Sneaker Rush 3D".

The model's toe points +X; the game rotates it at load time (`ASSET_OVERRIDES` in `js/config/assets.js`). The licence excludes logos and trademarks; the model carries no brand logo (the midsole has a generic embossed "FOAM" texture detail).

## Third-party code

| Library | Version | Author | Licence | Licence text |
|---|---|---|---|---|
| three.js (bundled into `js/game.min.js`, decoders in `lib/addons/libs/`) | 0.170.0 | three.js authors | MIT | `licenses/three.js-MIT.txt` |

## Adding a new asset

Add one row per file **before** committing the model: game file, model name, author, licence, whether attribution is required, source page, direct file URL, download date.
If attribution is required, also add it to the in-game credits (Settings → Credits, `js/ui/Panels.js`). Never remove an existing attribution.
Put any licence text that must travel with the files in `assets/licenses/` (it is copied into `dist/` by the build).

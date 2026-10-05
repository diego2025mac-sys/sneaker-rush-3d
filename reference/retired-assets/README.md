# Retired assets (reference only — not shipped)

Imported models that were removed from the game because they do not match the KayKit-style art direction (`ART_DIRECTION.md`). They are kept for reference (scale, rig and animation comparisons) and are **not** part of the build: this folder is outside `assets/`, so `npm run assets` never lists these files in the manifest and `npm run build` never copies them into `dist/`.

| File | Former slot | Author / licence |
|---|---|---|
| `characters/runner.glb` | `assets/characters/runner.glb` | Quaternius — CC0 1.0 |
| `pets/dog.glb` | `assets/pets/dog.glb` | Quaternius (Shiba Inu) — CC0 1.0 |
| `pets/cat.glb` | `assets/pets/cat.glb` | Poly by Google — **CC-BY 3.0, attribution required** |
| `sneakers/street_runner.glb` | `assets/sneakers/street_runner.glb` | Shopify, Inc. (Materials Variants Shoe, modified) — **CC-BY 4.0, attribution required**; licence in `licenses/` |

Full source URLs, download dates, modifications and the exact attribution texts are in `assets/CREDITS.md` → "Retired assets". If a file is ever moved back into `assets/`, its row and attribution must move back to the shipped section and to the in-game credits (`js/ui/Panels.js`), and `sneakers/street_runner.glb` needs `ASSET_OVERRIDES['sneakers/street_runner.glb'] = { rotateY: -90 }` again.

# Sneaker Rush 3D — art direction

Status: **Option B chosen (2026-10-05)** — Quaternius chibi characters + Kenney world and pets. A first playable **visual slice** is integrated (player, Starter Canvas, Street Runner, dog, cat, one shop corner); everything else stays as it was until the slice is approved. KayKit is no longer the target direction. Gameplay, balance, movement, camera and economy are out of scope for every art change.

## 1. Constraints

- **Free assets only.** No paid packs, no commissions.
- **Licences:** CC0 / public domain, or permissive licences that explicitly allow commercial web games; CC-BY only when attribution is manageable. **Rejected:** unclear licences, ripped or re-uploaded paid content, non-commercial (NC) licences, branded/trademarked assets.
- **Consistency over detail:** one coherent look (at most two families whose styles genuinely match). Never mix photoreal, angular low-poly and flat assets again.
- Priorities, in order: overall visual quality → consistency → attractive casual-game look → good characters and pets → sneaker compatibility.
- Use the existing GLB pipeline (`js/assets/`, `js/config/assets.js`); skeleton differences are solved with config aliases, not rewrites.

## 2. History

1. First import pass (Quaternius runner/Shiba, Poly cat, photoreal Shopify sneaker, Quaternius props) mixed five style families; it was retired to `reference/retired-assets/`.
2. A KayKit-only direction was approved, then dropped: no free casual runner, sneakers or pets exist in that style. The KayKit tree, bench and lamp remain in `assets/props/` (CC0) as references until the new direction is chosen. `ASSET_SPEC_BATCH1.md` (KayKit-specific) is superseded.

## 3. Source audit (reachable from the build environment: GitHub + npm)

| Source | Author / licence (verified from the pack's own licence file) | Useful content | Style | Rigged / animated | Verdict |
|---|---|---|---|---|---|
| Kenney 3D catalogue (mirror `series-ai/jam-ready-assets`, every pack with its original `License.txt`) | Kenney — **CC0** | Mini Characters (12), Mini Skate (skater boy/girl), Blocky Characters (18), **Cube Pets (24 animals)**, Mini Market (shop shelves, displays, register, employee), City Kit Commercial/Suburban/Roads, Nature Kit (329), Furniture Kit (140), Car/Toy Car kits | Clean flat-colour low-poly, one colormap atlas per pack | Characters skinned (Mini) or rigid-part (Blocky); pets rigid-part animated | **Usable** |
| Quaternius Ultimate Animated Character Pack, Nov 2019 (original release folder incl. `License.txt`, in `BMOxOMB/Proyecto_ProgramacionConPatrones`) | Quaternius — **CC0** | 50 chibi characters incl. Casual 1/2/3 male+female, Worker, Suit; glTF | Chibi, rounded faceted, flat colours; skin exported near-black (recolour needed) | Skinned, `Foot.L/Foot.R`, Idle/Walk/Run/Jump/Victory | **Usable** |
| Quaternius full catalogue (OpenUSD copy `chibifire-stages/quaternius-stage`, CC0 licence file) | Quaternius — **CC0** | ~80 packs: Ultimate Modular Characters (incl. sneaker *Feet* meshes), Downtown City MegaKit, Stylized Nature MegaKit, Furniture, Home Interior, Cars, Animated Animals, Cube World | Varies strongly by pack and year | Yes (various) | Usable after USD→GLB conversion (Blender `bpy` / `usd-core` are on PyPI, not yet tested) |
| KayKit official (`KayKit-Game-Assets`) | Kay Lousberg — CC0 | Adventurers, Skeletons, props | Chunky clay-toy | Yes | Kept only as reference; no casual runner/pets/sneakers |
| GDQuest Sophia | GDQuest — **CC-BY-NC-SA 4.0** | Stylized girl, 19k tris | Stylized | Yes | **Rejected (non-commercial)** |
| `nginetechnologies/zoo-kay-lousberg` | none stated; contains paid-tier source files | KayKit extras | — | — | **Rejected (unclear licence / paid content)** |
| 100Avatars / Open Source Avatars | CC0 claimed; per-collection licence could not be verified | VRM avatars | Stylized | Rig only, no animations | Not used (licence unverifiable, no animations) |
| Khronos Materials Variants Shoe | Shopify — CC-BY 4.0 | One realistic sneaker | Photoreal | — | Geometry-only fallback for sneakers (see option B) |

## 4. Options (owner decides)

See the comparison in the PR/discussion for screenshots. Summary:

| | A — Kenney Mini family | B — Quaternius chibi + Kenney world | C — Kenney Blocky family |
|---|---|---|---|
| Player | Kenney Mini Skate skater boy/girl (Mini Characters for variety) | Quaternius Casual chibi (skin recoloured) | Kenney Blocky Characters (custom streetwear skins possible) |
| Pets | Kenney Cube Pets | Kenney Cube Pets | Kenney Cube Pets |
| Environment / shop | Kenney Mini Market, City kits, Nature, Furniture | Same Kenney packs (+ selected Quaternius packs after conversion) | Same Kenney packs |
| Sneakers | Original chunky sneaker kit authored in Blender from the Kenney skater's foot shape | Base from Quaternius Modular Characters feet (CC0) → original variants; fits the existing `Foot.L/R` sockets | Painted on skins or block shoes |
| Ranking | #2 | **#1 — chosen** | #3 |

## 5. Rules that stay valid whatever is chosen

- One right sneaker per file, toe → +Z, sole on y = 0; the game mirrors the left foot.
- No real brands, logos or recognisable trademarked shoe designs.
- Every file gets a row in `assets/CREDITS.md` before it is committed; CC-BY attributions also go in the in-game credits.
- Visual changes are validated in-game against the procedural version from the same camera presets before they replace it.

## 6. Visual slice (Option B) — what is in the game now

| Slot | Asset | Notes |
|---|---|---|
| `characters/runner.glb` | Quaternius Casual_Male | Recoloured (skin, outfit); `Foot.L/R` sockets; clip speeds tuned in `ASSET_OVERRIDES` |
| `sneakers/starter_canvas.glb`, `street_runner.glb` | Original variants of the Quaternius `SK_CasualFeet` mesh | Built by `tools/build-slice-assets.mjs` |
| `pets/dog.glb`, `pets/cat.glb` | Kenney Cube Pets | Scale 0.8 via `ASSET_OVERRIDES` |
| `props/shop_*.glb` | Kenney Mini Market counter + Furniture Kit bench, plant, floor lamp | North half of the shop only; the south half stays procedural for comparison |

Not migrated yet (by design): the other 12 sneakers, the other pets, the rest of the shop, hatchery and lobby.

# Sneaker Rush 3D — art direction & asset migration plan

Status: **proposed** (2026-10-05). Gameplay, balance, movement and economy are out of scope for every step below.

## 1. Audit: where the style is inconsistent today

Evidence was captured in-game (same camera presets, procedural fallback vs. imported GLBs) and in a neutral studio lineup at real-world relative scale.

| Asset | Current source | Style family | Problem |
|---|---|---|---|
| Lobby, shop, hatchery, portal, track, signage (procedural) | game code | Clean "neon toy plaza": flat saturated colours, rounded blocks, neon accents | Coherent, but primitive-built and cheap-looking up close |
| Player, pets, sneakers (procedural fallbacks) | game code | Voxel-like chunky toys | Cheap-looking, stepped surfaces |
| `characters/runner.glb` | Quaternius, CC0 | Faceted low-poly, realistic proportions, muted purple | Thin and generic next to the chunky world; no chibi appeal |
| `pets/dog.glb` (Shiba) | Quaternius, CC0 | Faceted, realistic proportions | Adult dog proportions, not "cute pet" |
| `pets/cat.glb` | Poly by Google, CC-BY 3.0 | Faceted, flat grey | Third faceting style; lowest quality asset |
| `sneakers/street_runner.glb` | Shopify, CC-BY 4.0 | **Photoreal** PBR textures | High quality but a completely different rendering style |
| Previous `props/tree.glb` | Quaternius, CC0 | Painted alpha-card foliage, semi-realistic | Fourth style; 2.5 MB |
| Previous `props/bench.glb`, `props/lamp.glb` | Quaternius, CC0 | Rustic park furniture (brown wood, thin grey metal) | Palette clashes with the neon plaza |

Result: **five style families in one scene**. The imported slice was technically better per asset but visually *less* coherent than the procedural version.

## 2. Chosen direction: "chunky toy" stylized (KayKit-compatible)

One art direction for everything: the look of [KayKit](https://kaylousberg.com) packs by Kay Lousberg — smooth bevelled "clay toy" shapes, chibi proportions, one shared gradient-atlas texture — pushed toward this game's neon-plaza palette.

Why this one:
- It is closest to what the procedural world already is (rounded, saturated, toy-like), so environment, UI and FX don't need re-styling.
- It reads well at small sizes and on mobile, and matches the casual-simulator audience on CrazyGames.
- A large CC0 library already exists in exactly this style (City Builder Bits, Furniture Bits, Medieval Hexagon nature, Prototype Bits, Character packs on a shared rig with 75+ animations), published officially at https://github.com/KayKit-Game-Assets. Anything commissioned can be briefed as "KayKit-compatible", which is a precise, checkable brief.

### Style rules (apply to every asset, sourced or commissioned)

| Rule | Spec |
|---|---|
| Shapes | Chunky, soft, bevelled edges; no thin parts under ~4 cm at game scale; readable silhouette at 10 m |
| Proportions | Characters chibi: head ≈ 1/3 of body height, big hands and feet; pets: big head, short legs, "plush toy" |
| Surface | **No photo textures, no normal/detail maps.** Colour comes from a small gradient-swatch atlas (≤ 512²) or flat vertex colours. Metalness 0, roughness 0.4–0.6 |
| Palette | Warm pastel bases (peach, cream, mint, sky) + the game's neon accents (pink `#ff3d7f`, cyan `#2ec4f1`, violet `#b45cff`, yellow `#ffd23f`) used sparingly, as emissive trims on premium items |
| Lighting | Unchanged (current render pipeline); emissive only on neon trims, rarity glows and lamp heads |
| Budgets | Character ≤ 8k tris; sneaker ≤ 3k tris; pet ≤ 4k tris; prop ≤ 1.5k tris; one material per asset where possible |
| Format | `.glb`, Y-up, metres, faces +Z, origin on the ground; meshopt compression allowed |
| Brands | No real brands, logos or recognisable trademarked shoe designs (no stripes/swooshes/jumpman-like marks) |

### Sneaker design language (all 14 tiers)

Sneakers are the hero items, so they get their own rules:
- Oversized "toy" proportions (≈1.25× a real shoe relative to the foot), sole thickness grows with tier.
- **One modular base kit** (outsole, midsole, upper, tongue, laces, heel tab, collar as separate named meshes), so tiers share topology and stay consistent; tiers differ by silhouette pieces + material/emissive treatment.
- Progression readable at a glance: canvas/fabric → mesh/knit → plastic overlays → glowing soles/trims → cosmic/energy materials.
- One right shoe per file (the game mirrors the left), sole flat at y = 0, toe → +Z.

## 3. Migration plan

| Area | Plan | Source | Status |
|---|---|---|---|
| **Props (tree, bench, lamp)** | KayKit tree_single_B, bench, streetlight | KayKit CC0 (free) | **Done in the first slice** |
| **Player character** | One KayKit-compatible chibi runner (casual athletic outfit, no shoes or separate `shoes` mesh), built on the **KayKit standard rig** so it reuses its locomotion set (Idle, Walking_A, Running_A/B, Jump_*, Cheer…) and foot bones `foot.l`/`foot.r` | **Commission** (or a KayKit paid character pack if one fits — verify contents before buying) | Missing |
| **Sneakers (14)** | Modular kit + 14 tier variants following §2 | **Commission** (no CC0 set exists in this style) | Missing (Street Runner photoreal stays as a placeholder) |
| **Pets** | 12 species (`dog`, `cat`, `bunny`, `pigeon`, `fox`, `robot_dog`, `tiger`, `dragon`, `unicorn`, `phoenix`, `bear`, `slime`), plush-toy proportions, Idle + Walk clips; finishes stay material variants in code | **Commission** (dog + cat first) | Missing |
| **Sneaker shop** | Retail fixtures in the same style: slatwall panel, wall shoe shelf, display pedestal (round + square), try-on bench, counter, mirror, neon sign frame, shoe box | **Commission** (KayKit Furniture Bits is home furniture; usable only for filler: rugs, cactus, cabinets) | Missing |
| **Pet hatchery** | Egg pedestal, incubator dome, hatch machine, egg model (finishes as materials), pet bed | Commission; filler from KayKit Furniture/Prototype Bits | Missing |
| **Lobby environment** | Background buildings from KayKit City Builder Bits (`building_A`–`H`) re-tinted toward the palette; planters, bushes, bins, hydrants, traffic bits from the same pack; portal, track and signage stay procedural (they are already on-style) | KayKit CC0 (free) | Next, after the slice is approved |

### Order of work

1. ~~Props~~ (done).
2. **Commission batch 1 (the rest of the first slice):** runner character, Starter Canvas, Street Runner, dog, cat, shop display set (slatwall, wall shelf, pedestal, try-on bench).
3. Integrate batch 1 → in-game comparison against procedural. **Gate:** continue only if the slice is clearly better.
4. Environment from KayKit City Builder Bits (free) + hatchery fixtures.
5. Commission batch 2: remaining 12 sneakers (same kit), remaining 10 pets.

### Interim recommendation

Until batch 1 arrives, the imported Quaternius runner, Shiba, Poly cat and photoreal Street Runner are the off-style assets. Removing them from `assets/` makes those slots fall back to the procedural toys, which are closer to the chosen direction (compare `interim` vs `branch` screenshots in the PR/discussion). This is a one-line-per-file decision for the project owner; it is **not** done automatically.

## 4. Commission brief (copy-paste)

> Stylized low-poly game assets for a casual browser running/pet simulator, in the **KayKit style by Kay Lousberg** (chunky bevelled shapes, chibi proportions, single gradient atlas texture ≤ 512², no photo textures or normal maps, metalness 0). Deliver `.glb` (glTF 2.0), Y-up, metres, facing +Z, origin on the ground, plus source `.blend`. Full commercial rights for web/mobile distribution. No real brands or logos.
>
> **Batch 1**
> 1. **Runner character** — gender-neutral or male+female variant, casual athletic outfit (hoodie or tee, joggers/shorts, cap optional), ~1.8 m game height, ≤ 8k tris, **rigged on the KayKit standard character rig** (same bone names, incl. `foot.l`/`foot.r`, `hips`) so existing KayKit animations apply; feet as sock/bare feet or shoes as a separate mesh named `shoes`.
> 2. **Sneaker kit + 2 sneakers** — modular parts (outsole, midsole, upper, tongue, laces, heel tab, collar; separate meshes and named materials `sole_rubber`, `midsole`, `upper_fabric`, `laces`…), one right shoe per file, ≤ 3k tris each: **Starter Canvas** (white canvas low-top, vulcanised sole, rubber toe cap) and **Street Runner** (grey knit everyday runner with orange accents, more sculpted sole, visibly more premium). Original designs only.
> 3. **Pets: dog (puppy) and cat (kitten)** — plush-toy proportions, ≤ 4k tris, rigged with looping `Idle` and `Walk`, ~0.7 m tall.
> 4. **Sneaker shop display set** — slatwall panel (2 m), floating wall shoe shelf, round display pedestal, square plinth, try-on bench, counter; ≤ 1.5k tris each, palette slots for the game's neon accents.
>
> **Batch 2 (after approval):** 12 more sneakers on the same kit (Retro High, Court Classic, Urban Dunk, Air Sprint, Velocity X, Neon Runner, Carbon Racer, Hyper Boost, Plasma Kicks, Cosmic Runner, Galaxy High, Quantum Sneakers), 10 more pet species, hatchery set.

Slot names, file paths and fit sizes are in `js/config/assets.js` and `assets/README.md`; licences go in `assets/CREDITS.md`.

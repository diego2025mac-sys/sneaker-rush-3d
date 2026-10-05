# Batch 1 asset specification

> **Superseded (2026-10-05).** This spec targeted the KayKit direction, which was dropped (see `ART_DIRECTION.md`). It is kept for reference only; slot paths and the general rules (one right shoe, toe +Z, sole at y = 0, no brands) still apply.

Batch 1 sets the final visual quality bar for the whole game. Style: KayKit-compatible "chunky toy" (`ART_DIRECTION.md`). Six deliverables:

1. Runner character · 2. Starter Canvas · 3. Street Runner · 4. Puppy · 5. Kitten · 6. Sneaker-shop display set

## Rules for every file

| | |
|---|---|
| Format | glTF 2.0 binary `.glb` (+ source `.blend`), meshopt compression allowed |
| Axes / units | Y-up, metres, front faces **+Z**, origin on the ground (y = 0) unless stated |
| Look | Bevelled chunky shapes, no part thinner than ~4 cm at game scale, readable silhouette at 10 m |
| Materials | Metallic-roughness, metalness 0, roughness 0.4–0.6. Colour from **one gradient-swatch atlas** (KayKit-style). No photo textures, no normal/AO/detail maps. Emissive only on a material named `trim_neon` |
| Palette | Warm pastels + game accents: pink `#ff3d7f`, cyan `#2ec4f1` / `#9ad8ff`, violet `#b45cff`, yellow `#ffd23f`, charcoal `#2b2f3a` |
| Names | Every mesh node named by part (below). No empty/unused nodes, cameras or lights |
| Rights | Work-for-hire or licence allowing commercial web/mobile distribution; no real brands, logos, stripes/swooshes or copied shoe designs |
| Hand-off | Drop files at the exact paths below, run `npm run assets` (regenerates the manifest + prints a budget audit), add rows to `assets/CREDITS.md` |

## 1. Runner character

| | |
|---|---|
| **File** | `assets/characters/runner.glb` |
| Scale | Auto-fitted to **1.8 m** tall in game (deliver at any consistent scale; KayKit native scale is fine). Chibi: head ≈ 1/3 of height, big hands/feet |
| Triangles | ≤ **8,000** |
| Materials | 1 material, 1 atlas ≤ **1024²** |
| Rig / bones | **KayKit standard character rig** — identical bone names and hierarchy to *KayKit Character Pack: Adventures 1.0* (incl. `hips`, `foot.l`, `foot.r`). Bind pose: feet flat on the ground, toes +Z |
| Pivot | Root at the ground between the feet |
| Feet | Chunky sock/bare feet that fit inside a **0.32 × 0.18 × 0.14 m** box (L × W × H) per foot, so the game's sneakers cover them. If shoes are modelled, make them a separate mesh whose name contains `shoe` (the game hides it) |
| Animations (baked into the GLB, in place, seamless loops, exact names) | Required: `Idle`, `Walking_A`, `Running_A`, `Cheer`, `Jump_Idle`. Recommended: `Jump_Start`, `Jump_Land`, `Hit_A` (used for stumbles) |
| Outfit | Casual athletic, gender-neutral (hoodie or tee, joggers or shorts, optional cap); colours from the palette |

The game already maps these clip names and finds `foot.l`/`foot.r` (tested with a KayKit-rigged character). Ground-speed matching (`clipSpeeds` in `js/config/assets.js`) is tuned on arrival.

## 2. Starter Canvas · 3. Street Runner (sneakers)

| | Starter Canvas | Street Runner |
|---|---|---|
| **File** | `assets/sneakers/starter_canvas.glb` | `assets/sneakers/street_runner.glb` |
| Design | Classic canvas low-top: white canvas upper, vulcanised sole, rubber toe cap, flat laces | Everyday runner, visibly more premium: grey knit upper, layered side overlay, sculpted athletic sole, orange accents |
| Triangles | ≤ **3,000** | ≤ **3,000** |

Shared requirements:

| | |
|---|---|
| Content | **One right shoe** per file (the game mirrors it for the left foot). No animation |
| Scale / proportions | Auto-fitted to 0.31 m long, then ×1.12 on the foot → **≈ 0.35 m long in game**. Chibi proportions: width ≈ **0.6 × length**, collar height ≈ **0.5 × length**. Must fully enclose the runner's foot box (0.32 × 0.18 × 0.14 m). Also shown at 3.4–11× on shelves, podium and the roof sign, so bevels must hold up at large size |
| Pivot | Origin on the ground **under the ankle** (≈ 27 % of the length from the heel), centred left-right; sole flat on y = 0; toe → **+Z** |
| Mesh parts (named nodes) | `outsole`, `midsole`, `upper`, `toe_cap` (Starter) / `overlay` (Street), `tongue`, `laces`, `heel_tab`, `collar` |
| Materials | 1 material on **one atlas shared by both sneakers** (≤ 512²; later tiers reuse it). Optional `trim_neon` only if the design needs a glow (not expected for these two tiers) |
| Kit | Both shoes are built from **one modular base** (same last/sole topology) so the other 12 tiers can follow later |

## 4. Puppy · 5. Kitten (pets)

| | Puppy | Kitten |
|---|---|---|
| **File** | `assets/pets/dog.glb` | `assets/pets/cat.glb` |
| Also used for | Golden Dog (gold finish) | Diamond Cat, Cyber Cat (finish variants) |

Shared requirements:

| | |
|---|---|
| Scale | Auto-fitted to **0.72 m** tall; body length ≤ 0.8 m. Plush-toy proportions: head ≈ 40–45 % of height, short legs |
| Triangles | ≤ **4,000** |
| Materials | 1 material, atlas ≤ 512². Eyes, nose and mouth must be **dark swatches in the atlas** (finishes tint the material colour; atlas details survive the tint) |
| Rig / bones | Simple skeleton: `root`, `spine`, `head`, four legs, `tail` (ears optional) |
| Pivot | Origin on the ground, centred between the feet; faces +Z |
| Animations (in place, seamless loops, exact names) | Required: `Idle` (played while following the player), `Walk`. Optional: `Jump` / `Happy` |

## 6. Sneaker-shop display set

Six props in one atlas (≤ 512²) plus optional `trim_neon` emissive material (cyan `#9ad8ff` / pink `#ff3d7f`, as in the current shop). Neutral body colours: cream, white, charcoal. Sizes match the current shop layout so they drop into the same positions; the placement code in `js/world/Lobby.js` is wired when the files arrive.

| **File** | What | Size (W × D × H, m) | Pivot | Tris | Instances |
|---|---|---|---|---|---|
| `assets/props/shop_wall_shelf.glb` | Floating wall shelf for one sneaker, optional neon strip under the front edge | 2.0 × 0.9 × ≤ 0.12 | Back edge centre, **top surface at y = 0** | ≤ 600 | 14 (2 rows × 7, 2.3 m pitch) |
| `assets/props/shop_slatwall.glb` | Back-wall panel module behind the shelves | 2.3 × ≤ 0.15 × 4.6 | Bottom back centre | ≤ 800 | 7 |
| `assets/props/shop_pedestal_round.glb` | Round display pedestal with neon top ring (used for the "Next upgrade" podium and the 2 outdoor showcases, scaled) | Ø 2.0 × 0.85 | Bottom centre | ≤ 1,500 | 3 |
| `assets/props/shop_tryon_bench.glb` | Try-on bench | 3.2 × 1.0 × 0.6 (seat) | Bottom centre | ≤ 800 | 2 |
| `assets/props/shop_counter.glb` | Checkout counter | 2.6 × 2.6 × 1.3 | Bottom centre | ≤ 1,500 | 1 |
| `assets/props/shop_shoebox.glb` | Shoe box with lid, stackable | 1.6 × 1.0 × 0.6 | Bottom centre | ≤ 300 | ~9 (stacks) |

All shop props: front faces +Z (the game rotates them into place), no animation.

## Acceptance (how Batch 1 is checked in-game)

1. `npm run assets` lists every file with no over-budget warning.
2. Runner: all clips resolve, sneakers stay attached through idle / walk / run / sprint (side, front and top views), no foot or sock poking through.
3. Each sneaker looks correct on the feet, in the shop panel thumbnail, on the shelves, the podium and the roof sign (scale, orientation, mirroring, lighting).
4. Pets follow the player with `Idle` playing; golden / diamond / cyber finishes keep the face readable.
5. Side-by-side screenshots against the procedural version from the same camera presets: Batch 1 must look **clearly better** before the other 12 sneakers and 10 pets are commissioned.

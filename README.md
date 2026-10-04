# Sneaker Rush 3D

A 3D running and progression simulator for the browser, built with Three.js and ready for CrazyGames.
Buy faster sneakers, hatch pets that multiply your money, and run as far as you dare before you **CASH OUT**.

## Run it

No install is needed to play locally. Three.js is vendored in `lib/`.

```bash
npm run dev
```

Then open http://localhost:5173. Add `?debug=1` for the developer panel (toggle it with the backquote key). Add `?nosdk=1` to simulate a portal that has no CrazyGames SDK.

Logic tests and the economy pacing simulator:

```bash
npm test
```

```bash
npm run sim
```

Production build. This writes `dist/`, a single minified bundle with the debug tools compiled out. Zip `dist/` and upload it to CrazyGames:

```bash
npm install && npm run build
```

## Controls

| | Desktop | Mobile |
|---|---|---|
| Move / run | W A S D (hold W on the track) | Left joystick |
| Camera | Click the game to lock the pointer, then move the mouse. **Z** releases the cursor | Drag on the right side |
| Jump | Space | ⤒ button |
| Cash out | **C** / Enter / button | CASH OUT button |
| Auto-run | R / button | AUTO RUN button |
| Open nearby shop | E (shops also open automatically when you step on a pad) | OPEN button |
| Pets / Missions / Settings | I / M / Esc | Top-right buttons |

## Project structure

```
index.html, css/style.css         UI shell + styles
lib/three.module.min.js           vendored three.js r170
js/main.js                        boot: SDK → save → game
js/config/                        ALL balancing data
  balance.js                      economy formula, speed curve, run/chunk settings, milestones, rebirth, boosts, platform
  sneakers.js  pets.js            14 sneakers · 20 pets in 5 eggs
  missions.js  biomes.js          missions/achievements · 8 track biomes
js/core/                          Game (orchestrator), PlatformManager (CrazyGames SDK v3), SaveManager
                                  (localStorage / CG Data Module), Input (Pointer Lock), AudioManager (procedural), EventBus, GameState
js/systems/Economy.js             pure formulas (rewards, pet multiplier, odds + luck, speed curve)
js/systems/Progression.js         every state-changing action (buy, hatch, equip, cash out, missions, rebirth)
js/world/                         Lobby, RunTrack (chunk streaming + pooling), BiomeProps, Sky
js/player/                        Character (rig + sneakers on feet), SneakerModel, RunController, LobbyController, camera
js/pets/                          PetModel, EggModel, PetFollower
js/fx/                            Particles, SpeedFX, HatchScene
js/ui/                            HUD, Panels, Thumbnails (3D renders for cards), MobileControls
js/net/NetAdapter.js              multiplayer seam (offline no-op)
js/debug/DebugPanel.js            dev tools (dev builds only)
tools/                            serve, build, sim
test/economy.test.mjs             23 logic tests
```

## Economy (see `js/config/balance.js`)

```
reward = (distance × distanceValue × distanceBonus(distance) + coins) × petMultiplier × rebirthMultiplier × boost
distanceBonus(d) = (1 + d / 250) ^ 0.8         → 250 m x1.7 · 1 km x3.6 · 5 km x11 · 25 km x40 · 100 km x121
petMultiplier    = 1 + Σ (pet.mult − 1)        (additive, so the economy can't explode)
```

Sneaker SPEED is metres of distance per second. The physical world speed is compressed: it is linear up to 12 m/s, then follows a square root, and it is capped at 50 units/s. So the track stays controllable while the distance counter and the visual effects scale up.

## 3D asset pipeline (GLB / glTF)

- `js/assets/AssetManager.js` handles loading and caching. It reads `assets/manifest.json` and loads each GLB/HDR once, using GLTFLoader with Draco, Meshopt and KTX2/Basis support.
- `js/assets/ModelLibrary.js` is where the game asks for sneakers, pets, props and the character. It auto-fits imported models to the slot spec, clones cached templates, and falls back to the procedural prototypes.
- `js/assets/MaterialLibrary.js` holds the PBR presets (rubber, fabric, leather, plastic, metal, glass, concrete, neon, foliage, wood), prepares imported materials, and creates pet finish variants.
- `js/player/GLBCharacter.js` drives a rigged character with an AnimationMixer, using clip aliases, speed-matched playback and automatic sneaker sockets on the foot bones. It has the same interface as the procedural character.
- `js/core/RenderPipeline.js` handles colour management, tone mapping/exposure, the LOW/MEDIUM/HIGH presets, the environment map, shadows and the post-processing stack (MSAA, bloom, vignette, output).
- Slots, filenames and specs: `js/config/assets.js` and **[assets/README.md](assets/README.md)**.

Add or replace models, then refresh the manifest and audit:

```bash
npm run assets
```

Generate pipeline test fixtures (not art), then open the game with `?assets=fixtures`:

```bash
npm run fixtures
```

# Sneaker Rush 3D

Browser-based 3D progression simulator built with Three.js, targeting CrazyGames.

**Core loop:** buy sneakers (running speed) → hatch pets (money multiplier) → enter the run area → run as far as you dare → **cash out** → upgrade → repeat.

## Requirements

- Node.js 20+
- npm

## Getting started

```bash
npm install      # installs three + esbuild and vendors three.js into lib/ (postinstall)
npm run dev      # http://localhost:5173
```

The game is plain ES modules served as static files: `index.html` uses an import map that points `three` and `three/addons/` at the vendored copies in `lib/`, so nothing is loaded from a CDN.

Dev-only URL flags: `?debug=1` (debug panel on localhost), `?assets=fixtures` (load the GLB test fixtures from `test/fixtures/assets/`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm start` | Static dev server on port 5173 (`tools/serve.mjs`) |
| `npm test` | Pure-logic tests: economy, eggs, pets, progression, missions, rebirth, saves (`test/economy.test.mjs`) |
| `npm run build` | Production bundle into `dist/` (`tools/build.mjs`): minified `js/game.min.js`, CSS, assets, decoders |
| `npm run preview` | Serve `dist/` on port 5174 |
| `npm run assets` | Regenerate `assets/manifest.json` and audit every GLB (`tools/assets.mjs`) |
| `npm run fixtures` | Export the procedural models as GLB test fixtures (`tools/make-fixtures.mjs`) |
| `npm run sim` | Economy pacing simulator (`tools/sim.mjs`) |
| `npm run vendor` | Copy three.js + used addons from `node_modules/` into `lib/` (`tools/vendor.mjs`) |

## Repository layout

```
index.html            game page (dev entry; the build rewrites it for dist/)
css/                  UI styles
js/
  main.js             entry point (boot, SDK, save, game loop)
  assets/             AssetManager, ModelLibrary, MaterialLibrary (GLB pipeline + caching + fallbacks)
  config/             balance, sneakers, pets, missions, biomes, asset slots
  core/               Game, state, input, save, audio, platform (CrazyGames SDK), render pipeline
  debug/              debug panel (stripped from production)
  fx/                 particles, speed FX, hatch scene, contact shadows
  net/                multiplayer seam (offline no-op adapter today)
  pets/               pet models, followers, eggs
  player/             character, GLB character, sneakers, lobby/run controllers, camera
  systems/            Economy, Progression
  ui/                 HUD, panels, mobile controls, thumbnails
  utils/              geometry helpers, labels, math
  world/              lobby, run track, biome props, sky, posters
assets/               production models (see assets/README.md for slot specs)
  characters/ pets/ props/ (sneakers/ environment/ textures/ when added)
  manifest.json       generated list of files the game may request (npm run assets)
  CREDITS.md          authors, licences, attribution for every third-party file
  licenses/           licence texts shipped with the build
reference/            retired assets kept for reference (not shipped)
test/                 unit tests + GLB pipeline fixtures (test/fixtures/assets, never shipped)
tools/                build, dev server, asset audit, fixtures, simulator, vendoring
```

Generated, not committed: `node_modules/`, `lib/` (`npm run vendor`), `dist/` (`npm run build`).

## Assets

Real `.glb` models go under `assets/<category>/` using the slot names in `js/config/assets.js`; then run `npm run assets`. Any slot without a file falls back to the procedural model, so the game always runs. Every third-party file must be recorded in [`assets/CREDITS.md`](assets/CREDITS.md) with its licence, and CC-BY attributions must also appear in the in-game credits.

Do not use real brands, logos or copied trademarked shoe designs. The art direction is being re-selected from free assets; see [`ART_DIRECTION.md`](ART_DIRECTION.md) (KayKit is no longer required; `ASSET_SPEC_BATCH1.md` is superseded). Retired off-style imports are kept, unshipped, in `reference/retired-assets/`.

## Deploying to CrazyGames

```bash
npm run build
cd dist && zip -r ../sneaker-rush-3d.zip . && cd ..
```

Upload the zip. `dist/` is self-contained (no CDN dependencies besides Google Fonts and the CrazyGames SDK, both optional at runtime).

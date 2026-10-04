# Third-party asset credits

All files were downloaded unmodified from Poly Pizza's static host. Any adjustments (scale, origin, sockets, hidden meshes) are made at load time by the game, not in the files.

| Game file | Model | Author | Licence | Attribution required | Source page | File URL | Downloaded |
|---|---|---|---|---|---|---|---|
| `characters/runner.glb` | Hoodie Character | Quaternius | CC0 1.0 (public domain) | No | https://poly.pizza/m/gKLBoRsyKe | https://static.poly.pizza/bcd66ec5-5e81-4901-a222-47abc875fe2a.glb | 2026-10-04 |
| `pets/dog.glb` | Shiba Inu (Animated Animal Pack) | Quaternius | CC0 1.0 (public domain) | No | https://poly.pizza/m/y4wdQpg767 | https://static.poly.pizza/ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77.glb | 2026-10-04 |
| `pets/cat.glb` | Cat | Poly by Google | **CC-BY 3.0 — attribution required** | **Yes** | https://poly.pizza/m/6dM1J6f6pm9 | https://static.poly.pizza/5d32eb38-9546-4ce4-aa77-bcef9328ee61.glb | 2026-10-04 |
| `props/tree.glb` | Tree | Quaternius | CC0 1.0 (public domain) | No | https://poly.pizza/m/qZtx0AHhcy | https://static.poly.pizza/24cf9df9-435f-408e-971b-640d670ce973.glb | 2026-10-04 |
| `props/bench.glb` | Bench | Quaternius | CC0 1.0 (public domain) | No | https://poly.pizza/m/jLxjFxFRpw | https://static.poly.pizza/1361c268-20f7-4e73-a931-ce434c6b503e.glb | 2026-10-04 |
| `props/lamp.glb` | Street Light | Quaternius | CC0 1.0 (public domain) | No | https://poly.pizza/m/0lxF8Dl1jU | https://static.poly.pizza/451a3b57-b957-4184-9c67-4a11587299b5.glb | 2026-10-04 |

Required attribution, shown in-game under Settings → Credits:

> "Cat" by Poly by Google, licensed under CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/), via Poly Pizza.

## Third-party code

| Library | Version | Author | Licence | Licence text |
|---|---|---|---|---|
| three.js (bundled into `js/game.min.js`, decoders in `lib/addons/libs/`) | 0.170.0 | three.js authors | MIT | `licenses/three.js-MIT.txt` |

## Adding a new asset

Add one row per file **before** committing the model: game file, model name, author, licence, whether attribution is required, source page, direct file URL, download date.
If attribution is required, also add it to the in-game credits (Settings → Credits, `js/ui/Panels.js`). Never remove an existing attribution.
Put any licence text that must travel with the files in `assets/licenses/` (it is copied into `dist/` by the build).

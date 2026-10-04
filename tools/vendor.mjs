// Copies three.js and the addons the game uses into /lib so the game never depends on a CDN.
// Run after `npm install`:  npm run vendor
import { cpSync, mkdirSync, rmSync } from 'node:fs';
const src = 'node_modules/three';
mkdirSync('lib', { recursive: true });
cpSync(`${src}/build/three.module.min.js`, 'lib/three.module.min.js');
rmSync('lib/addons', { recursive: true, force: true });
const dirs = ['loaders', 'utils', 'postprocessing', 'shaders', 'environments', 'exporters', 'math'];
for (const d of dirs) cpSync(`${src}/examples/jsm/${d}`, `lib/addons/${d}`, { recursive: true });
// decoders (loaded at runtime only when an asset needs them)
for (const f of ['meshopt_decoder.module.js', 'ktx-parse.module.js', 'zstddec.module.js', 'fflate.module.js']) cpSync(`${src}/examples/jsm/libs/${f}`, `lib/addons/libs/${f}`);
cpSync(`${src}/examples/jsm/libs/draco/gltf`, 'lib/addons/libs/draco/gltf', { recursive: true });
cpSync(`${src}/examples/jsm/libs/basis`, 'lib/addons/libs/basis', { recursive: true });
console.log('Vendored three.module.min.js + addons -> lib/');

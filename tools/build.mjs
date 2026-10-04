// Production build: bundles + minifies all game code and three.js into one file and writes a
// self-contained static site to /dist (zip it for CrazyGames). Debug tools are stripped.
import { build } from 'esbuild';
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'js'), { recursive: true });

await build({
  entryPoints: ['js/main.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  outfile: join(out, 'js', 'game.min.js'),
  plugins: [{
    // 'three' and 'three/addons/*' resolve to the vendored copies in /lib (same as the dev import map)
    name: 'three-vendored',
    setup(b) {
      b.onResolve({ filter: /^three(\/addons\/.*)?$/ }, (args) => ({
        path: resolve(args.path === 'three' ? 'lib/three.module.min.js' : 'lib/addons/' + args.path.slice('three/addons/'.length)),
      }));
    },
  }],
  define: { __PRODUCTION__: 'true' },
  legalComments: 'none',
  logLevel: 'info',
});

cpSync('css', join(out, 'css'), { recursive: true });
execSync('node tools/assets.mjs assets', { stdio: 'inherit' }); // fresh manifest
cpSync('assets', join(out, 'assets'), { recursive: true, filter: (p) => !/README\.md$/.test(p) });
// runtime decoders, only fetched if an asset uses Draco / KTX2
cpSync('lib/addons/libs/draco/gltf', join(out, 'lib/addons/libs/draco/gltf'), { recursive: true });
cpSync('lib/addons/libs/basis', join(out, 'lib/addons/libs/basis'), { recursive: true });
let html = readFileSync('index.html', 'utf8');
html = html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '');
html = html.replace('<script type="module" src="js/main.js"></script>', '<script type="module" src="js/game.min.js"></script>');
writeFileSync(join(out, 'index.html'), html);

const size = (p) => { const s = statSync(p); return s.isFile() ? s.size : readdirSync(p).reduce((a, f) => a + size(join(p, f)), 0); };
console.log(`\nBuilt ${out}/ — total ${(size(out) / 1024).toFixed(0)} KB`);
for (const f of ['index.html', 'js/game.min.js', 'css/style.css']) console.log(`  ${f.padEnd(18)} ${(size(join(out, f)) / 1024).toFixed(0)} KB`);

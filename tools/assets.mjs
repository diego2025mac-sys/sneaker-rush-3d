// Scans an asset folder, writes <root>/manifest.json (the list of files the game may request)
// and prints an audit of every GLB against the specs in assets/README.md.
// Usage: node tools/assets.mjs [root=assets]
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const root = process.argv[2] || 'assets';
const exts = new Set(['.glb', '.gltf', '.bin', '.hdr', '.ktx2', '.png', '.jpg', '.jpeg', '.webp']);
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (exts.has(extname(f).toLowerCase())) files.push({ path: relative(root, p).split('\\').join('/'), bytes: st.size });
  }
})(root);
files.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(join(root, 'manifest.json'), JSON.stringify({ generated: new Date().toISOString(), files }, null, 2) + '\n');

// ---- audit
// triangle budgets from ART_DIRECTION.md / ASSET_SPEC_BATCH1.md (KayKit-style chunky low-poly)
const BUDGET = { 'sneakers/': 3000, 'pets/': 4000, 'characters/': 8000, 'props/': 1500, 'environment/': 20000 };
function glbJson(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) return JSON.parse(b.toString('utf8')); // .gltf
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}
console.log(`manifest: ${files.length} file(s) in ${root}/`);
for (const f of files.filter((x) => /\.(glb|gltf)$/i.test(x.path))) {
  try {
    const j = glbJson(join(root, f.path));
    let tris = 0;
    for (const m of j.meshes || []) for (const pr of m.primitives || []) {
      const acc = j.accessors[pr.indices ?? pr.attributes.POSITION];
      tris += pr.indices !== undefined ? acc.count / 3 : acc.count / 3;
    }
    const ext = (j.extensionsUsed || []).join(',') || '-';
    const anims = (j.animations || []).map((a) => a.name).join(', ') || '-';
    const budget = Object.entries(BUDGET).find(([k]) => f.path.startsWith(k))?.[1];
    const warn = budget && tris > budget ? `  ⚠ over budget (${budget})` : '';
    console.log(`  ${f.path.padEnd(34)} ${(f.bytes / 1024).toFixed(0).padStart(6)} KB  tris ${Math.round(tris).toString().padStart(6)}  mats ${(j.materials || []).length}  tex ${(j.textures || []).length}  skins ${(j.skins || []).length}  ext ${ext}${warn}`);
    if (j.animations?.length) console.log(`      animations: ${anims}`);
  } catch (e) {
    console.log(`  ${f.path}  (could not parse: ${e.message})`);
  }
}

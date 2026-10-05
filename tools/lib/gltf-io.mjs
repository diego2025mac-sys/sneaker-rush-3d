// Minimal glTF/GLB + PNG helpers shared by the asset build tools (no dependencies beyond Node).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

export function readGltf(path) {
  const raw = readFileSync(path);
  let json, bin = null;
  if (raw.readUInt32LE(0) === 0x46546c67) { // GLB
    let off = 12;
    while (off < raw.length) {
      const len = raw.readUInt32LE(off), type = raw.readUInt32LE(off + 4);
      const chunk = raw.subarray(off + 8, off + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
      else if (type === 0x004e4942) bin = Buffer.from(chunk);
      off += 8 + len;
    }
  } else {
    json = JSON.parse(raw.toString('utf8'));
    const uri = json.buffers?.[0]?.uri;
    if (uri) {
      bin = uri.startsWith('data:') ? Buffer.from(uri.split(',')[1], 'base64') : readFileSync(join(dirname(path), uri));
      json.buffers = [{ byteLength: bin.length }];
    }
  }
  return { json, bin: bin || Buffer.alloc(0), dir: dirname(path) };
}

/** Append raw bytes to the binary chunk (4-byte aligned) and return a new bufferView index. */
export function appendView(g, data, target) {
  const pad = (4 - (g.bin.length % 4)) % 4;
  const offset = g.bin.length + pad;
  g.bin = Buffer.concat([g.bin, Buffer.alloc(pad), Buffer.from(data.buffer ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : data)]);
  g.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength ?? data.length, ...(target ? { target } : {}) });
  g.json.buffers[0] = { byteLength: g.bin.length };
  return g.json.bufferViews.length - 1;
}

/** Move external images (Textures/colormap.png) into the binary chunk so each GLB is self-contained. */
export function embedImages(g, replace = null) {
  if (!g.json.buffers?.length) g.json.buffers = [{}];
  g.json.buffers[0] = { byteLength: g.bin.length };
  for (const img of g.json.images || []) {
    if (!img.uri) continue;
    const data = replace || readFileSync(join(g.dir, decodeURIComponent(img.uri)));
    img.bufferView = appendView(g, data);
    img.mimeType = img.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    delete img.uri;
  }
  return g;
}

export function writeGlb(path, json, bin) {
  mkdirSync(dirname(path), { recursive: true });
  const js = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jsonChunk.length + (bin.length ? 8 + binChunk.length : 0), 8);
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
  writeFileSync(path, Buffer.concat([head, chunk(0x4e4f534a, jsonChunk), ...(bin.length ? [chunk(0x004e4942, binChunk)] : [])]));
  console.log('  wrote', path, (Buffer.byteLength(JSON.stringify(json)) / 1024 + bin.length / 1024).toFixed(0) + ' KB');
}

/** Typed view of an accessor (no sparse / normalized support needed for these assets). */
export function accessorArray(g, index) {
  const a = g.json.accessors[index], v = g.json.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const stride = v.byteStride || 0;
  if (stride && stride !== n * C.BYTES_PER_ELEMENT) throw new Error('interleaved accessors are not supported');
  const start = g.bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
  return { arr: new C(g.bin.buffer.slice(start, start + a.count * n * C.BYTES_PER_ELEMENT)), n, count: a.count };
}

/** Add an accessor for a typed array (min/max for POSITION) and return its index. */
export function addAccessor(g, arr, type, { target, minmax = false } = {}) {
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
  const componentType = arr instanceof Float32Array ? 5126 : arr instanceof Uint32Array ? 5125 : 5123;
  const acc = { bufferView: appendView(g, arr, target), componentType, count: arr.length / n, type };
  if (minmax) {
    acc.min = Array(n).fill(Infinity); acc.max = Array(n).fill(-Infinity);
    for (let i = 0; i < arr.length; i++) { const k = i % n; acc.min[k] = Math.min(acc.min[k], arr[i]); acc.max[k] = Math.max(acc.max[k], arr[i]); }
  }
  g.json.accessors.push(acc);
  return g.json.accessors.length - 1;
}

// ---------------------------------------------------------------------------- PNG --
// 8-bit RGB / RGBA, non-interlaced (what the Kenney atlases use). Decodes to RGBA.
export function decodePng(buf) {
  let off = 8, w = 0, h = 0, type = 0, depth = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), name = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (name === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; if (data[12]) throw new Error('interlaced PNG'); }
    else if (name === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6)) throw new Error(`unsupported PNG (depth ${depth}, type ${type})`);
  const bpp = type === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp;
  const out = Buffer.alloc(w * h * 4), cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 4] = cur[x * bpp]; out[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; out[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; out[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    cur.copy(prev);
  }
  return { w, h, data: out };
}

let CRC;
function crc32(buf) {
  CRC ||= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function encodePng({ w, h, data }) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) raw[y * (w * 3 + 1) + 1 + x * 3 + k] = data[(y * w + x) * 4 + k];
  const chunk = (name, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const nd = Buffer.concat([Buffer.from(name, 'ascii'), d]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(nd)); return Buffer.concat([len, nd, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Drop unreferenced accessors / bufferViews and rebuild the binary chunk (after removing data). */
export function compact(g) {
  const J = g.json, usedAcc = new Set(), usedView = new Set();
  for (const m of J.meshes || []) for (const p of m.primitives) { Object.values(p.attributes).forEach((a) => usedAcc.add(a)); if (p.indices !== undefined) usedAcc.add(p.indices); }
  for (const a of J.animations || []) for (const s of a.samplers) { usedAcc.add(s.input); usedAcc.add(s.output); }
  for (const s of J.skins || []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
  const accMap = new Map(), accessors = [];
  [...usedAcc].sort((a, b) => a - b).forEach((i) => { accMap.set(i, accessors.length); accessors.push(J.accessors[i]); });
  for (const a of accessors) usedView.add(a.bufferView);
  for (const im of J.images || []) if (im.bufferView !== undefined) usedView.add(im.bufferView);
  const viewMap = new Map(), views = [], parts = [];
  let off = 0;
  [...usedView].sort((a, b) => a - b).forEach((i) => {
    const v = J.bufferViews[i], data = g.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), pad = (4 - (off % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
    viewMap.set(i, views.length); views.push({ ...v, byteOffset: off }); parts.push(data); off += data.length;
  });
  for (const a of accessors) a.bufferView = viewMap.get(a.bufferView);
  for (const im of J.images || []) if (im.bufferView !== undefined) im.bufferView = viewMap.get(im.bufferView);
  for (const m of J.meshes || []) for (const p of m.primitives) { for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]); if (p.indices !== undefined) p.indices = accMap.get(p.indices); }
  for (const a of J.animations || []) for (const s of a.samplers) { s.input = accMap.get(s.input); s.output = accMap.get(s.output); }
  for (const s of J.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
  J.accessors = accessors; J.bufferViews = views;
  g.bin = Buffer.concat(parts); J.buffers = [{ byteLength: g.bin.length }];
  return g;
}

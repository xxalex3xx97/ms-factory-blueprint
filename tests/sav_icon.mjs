// Headless check of js/sav_icon.js (pure renderer, no DOM).
// Run: node tests/sav_icon.mjs
// Writes only C:/Users/SFidelis/rea_work/out/site-sample-icon.png (256x256 greyscale). Exit code 1 on any failed check.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import zlib from 'zlib';
import {fileURLToPath} from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', 'sav_icon.js'), 'utf8'), 'sav_icon.js');

let total = 0, pass = 0;
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`);
}

const size = () => [4, 4];
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'sav_sample.json'), 'utf8'));
const hand = {Blocks: [
  {GridLocation: {X: 0, Y: 0}},
  {GridLocation: {X: 300, Y: 120}},
]};

// Replicates the renderer's rect and transform so the test can check its output independently.
function rects(j) {
  return (j.Blocks || []).map(b => {
    const [w, h] = size(b), cx = b.GridLocation.X, cy = b.GridLocation.Y;
    return [cx - 2 * w, cy - 2 * h, cx + 2 * w, cy + 2 * h];
  });
}
function transform(R) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of R) { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]); }
  const s = 255 / Math.max(x1 - x0, y1 - y0, 1);
  const ox = (255 - (x1 - x0) * s) / 2, oy = (255 - (y1 - y0) * s) / 2;
  const cl = v => Math.max(0, Math.min(255, v));
  return r => [
    cl(Math.round((r[0] - x0) * s + ox)), cl(Math.round((r[1] - y0) * s + oy)),
    cl(Math.round((r[2] - x0) * s + ox)), cl(Math.round((r[3] - y0) * s + oy)),
  ];
}

// CRC-32 with own table (zlib.crc32 deliberately not used).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngGrey(px, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit, greyscale, no interlace
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0; // filter: none
    Buffer.from(px.buffer, px.byteOffset + y * w, w).copy(raw, y * (w + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const pxSample = savIcon(sample, size);
const pxHand = savIcon(hand, size);
const pxEmpty = savIcon({Blocks: []}, size);

chk('length 65536', pxSample.length === 65536 && pxHand.length === 65536, `got ${pxSample.length} / ${pxHand.length}`);
chk('values all in 0..255', [pxSample, pxHand].every(p => p.every(v => v >= 0 && v <= 255)));
chk('no Blocks gives all zeros', pxEmpty.every(v => v === 0));

// bbox of non-zero pixels
function bbox(px) {
  let minx = 256, miny = 256, maxx = -1, maxy = -1;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    if (px[y * 256 + x]) {
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  }
  return {minx, miny, maxx, maxy};
}
for (const [label, px] of [['sample', pxSample], ['hand', pxHand]]) {
  const b = bbox(px);
  const longest = Math.max(b.maxx - b.minx, b.maxy - b.miny); // edge-to-edge span
  chk(`${label}: longest bbox side 250..255`, longest >= 250 && longest <= 255, `got ${longest}`);
  const cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
  chk(`${label}: centred within 3 px`, Math.abs(cx - 127.5) <= 3 && Math.abs(cy - 127.5) <= 3, `centre ${cx},${cy}`);
  const touches = b.minx === 0 && b.miny === 0;
  chk(`${label}: pixel (0,0) is 0 unless bbox touches it`, px[0] === 0 || touches, `px[0]=${px[0]}`);
  const vals = new Set(px);
  chk(`${label}: 255 occurs`, vals.has(255));
  // sample blocks are sub-pixel at 4-cell size (large spacing), so no interior floor; checked on hand only
  if (label === 'hand') chk(`${label}: 20 (floor) occurs`, vals.has(20));
  const tf = transform(rects(label === 'sample' ? sample : hand));
  let holes = 0;
  for (const r of rects(label === 'sample' ? sample : hand)) {
    const [a, bb, c, d] = tf(r);
    for (let y = bb; y <= d; y++) for (let x = a; x <= c; x++) if (px[y * 256 + x] === 0) holes++;
  }
  chk(`${label}: no 0 pixel inside any block rectangle`, holes === 0, `holes=${holes}`);
}

// Write PNG (only file this test writes).
const outDir = 'C:/Users/SFidelis/rea_work/out';
const outPng = path.join(outDir, 'site-sample-icon.png');
fs.writeFileSync(outPng, pngGrey(pxSample, 256, 256));
chk('PNG written', fs.existsSync(outPng) && fs.statSync(outPng).size > 0, outPng);

console.log(`\n${pass}/${total} passed`);
console.log(pass === total ? 'PASS' : 'FAIL');
process.exitCode = pass === total ? 0 : 1;

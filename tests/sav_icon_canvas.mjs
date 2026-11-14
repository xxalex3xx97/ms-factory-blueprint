// Headless check of the canvas design icon in the Export dialog "Download .sav" (#expSav): load a factory JSON,
// click Export then #expSav, read Screenshot GreyscaleValues from the downloaded .sav (parsed with js/sav_template.js
// + js/sav_export.js in node), check the icon shape, no page errors. Writes the 256x256 greyscale PNG.
// Run:  node tests/sav_icon_canvas.mjs [input.json] [outName] [sav]
//   default input: C:/Users/SFidelis/Downloads/Main_Base (1).json; output: rea_work/out/icon-canvas.png
//   outName (e.g. test-from-website-icon2) -> rea_work/out/<outName>.png; the 3rd arg 'sav' also writes rea_work/out/<outName>.sav
// Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import zlib from 'zlib';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const OUT = 'C:/Users/SFidelis/rea_work/out';
const IN = process.argv[2] || 'C:/Users/SFidelis/Downloads/Main_Base (1).json';
const BASE = process.argv[3] || 'icon-canvas';
const WANT_SAV = process.argv[4] === 'sav';

// Parser side: same globals the page uses (savLoad, savFind).
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', 'sav_template.js'), 'utf8'), 'sav_template.js');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', 'sav_export.js'), 'utf8'), 'sav_export.js');

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}

// CRC-32 with own table; PNG writer (same as tests/sav_icon.mjs).
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
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    Buffer.from(px.buffer, px.byteOffset + y * w, w).copy(raw, y * (w + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Greyscale icon values from a .sav (count i32, then i32 per pixel).
function greyFromSav(u8) {
  const o = savLoad(u8);
  const bp = savFind(o.props, 'Blueprint').val[1];
  const raw = savFind(savFind(bp, 'Screenshot').val[1], 'GreyscaleValues').val[1];
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const n = dv.getInt32(0, true);
  const px = new Uint8Array(n);
  for (let i = 0; i < n; i++) px[i] = dv.getInt32(4 + 4 * i, true);
  return px;
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1400, height: 900}, acceptDownloads: true});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => { d.dismiss().catch(() => {}); });
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');

  const TXT = fs.readFileSync(IN, 'utf8');
  const ok = await pg.evaluate(t => __fb.importJson(t, true), TXT);
  chk('factory JSON imported', ok === true);

  await pg.click('#exp');
  await pg.waitForFunction(() => document.getElementById('dExp').open);
  const [dl] = await Promise.all([
    pg.waitForEvent('download', {timeout: 15000}),
    pg.click('#expSav'),
  ]);
  const buf = fs.readFileSync(await dl.path());
  chk('download is a GVAS .sav', dl.suggestedFilename().endsWith('.sav') && buf.toString('latin1', 0, 4) === 'GVAS', dl.suggestedFilename());

  const px = greyFromSav(Uint8Array.from(buf));
  chk('GreyscaleValues length 65536', px.length === 65536, `got ${px.length}`);
  let nz = 0, has255 = false, hasMid = false, mnx = 256, mny = 256, mxx = -1, mxy = -1;
  for (let i = 0; i < 65536; i++) {
    const v = px[i];
    if (v) {
      nz++;
      const x = i & 255, y = i >> 8;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
    if (v === 255) has255 = true;
    if (v >= 20 && v <= 120) hasMid = true;
  }
  chk('more than 2000 non-zero pixels', nz > 2000, `nz=${nz}`);
  chk('value 255 present (edges)', has255);
  chk('values 20..120 present (fills)', hasMid);
  const longest = Math.max(mxx - mnx + 1, mxy - mny + 1);
  chk('bbox longest side 245..255', longest >= 245 && longest <= 255, `got ${longest}`);
  chk('no page or console errors', errs.length === 0, errs.slice(0, 5).join('\n     '));

  fs.mkdirSync(OUT, {recursive: true});
  const outPng = path.join(OUT, `${BASE}.png`);
  fs.writeFileSync(outPng, pngGrey(px, 256, 256));
  chk('PNG written', fs.existsSync(outPng) && fs.statSync(outPng).size > 0, outPng);
  if (WANT_SAV) {
    const outSav = path.join(OUT, `${BASE}.sav`);
    fs.copyFileSync(await dl.path(), outSav);
    chk('.sav written', fs.existsSync(outSav), outSav);
  }
} catch (e) {
  chk('sav icon canvas run completed', false, String(e && e.stack || e));
} finally {
  await br.close();
}

console.log(`${fails.length ? 'FAIL' : 'PASS'} ${pass}/${total}`);
process.exitCode = fails.length ? 1 : 0;

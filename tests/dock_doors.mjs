// Industrial Dock (BPO_Dock_2): doors on every side except the ship side, at every rotation. Run: node tests/dock_doors.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext()).newPage();
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  for (const rot of [0, 1, 2, 3]) {
    const r = await pg.evaluate(rot => {
      const d = CATALOG.blocks.find(b => b.name === 'BPO_Dock_2');
      __fb.importJson(JSON.stringify({Version: 1, DisplayName: 't', Blocks: [{Class: d.class, GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: rot, BlockID: 1, PaletteID: 0}], DefaultMachines: []}));
      const a = __fb.areas(0), f = a.floors[0];
      return {eds: a.doors.map(x => x.ed).sort().join(''), w: f.w, h: f.h};
    }, rot);
    // doors on every side except the ship side (edge index = rot): long sides 2 doors, short ends 1 each
    const tall = r.h > r.w, n = ed => ed % 2 === 0 ? (tall ? 2 : 1) : (tall ? 1 : 2);
    const want = [0, 1, 2, 3].filter(ed => ed !== rot).flatMap(ed => Array(n(ed)).fill(ed)).join('');
    chk(`rot ${rot}: floor ${r.w}x${r.h}, doors ${want} (all sides but the ship side ${rot})`, r.eds === want, r.eds);
    // footprint 3x2 (rot 0/2) or 2x3 (rot 1/3); floor box = the end opposite DIR[rot] (station side)
    const fp = await pg.evaluate(() => {
      const b = __fb.S.blocks[0], d = dim(b), c = fcell(b);
      return {w: d.w, h: d.h, cx: c.cx - b.x, cy: c.cy - b.y, cw: c.cw, ch: c.ch};
    });
    const wantFp = {0: {w: 3, h: 2, cx: 0, cy: 0, cw: 1, ch: 2}, 1: {w: 2, h: 3, cx: 0, cy: 0, cw: 2, ch: 1},
      2: {w: 3, h: 2, cx: 2, cy: 0, cw: 1, ch: 2}, 3: {w: 2, h: 3, cx: 0, cy: 2, cw: 2, ch: 1}}[rot];
    chk(`rot ${rot}: footprint ${wantFp.w}x${wantFp.h}, floor box at ${wantFp.cx},${wantFp.cy} size ${wantFp.cw}x${wantFp.ch}`, JSON.stringify(fp) === JSON.stringify(wantFp), JSON.stringify(fp));
  }
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

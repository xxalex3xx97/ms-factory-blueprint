// Dock assembly geometry + slot pickers (js/nl_dock.js). Run: node tests/dock_asm.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
try {
  const pg = await (await br.newContext()).newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await pg.waitForFunction(() => window.__fb && typeof nlDockApply === 'function' && typeof nlIndAsm === 'function');
  const r = await pg.evaluate(() => {
    const A = nlIndAsm(), cells = new Map(); let ov = 0, oob = 0;
    const put = (x, y) => { const k = x + ',' + y; if (cells.has(k)) ov++; cells.set(k, 1); if (x < 0 || x > 29 || y < 0 || y > 13) oob++ };
    A.boxes.forEach(b => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) put(b.x + i, b.y + j) });
    A.belts.forEach(b => put(b.x, b.y));
    // 180 form: boxes (x,y)->(26-x,10-y), belts (x,y)->(29-x,13-y)
    const c2 = new Map(); let ov2 = 0, oob2 = 0;
    const put2 = (x, y) => { const k = x + ',' + y; if (c2.has(k)) ov2++; c2.set(k, 1); if (x < 0 || x > 29 || y < 0 || y > 13) oob2++ };
    A.boxes.forEach(b => { const x = 26 - b.x, y = 10 - b.y; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) put2(x + i, y + j) });
    A.belts.forEach(b => put2(29 - b.x, 13 - b.y));
    const nrm = nlOutSlots('nrm', [3, 40, 41], 4), ind = nlOutSlots('ind', [5, 20, 40, 60, 80], 4);
    return {nb: A.boxes.length, nk: A.belts.length, ov, oob, ov2, oob2, nrm, ind};
  });
  chk('assembly: 8 boxes, 64 belts', r.nb === 8 && r.nk === 64, JSON.stringify([r.nb, r.nk]));
  chk('assembly: inside 30x14, no overlap', r.ov === 0 && r.oob === 0, JSON.stringify([r.ov, r.oob]));
  chk('rot180 form: inside 30x14, no overlap', r.ov2 === 0 && r.oob2 === 0, JSON.stringify([r.ov2, r.oob2]));
  chk('nlOutSlots nrm strictly increasing on slots', r.nrm.every((x, i) => (i === 0 || x > r.nrm[i - 1]) && [6, 22].includes((x + 1) % 30)), JSON.stringify(r.nrm));
  const cols = new Set(r.ind.map(x => Math.floor(x / 30)));
  chk('nlOutSlots ind: 2 columns, lanes at 30c+{4,6,22,24}', cols.size === 2 && r.ind.every(x => [4, 6, 22, 24].includes(x % 30)), JSON.stringify(r.ind));
  // synthetic Normal input + output through nlDockApply
  const s = await pg.evaluate(() => {
    const cls = plcCls('BPO_Station_02'), box = 'DAT_Container_2', L = {mk: 0, dk: {in: 'nrm', out: 'nrm'}};
    const T = {ok: true, blocks: [{cls, x: 0, y: 0}], span: 0, ms: [{cls: box, x: 5, y: 1, rot: 0, ct: [{item: 'X', n: 0, inf: true}], dk: 'in'}, {cls: box, x: 5, y: 10, rot: 0, ct: [], dk: 'out'}]};
    const R = nlDockApply(L, T, cls);
    return {ok: R.ok, why: R.why, ov: R.ov, blocks: R.blocks, ys: R.ms && R.ms.map(m => m.y).slice(0, 2), n: R.ms && R.ms.length};
  });
  chk('synthetic nrm in+out: ok, ov 0, 3 blocks, shifted by one cell', s.ok && s.ov === 0 && s.blocks.length === 3 && s.blocks.some(b => b.y === 0 && b.rot === 3) && s.ys[0] === 17, JSON.stringify(s));
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

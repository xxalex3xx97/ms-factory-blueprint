// Built-plan ghost rotates with R (pasting.rot) and places rotated. Run: node tests/plan_rotate.mjs   Exit 1 on any failed check or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1400, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=old');
await pg.waitForFunction(() => window.__fb && typeof placerPaste === 'function' && typeof plT === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const r = await pg.evaluate(() => {
  const blockCls = CATALOG.blocks[0].class;
  const machCls = CATALOG.buildables.find(b => b.id === 'DAT_Container').id;
  STRICT = false; view = 'F'; layer = 0; sel = new Set(); drag = null; hoverIn = true;
  const pl = {blocks: [{cls: blockCls, x: 0, y: 0, rot: 0}, {cls: blockCls, x: 2, y: 0, rot: 0}],
    ms: [{cls: machCls, x: 0, y: 0, rot: 0}], plan: {item: 'x', rate: 1}};
  const key = P => P.blocks.map(q => [q.cls, q.x, q.y, q.rot || 0]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(a => a.join(','))
    .concat(P.ms.map(q => ['M', q.cls, q.x, q.y, q.rot || 0].join(','))).join('|');
  const p1 = plT(pl, 1), p2 = plT(p1, 1), p4 = plT(pl, 4), pz = plT(pl, 0);
  const A = p1.blocks.every(q => q.rot === 1) && key(p1) !== key(pl);
  const B = JSON.stringify(p2) === JSON.stringify(plT(pl, 2));
  const C = key(p4) === key(pl) && JSON.stringify(pz) === JSON.stringify({blocks: pl.blocks, ms: pl.ms});
  pasting = {rot: 0, fl: false, pl};
  hover = {x: 5, y: 5};
  const before = new Set(S.blocks.map(b => b.id));
  return {A, B, C, blockCls, machCls, before: [...before], sizes: [p1.blocks.length, p1.ms.length]};
});
check(r.A, 'A plT(pl,1): all blocks rot 1 and positions differ from n=0');
check(r.B, 'B plT(plT(pl,1),1) equals plT(pl,2)');
check(r.C, 'C plT(pl,4) equals pl (and n=0 is identity)');

await pg.evaluate(() => { hover = {x: 5, y: 5}; hoverIn = true; });
await pg.keyboard.press('r');
const rot = await pg.evaluate(() => pasting && pasting.rot);
check(rot === 1, 'D press r -> pasting.rot === 1 (got ' + rot + ')');
const placed = await pg.evaluate(() => {
  const before = new Set(S.blocks.map(b => b.id));
  placerPaste();
  const news = S.blocks.filter(b => !before.has(b.id));
  return {n: news.length, rots: news.filter(b => b.cls !== 'DAT_Container').map(b => b.rot), ms: news.filter(b => b.cls === 'DAT_Container').length, pasting: !!pasting};
});
check(placed.rots.length === 2 && placed.rots.every(x => x === 1), 'D placerPaste places 2 blocks, all rot 1 (' + JSON.stringify(placed) + ')');
check(placed.ms === 1, 'D placed 1 machine');
check(errs.length === 0, 'E no pageerror' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
await br.close();
process.exit(fails ? 1 : 0);

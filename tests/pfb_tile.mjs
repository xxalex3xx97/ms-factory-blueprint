// pfBands step 1: placerCut with L.tall (virtual tall canvas) cuts a synthetic 2x2 layout into 4 blocks (same wall grid as L.bank).
// Layout (floor cells, 60 x 60): east belts y=5,40 and west belt y=10 cross the column wall x=30; a vertical lane x=15 (flows +y) crosses the row wall y=30.
// Checks: ok, ov 0, span 0, 4 blocks (2x2), underground cells = 2 * crossings (3 column-wall pairs + 1 row-wall pair),
// and a lone west belt at a column wall (mismatch) is refused.
// Run:  node tests/pfb_tile.mjs     Exit code 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerCut === 'function' && typeof plcOcc === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const r = await pg.evaluate(() => {
  const CLS = plcCls('BPO_Station_02'), BELT = PLC_BELT[0], UG = PLC_UG[0];
  const it = [];
  const bl = (x, y, rot) => it.push({cls: BELT, x, y, h: 0, rot, pid: 0});
  for (const y of [5, 40]) for (let x = 0; x < 60; x++) if (x !== 15) bl(x, y, 0);   // east belts across x=30
  for (let x = 0; x < 60; x++) if (x !== 15) bl(x, 10, 2);                            // west belt across x=30
  for (let y = 0; y < 60; y++) bl(15, y, 1);                                          // vertical lane across y=30
  const L = {tall: true, items: it, w: 60, h: 60, mk: 0, pitch: 1};
  const T = placerCut(L, CLS);
  const ugCells = T.ok ? T.ms.filter(m => m.cls === UG).length : -1;
  // lone west belt at the column wall: its partner cell is empty, so the wall cannot be cut there
  const IT2 = [{cls: BELT, x: 30, y: 20, h: 0, rot: 2, pid: 0}];
  const T2 = plcTryCut(IT2, plcOcc(IT2), 30, true, 30);   // direct: null = wall refused at column 30
  return {ok: T.ok, why: T.ok ? '' : String(T.why), ov: T.ov, span: T.span, blocks: T.blocks ? T.blocks.length : -1,
    cols: T.cols, rows: T.rows, ug: ugCells, lone: T2 !== null};
});
console.log(JSON.stringify(r));
const CROSSINGS = 4;
check(r.ok, 'placerCut ok' + (r.ok ? '' : ' (' + r.why + ')'));
check(r.ov === 0, 'no overlap (ov ' + r.ov + ')');
check(r.span === 0, 'no UG pair longer than Mk span (span ' + r.span + ')');
check(r.blocks === 4 && r.cols === 2 && r.rows === 2, '4 blocks in 2x2 (' + r.blocks + ', ' + r.cols + 'x' + r.rows + ')');
check(r.ug === 2 * CROSSINGS, 'underground cells = 2 x crossings (' + r.ug + ' vs ' + 2 * CROSSINGS + ')');
check(r.lone === false, 'lone west belt at column wall refused');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

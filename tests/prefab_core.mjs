// Prefab core (step 1): pfBus(2,10,0) placed at gx 0 and gx 1 -> 0 overlaps, seams ok; memo returns the same object for equal args; a forced overlap is caught.
// Run:  node tests/prefab_core.mjs     Exit code 1 on any failed check or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfPlace === 'function' && typeof placerLayout === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const r = await pg.evaluate(() => {
  const P1 = pfBus(2, 10, 0), P2 = pfBus(2, 10, 0);
  const A = pfPlace({id: 1, proto: 'pfBus', args: [2, 10, 0], at: {gx: 0, gy: 0}});
  const B = pfPlace({id: 2, proto: 'pfBus', args: [2, 10, 0], at: {gx: 1, gy: 0}});
  const both = {w: 2 * PF_GRID.cw, h: 2, items: [...A, ...B], ports: P1.ports};
  const bad = {w: 10, h: 2, items: [P1.items[0], P1.items[0]], ports: P1.ports};   // same cell twice
  const cellsB = [...new Set(B.map(b => b.x + ',' + b.y))].length;
  return {
    both: pfCheck(both), single: pfCheck(P1), bad: pfCheck(bad),
    same: P1 === P2, sameArgsIdx: pfKey('pfBus', [2, 10, 0]) === pfKey('pfBus', [2, 10, 0]),
    countA: A.length, countB: B.length, shiftB: Math.min(...B.map(b => b.x)), uniqIds: new Set([...A, ...B].map(b => b.id)).size,
    distinctCells: cellsB, cls: A[0].cls,
  };
});
check(r.both.ok && r.both.ov === 0 && r.both.seamBad === 0, 'two pfBus(2,10,0) at gx 0 and gx 1: 0 overlaps, seams ok (' + JSON.stringify(r.both) + ')');
check(r.single.ok, 'single pfBus(2,10,0) passes pfCheck');
check(!r.bad.ok && r.bad.ov > 0, 'forced double cell is caught by pfCheck (ov ' + r.bad.ov + ')');
check(r.same, 'memo: pfBus(2,10,0) twice returns the same object');
check(r.sameArgsIdx, 'pfKey stable for equal args');
check(r.countA === 20 && r.countB === 20 && r.uniqIds === 40, 'instances: 20 belts each, 40 unique ids');
check(r.shiftB === 30, 'gx 1 translates by PF_GRID.cw (min x = ' + r.shiftB + ')');
check(r.cls === 'DAT_ConveyorBelt', 'belt class from PLC_BELT[0] (' + r.cls + ')');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

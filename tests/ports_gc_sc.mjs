// GrowthChamber and Supercomputer: 7x7, identical ports, positions 3 and 5 (cells 2 and 4 of 7) on every side (user 2026-11-14).
// Checks portsOf (catalog) and PORT_ORDER cells (half cells, centre origin). Run: node tests/ports_gc_sc.mjs   Exit 1 on FAIL.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await br.newPage();
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof portsOf === 'function');
const R = await pg.evaluate(() => {
  const o = {};
  for (const c of ['DAT_GrowthChamber', 'DAT_Supercomputer']) o[c] = {
    cells: portsOf({cls: c, x: 0, y: 0, rot: 0, off: []}).map(p => p.f + ':' + p.x + ',' + p.y).sort(),
    order: PORT_ORDER[c].cells.map(q => q.join(',')).sort(), ver: PORT_ORDER[c].verified};
  return o;
});
await br.close();
const WANT = ['N:2,0', 'N:4,0', 'E:6,2', 'E:6,4', 'S:2,6', 'S:4,6', 'W:0,2', 'W:0,4'].sort();
const WANTO = ['7,-2', '7,2', '2,7', '-2,7', '-7,2', '-7,-2', '-2,-7', '2,-7'].sort();
let fails = 0;
const check = (ok, m) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) fails++ };
const [g, s] = [R.DAT_GrowthChamber, R.DAT_Supercomputer];
check(JSON.stringify(g.cells) === JSON.stringify(s.cells), 'portsOf identical');
check(JSON.stringify(g.cells) === JSON.stringify(WANT), 'portsOf = positions 3 and 5 on every side: ' + g.cells);
check(JSON.stringify(g.order) === JSON.stringify(s.order), 'PORT_ORDER identical');
check(JSON.stringify(g.order) === JSON.stringify(WANTO), 'PORT_ORDER cells (half cells ±2, edge 7)');
check(g.ver && s.ver, 'PORT_ORDER verified (user statement)');
process.exit(fails ? 1 : 0);

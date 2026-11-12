// pfBands step 4: pfGutter
// Run:  node tests/pfb_gutter.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfGutter === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const G = (links, y0, y1) => pg.evaluate(([links, y0, y1]) => {
  const r = pfGutter(links, y0, y1, 1);
  return {...r, ug: PLC_UG[1], bc: PLC_BELT[1], mx: def(PLC_UG[1]).maxApart};
}, [links, y0, y1]);
function trace(r, l, y0, y1) {
  const m = new Map(r.items.map(i => [i.x + ',' + i.y, i])), D = [[1,0],[0,1],[-1,0],[0,-1]];
  let x = l.sx, y = y0, jumped = false;
  for (let n = 0; n < 3000; n++) {
    if (y >= y1) return x === l.tx && y === y1;
    const c = m.get(x + ',' + y); if (!c) return false;
    const [dx, dy] = D[c.rot];
    if (c.cls === r.ug && !jumped) {
      let k = 1;
      while (k < r.mx) { const q = m.get((x + dx * k) + ',' + (y + dy * k)); if (q && q.cls === r.ug && q.rot === c.rot) break; k++ }
      if (k >= r.mx) return false;
      x += dx * k; y += dy * k; jumped = true; continue;
    }
    jumped = false; x += dx; y += dy;
  }
  return false;
}
const allOk = (r, links, y0, y1) => r.ok && links.every(l => trace(r, l, y0, y1)) && new Set(r.items.map(i => i.x + ',' + i.y)).size === r.items.length;
const nUG = r => r.items.filter(i => i.cls === r.ug).length;
const rowsOf = r => [...new Set(r.items.filter(i => i.rot === 0 || i.rot === 2).map(i => i.y))].sort((a, b) => a - b);

// 1 straight
{
  const links = [{id:'a',sx:10,tx:10}], r = await G(links, 3, 20);
  check(allOk(r, links, 3, 20) && r.tracks === 0 && r.items.length === 17 && nUG(r) === 0, 'straight: ok, 0 tracks, 17 items, 0 UG (' + r.items?.length + ' items, ' + r.tracks + ' tracks)');
}
// 2 west
{
  const links = [{id:'a',sx:15,tx:10}], r = await G(links, 3, 20);
  check(allOk(r, links, 3, 20) && r.tracks === 1 && r.items.some(i => i.x === 15 && i.y === 5 && i.rot === 2) && nUG(r) === 0, 'west: ok, 1 track, (15,5) rot 2, 0 UG (tracks ' + r.tracks + ')');
}
// 3 east
{
  const links = [{id:'a',sx:10,tx:15}], r = await G(links, 3, 20);
  check(allOk(r, links, 3, 20) && r.tracks === 1 && r.items.some(i => i.x === 10 && i.y === 5 && i.rot === 0) && nUG(r) === 0, 'east: ok, 1 track, (10,5) rot 0, 0 UG (tracks ' + r.tracks + ')');
}
// 4 crossing: a 10->20 passes under b's straight column 15
{
  const links = [{id:'a',sx:10,tx:20},{id:'b',sx:15,tx:15}], r = await G(links, 3, 20);
  check(allOk(r, links, 3, 20) && nUG(r) === 2, 'cross straight under track: ok, 2 UG (' + nUG(r) + ')');
}
// 5 two tracks, crossings
{
  const links = [{id:'a',sx:10,tx:20},{id:'b',sx:12,tx:18}], r = await G(links, 3, 30);
  check(allOk(r, links, 3, 30) && r.tracks === 2 && nUG(r) === 2, 'nested pair: ok, 2 tracks, 2 UG (tracks ' + r.tracks + ', UG ' + nUG(r) + ')');
}
// 6 A.sx==B.tx => A track above B
{
  const links = [{id:'a',sx:10,tx:14},{id:'b',sx:14,tx:18}], r = await G(links, 3, 30);
  const rowAt = x => { const it = r.items.find(i => i.x === x && (i.rot === 0 || i.rot === 2)); return it ? it.y : -1 };
  check(allOk(r, links, 3, 30) && r.tracks === 2 && rowAt(16) < rowAt(12) && rowAt(16) >= 0, 'chain: ok, 2 tracks, b (14->18) above a (10->14) (b row ' + rowAt(16) + ', a row ' + rowAt(12) + ')');
}
// 7 order cycle
{
  const links = [{id:'a',sx:10,tx:14},{id:'b',sx:14,tx:10}], r = await G(links, 3, 30);
  check(r.ok === false && r.why === 'gutter order cycle', 'cycle: ' + r.ok + ' / ' + r.why);
}
// 8 duplicate source column
{
  const links = [{id:'a',sx:10,tx:12},{id:'b',sx:10,tx:14}], r = await G(links, 3, 30);
  check(r.ok === false && r.why === 'gutter cells clash', 'dup sx: ' + r.ok + ' / ' + r.why);
}
// 9 wall-row skip
{
  const links = [{id:'a',sx:10,tx:20},{id:'b',sx:12,tx:18},{id:'c',sx:14,tx:16}], r = await G(links, 22, 45);
  const rows = rowsOf(r);
  check(allOk(r, links, 22, 45) && r.tracks === 3 && JSON.stringify(rows) === '[24,27,32]' && rows.every(y => [2, 27].includes(y % 30) || (y % 30 >= 2 && y % 30 <= 27)), 'wall-row skip: ok, 3 tracks, rows ' + JSON.stringify(rows) + ' tracks ' + r.tracks);
}
// 10 too short
{
  const r1 = await G([{id:'a',sx:10,tx:20},{id:'b',sx:12,tx:18}], 3, 8);
  check(r1.ok === false && r1.why === 'gutter too short', 'short 2 links: ' + r1.ok + ' / ' + r1.why);
  const r2 = await G([{id:'a',sx:10,tx:20}], 3, 6);
  check(r2.ok === false && r2.why === 'gutter too short', 'short 1 link: ' + r2.ok + ' / ' + r2.why);
}
check(await pg.evaluate(() => PF_BANDS) === false, 'PF_BANDS still false');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

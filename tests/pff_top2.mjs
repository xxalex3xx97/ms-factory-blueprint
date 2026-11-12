// pfFact2 S4: full factory layout via pfFactTop2 (direct call, no dispatch, no sim).
// Per case: ok; pfCheck ov 0 + seamBad 0; placerTile ok, ov 0, span 0; one S port; exactly one sink (empty box at port x, bottom of layout);
// no UG/splitter/belt-turn on a wall column (x mod 30 in {0,29}); no S-curve (trunk = one horizontal run, feed leg above it).
// Budget numbers are printed only (no gates): blocks, belts, machines, belts/machine, w, h.
// Run:  timeout 120 node tests/pff_top2.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTop2 === 'function' && typeof pfBusAssign === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// browser helper: returns {refused} or the metrics + fail list
const runCase = c => {
  const MK = 1, SP = 1;
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfFactTop2(P, it, MK, SP, {box: 'DAT_Container_2'});
  if (L.ok === false) return {refused: L.why};
  const fails = [], out = {};
  const pc = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports});
  out.ov = pc.ov; out.seamBad = pc.seamBad;
  if (pc.ov !== 0) fails.push('pfCheck ov ' + pc.ov);
  if (pc.seamBad !== 0) fails.push('pfCheck seamBad ' + pc.seamBad);
  const T = placerTile(L, placerBk());
  out.tileOk = T.ok; out.tileWhy = T.ok ? '' : String(T.why).slice(0, 160);
  out.blocks = T.ok ? T.blocks.length : null;
  out.tileOv = T.ov; out.tileSpan = T.span;
  if (!T.ok) fails.push('placerTile: ' + out.tileWhy);
  if (T.ok && T.ov !== 0) fails.push('placerTile ov ' + T.ov);
  if (T.ok && T.span !== 0) fails.push('placerTile span ' + T.span);
  out.w = L.w; out.h = L.h;
  out.nFact = L.note[0];
  // sink: exactly one empty box at the port x whose bottom edge is the layout bottom
  const sinks = L.ports.length ? L.items.filter(q => q.cls === PLC_BOX && q.ct && q.ct.length === 0 && q.x === L.ports[0].off && q.y + def(PLC_BOX).h === L.h) : [];
  out.sinks = sinks.length;
  if (sinks.length !== 1) fails.push('sinks ' + sinks.length);
  out.ports = L.ports.length; out.portEdge = L.ports.map(p => p.edge).join(',');
  if (L.ports.length !== 1) fails.push('ports ' + L.ports.length);
  if (L.ports.some(p => p.edge !== 'S')) fails.push('port not on S');
  const wallBad = L.items.filter(q => [0, 29].includes(((q.x % 30) + 30) % 30) && (PLC_UG.includes(q.cls) || PLC_SPL.includes(q.cls)));
  const byXY = new Map(L.items.map(q => [q.x + ',' + q.y, q]));
  const turnBad = L.items.filter(q => PLC_BELT.includes(q.cls) && q.rot === 0 && [0, 29].includes(((q.x % 30) + 30) % 30) && byXY.get(q.x + ',' + (q.y - 1)) && PLC_BELT.includes(byXY.get(q.x + ',' + (q.y - 1)).cls) && byXY.get(q.x + ',' + (q.y - 1)).rot === 1);
  out.wallBad = wallBad.length; out.turnBad = turnBad.length;
  if (wallBad.length) fails.push('UG/splitter on wall column x ' + wallBad.map(q => q.x + ',' + q.y).join(' '));
  if (turnBad.length) fails.push('belt turn on wall column ' + turnBad.map(q => q.x + ',' + q.y).join(' '));
  out.belts = L.items.filter(q => PLC_BELT.includes(q.cls) || PLC_UG.includes(q.cls)).length;
  out.machines = L.items.filter(q => q.rec).length;
  out.perM = out.machines ? +(out.belts / out.machines).toFixed(1) : null;
  return {fails, out};
};

const cases = [
  {name: 'Basic Circuits', rate: 10},
  {name: 'Magnetic Coils', rate: 30},
  {name: 'Nickel Plates', rate: 30},
  {name: 'Advanced Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 50},
];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(runCase, c);
  if (r.refused) { check(false, tag + ': refused: ' + r.refused); continue }
  const o = r.out;
  console.log(tag + ': w ' + o.w + ' h ' + o.h + ' blocks ' + o.blocks + ' belts ' + o.belts + ' machines ' + o.machines + ' belts/machine ' + o.perM + ' ports ' + o.ports + ' ' + o.portEdge + ' sinks ' + o.sinks + ' ' + o.nFact);
  if (!o.tileOk) console.log('  tile why: ' + o.tileWhy);
  check(r.fails.length === 0, tag + ': layout checks' + (r.fails.length ? ' (' + r.fails.slice(0, 8).join('; ') + ')' : ''));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// pfFact2 S4: reusable count/exactness check. Env TOP = layout function name (default pfFactTop2), same signature (P,item,mk,spMk,o).
// Per case prints one JSON line: belts (belt+UG), byRole (L.stat), machines (q.rec), planner, builtSizes, plus1, blocks, w, h, occupancy, beltsPerMachine.
// Hard checks: machines===builtSizes; every item built-N in {0,1}; BC 10 and MC 30 plus1===0; tile ok, ov 0, span 0; exactly one sink; one port on S.
// NO belt/block gates (numbers only).
// Run:  TOP=pfFactTop2 timeout 120 node tests/pff_count.mjs     Exit code 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOP = process.env.TOP || 'pfFactTop2';
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTop2 === 'function' && typeof pfFactTop === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const runCase = ([c, TOP]) => {
  const MK = 1, SP = 1;
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = window[TOP](P, it, MK, SP, {box: 'DAT_Container_2'});
  if (L.ok === false) return {refused: L.why};
  const fails = [];
  const belts = L.items.filter(q => PLC_BELT.includes(q.cls) || PLC_UG.includes(q.cls)).length;
  const machines = L.items.filter(q => q.rec).length;
  const sizes = L.sizes || [];
  const planner = sizes.reduce((a, s) => a + P.nodes[s.item].machines, 0);
  const builtSizes = sizes.reduce((a, s) => a + s.built, 0);
  const plus1 = sizes.filter(s => s.built > s.N).length;
  for (const s of sizes) if (![0, 1].includes(s.built - s.N)) fails.push('built-N ' + (s.built - s.N) + ' for item ' + plnNm(s.item));
  if (machines !== builtSizes) fails.push('machines ' + machines + ' != builtSizes ' + builtSizes);
  if (['Basic Circuits', 'Magnetic Coils'].includes(c.name) && c.rate === (c.name === 'Basic Circuits' ? 10 : 30) && plus1 !== 0) fails.push('plus1 ' + plus1);
  const pc = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports});
  if (pc.ov !== 0) fails.push('pfCheck ov ' + pc.ov);
  if (pc.seamBad !== 0) fails.push('pfCheck seamBad ' + pc.seamBad);
  const T = placerTile(L, placerBk());
  if (!T.ok) fails.push('placerTile: ' + String(T.why).slice(0, 160));
  if (T.ok && T.ov !== 0) fails.push('placerTile ov ' + T.ov);
  if (T.ok && T.span !== 0) fails.push('placerTile span ' + T.span);
  const sinks = L.ports.length ? L.items.filter(q => q.cls === PLC_BOX && q.ct && q.ct.length === 0 && q.x === L.ports[0].off && q.y + def(PLC_BOX).h === L.h) : [];
  if (sinks.length !== 1) fails.push('sinks ' + sinks.length);
  if (L.ports.length !== 1) fails.push('ports ' + L.ports.length);
  if (L.ports.some(p => p.edge !== 'S')) fails.push('port not on S');
  const area = L.items.reduce((a, q) => { const d = dim(q); return a + d.w * d.h }, 0);
  return {fails, out: {
    case: c.name + ' ' + c.rate, belts, byRole: L.stat, machines, planner, builtSizes, plus1,
    blocks: T.ok ? T.blocks.length : null, w: L.w, h: L.h,
    occupancy: +(area / (L.w * L.h)).toFixed(3), beltsPerMachine: machines ? +(belts / machines).toFixed(1) : null,
  }};
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
  const r = await pg.evaluate(runCase, [c, TOP]);
  if (r.refused) { check(false, tag + ': refused: ' + r.refused); continue }
  console.log(JSON.stringify(r.out));
  check(r.fails.length === 0, tag + ': checks' + (r.fails.length ? ' (' + r.fails.slice(0, 8).join('; ') + ')' : ''));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

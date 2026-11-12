// pfFact2 R1+R2: raw dock blocks (one PF_DOCK x PF_DOCK = 60x60 block per raw item) and raw lanes straight down from the container.
// Per case: ok; pfCheck ov 0 + seamBad 0; placerTile ok, ov 0, span 0; one S port; exactly one sink (empty box at port x, bottom of layout).
// Bus mode: every raw container fully inside one aligned 60-col block, y+bh<=60; blocks of different raw items disjoint;
// stat.dockBlocks === distinct blocks used; each raw container's S-port column is a straight vertical chain down to a splitter or horizontal corner belt (rot 0 east or rot 2 west: the one L-bend into the track) at y>=60.
// Direct mode (nRows 1, from note): stat.dockBlocks === 0.
// Budget numbers are printed only (no gates): blocks, belts, machines, belts/machine, w, h.
// Run:  timeout 120 node tests/pff_dock.mjs     Exit code 1 on FAIL or page error.
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
  const MK = 1, SP = 1, DK = 60;
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfFactTop2(P, it, MK, SP, {box: 'DAT_Container_2'});
  if (L.ok === false) return {refused: L.why};
  const fails = [], out = {};
  const bw = def(PLC_BOX).w, bh = def(PLC_BOX).h;
  const sp = portsOf({cls: PLC_BOX, x: 0, y: 0, rot: 0, off: []}).filter(p => p.f === 'S').sort((a, b) => a.x - b.x)[0];
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
  const sinks = L.ports.length ? L.items.filter(q => q.cls === PLC_BOX && q.ct && q.ct.length === 0 && q.x === L.ports[0].off && q.y + bh === L.h) : [];
  out.sinks = sinks.length;
  if (sinks.length !== 1) fails.push('sinks ' + sinks.length);
  out.ports = L.ports.length; out.portEdge = L.ports.map(p => p.edge).join(',');
  if (L.ports.length !== 1) fails.push('ports ' + L.ports.length);
  if (L.ports.some(p => p.edge !== 'S')) fails.push('port not on S');
  // raw containers
  const raws = L.items.filter(q => q.cls === PLC_BOX && q.ct && q.ct[0] && q.ct[0].inf);
  out.raws = raws.length;
  const byXY = new Map(L.items.map(q => [q.x + ',' + q.y, q]));
  const blockOf = new Map();   // 60-block index -> item
  const blocksUsed = new Set();
  let dockOk = true;
  if (L.stat.dockBlocks === 0 && raws.length) { dockOk = false; fails.push('raw containers but dockBlocks 0') }
  const nRows = +(/, (\d+) rows,/.exec(L.note[0])||[0,0])[1];
  if (nRows === 1) {
    if (L.stat.dockBlocks !== 0) fails.push('direct: dockBlocks ' + L.stat.dockBlocks);
  } else {
    for (const q of raws) {
      const k0 = Math.floor(q.x / DK), k1 = Math.floor((q.x + bw - 1) / DK);
      if (k0 !== k1) { fails.push('raw container x ' + q.x + ' crosses 60-block'); dockOk = false; continue }
      if (q.y + bh > DK) fails.push('raw container y+bh ' + (q.y + bh) + ' > 60');
      const item = q.ct[0].item;
      if (blockOf.has(k0) && blockOf.get(k0) !== item) fails.push('60-block ' + k0 + ' shared by two raw items');
      blockOf.set(k0, item); blocksUsed.add(k0);
      // straight vertical chain from container bottom down to a splitter or east corner belt (rot 0) at y>=60
      const col = q.x + sp.x;
      let y = q.y + bh, prev = null, end = null, steps = 0;
      while (steps++ < 2000) {
        const cur = byXY.get(col + ',' + y);
        if (!cur) { if (prev && PLC_UG.includes(prev.cls)) { y++; continue } break }
        if (PLC_SPL.includes(cur.cls)) { end = {kind: 'spl', y}; break }
        if (PLC_BELT.includes(cur.cls) && (cur.rot === 0 || cur.rot === 2)) { end = {kind: 'corner', y, rot: cur.rot}; break }
        if (PLC_BELT.includes(cur.cls) && cur.rot === 1) { prev = cur; y++; continue }
        if (PLC_UG.includes(cur.cls)) { prev = cur; y++; continue }
        end = {kind: 'bad ' + cur.cls + ' rot ' + cur.rot, y}; break;
      }
      if (!end || end.kind.startsWith('bad') || end.y < DK) fails.push('raw ' + item + ' at ' + q.x + ',' + q.y + ': chain end ' + JSON.stringify(end));
    }
    const distinct = blocksUsed.size;
    out.dockBlocks = L.stat.dockBlocks;
    if (L.stat.dockBlocks !== distinct) fails.push('dockBlocks ' + L.stat.dockBlocks + ' !== distinct ' + distinct);
  }
  out.blocksDock = blocksUsed.size;
  out.belts = L.items.filter(q => PLC_BELT.includes(q.cls) || PLC_UG.includes(q.cls)).length;
  out.machines = L.items.filter(q => q.rec).length;
  out.perM = out.machines ? +(out.belts / out.machines).toFixed(1) : null;
  return {fails, out};
};

const cases = [
  {name: 'Basic Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 50},
  {name: 'Magnetic Coils', rate: 30},
];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(runCase, c);
  if (r.refused) { check(false, tag + ': refused: ' + r.refused); continue }
  const o = r.out;
  console.log(tag + ': w ' + o.w + ' h ' + o.h + ' blocks ' + o.blocks + ' dockBlocks ' + o.dockBlocks + ' raws ' + o.raws + ' belts ' + o.belts + ' machines ' + o.machines + ' belts/machine ' + o.perM + ' ports ' + o.ports + ' ' + o.portEdge + ' sinks ' + o.sinks + ' ' + o.nFact);
  if (!o.tileOk) console.log('  tile why: ' + o.tileWhy);
  check(r.fails.length === 0, tag + ': layout checks' + (r.fails.length ? ' (' + r.fails.slice(0, 8).join('; ') + ')' : ''));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

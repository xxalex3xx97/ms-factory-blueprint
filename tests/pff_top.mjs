// pfFact step 4d+5: full factory layout via pfFactTop (direct call, no dispatch, no sim).
// Per case: ok; pfCheck ov 0 + seamBad 0; placerTile ok, ov 0, span 0; one collector under the S port; one S port; no UG/splitter/belt-turn on a wall column (x mod 30 in {0,29});
// diamond item: one factory, its links cover every consumer head; each link = feed leg + one horizontal trunk (no S-curve).
// Budget reports (not hard fails unless noted): BC 10 blocks<=2 belts<=70; AC 10/50 belts/machine<=40.
// Run:  timeout 120 node tests/pff_top.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTop === 'function' && typeof pfFactAlloc === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// browser helper: returns {refused} or the metrics + fail list
const runCase = c => {
  const MK = 1, SP = 1;
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfFactTop(P, it, MK, SP, {box: 'DAT_Container_2'});
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
  const colls = L.ports.length ? L.items.filter(q => q.cls === PLC_BOX && q.ct && q.ct.length === 0 && q.x === L.ports[0].off).length : 0;
  out.collectors = colls;
  if (colls !== 1) fails.push('collectors ' + colls);
  out.ports = L.ports.length; out.portEdge = L.ports.map(p => p.edge).join(',');
  if (L.ports.length !== 1) fails.push('ports ' + L.ports.length);
  if (L.ports.some(p => p.edge !== 'S')) fails.push('port not on S');
  const wallBad = L.items.filter(q => [0, 29].includes(((q.x % 30) + 30) % 30) && (PLC_UG.includes(q.cls) || PLC_SPL.includes(q.cls)));
  const byXY = new Map(L.items.map(q => [q.x + ',' + q.y, q]));
  const turnBad = L.items.filter(q => PLC_BELT.includes(q.cls) && q.rot === 0 && [0, 29].includes(((q.x % 30) + 30) % 30) && byXY.get(q.x + ',' + (q.y - 1)) && PLC_BELT.includes(byXY.get(q.x + ',' + (q.y - 1)).cls) && byXY.get(q.x + ',' + (q.y - 1)).rot === 1);
  out.wallBad = wallBad.length; out.turnBad = turnBad.length;
  if (wallBad.length) fails.push('UG/splitter on wall column x ' + wallBad.map(q => q.x + ',' + q.y).join(' '));
  if (turnBad.length) fails.push('belt turn on wall column ' + turnBad.map(q => q.x + ',' + q.y).join(' '));
  // trunks: each link with t>=0 is feed leg (rot1 or UG) above a single horizontal run from xp to its last head
  const cellAt = (x, y) => byXY.get(x + ',' + y);
  let trunks = 0, sBad = 0;
  for (const l of L.links) {
    if (l.t < 0) continue;
    trunks++;
    const last = l.heads[l.heads.length - 1];
    for (let x = l.xp; x <= last; x++) if (!cellAt(x, l.t)) { sBad++; fails.push('trunk gap at ' + x + ',' + l.t); break }
    const f = cellAt(l.xp, l.t - 1);
    if (!f || !(f.rot === 1 || PLC_UG.includes(f.cls))) { sBad++; fails.push('feed leg missing above trunk at x ' + l.xp) }
    for (const hx of l.heads) { const e = cellAt(hx, l.t + 1); if (!e) { sBad++; fails.push('head leg missing at x ' + hx) } }
  }
  out.trunks = trunks;
  // diamond: producer with >=2 consumers: one factory (one node), links cover each consumer's heads exactly
  const Z = pfFactTree(P, it, MK);
  const SZ = new Map();
  for (const nd of Z.nodes) { const s = pfFactSizeTile(nd, MK); SZ.set(nd.item, {T: s.T, M: s.M, K: s.K, nd}) }
  const AL = pfFactAlloc(Z, SZ, MK, SP);
  const cons = nd => [...new Set(nd.cons.map(q => q.to))];
  const multi = Z.nodes.filter(n => n.item !== it && cons(n).length >= 2);
  out.diamonds = multi.map(n => plnNm(n.item)).join(',');
  for (const nd of multi) {
    const nm = plnNm(nd.item);
    if (Z.nodes.filter(n => n.item === nd.item).length !== 1) fails.push(nm + ': not one node');
    for (const k of cons(nd)) {
      const Sk = SZ.get(k);
      const rel = [];
      for (let j = 0; j < Sk.K; j++) Sk.T.ins.filter(p => p.item === nd.item).forEach(p => rel.push(p.x + j * Sk.T.w));
      const lk = L.links.filter(l => l.p === nd.item && l.c === k);
      const got = lk.flatMap(l => l.heads).sort((a, b) => a - b);
      if (got.length !== rel.length) { fails.push(nm + '->' + plnNm(k) + ': heads ' + got.length + ' != ' + rel.length); continue }
      const base = Math.min(...got) - Math.min(...rel);
      if (rel.some((r, i) => got[i] !== r + base)) fails.push(nm + '->' + plnNm(k) + ': heads do not match consumer ins');
    }
  }
  out.belts = L.items.filter(q => PLC_BELT.includes(q.cls) || PLC_UG.includes(q.cls)).length;
  out.machines = L.items.filter(q => q.rec).length;
  out.perM = out.machines ? +(out.belts / out.machines).toFixed(1) : null;
  out.sBad = sBad;
  return {fails, out};
};

const cases = [
  {name: 'Basic Circuits', rate: 10, bc10: true},
  {name: 'Magnetic Coils', rate: 30},
  {name: 'Advanced Circuits', rate: 10, ac: true},
  {name: 'Advanced Circuits', rate: 50, ac: true},
];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(runCase, c);
  if (r.refused) { check(false, tag + ': refused: ' + r.refused); continue }
  const o = r.out;
  console.log(tag + ': w ' + o.w + ' h ' + o.h + ' blocks ' + o.blocks + ' belts ' + o.belts + ' machines ' + o.machines + ' belts/machine ' + o.perM + ' ports ' + o.ports + ' ' + o.portEdge + ' collectors ' + o.collectors + ' trunks ' + o.trunks + ' diamonds [' + o.diamonds + '] ' + o.nFact);
  if (!o.tileOk) console.log('  tile why: ' + o.tileWhy);
  check(r.fails.length === 0, tag + ': layout checks' + (r.fails.length ? ' (' + r.fails.slice(0, 8).join('; ') + ')' : ''));
  if (c.bc10) {
    check(o.blocks !== null && o.blocks <= 2, tag + ': blocks ' + o.blocks + ' <= 2');
    check(o.belts <= 70, tag + ': belts ' + o.belts + ' <= 70');
  }
  if (c.ac) check(o.perM !== null && o.perM <= 40, tag + ': belts/machine ' + o.perM + ' <= 40');
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

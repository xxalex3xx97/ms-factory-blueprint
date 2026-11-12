// LC S5 lcPlan geometry gates. Run: node tests/lc_plan.mjs   Exit 1 on FAIL or page error.
// Gates: cells pairwise disjoint; no lane column crosses a foreign cell; terminals pass pfFitX; every route <=2 turns (straight/jog/tap+L);
// machine count per item == planner N. Prints lanes, w x h, cells, UG crossings.
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
await pg.waitForFunction(() => window.__fb && typeof plan === 'function' && typeof lcFlow === 'function' && typeof lcPlan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [['Basic Circuits', 10], ['Advanced Circuits', 10], ['Advanced Circuits', 50], ['Basic Motor', 60]];
for (const [name, rate] of cases) {
  const r = await pg.evaluate(([name, rate]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const F = lcFlow(P, it, 1);
    if (!F.ok) return {refused: F.why};
    const t0 = performance.now(), L = lcPlan(F, 1), ms = performance.now() - t0;
    if (!L.ok) return {refused: L.why};
    // geometry gates inside page (pfFitX lives here)
    const occ = new Map(); let ov = 0, fit = 0;
    for (const c of L.cells) {
      for (let y = c.oy; y < c.oy + c.h; y++) for (let x = c.ox; x < c.ox + c.w; x++) { const k = y * 100000 + x; if (occ.has(k)) ov++; else occ.set(k, c.id) }
      for (const q of c.ins) if (!pfFitX(c.ox + q.x, 1, true)) fit++;
      if (!pfFitX(c.ox + c.out.x, 1, true)) fit++;
      if (c.w <= 28 && !pfFitX(c.ox, c.w)) fit++;
    }
    let lane = 0;   // lane segment x, y0..y1 must hit no cell other than its source cell
    const src = new Map(); L.lanes.forEach((l, i) => { if (!l.raw) src.set(i, null) });
    for (const l of L.lanes) {
      if (l.y0 == null || l.y1 == null) continue;
      for (let y = l.y0; y < l.y1; y++) { const o = occ.get(y * 100000 + l.x); if (o !== undefined) lane++ }
    }
    const turns = Math.max(...L.routes.map(q => q.turns));
    const kinds = {}; for (const q of L.routes) kinds[q.kind] = (kinds[q.kind] || 0) + 1;
    const counts = F.nodes.map(n => ({n: plnNm(n.item), N: n.N, got: L.cells.filter(c => c.item === n.item).reduce((a, c) => a + c.K, 0)}));
    const unrouted = L.cells.reduce((a, c) => a + c.ins.length, 0) - L.routes.length;
    return {ov, fit, lane, turns, kinds, counts, unrouted, nl: L.lanes.length, nth: L.lanes.filter(l => l.kind === 'through').length, nc: L.cells.length, w: L.w, h: L.h, ug: L.ug, taps: L.taps.length, tracks: L.tracks.length, dock: L.dock.length, sink: !!L.sink, ms: Math.round(ms)};
  }, [name, rate]);
  const tag = name + ' ' + rate;
  if (r.refused) { check(false, tag + ' refused: ' + r.refused); continue }
  console.log(tag, 'lanes', r.nl, '(through ' + r.nth + ')', 'size', r.w + 'x' + r.h, 'cells', r.nc, 'taps', r.taps, 'tracks', r.tracks, 'dock', r.dock, 'UG', r.ug, 'sink', r.sink, r.ms + 'ms', JSON.stringify(r.kinds));
  check(r.ov === 0, tag + ': cell rects disjoint (overlap cells ' + r.ov + ')');
  check(r.lane === 0, tag + ': no lane runs through a cell (' + r.lane + ')');
  check(r.fit === 0, tag + ': terminals/cells pass pfFitX (bad ' + r.fit + ')');
  check(r.turns <= 2, tag + ': every route <=2 turns (max ' + r.turns + ')');
  check(r.unrouted === 0, tag + ': every cell input routed (missing ' + r.unrouted + ')');
  check(r.counts.every(c => c.N === c.got), tag + ': machine counts == planner N');
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

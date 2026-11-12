// pfFact2 whole-factory sim (S5): PF_FACT on (PF_BANDS off), layout via placerLayout -> tile -> 600 s sim.
// Checks: prefab factory path used, placerTile ok, no overlap (ov 0), tile ov 0 / span 0, one S out port, one sink,
// sim: sink rate within 5% of the target rate (hard). Flag off = not a factory note (old path).
// Env CASE='Advanced Circuits 50' runs one case only. Env WIN=<s> overrides the sim window for AC 50 if needed.
// Run:  timeout 600 node tests/pff_sim.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
let cases = [
  {name: 'Magnetic Coils', rate: 30},
  {name: 'Basic Circuits', rate: 10},
  {name: 'Nickel Plates', rate: 30},
  {name: 'Advanced Circuits', rate: 5},
  {name: 'Advanced Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 50},
];
if (process.env.CASE) cases = cases.filter(c => process.env.CASE === c.name + ' ' + c.rate);
const WIN = Number(process.env.WIN || 600);
for (const c of cases) {
  const t0 = Date.now();
  const r = await pg.evaluate(c => {
    const WIN = c.win;
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    if (it === undefined) return {refused: 'item not found'};
    const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const lay = () => { PLC_PREFAB = true; try { return placerLayout(P, it, 1, 0, {box: 'DAT_Container_2', mod: false}) } finally { PLC_PREFAB = false } };
    PF_BANDS = false;
    PF_FACT = false;
    const off = lay();
    let L;
    PF_FACT = true;
    try { L = lay() } finally { PF_FACT = false }
    if (!L.ok) return {refused: L.why, name: plnNm(it), offNote: off.note && off.note[0]};
    const T = placerTile(L, placerBk());
    const empty = L.items.filter(q => q.cls === PLC_BOX && q.ct && !q.ct.length);
    const outs = (L.ports || []).filter(p => p.dir === 'out');
    const sink = empty.filter(q => outs.length && q.x === outs[0].off).reduce((a, q) => (a === null || q.y > a.y ? q : a), null);
    const chk = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports || []});
    S.blocks = L.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
    try { smSet(true) } catch (e) {}
    simReset && simReset();
    if (!sink) return {refused: 'no sink box', name: plnNm(it)};
    const item = it, sinkId = L.items.indexOf(sink) + 1;   // S.blocks ids = index + 1 (as prefab_bands)
    const stock = () => { const cn = SIM.C.get(sinkId); const x = cn && cn.st.get(item); return x ? x.n : 0 };
    let n120 = 0;
    for (let s = 0; s < WIN; s++) { simAdvance(1, 1); if (s === 119) n120 = stock() }
    const nEnd = stock();
    const measured = (nEnd - n120) * 60 / (WIN - 120);
    return {name: plnNm(it), prefab: !!L.prefab, note: L.note && L.note[0], offNote: off.note && off.note[0], per: L.per, tileOk: T.ok, tileWhy: T.ok ? '' : String(T.why).slice(0, 120), w: L.w, h: L.h, ov: chk.ov, tileOv: T.ov, tileSpan: T.span, nOuts: outs.length, outEdges: outs.map(p => p.edge).join(','), sinkY: sink.y, sinkStock: nEnd, measured, target: c.rate, working: [...SIM.M.values()].filter(m => m.st === 'working').length, machines: [...SIM.M.values()].length, planMachines: Object.values(P.nodes).filter(n => n.crafter).reduce((a, n) => a + n.machines, 0)};
  }, {...c, win: WIN});
  console.log(c.name, c.rate, 'secs ' + ((Date.now() - t0) / 1000).toFixed(1), JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' ' + c.rate + ' refused: ' + r.refused); continue }
  check(r.prefab && /^Prefab factory/.test(r.note || ''), c.name + ' ' + c.rate + ': prefab factory path used (' + (r.note || '').slice(0, 60) + ')');
  check(!/^Prefab factory/.test(r.offNote || ''), c.name + ' ' + c.rate + ': flag off is not a factory note (' + (r.offNote || '').slice(0, 40) + ')');
  check(r.tileOk, c.name + ' ' + c.rate + ': placerTile ok' + (r.tileOk ? '' : ' (' + r.tileWhy + ')'));
  check(r.ov === 0, c.name + ' ' + c.rate + ': no overlap (ov ' + r.ov + ')');
  check(r.tileOv === 0, c.name + ' ' + c.rate + ': tile ov ' + r.tileOv);
  check(r.tileSpan === 0, c.name + ' ' + c.rate + ': tile span ' + r.tileSpan);
  check(r.nOuts === 1 && r.outEdges === 'S', c.name + ' ' + c.rate + ': one out port on S (' + r.nOuts + ', ' + r.outEdges + ')');
  const tol = Math.abs(r.measured - r.target) <= 0.05 * r.target;
  check(tol, c.name + ' ' + c.rate + ': sim sink rate ' + r.measured.toFixed(2) + '/min within 5% of ' + r.target + ' (' + (100 * r.measured / r.target).toFixed(1) + '%)');
  if (r.working < r.machines) console.log('WARN ' + c.name + ' ' + c.rate + ': machines working ' + r.working + '/' + r.machines);
  if (r.machines !== r.planMachines) console.log('WARN ' + c.name + ' ' + c.rate + ': sim machines ' + r.machines + ' vs planner ' + r.planMachines);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

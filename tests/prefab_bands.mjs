// Prefab BANDS (step 5d): PF_BANDS on, Magnetic Coils 30/min via pfBands (layered bands, S out).
// Checks: prefab path used, placerTile ok, no overlap (ov 0), one collector (empty box at the out port x), out port on S,
// sim: sink rate over 120..600 s within 5% of the target rate. Flag off = the existing pfChain note (unchanged).
// Run:  node tests/prefab_down2.mjs     Exit code 1 on FAIL or page error.
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
const cases = [
  {name: 'Magnetic Coils', rate: 30},
  {name: 'Advanced Circuits', rate: 5},
  {name: 'Advanced Circuits', rate: 10},
  // KNOWN LIMIT: sim.js caps each container at 8 items/tick (480/min); AC 40 Nickel Ore needs ~540, so 35.2/min (88%) is accepted by the user for the first run (tol 15%)
  {name: 'Advanced Circuits', rate: 40, tol: 0.15},
];
for (const c of cases) {
  const r = await pg.evaluate(c => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    if (it === undefined) return {refused: 'item not found'};
    const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const lay = () => { PLC_PREFAB = true; try { return placerLayout(P, it, 1, 0, {box: 'DAT_Container_2', mod: false}) } finally { PLC_PREFAB = false } };
    PF_BANDS = false;
    const off = lay();
    PF_BANDS = true;
    let L;
    try { L = lay() } finally { PF_BANDS = false }
    if (!L.ok) return {refused: L.why, name: plnNm(it), offNote: off.note && off.note[0]};
    const T = placerTile(L, placerBk());
    const empty = L.items.filter(q => q.cls === PLC_BOX && q.ct && !q.ct.length);
    const outs = (L.ports || []).filter(p => p.dir === 'out');
    const collectors = outs.length ? L.items.filter(q => q.cls === PLC_BOX && q.ct && !q.ct.length && q.x === outs[0].off).length : 0;
    const sink = empty.filter(q => outs.length && q.x === outs[0].off).reduce((a, q) => (a === null || q.y > a.y ? q : a), null);
    const chk = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports || []});
    S.blocks = L.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
    try { smSet(true) } catch (e) {}
    simReset && simReset();
    if (!sink) return {refused: 'no sink box', name: plnNm(it)};
    const item = it, sinkId = L.items.indexOf(sink) + 1;   // S.blocks ids = index + 1 (as prefab_down)
    const stock = () => { const cn = SIM.C.get(sinkId); const x = cn && cn.st.get(item); return x ? x.n : 0 };
    let n120 = 0;
    for (let s = 0; s < 600; s++) { simAdvance(1, 1); if (s === 119) n120 = stock() }
    const n60 = stock();
    const measured = (n60 - n120) * 60 / 480;
    return {name: plnNm(it), prefab: !!L.prefab, note: L.note && L.note[0], offNote: off.note && off.note[0], per: L.per, tileOk: T.ok, tileWhy: T.ok ? '' : String(T.why).slice(0, 120), w: L.w, h: L.h, ov: chk.ov, tileOv: T.ov, tileSpan: T.span, nOuts: outs.length, nGroups: L.note && L.note[0], fin: outs.length, outEdges: outs.map(p => p.edge).join(','), collectors, sinkY: sink.y, sinkStock: n60, measured, target: c.rate, working: [...SIM.M.values()].filter(m => m.st === 'working').length, machines: [...SIM.M.values()].length};
  }, c);
  console.log(c.name, c.rate, JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' ' + c.rate + ' refused: ' + r.refused); continue }
  check(r.prefab && /bands/.test(r.note || ''), c.name + ' ' + c.rate + ': bands prefab path used');
  check(/bands/.test(r.offNote || '') === false, c.name + ' ' + c.rate + ': flag off = old path (' + (r.offNote || '').slice(0, 40) + ')');
  check(r.tileOk, c.name + ' ' + c.rate + ': placerTile ok' + (r.tileOk ? '' : ' (' + r.tileWhy + ')'));
  check(r.ov === 0, c.name + ' ' + c.rate + ': no overlap (ov ' + r.ov + ')');
  check(r.tileOv === 0, c.name + ': tile ov ' + r.tileOv);
  check(r.tileSpan === 0, c.name + ': tile span ' + r.tileSpan);
  console.log('out ports ' + r.nOuts);
  check(r.outEdges === 'S', c.name + ' ' + c.rate + ': out port on S edge (' + r.outEdges + ')');
  check(r.collectors === 1, c.name + ' ' + c.rate + ': one collector (' + r.collectors + ')');
  const tol = Math.abs(r.measured - r.target) <= (c.tol || 0.05) * r.target;
  check(tol, c.name + ' ' + c.rate + ': sim sink rate ' + r.measured + '/min within ' + (c.tol || 0.05) * 100 + '% of ' + r.target);
  if (r.working < r.machines) console.log('WARN ' + c.name + ' ' + c.rate + ': machines working ' + r.working + '/' + r.machines);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

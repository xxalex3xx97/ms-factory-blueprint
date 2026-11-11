// Prefab DOWN (step 1): PF_DOWN on, single-stage Nickel Plates (raw input only, pfCompose single-column path).
// Sink box at the BOTTOM row, collector belts south, out port on the S edge.
// Checks: prefab path used, placerTile ok, no overlap (ov 0), one collector (empty box at the out port x),
// sim: sink rate over 120..600 s within 5% of the target rate; flag off = out port on the N edge (unchanged).
// Run:  node tests/prefab_down.mjs     Exit code 1 on FAIL or page error.
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
  {name: 'Nickel Plates', rate: 20},   // 1 machine, 1 column
  {name: 'Nickel Plates', rate: 40},   // 2 machines, 1 column (30 rounds up to 2 whole machines = 40/min, see round-rates rule)
];
for (const c of cases) {
  const r = await pg.evaluate(c => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    if (it === undefined) return {refused: 'item not found'};
    const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const lay = () => { PLC_PREFAB = true; try { return placerLayout(P, it, 1, 0, {box: 'DAT_Container_2', mod: false}) } finally { PLC_PREFAB = false } };
    PF_DOWN = false;
    const off = lay();
    PF_DOWN = true;
    let L;
    try { L = lay() } finally { PF_DOWN = false }
    const offEdges = (off.ports || []).filter(p => p.dir === 'out').map(p => p.edge).join(',');
    if (!L.ok) return {refused: L.why, name: plnNm(it), offEdges};
    const T = placerTile(L, placerBk());
    const boxes = L.items.map((b, i) => ({b, id: i + 1})).filter(q => q.b.cls === PLC_BOX);
    const empty = boxes.filter(q => q.b.ct && !q.b.ct.length);
    const outs = (L.ports || []).filter(p => p.dir === 'out');
    const collectors = outs.length ? L.items.filter(q => q.cls === PLC_BOX && q.ct && !q.ct.length && q.x === outs[0].off).length : 0;
    const sink = empty.reduce((a, q) => (a === null || q.b.x > a.b.x ? q : a), null);
    const chk = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports || []});
    S.blocks = L.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
    try { smSet(true) } catch (e) {}
    simReset && simReset();
    if (!sink) return {refused: 'no sink box', name: plnNm(it)};
    const stock = () => { const cn = SIM.C.get(sink.id); const x = cn && cn.st.get(it); return x ? x.n : 0 };
    let n120 = 0;
    for (let s = 0; s < 600; s++) { simAdvance(1, 1); if (s === 119) n120 = stock() }
    const n60 = stock();
    const measured = (n60 - n120) * 60 / 480;
    return {name: plnNm(it), prefab: !!L.prefab, note: L.note && L.note[0], per: L.per, tileOk: T.ok, tileWhy: T.ok ? '' : String(T.why).slice(0, 120), w: L.w, h: L.h, ov: chk.ov, outEdges: outs.map(p => p.edge).join(','), offEdges, sinkY: sink.b.y, collectors, sinkStock: n60, measured, target: c.rate, working: [...SIM.M.values()].filter(m => m.st === 'working').length, machines: [...SIM.M.values()].length};
  }, c);
  console.log(c.name, c.rate, JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' ' + c.rate + ' refused: ' + r.refused); continue }
  check(r.prefab, c.name + ' ' + c.rate + ': prefab path used');
  check(r.tileOk, c.name + ' ' + c.rate + ': placerTile ok' + (r.tileOk ? '' : ' (' + r.tileWhy + ')'));
  check(r.ov === 0, c.name + ' ' + c.rate + ': no overlap (ov ' + r.ov + ')');
  check(r.outEdges === 'S', c.name + ' ' + c.rate + ': out port on S edge (' + r.outEdges + ')');
  check(r.collectors === 1, c.name + ' ' + c.rate + ': one collector (' + r.collectors + ')');
  check(r.offEdges === 'N', c.name + ' ' + c.rate + ': flag off = out port on N (' + r.offEdges + ')');
  const tol = Math.abs(r.measured - r.target) <= 0.05 * r.target;
  check(tol, c.name + ' ' + c.rate + ': sim sink rate ' + r.measured + '/min within 5% of ' + r.target);
  if (r.working < r.machines) console.log('WARN ' + c.name + ' ' + c.rate + ': machines working ' + r.working + '/' + r.machines);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

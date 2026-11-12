// Prefab CHAIN (step 7): PLC_PREFAB on, single-input chains (Nickel Ore -> Nickel Plates (Refinery) -> Magnetic Coils (Assembler)).
// Checks: prefab path used (L.prefab), placerTile ok, no overlap (ov 0), one collector (empty boxes minus the hub between stages),
// sim: final sink rate over 30..60 s within 5% of the target rate.
// KNOWN LIMITS (refused, old path): Enzyme 60/min (growth stage not built in prefab).
// Run:  node tests/prefab_chain.mjs     Exit code 1 on FAIL or page error.
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
// pin the chain path: PF_FACT (pfFact2) and PF_BANDS off (sink = rightmost empty box is chain geometry; bands use S out); previous flag values restored before exit
const keepFlags = await pg.evaluate(() => { const k = {p: PLC_PREFAB, f: PF_FACT, b: PF_BANDS}; PF_FACT = false; PF_BANDS = false; return k });
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [
  {name: 'Magnetic Coils', rate: 20},   // 2 stages, 1 + 1 machines
  {name: 'Magnetic Coils', rate: 30},   // 2 stages, 2 + 1 machines
  {name: 'Advanced Circuits', rate: 5},   // multi-input + fan-out tree (Basic Circuits feeds Detector Array and AC)
  {name: 'Advanced Circuits', rate: 10},   // multi-column Basic Circuits stage, corridors crossing out rows (vertical UG)
];
const known = [
  {name: 'Advanced Circuits', rate: 40, why: 'corridor rows'},   // 25 corridor rows > 8 reserved, 1008 wide: needs a different inter-stage layout
  {name: 'Enzyme', rate: 60, why: 'growth not built'},
];
for (const c of cases) {
  const r = await pg.evaluate(c => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    if (it === undefined) return {refused: 'item not found'};
    const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const prevP = PLC_PREFAB;
    PLC_PREFAB = true;
    const L = placerLayout(P, it, 1, 0, {box: 'DAT_Container_2', mod: false});
    PLC_PREFAB = prevP;
    if (!L.ok) return {refused: L.why, name: plnNm(it)};
    const T = placerTile(L, placerBk());
    const boxes = L.items.map((b, i) => ({b, id: i + 1})).filter(q => q.b.cls === PLC_BOX);
    const empty = boxes.filter(q => q.b.ct && !q.b.ct.length);
    const hubs = Math.max(0, L.per.length - 1);   // one hub between each pair of stages
    const outs = (L.ports || []).filter(p => p.dir === 'out');
    const collectors = outs.length ? L.items.filter(q => q.cls === PLC_BOX && q.ct && !q.ct.length && q.x === outs[0].off).length : 0;   // exactly one empty box at the out port x
    const sink = empty.reduce((a, q) => (a === null || q.b.x > a.b.x ? q : a), null);   // final collector = rightmost empty box
    const chk = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports || []});
    S.blocks = L.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
    try { smSet(true) } catch (e) {}
    simReset && simReset();
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    if (!sink) return {refused: 'no sink box', name: plnNm(it)};
    const stock = () => { const cn = SIM.C.get(sink.id); const x = cn && cn.st.get(item); return x ? x.n : 0 };
    // 600 s run, rate over 120..600 s (after the 13-stage pipeline fills; a 60 s window is one item of noise at 5/min)
    let n120 = 0;
    for (let s = 0; s < 600; s++) { simAdvance(1, 1); if (s === 119) n120 = stock() }
    const n60 = stock();
    const measured = (n60 - n120) * 60 / 480;   // items per minute over 120..600 s
    return {name: plnNm(it), prefab: !!L.prefab, note: L.note && L.note[0], per: L.per, tileOk: T.ok, tileWhy: T.ok ? '' : String(T.why).slice(0, 120), w: L.w, h: L.h, ov: chk.ov, collectors, hubs, sinkStock: n60, measured, target: c.rate, working: [...SIM.M.values()].filter(m => m.st === 'working').length, machines: [...SIM.M.values()].length};
  }, c);
  console.log(c.name, c.rate, JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' ' + c.rate + ' refused: ' + r.refused); continue }
  check(r.prefab, c.name + ' ' + c.rate + ': prefab path used');
  check(r.tileOk, c.name + ' ' + c.rate + ': placerTile ok' + (r.tileOk ? '' : ' (' + r.tileWhy + ')'));
  check(r.ov === 0, c.name + ' ' + c.rate + ': no overlap (ov ' + r.ov + ')');
  check(r.collectors === 1, c.name + ' ' + c.rate + ': one collector (' + r.collectors + ', hubs ' + r.hubs + ')');
  const tol = Math.abs(r.measured - r.target) <= 0.05 * r.target;
  check(tol, c.name + ' ' + c.rate + ': sim sink rate ' + r.measured + '/min within 5% of ' + r.target);
  if (r.working < r.machines) console.log('WARN ' + c.name + ' ' + c.rate + ': machines working ' + r.working + '/' + r.machines);
}
for (const k of known) {
  const r = await pg.evaluate(k => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === k.name);
    if (it === undefined) return {why: 'item not found'};
    const P = plan(it, k.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const q = pfCompose(P, it, 1, 0, {box: 'DAT_Container_2', mod: false});
    return {ok: q.ok, why: q.why || ''};
  }, k);
  check(r.ok === false && r.why.includes(k.why), 'KNOWN LIMIT ' + k.name + ' ' + k.rate + ' refused: ' + r.why);
}
await pg.evaluate(k => { PLC_PREFAB = k.p; PF_FACT = k.f; PF_BANDS = k.b }, keepFlags);
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

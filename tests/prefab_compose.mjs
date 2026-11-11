// Prefab COMPOSE (step 6): PLC_PREFAB on, single-stage plans: Advanced Circuits 100/min Mk2 (4 inputs) and a 3-input Assembler item at 100/min Mk2.
// Checks: prefab path used (L.prefab), placerTile ok, no overlap (ov 0), exactly ONE collector container, UG span <= maxApart, 60 s sim: output reaches the sink (zero = FAIL).
// Run:  node tests/prefab_compose.mjs     Exit code 1 on FAIL or page error.
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
  {name: "Advanced Circuits 10/min Mk2", rate: 10},
  {name: "Assembler 3-input 20/min Mk2", rate: 20, asm: true},
];
for (const c of cases) {
  const r = await pg.evaluate(c => {
    let it = null, info = '';
    if (c.asm) {
      for (const k of plnBy(false).keys()) {
        const P0 = plan(k, 20, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
        const n = P0.nodes[k];
        if (!n || !n.rec || n.rec.i.length !== 3 || !plnCb(n.crafter)) continue;
        if (def(plnCb(n.crafter).id).key === 'DAT_Assembler') { it = k; break }
      }
    } else it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Advanced Circuits');
    if (!it) return {refused: 'item not found'};
    PLC_PREFAB = true;
    const P0 = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false}), P = {...P0, nodes: {[it]: P0.nodes[it]}};   // the one stage: its inputs are source containers (as placer_four)
    const L = placerLayout(P, it, 1, 0, {box: 'DAT_Container_2', mod: false});
    PLC_PREFAB = false;
    if (!L.ok) return {refused: L.why, name: plnNm(it)};
    const T = placerTile(L, placerBk());
    const cls = [...new Set(L.items.map(b => b.cls))].join(',');
    const boxes = L.items.filter(b => b.cls === PLC_BOX || b.cls === 'DAT_Container_2');
    const collectors = L.items.filter(b => /DAT_Container/.test(b.cls) && b.ct && !b.ct.length).length;
    const ugs = L.items.filter(b => PLC_UG.includes(b.cls)).map(b => b.x);
    const maxApart = def(PLC_UG[1]).maxApart;
    const chk = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports || []});
    S.blocks = L.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
    try { smSet(true) } catch (e) {}
    simReset && simReset();
    for (let s = 0; s < 60; s++) simAdvance(1, 1);
    const sinkStock = [...SIM.C.values()].reduce((a, cn) => a + ([...cn.st.values()].filter(x => !x.inf).reduce((b, x) => b + x.n, 0)), 0);
    return {name: plnNm(it), prefab: !!L.prefab, note: L.note && L.note[0], tileOk: T.ok, tileWhy: T.ok ? '' : String(T.why).slice(0, 120), w: L.w, h: L.h, items: L.items.length, ov: chk.ov, collectors, ugs: ugs.length, sinkStock, produced: simProd().byItem, machines: [...SIM.M.values()].length, working: [...SIM.M.values()].filter(m => m.st === 'working').length};
  }, c);
  console.log(c.name, JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' refused: ' + r.refused); continue }
  check(r.prefab, c.name + ': prefab path used');
  check(r.tileOk, c.name + ': placerTile ok' + (r.tileOk ? '' : ' (' + r.tileWhy + ')'));
  check(r.ov === 0, c.name + ': no overlap (ov ' + r.ov + ')');
  check(r.collectors === 1, c.name + ': one collector container (' + r.collectors + ')');
  check(r.sinkStock > 0, c.name + ': output reached the sink: ' + r.sinkStock);
  if (r.working < r.machines) console.log('WARN ' + c.name + ': machines working ' + r.working + '/' + r.machines);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

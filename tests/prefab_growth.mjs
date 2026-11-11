// Prefab GROWTH (step 4): pfGrowth(Xenoeukarya, rate, mk, box) = plcGrowthLane built as a prefab. Cases: Container Mk1 10/min and 600/min (20 lanes), Large Mk2 10/min and 600/min.
// Checks: no overlap (pfCheck ov 0), no UG (span 0), item count equals placerLayout's growth layout, 60 s sim: net must reach the sink (zero = FAIL). Seam/cut rule is WARN only (growth is not column-tiled).
// Run:  node tests/prefab_growth.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfGrowth === 'function' && typeof placerLayout === 'function' && typeof simAdvance === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [
  {name: 'Container Mk1 10/min', rate: 10, mk: 0, box: 'DAT_Container'},
  {name: 'Container Mk1 600/min', rate: 600, mk: 0, box: 'DAT_Container'},
  {name: 'Large Mk2 10/min', rate: 10, mk: 1, box: 'DAT_Container_2'},
  {name: 'Large Mk2 600/min', rate: 600, mk: 1, box: 'DAT_Container_2'},
];
for (const c of cases) {
  const r = await pg.evaluate(c => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Xenoeukarya');
    const G = pfGrowth(it, c.rate, c.mk, c.box);
    if (G.ok === false) return {refused: G.why};
    const P = plan(it, c.rate, 0, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = placerLayout(P, it, c.mk, 0, {box: c.box, mod: false});
    const chk = pfCheck(G);
    const ugs = G.items.filter(b => PLC_UG.includes(b.cls)).length;
    const inst = {id: 1, proto: 'pfGrowth', args: [it, c.rate, c.mk, c.box], at: {gx: 0, gy: 0}};
    const items = pfPlace(inst);
    S.blocks = items.map(b => ({id: b.id, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
    try { smSet(true) } catch (e) {}
    simReset && simReset();
    for (let s = 0; s < 60; s++) simAdvance(1, 1);
    const sinkStock = [...SIM.C.values()].reduce((a, cn) => a + ([...cn.st.values()].filter(x => !x.inf).reduce((b, x) => b + x.n, 0)), 0);
    return {w: G.w, h: G.h, lanes: G.lanes, ports: G.ports.length, items: G.items.length, placerItems: L.ok ? L.items.length : 'L:' + L.why,
      ov: chk.ov, seamBad: chk.seamBad, ugs, machines: [...SIM.M.values()].length,
      working: [...SIM.M.values()].filter(m => m.st === 'working').length, produced: simProd().byItem, sinkStock};
  }, c);
  console.log(c.name, JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' refused: ' + r.refused); continue }
  check(r.ov === 0, c.name + ': no overlap (ov ' + r.ov + ')');
  if (r.seamBad) console.log('WARN ' + c.name + ': seam/cut cells ' + r.seamBad + ' (growth not column-tiled)');
  check(r.ugs === 0, c.name + ': span valid (UG ' + r.ugs + ', max span 0 used)');
  check(r.items === r.placerItems, c.name + ': items ' + r.items + ' = placer growth layout ' + r.placerItems);
  check(r.sinkStock > 0, c.name + ': net reached the sink: ' + r.sinkStock + ' (produced ' + JSON.stringify(r.produced) + ')');
  if (r.working < r.machines) console.log('WARN ' + c.name + ': machines working ' + r.working + '/' + r.machines);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// Prefab COL sim (step 3a): Advanced Circuits 20/min Mk2 (Large belt), two pfCol columns (m=2 each) placed at gx 0 and gx 1, real recipe items and rec, infinite N-edge source containers, 60 s sim.
// FAIL when nothing reaches the sink (wiring bug). Machines working below 100% is WARN only.
// Run:  node tests/prefab_sim.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCol === 'function' && typeof simAdvance === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const r = await pg.evaluate(() => {
  const its = [...plnBy(false).keys()];
  const it = its.find(i => plnNm(i) === 'Advanced Circuits');
  const P = plan(it, 20, 0, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const n = P.nodes[it], cb = plnCb(n.crafter), cls = def(cb.id).key, rec = rk(n.rec), k = n.rec.i.length;
  const flows = n.rec.i.map(([item]) => ({item, flow: 20}));
  const C = pfCol(cls, k, flows, 2, 1);
  if (C.ok === false) return {refused: C.why, cls, k, rec};
  const inst = gx => ({id: 1 + gx, proto: 'pfCol', args: [cls, k, flows, 2, 1], at: {gx, gy: 0}});
  const items = [...pfPlace(inst(0)), ...pfPlace(inst(1))];
  S.blocks = items.map(b => ({id: b.id, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(c => ({...c})) : undefined, rec: b.cls === cls ? rec : undefined}));
  try { smSet(true) } catch (e) {}
  simReset && simReset();
  for (let s = 0; s < 60; s++) simAdvance(1, 1);
  const machines = [...SIM.M.values()];
  const sinkStock = [...SIM.C.values()].reduce((a, cn) => a + ([...cn.st.values()].filter(x => !x.inf).reduce((b, x) => b + x.n, 0)), 0);
  return {cls, k, rec, items: items.length, machines: machines.length, working: machines.filter(m => m.st === 'working').length, produced: simProd().byItem, sinkStock};
});
console.log(JSON.stringify(r));
if (r.refused) check(false, 'column refused: ' + r.refused);
else {
  check(r.machines === 4, 'machines in the sim: ' + r.machines + ' (expect 4)');
  check(r.working >= 1, 'machines working: ' + r.working + '/' + r.machines + (r.working < r.machines ? ' (WARN: not all)' : ''));
  check(r.sinkStock > 0, 'output reached the sink: ' + r.sinkStock + ' in sink containers, produced ' + JSON.stringify(r.produced));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

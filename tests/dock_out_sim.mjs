// Output dock takes items out (sim): composer layout of a product with an E output dock (dock {in:null,out:'nrm'}), S.blocks loaded as tests/pff_sim.mjs does,
// sim runs WIN s; counts items pulled out of the output dock containers (SIM.ev.co of the dk:'out' containers) after warm-up. Check: throughput > 0.
// Run: node tests/dock_out_sim.mjs   (env CASE='Nickel Plates 31' overrides the case)   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof simInit === 'function' && typeof simRun === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
let cases = [{name: 'Nickel Plates', rate: 31}, {name: 'Nickel Plates', rate: 480}];
if (process.env.CASE) cases = cases.filter(c => process.env.CASE === c.name + ' ' + c.rate);
const WIN = Number(process.env.WIN || 600);
for (const c of cases) {
  const r = await pg.evaluate(c => {
    const WIN = c.win;
    const rec = [].concat(...Object.values(RECS)).find(q => plnNm(q.o[0]) === c.name);
    if (!rec) return {refused: 'recipe not found'};
    const item = rec.o[0], key = rk(rec);
    const P = plan(item, c.rate, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false});
    const L = placerLayout(P, item, 1, 1, {box: 'DAT_Container_2', mod: false, dock: {in: null, out: 'nrm'}, bk: 'BPO_Station_02'});
    if (!L.ok) return {refused: L.why};
    const T = L.tile;
    const all = [...T.blocks, ...T.ms];
    const outBox = T.ms.filter(q => q.dk === 'out' && (def(q.cls) || {}).category === 'Storage');
    const docks = T.blocks.filter(q => q.cls === plcCls('BPO_Dock'));
    S.blocks = all.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
    const outIds = new Set(outBox.map(q => all.indexOf(q) + 1));
    simInit({});
    const Z = SIM;
    let pulled = 0, pulledWarm = 0, tot = 0;
    const WARM = 120;
    for (let s = 0; s < WIN; s++) {
      simRun(1);
      let n = 0;
      Z.ev.co.forEach((m, id) => { if (outIds.has(id)) m.forEach(k => n += k) });
      tot += n;
      if (s === WARM - 1) pulledWarm = tot;
    }
    pulled = tot - pulledWarm;
    const outStock = [...outIds].map(id => { const cn = Z.C.get(id); return cn ? [...cn.st.values()].reduce((a, x) => a + (x.inf ? 0 : x.n), 0) : null });
    return {name: c.name, docks: docks.length, outBoxes: outBox.length, outIds: outIds.size, pulledPerMin: pulled * 60 / (WIN - WARM), outStock, machines: Z.M.size, working: [...Z.M.values()].filter(m => m.st === 'working').length, outEdge: docks.map(d => d.rot)};
  }, {...c, win: WIN});
  console.log(c.name, c.rate, JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' ' + c.rate + ' refused: ' + r.refused); continue }
  check(r.docks >= 1 && r.outBoxes >= 1, c.name + ' ' + c.rate + ': output dock (' + r.docks + ') and out containers (' + r.outBoxes + ') built');
  check(r.pulledPerMin > 0, c.name + ' ' + c.rate + ': output dock throughput ' + r.pulledPerMin.toFixed(2) + '/min > 0');
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

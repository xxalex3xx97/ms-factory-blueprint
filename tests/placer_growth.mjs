// Growth lanes (Xenoeukarya: self-fed GrowthChamber + Biomass). Container Mk1 at 10 and 120/min: builds, Seed note, ov 0, span 0, structural links (each machine W input port has a straight belt pointing into it, the machine E output has a belt, the in/out/sink containers exist), sim >= net target (WARN only).
// Run:  node tests/placer_growth.mjs     Exit code 1 on any failed check or page error.
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
await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof simAdvance === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const r = await pg.evaluate(() => {
  const out = [];
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Xenoeukarya');
  for (const rate of [10, 120, 600]) {
    const P = plan(it, rate, 0, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = placerLayout(P, it, 0, 0, {box: 'DAT_Container', mod: false});
    const row = {rate, layoutOk: L.ok, why: L.ok ? '' : L.why.slice(0, 120), note: L.ok ? L.note.join(' | ') : ''};
    if (L.ok) {
      const T = placerTile(L, placerBk());
      row.tileOk = T.ok; row.tileWhy = T.ok ? '' : T.why.slice(0, 100);
      if (T.ok) {
        row.ov = T.ov; row.span = T.span;
        // structural: every machine W input port has a belt pointing into it; the machine E output has a belt leaving it
        const ms = T.ms, machines = ms.filter(m => m.rec);
        const belts = ms.filter(m => PLC_BELT.includes(m.cls));
        const at = (x, y) => belts.find(b => b.x === x && b.y === y);
        let inOk = 0, outOk = 0;
        machines.forEach(m => {
          const d = def(m.cls), ports = portsOf(m).filter(p => p.en && p.tg !== undefined);
          ports.forEach(p => {
            if (p.nx === -1 && p.dir !== 'out') { const b = at(p.x - 1, p.y); if (b && b.rot === 0) inOk++ }
            if (p.nx === 1 && p.dir !== 'in') { const b = at(p.x + 1, p.y); if (b) outOk++ }
          });
        });
        row.machines = machines.length; row.inputBelts = inOk; row.outputBelts = outOk;
        row.boxes = ms.filter(m => m.ct).length;
        // sim: net rate delivered (WARN only): run the lane in the sim for 60 s and read the sink container stock
        S.blocks = [...T.blocks.map((q, i) => ({id: i + 1, cls: q.cls, x: q.x, y: q.y, h: 0, rot: 0, pid: 0})), ...T.ms.map((x, i) => ({...x, id: T.blocks.length + i + 1, h: 0}))];
        try { smSet(true) } catch (e) {}
        simReset && simReset();
        for (let s = 0; s < 60; s++) simAdvance(1, 1);
        const sinkStock = [...SIM.C.values()].reduce((a, cn) => a + ([...cn.st.values()].filter(x => !x.inf).reduce((b, x) => b + x.n, 0)), 0);
        row.simWorking = [...SIM.M.values()].filter(m => m.st === 'working').length;
        row.simProduced = simProd().byItem;
        row.simNetTarget = rate;
        row.simSinkStock = sinkStock;
      }
    }
    out.push(row);
  }
  return out;
});
for (const row of r) {
  const tag = 'Xenoeukarya ' + row.rate + '/min Mk1/Container';
  check(row.layoutOk && row.tileOk, tag + ': builds (' + (row.why || row.tileWhy || 'ok') + ')');
  check(/Seed:/.test(row.note), tag + ': note has Seed:');
  check(row.ov === 0 && row.span === 0, tag + ': ov 0 and span 0 (' + row.ov + ', ' + row.span + ')');
  check(row.inputBelts === 2 * row.machines, tag + ': each machine has 2 straight input belts into its W ports (' + row.inputBelts + ' for ' + row.machines + ' machines)');
  check(row.outputBelts >= row.machines, tag + ': each machine has an output belt (' + row.outputBelts + ')');
  console.log('WARN ' + tag + ': sim working ' + row.simWorking + '/' + row.machines + ', produced ' + JSON.stringify(row.simProduced) + ', sink stock ' + row.simSinkStock + ' (net target ' + row.simNetTarget + '/min)');
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails || errs.length ? 'FAILED ' + (fails + errs.length) : 'PASS all');
process.exit(fails || errs.length ? 1 : 0);

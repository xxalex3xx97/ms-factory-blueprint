// 4-input stages, lane-based (plcFourLane, phase 1: inputs are source containers). Alpha Protein 10/120/300 and Advanced Circuits 10/120, belt Mk1 (Container) and Mk2 (Large belt): builds, ov 0, span 0, machines, 5 boxes per machine, every machine input port has a belt pointing in, output belt, sim 60 s (WARN only).
// Run:  node tests/placer_four.mjs     Exit code 1 on any failed check or page error.
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
const cases = [];
for (const name of ['Alpha Protein', 'Advanced Circuits']) for (const mk of [0, 1]) for (const rate of (name === 'Alpha Protein' ? [10, 120, 300] : [10, 120])) cases.push({name, mk, rate});
const r = await pg.evaluate(cases => {
  const out = [];
  const its = [...plnBy(false).keys()];
  for (const c of cases) {
    const it = its.find(i => plnNm(i) === c.name);
    const P = plan(it, c.rate, 0, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = placerLayout(P, it, c.mk, 0, {box: 'DAT_Container', mod: false});
    const row = {...c, layoutOk: L.ok, why: L.ok ? '' : L.why.slice(0, 140), note: L.ok ? L.note.join(' | ') : ''};
    if (L.ok) {
      const T = placerTile(L, placerBk());
      row.tileOk = T.ok; row.tileWhy = T.ok ? '' : T.why.slice(0, 120);
      if (T.ok) {
        row.ov = T.ov; row.span = T.span;
        const ms = T.ms, machines = ms.filter(m => m.rec);
        const belts = ms.filter(m => PLC_BELT.includes(m.cls));
        const at = (x, y) => belts.find(b => b.x === x && b.y === y);
        let inOk = 0, outOk = 0;
        machines.forEach(m => {
          portsOf(m).filter(p => p.en && p.tg !== undefined).forEach(p => {
            if (p.nx === -1 && p.dir !== 'out') { const b = at(p.x - 1, p.y); if (b && b.rot === 0) inOk++ }
            if (p.nx === 1 && p.dir !== 'in') { const b = at(p.x + 1, p.y); if (b) outOk++ }
            if (p.nx === 0 && p.ny === -1 && p.dir !== 'out') { const b = at(p.x, p.y - 1); if (b && b.rot === 1) inOk++ }
            if (p.nx === 0 && p.ny === 1 && p.dir !== 'out') { const b = at(p.x, p.y + 1); if (b && b.rot === 3) inOk++ }
          });
        });
        row.machines = machines.length; row.inputBelts = inOk; row.outputBelts = outOk;
        row.expectedMachines = P.nodes[it].machines;
        row.boxes = ms.filter(m => m.ct).length;
        row.planRate = P.nodes[it].pmach * P.nodes[it].machines;
        S.blocks = [...T.blocks.map((q, i) => ({id: i + 1, cls: q.cls, x: q.x, y: q.y, h: 0, rot: 0, pid: 0})), ...T.ms.map((x, i) => ({...x, id: T.blocks.length + i + 1, h: 0}))];
        try { smSet(true) } catch (e) {}
        simReset && simReset();
        for (let s = 0; s < 60; s++) simAdvance(1, 1);
        row.simWorking = [...SIM.M.values()].filter(m => m.st === 'working').length;
        row.simProduced = simProd().byItem;
      }
    }
    out.push(row);
  }
  return out;
}, cases);
for (const row of r) {
  const tag = row.name + ' ' + row.rate + '/min mk' + row.mk + (row.mk ? ' Large belt' : ' Container belt');
  check(row.layoutOk && row.tileOk, tag + ': builds (' + (row.why || row.tileWhy || 'ok') + ')');
  if (!row.layoutOk || !row.tileOk) continue;
  check(row.ov === 0 && row.span === 0, tag + ': ov 0 and span 0 (' + row.ov + ', ' + row.span + ')');
  check(row.machines === row.expectedMachines, tag + ': machines ' + row.machines + ' = planned ' + row.expectedMachines);
  check(row.boxes === 5 * row.machines, tag + ': 5 boxes per machine (' + row.boxes + ')');
  check(row.inputBelts === 4 * row.machines, tag + ': 4 input belts per machine (' + row.inputBelts + ')');
  check(row.outputBelts >= row.machines, tag + ': output belt per machine (' + row.outputBelts + ')');
  check(row.planRate >= row.rate, tag + ': planned rate ' + row.planRate + ' >= target ' + row.rate);
  console.log('WARN ' + tag + ': sim working ' + row.simWorking + '/' + row.machines + ', produced ' + JSON.stringify(row.simProduced));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails || errs.length ? 'FAILED ' + (fails + errs.length) : 'PASS all');
process.exit(fails || errs.length ? 1 : 0);

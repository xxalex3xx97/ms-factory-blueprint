// BL7 dashboard + golden (page). Run: node tests/bl_dash.mjs   (add --update to rewrite tests/bl_golden.json)  Exit 1 on FAIL or page error.
// Cases: Silicon Wafers 120/360/720, Basic Motor 120/1000 (2-stage chain). Per case: BL vs NL belts/machine and area (w x h). Sim error (sink rate from t=120 s vs planned makes) for Silicon Wafers 360 and Basic Motor 120.
// Fail if BL belts/machine grows more than 5% over golden, or |sim error| exceeds golden |sim error|.
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLD = ROOT + '/tests/bl_golden.json';
const UPDATE = process.argv.includes('--update');
const golden = fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD, 'utf8')) : {cases: {}};
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof blTop === 'function' && typeof pfCompose === 'function' && typeof nlTop === 'function' && typeof simAdvance === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const WIN = Number(process.env.WIN || 600);
const cases = [['Silicon Wafers', 120], ['Silicon Wafers', 360], ['Silicon Wafers', 720], ['Basic Motor', 120], ['Basic Motor', 1000]];
const sims = {'Silicon Wafers 360': true, 'Basic Motor 120': true};
const rows = [];
const out = {cases: {}};
for (const [name, rate] of cases) {
  const tag = name + ' ' + rate;
  const r = await pg.evaluate(([name, rate]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = pfCompose(P, it, 1, 0, {});
    const NL = nlTop(P, it, 1, 0, {});
    if (!L.ok || !L.bl) return {refused: L.why || 'not BL'};
    return {K: L.bl.K, stages: L.bl.n.length, belts: L.stat.belts, machines: L.stat.machines, area: L.w * L.h, w: L.w, h: L.h,
      nlBelts: NL.ok ? NL.stat.belts : null, nlMach: NL.ok ? NL.stat.machines : null, nlArea: NL.ok ? NL.w * NL.h : null, makes: L.makes};
  }, [name, rate]);
  if (r.refused) { check(false, tag + ' refused (' + r.refused + ')'); continue }
  const bpm = r.belts / r.machines, nlBpm = r.nlBelts / r.nlMach;
  const row = {tag, K: r.K, stages: r.stages, bpm, nlBpm, area: r.area, nlArea: r.nlArea, w: r.w, h: r.h, makes: r.makes, sim: null};
  if (sims[tag]) {
    const s = await pg.evaluate(([name, rate, WIN]) => {
      const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
      const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
      const L = pfCompose(P, it, 1, 0, {});
      if (!L.ok || !L.bl) return {refused: L.why || 'not BL'};
      const sinks = L.items.map((q, i) => ({q, id: i + 1})).filter(({q}) => q.cls === L.box && q.ct && !q.ct.length && q.y + dim(q).h === L.h);
      S.blocks = L.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
      try { smSet(true) } catch (e) {}
      simReset && simReset();
      const stock = () => sinks.reduce((a, {id}) => { const cn = SIM.C.get(id); const x = cn && cn.st.get(it); return a + (x ? x.n : 0) }, 0);
      let n120 = 0;
      for (let t = 0; t < WIN; t++) { simAdvance(1, 1); if (t === 119) n120 = stock() }
      return {measured: (stock() - n120) * 60 / (WIN - 120), makes: L.makes};
    }, [name, rate, WIN]);
    if (s.refused) { check(false, tag + ' sim: ' + s.refused); continue }
    row.sim = (s.measured - s.makes) / s.makes * 100;
  }
  rows.push(row);
  out.cases[tag] = {bpm: +bpm.toFixed(3), area: r.area, sim: row.sim === null ? null : +row.sim.toFixed(3)};
  const g = golden.cases[tag];
  if (UPDATE || !g) { check(true, tag + ': golden ' + (g ? 'kept' : 'recorded') + ' (bpm ' + bpm.toFixed(2) + ')'); continue }
  check(bpm <= g.bpm * 1.05, tag + ': BL belts/machine ' + bpm.toFixed(2) + ' <= golden ' + g.bpm + ' +5%');
  if (g.sim !== null && row.sim !== null) check(Math.abs(row.sim) <= Math.abs(g.sim), tag + ': |sim error| ' + Math.abs(row.sim).toFixed(2) + '% <= golden ' + Math.abs(g.sim).toFixed(2) + '%');
}
// dashboard
console.log('\ntag | K | stages | BL belts/machine | NL belts/machine | BL area (w x h) | NL area | BL/NL area | sim error % | planned makes');
for (const r of rows) console.log([r.tag, r.K, r.stages, r.bpm.toFixed(1), r.nlBpm.toFixed(1), r.area + ' (' + r.w + 'x' + r.h + ')', r.nlArea, (r.area / r.nlArea).toFixed(2), r.sim === null ? '-' : r.sim.toFixed(2), r.makes.toFixed(1)].join(' | '));
if (UPDATE) { fs.writeFileSync(GOLD, JSON.stringify(out, null, 1) + '\n'); console.log('golden written: ' + GOLD) }
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

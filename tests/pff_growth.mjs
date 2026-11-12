// pfFact2 R3: growth stages inside the pfFact factory tree (seed = raw lane of the growth item, no feedback loop).
// Per case: pfFactTop2 ok; machines == sum of built; each node built-N in {0,1}; >=1 growth node; each growth node has an infinite raw container of its item;
// pfCheck ov 0 / seamBad 0; placerTile ok / ov 0 / span 0; one S port; one sink (empty box at port x, bottom of layout);
// then a sim through the dispatch (PLC_PREFAB + PF_FACT): L.prefab, note 'Prefab factory', sink rate within tol of target.
// Env CASE='Enzyme 30' runs one case. Env WIN=<s> overrides the sim window (default 600).
// Run:  timeout 600 node tests/pff_growth.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTop2 === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// browser side: structural checks on pfFactTop2, then sim through the dispatch
const runCase = c => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfFactTop2(P, it, 1, 1, {box: 'DAT_Container_2'});
  if (L.ok === false) return {refused: L.why};
  const fails = [], out = {};
  const machines = L.items.filter(q => q.rec).length;
  const built = L.sizes.reduce((a, s) => a + s.built, 0);
  out.machines = machines; out.built = built;
  if (machines !== built) fails.push('machines ' + machines + ' != built ' + built);
  const badN = L.sizes.filter(s => ![0, 1].includes(s.built - s.N));
  if (badN.length) fails.push('built-N not in {0,1}: ' + badN.map(s => plnNm(s.item) + ' ' + s.built + '/' + s.N).join('; '));
  const growth = Object.values(P.nodes).filter(n => n.rec && n.rec.i.some(([x]) => x === n.item)).map(n => n.item);
  out.growth = growth.map(g => plnNm(g)).join(',');
  if (!growth.length) fails.push('no growth node in plan');
  for (const g of growth) {
    const inf = L.items.some(q => q.cls === PLC_BOX && q.ct && q.ct.some(x => x.item === g && x.inf));
    if (!inf) fails.push('no infinite raw container of ' + plnNm(g));
  }
  const pc = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports});
  out.ov = pc.ov; out.seamBad = pc.seamBad;
  if (pc.ov !== 0) fails.push('pfCheck ov ' + pc.ov);
  if (pc.seamBad !== 0) fails.push('pfCheck seamBad ' + pc.seamBad);
  const T = placerTile(L, placerBk());
  out.tileOk = T.ok; out.tileWhy = T.ok ? '' : String(T.why).slice(0, 160);
  if (!T.ok) fails.push('placerTile: ' + out.tileWhy);
  if (T.ok && T.ov !== 0) fails.push('placerTile ov ' + T.ov);
  if (T.ok && T.span !== 0) fails.push('placerTile span ' + T.span);
  out.w = L.w; out.h = L.h; out.blocks = T.ok ? T.blocks.length : null;
  const sinks = L.ports.length ? L.items.filter(q => q.cls === PLC_BOX && q.ct && q.ct.length === 0 && q.x === L.ports[0].off && q.y + def(PLC_BOX).h === L.h) : [];
  if (sinks.length !== 1) fails.push('sinks ' + sinks.length);
  if (L.ports.length !== 1) fails.push('ports ' + L.ports.length);
  if (L.ports.some(p => p.edge !== 'S')) fails.push('port not on S');
  if (fails.length) return {fails, out};

  // sim through the dispatch
  const WIN = c.win;
  const lay = () => { PLC_PREFAB = true; PF_BANDS = false; PF_FACT = true; try { return placerLayout(P, it, 1, 0, {box: 'DAT_Container_2', mod: false}) } finally { PLC_PREFAB = false; PF_BANDS = true; PF_FACT = false } };
  const SL = lay();
  if (!SL.ok) return {fails: ['sim layout refused: ' + SL.why], out};
  out.prefab = !!SL.prefab; out.note = SL.note && SL.note[0];
  if (!SL.prefab || !/^Prefab factory/.test(out.note || '')) fails.push('dispatch not prefab factory: ' + out.note);
  const ST = placerTile(SL, placerBk());
  if (!ST.ok) fails.push('sim placerTile: ' + String(ST.why).slice(0, 120));
  const empty = SL.items.filter(q => q.cls === PLC_BOX && q.ct && !q.ct.length);
  const outs = (SL.ports || []).filter(p => p.dir === 'out');
  const sink = empty.filter(q => outs.length && q.x === outs[0].off).reduce((a, q) => (a === null || q.y > a.y ? q : a), null);
  if (!sink) return {fails: ['no sink box in sim layout'], out};
  S.blocks = SL.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
  try { smSet(true) } catch (e) {}
  simReset && simReset();
  const sinkId = SL.items.indexOf(sink) + 1;   // S.blocks ids = index + 1 (as pff_sim)
  const stock = () => { const cn = SIM.C.get(sinkId); const x = cn && cn.st.get(it); return x ? x.n : 0 };
  let n120 = 0;
  for (let s = 0; s < WIN; s++) { simAdvance(1, 1); if (s === 119) n120 = stock() }
  const nEnd = stock();
  out.measured = (nEnd - n120) * 60 / (WIN - 120);
  out.target = c.rate;
  out.working = [...SIM.M.values()].filter(m => m.st === 'working').length;
  out.simMachines = [...SIM.M.values()].length;
  out.sinkStock = nEnd;
  return {fails, out};
};

const cases = [
  {name: 'Enzyme', rate: 30, tol: 0.05},
  {name: 'Alpha Protein', rate: 10, tol: 0.05},
  {name: 'Advanced Plate', rate: 5, tol: 0.15},
];
const WIN = Number(process.env.WIN || 600);
const sel = process.env.CASE ? cases.filter(c => process.env.CASE === c.name + ' ' + c.rate) : cases;
for (const c of sel) {
  const tag = c.name + ' ' + c.rate;
  const t0 = Date.now();
  const r = await pg.evaluate(runCase, {...c, win: WIN});
  console.log(tag + ' secs ' + ((Date.now() - t0) / 1000).toFixed(1) + ' ' + JSON.stringify(r.out || r));
  if (r.refused) { check(false, tag + ': refused: ' + r.refused); continue }
  if (r.out && r.out.w !== undefined) console.log(tag + ': w ' + r.out.w + ' h ' + r.out.h + ' blocks ' + r.out.blocks + ' machines ' + r.out.machines + ' working ' + r.out.working);
  check(!r.fails.length, tag + ': layout checks' + (r.fails.length ? ' (' + r.fails.slice(0, 8).join('; ') + ')' : ''));
  if (r.fails.length || r.out.measured === undefined) continue;
  const tol = Math.abs(r.out.measured - r.out.target) <= c.tol * r.out.target;
  check(tol, tag + ': sim sink rate ' + r.out.measured.toFixed(2) + '/min within ' + c.tol * 100 + '% of ' + r.out.target + ' (' + (100 * r.out.measured / r.out.target).toFixed(1) + '%)');
  if (r.out.simMachines !== r.out.machines) console.log('WARN ' + tag + ': sim machines ' + r.out.simMachines + ' vs layout ' + r.out.machines);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

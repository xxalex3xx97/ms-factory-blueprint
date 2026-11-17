// dock_auto_filters: the builder sets b.df (site bay filters) on every Industrial/Normal dock it places.
// Bay with a lane belt touching it -> filter = the item on that lane (input: raw ore, output: product). Unused bays stay empty.
// Checks also after Place (rot 0/1/3, flip) and the sav export / sim pull.
// Run: node tests/dock_auto_filters.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// [label, item, rate, mk (0=Mk1 1=Mk2), block, dock]
const CASES = [
  ['BC100 Mk2 2x1 ind', 'ITEM_BasicCircuit', 100, 1, 'BPO_Station_2x1', {in: 'ind', out: null}],
  ['BC100 Mk1 2x1 ind', 'ITEM_BasicCircuit', 100, 0, 'BPO_Station_2x1', {in: 'ind', out: null}],
  ['MagCoils150 Mk2 2x1 ind', 'ITEM_MagneticCoils', 150, 1, 'BPO_Station_2x1', {in: 'ind', out: null}],
  ['BC100 Mk2 2x2 ind', 'ITEM_BasicCircuit', 100, 1, 'BPO_Station_02', {in: 'ind', out: null}],
  ['BC100 Mk2 2x1 nrm in+out', 'ITEM_BasicCircuit', 100, 1, 'BPO_Station_2x1', {in: 'nrm', out: 'nrm'}],
  ['BC100 Mk2 2x1 ind in+out', 'ITEM_BasicCircuit', 100, 1, 'BPO_Station_2x1', {in: 'ind', out: 'ind'}]
];
// page side: bay filter per dock bay, same as the site panel reads it (bayRects + DIR touch by belt cells)
const PERBAY = `window.perBay=(docks,belts)=>{const ins=(r,x,y)=>x>=Math.round(r.x)&&x<Math.round(r.x+r.w)&&y>=Math.round(r.y)&&y<Math.round(r.y+r.h);
 return docks.map(d=>{const R=bayRects({...d,id:-1,h:0});return{cls:d.cls,rot:d.rot,out:d.rot===0,per:R.filter(r=>r.i>=0).map(r=>({i:r.i,touch:belts.some(b=>[[0,0],...DIR].some(([dx,dy])=>ins(r,b.x+dx,b.y+dy))),f:((d.df||[])[r.i]||{}).item||''}))}})};`;
// page side: build the plan, read the docks/belts, then Place it (rot 0/1/3, flip) and read the placed docks
const RUN = c => {
  window.CMP_ENGINE = true;
  const it = c.it, mk = c.mk;
  const P = plan(it, c.rate, mk, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = placerLayout(P, it, mk, mk, {box: 'DAT_Container_2', mod: false, dock: c.dock, bk: c.bk});
  if (!L.ok) return {err: L.why};
  let T = L.tile;
  if (!T) { T = placerTile(L, placerBk()); if (!T.ok) return {err: T.why} }
  const docks = T.blocks.filter(b => dkN(b.cls));
  const belts = T.ms.filter(m => PLC_BELT.includes(m.cls)).map((m, i) => ({id: i + 1, x: m.x, y: m.y, rot: m.rot, h: 0}));
  const raws = cmpPlan(P, it, mk, {share: true}).nodes.filter(o => o.raw).map(o => fkey(o.key));
  const prod = fkey(it);
  const rep = perBay(docks, belts);
  const nRole = [...dockBelts(docks.map((d, i) => ({...d, id: i + 1, h: 0})), belts, null).values()].filter(v => v.f && v.f !== '?').length;
  const nDfPlan = docks.filter(d => d.df).length;
  const placed = [];
  for (const [rot, fl] of [[0, 0], [1, 0], [3, 0], [0, 1]]) {
    S.blocks = []; layer = 0; view = 'F'; hover = {x: 2, y: 2};
    pasting = {rot, fl: !!fl, pl: {blocks: T.blocks, ms: T.ms, plan: null}};
    placerPaste();
    const pd = S.blocks.filter(b => dkN(b.cls)), pb = S.blocks.filter(b => PLC_BELT.includes(b.cls));
    const rec = {rot, fl, per: perBay(pd, pb), dfs: pd.map(b => JSON.stringify(b.df || null))};
    if (rot === 0 && !fl) {
      rec.ex = __fb.build().Blocks.filter(b => b.Filters && b.Filters.length).length;
      __fb.simInit({});
      rec.pull = __fb.SIM.pull.length;
    }
    placed.push(rec);
  }
  return {rep, raws, prod, nRole, nDfPlan, placed, cls: [plcCls('BPO_Dock'), plcCls('BPO_Dock_2')]};
};
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof dockBelts === 'function' && typeof cmpDockDf === 'function');
  await page.evaluate(PERBAY);
  for (const [label, it, rate, mk, bk, dock] of CASES) {
    const before = fails;
    const a = await page.evaluate(RUN, {it, rate, mk, bk, dock});
    if (a.err) { check(false, label + ' build: ' + a.err); continue }
    const [dk1, dk2] = a.cls;
    const n1 = a.rep.filter(d => d.cls === dk1).length, n2 = a.rep.filter(d => d.cls === dk2).length;
    // 1 builds, docks exist, right dock class, out dock present when asked
    check(a.rep.length > 0, label + ' docks exist (BPO_Dock ' + n1 + ', BPO_Dock_2 ' + n2 + ')');
    if (dock.in === 'ind') check(n2 > 0, label + ' input docks are BPO_Dock_2');
    else check(n1 > 0, label + ' input docks are BPO_Dock');
    if (dock.out) check(a.rep.some(d => d.out), label + ' has an output dock');
    // 2 every bay: touched by a lane belt -> filter = lane item (out dock: product, in dock: raw); untouched -> empty
    const bad2 = [];
    for (const d of a.rep) for (const p of d.per) {
      const ok = p.touch ? p.f !== '' && (d.out ? p.f === a.prod : a.raws.includes(p.f)) : p.f === '';
      if (!ok) bad2.push('cls' + d.cls + ' bay' + p.i + ' touch=' + p.touch + ' f=' + JSON.stringify(p.f));
    }
    check(bad2.length === 0, label + ' every dock bay filter matches its lane' + (bad2.length ? ' -> ' + bad2.slice(0, 4).join(' | ') : ''));
    // 3 some bay touched and filtered
    const touched = a.rep.reduce((s, d) => s + d.per.filter(p => p.touch).length, 0);
    check(touched > 0 && a.nDfPlan > 0, label + ' touched bays ' + touched + ', plan docks with df ' + a.nDfPlan);
    // 4 dock roles from dockBelts are known
    check(a.nRole > 0, label + ' dockBelts roles known ' + a.nRole);
    // 5 after Place (rot0, rot1, rot3, flip): filters kept on the same bays
    const bad5 = [];
    for (const rec of a.placed) {
      if (rec.per.length === 0) bad5.push('rot' + rec.rot + 'fl' + rec.fl + ' no docks');
      for (const d of rec.per) for (const p of d.per) {
        const ok = p.touch ? p.f !== '' && (a.raws.includes(p.f) || p.f === a.prod) : p.f === '';
        if (!ok) bad5.push('rot' + rec.rot + 'fl' + rec.fl + ' cls' + d.cls + ' bay' + p.i + ' touch=' + p.touch + ' f=' + JSON.stringify(p.f));
      }
    }
    check(bad5.length === 0, label + ' after Place rot0/1/3/flip filters kept' + (bad5.length ? ' -> ' + bad5.slice(0, 4).join(' | ') : ''));
    // 6 rotate keeps df equal to rot0
    check(eq(a.placed[1].dfs, a.placed[0].dfs) && eq(a.placed[2].dfs, a.placed[0].dfs), label + ' rot1 and rot3 df equal rot0');
    // 7 sav export carries the filters, sim pulls from filtered bays
    check(a.placed[0].ex === a.nDfPlan, label + ' export filtered blocks ' + a.placed[0].ex + ' == plan docks with df ' + a.nDfPlan);
    if (dock.in === 'ind') check(a.placed[0].pull > 0, label + ' sim pull from filtered Dock_2 bays ' + a.placed[0].pull);
    if (fails > before) console.log('   rep ' + label + ': ' + JSON.stringify(a.rep).slice(0, 1200));
  }
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS dock_auto_filters');
process.exit(fails ? 1 : 0);

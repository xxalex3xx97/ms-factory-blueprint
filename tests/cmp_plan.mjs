// checkCompose harness (composer slice C0): placerLayout(planner result) -> tile -> validity, connectivity flood (tests/lib/flood.mjs), machine counts vs planner, links1 run, table.
// Exports: async checkCompose(page, recipeKey, rate, mk, bk, opts) -> {ok, errs, row}. opts.strict (default true): machine counts must match the planner (K=1 exact; K>1 N<=built<=N+K-1, final stage exact),
// flood must be clean, product reaches an OZ container. strict:false (old Zones/Columns results): flood/counts are printed, not asserted; hard checks stay (layout ok, ov 0, span 0, no item in a wall).
// opts.mutate: delete one belt that the flood reached and return the mutated flood error count in row.mutErrs (must be > clean errs: flood turns red).
// Also: async printTree(page, name, rate, mk) -> text of the plan tree. bk = class of the Blocks select (passed as o.bk; the tile is whatever placerLayout built).
// Stage-wise links1 injection (spec 6.6) needs the composer's stage info (L.bl.cmp.stages): here links1(0,[]) is run with the containers as sources (links1 treats a raw container as a source at belt cap), flow checks print only. TODO C3.
// Run: node tests/cmp_plan.mjs [tree|gate]   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {floodPage} from './lib/flood.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- page side
const pageTree = a => {
  const rec = [].concat(...Object.values(RECS)).find(r => plnNm(r.o[0]) === a.name && (!a.crafter || true));
  if (!rec) return {err: 'recipe not found: ' + a.name};
  const item = rec.o[0], key = rk(rec);
  const P = plan(item, a.rate, a.mk, {}, {[item]: key}, {proto: false, enr: false, obs: false});
  const lines = ['== ' + a.name + ' @ ' + a.rate + '/min (recipe ' + key + ')'];
  const seen = new Set();
  const dfs = (x, d) => {
    if (seen.has(x)) { lines.push('  '.repeat(d) + '(again) ' + plnNm(x)); return }
    seen.add(x);
    const n = P.nodes[x], cons = P.edges.filter(e => e.from === x).length;
    if (!n || !n.crafter) { lines.push('  '.repeat(d) + plnNm(x) + ' RAW (consumers ' + cons + ')'); return }
    const r = n.rec, ins = r.i.map(([it, q]) => plnNm(it) + 'x' + q + (P.nodes[it] && P.nodes[it].crafter ? '[crafted]' : '[raw]') + (it === x ? '[self]' : ''));
    lines.push('  '.repeat(d) + plnNm(x) + ' crafter=' + (plnCb(n.crafter) ? def(plnCb(n.crafter).id).key : String(n.crafter)) + ' k=' + r.i.length + ' N=' + n.machines + ' util=' + (+n.util).toFixed(3) + ' rate=' + (+n.rate).toFixed(2) + ' consumers=' + cons + ' in: ' + ins.join(', '));
    r.i.forEach(([it]) => { if (it !== x) dfs(it, d + 1) });
  };
  dfs(item, 0);
  return {lines};
};

const pageRun = async a => {
  const isLane = c => PLC_BELT.includes(c) || PLC_SPL.includes(c) || PLC_UG.includes(c);
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.recipeKey);
  if (!rec) return {errs: ['recipe not found: ' + a.recipeKey]};
  const item = rec.o[0];
  const P = plan(item, a.rate, a.mk, {}, {[item]: a.recipeKey}, {proto: false, enr: false, obs: false});
  if (!P.nodes[item] || !P.nodes[item].rec) return {errs: ['planner: no node for ' + item]};
  const hasCmp = typeof cmpCompose === 'function';
  if (a.strict && !hasCmp) return {errs: ['strict: cmpCompose does not exist yet']};
  if (hasCmp && a.strict) window.CMP_ENGINE = true;
  const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: null, bk: a.bk});
  if (!L.ok) return {errs: ['layout refused: ' + L.why], refused: L.why};
  let T = L.tile;
  if (!T) { T = placerTile(L, placerBk()); if (!T.ok) return {errs: ['tile failed: ' + T.why]} }
  const errs = [], info = [];
  const ms = (T.ms || []).map(b => ({...b}));
  // load into the page model like tests/tpl_plan.mjs (ids from 500000, h 0)
  S.blocks = []; S.dm = [];
  let id = 500000;
  ms.forEach(b => S.blocks.push({...b, id: ++id, h: 0}));
  // (4) tile validity
  const hard = [];
  if (T.ov !== 0) hard.push('tile ov ' + T.ov);
  if (T.span !== 0) hard.push('tile span ' + T.span);
  const sc = T.blocks.every(b => b.x % FC === 0 && b.y % FC === 0) && T.blocks.some(b => b.x >= FC || b.y >= FC) ? 1 : FC;
  const geo = T.blocks.map(b => { const d = dim({cls: b.cls, rot: 0}), f = floorRect({cls: b.cls, x: 0, y: 0, h: 0, rot: 0}); return {x: b.x * sc, y: b.y * sc, TW: d.w * FC, TH: d.h * FC, Fw: f.w, Fh: f.h} });
  let wallHits = 0, outside = 0;
  ms.forEach(b => { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) {
    const g = geo.find(g => x >= g.x && x < g.x + g.TW && y >= g.y && y < g.y + g.TH);
    if (!g) { outside++; continue }
    if (x - g.x >= g.Fw || y - g.y >= g.Fh) wallHits++;
  } });
  if (wallHits) hard.push(wallHits + ' item cells in a wall');
  if (outside) hard.push(outside + ' item cells outside every block');
  const mx = def(PLC_UG[a.mk]).maxApart, pairs = ugPairs(S.blocks.filter(b => PLC_UG.includes(b.cls)));
  const badUg = pairs.filter(p => p.n > mx).length;
  if (badUg) hard.push(badUg + ' UG pairs longer than ' + mx);
  const unp = S.blocks.filter(b => PLC_UG.includes(b.cls)).length - 2 * pairs.length;
  if (unp) hard.push(unp + ' unpaired UG');
  // containers inside floors (own cells)
  // (3) machine counts per recipe key
  const stages = Object.values(P.nodes).filter(n => n.rec && n.crafter);
  const cnt = {}; ms.forEach(m => { if (m.rec) cnt[m.rec] = (cnt[m.rec] || 0) + 1 });
  const K = (L.bl && L.bl.cmp && L.bl.cmp.K) || 1;
  const count = [], cerrs = [];
  stages.forEach(n => {
    const key = rk(n.rec), built = cnt[key] || 0;
    count.push({item: plnNm(n.item), key, N: n.machines, built, util: +(+n.util).toFixed(3)});
    const fin = n.item === item;
    if (K === 1 ? built !== n.machines : fin ? built !== n.machines : (built < n.machines || built > n.machines + K - 1)) cerrs.push('stage ' + plnNm(n.item) + ': planner N=' + n.machines + ' built ' + built);
  });
  // (5) flood
  const fl = a.floodFn ? a.floodFn : null;
  const flood = a.flood;   // set by node side through page function below
  return {hard, cerrs, count, K, L: {eng: L.eng || null, blocks: T.blocks.length, ug: pairs.length}, items: ms, finalItems: [item], recKey: a.recipeKey, rate: a.rate, belts: ms.filter(b => PLC_BELT.includes(b.cls)).length, machines: ms.filter(b => b.rec).length, planBelts: null};
};

// links1 stats on the model loaded by pageRun (containers are sources)
const pageFlow = () => {
  const isLane = c => PLC_BELT.includes(c) || PLC_SPL.includes(c) || PLC_UG.includes(c);
  const K = links1(0, []);
  const ms = S.blocks.filter(q => !isLane(q.cls) && !isStore(q));
  let full = 0, partial = 0;
  ms.forEach(m => { const rows = supplyRows(m, K); const r = rows.length ? Math.min(...rows.map(x => x.need > 0 ? x.have / x.need : 1)) : 0; if (r >= 1 - 1e-9) full++; else partial++ });
  let mu = 0; K.load.forEach(e => { if (e.util != null) mu = Math.max(mu, e.util) });
  return {full, partial, mu: +mu.toFixed(3)};
};

const pageDelete = a => { const i = S.blocks.findIndex(b => PLC_BELT.includes(b.cls) && b.x + ',' + b.y === a.cell); if (i < 0) return false; S.blocks.splice(i, 1); return true };

export async function printTree(page, name, rate, mk = 1) {
  const r = await page.evaluate(pageTree, {name, rate, mk});
  return r.err ? 'ERR ' + r.err : r.lines.join('\n');
}

// node side: asserts. bk: class of the Blocks select (optional). Returns {ok, errs, row}.
export async function checkCompose(page, recipeKey, rate, mk = 1, bk = null, opts = {}) {
  const strict = opts.strict !== false;
  const r = await page.evaluate(pageRun, {recipeKey, rate, mk, bk, strict});
  const errs = [...(r.errs || [])];
  const row = {recipe: recipeKey, rate: +(+rate).toFixed(2)};
  if (r.errs) return {ok: false, errs, row, refused: r.refused};
  errs.push(...r.hard);
  const fl = await page.evaluate(floodPage, {items: r.items, finalItems: r.finalItems});
  const soft = [...r.cerrs, ...fl.errs];
  if (strict) { errs.push(...soft); if (!fl.ozReach.length) errs.push('product reaches no container') }
  else if (soft.length) console.log('  (non-strict) ' + soft.length + ' soft errs, first: ' + soft.slice(0, 2).join(' | '));
  const flow = await page.evaluate(pageFlow);
  if (strict && flow.mu > 1 + 1e-9) errs.push('belt util ' + flow.mu + ' > 1');
  Object.assign(row, {eng: r.L.eng, K: r.K, blocks: r.L.blocks, ug: r.L.ug, stages: r.count.map(c => c.item + ' N' + c.N + '/' + c.built + ' u' + c.util).join('; '), belts: r.belts, machines: r.machines,
    beltsPerMach: r.machines ? +(r.belts / r.machines).toFixed(1) : null, floodErrs: fl.errs.length, containers: fl.containers, ozReach: fl.ozReach.length, full: flow.full, partial: flow.partial, maxBelt: flow.mu});
  if (opts.mutate) {
    const reach = new Set(fl.reach), cand = r.items.filter(b => PLC_BELT_NAMES.includes(b.cls) && reach.has(b.x + ',' + b.y));
    const pick = cand[Math.floor(cand.length / 2)];
    const gone = pick ? r.items.filter(b => b !== pick) : null;
    if (!gone) errs.push('mutation: no belt reached by the flood');
    else { const m2 = await page.evaluate(floodPage, {items: gone, finalItems: r.finalItems}); row.mutErrs = m2.errs.length; row.mutOz = m2.ozReach.length; if (!(m2.errs.length > fl.errs.length || m2.ozReach.length < fl.ozReach.length)) errs.push('mutation (deleted belt @' + pick.x + ',' + pick.y + ') did not turn the flood red') }
  }
  return {ok: errs.length === 0, errs, row};
}
const PLC_BELT_NAMES = ['DAT_ConveyorBelt', 'DAT_ConveyorBelt2', 'DAT_ConveyorBelt3'];

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const mode = process.argv[2] || 'gate';
  const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
  let fails = 0; const pageErrs = [];
  try {
    const page = await (await br.newContext()).newPage();
    page.on('pageerror', e => pageErrs.push(e.message));
    await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=old');
    await page.waitForFunction(() => window.__fb && typeof plan === 'function' && typeof links1 === 'function' && typeof supplyRows === 'function' && typeof placerLayout === 'function');
    if (mode === 'c3') {   // composer C3 gate: Nickel Plates (plain and via enriched ore) x blocks, strict; needs ?engine=cmp
      await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
      await page.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof placerLayout === 'function');
      const keys = await page.evaluate(() => [].concat(...Object.values(RECS)).map(rk).filter(k => /NickelPlates$/.test(k)));
      console.log('nickel plate recipes: ' + keys);
      const BK = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02'}, rows = [];
      for (const key of keys) for (const rate of [31, 480]) for (const b in BK) {
        const r = await checkCompose(page, key, rate, 1, BK[b], {strict: true, mutate: true});
        rows.push({block: b, ...r.row});
        if (r.refused && /Enriched/.test(key)) { console.log('REFUSED (2-stage, not required) ' + key + ' ' + rate + ' ' + b + ': ' + r.refused); continue }
        console.log((r.ok ? 'PASS ' : 'FAIL ') + key + ' ' + rate + ' ' + b + (r.ok ? '' : ': ' + r.errs.join('; ')));
        if (!r.ok) fails++;
      }
      console.table(rows);
    } else if (mode === 'tree') {
      for (const [n, r] of [['Nickel Plates', 31], ['Nickel Plates', 480], ['Basic Circuits', 100], ['Capacitor', 100], ['Enzyme', 10], ['Advanced Circuits', 5]]) console.log(await printTree(page, n, r, 1) + '\n');
    } else {
      const key = await page.evaluate(() => { const r = [].concat(...Object.values(RECS)).find(x => x.i.length === 1 && /Silica/.test(rk(x)) && /SiliconWafers$/.test(rk(x))); return r ? rk(r) : null });
      if (!key) throw new Error('Silica>SiliconWafers recipe not found');
      const rows = [];
      for (const rate of [10, 200]) {
        const r = await checkCompose(page, key, rate, 1, null, {strict: false, mutate: true});
        rows.push(r.row);
        if (!r.ok) { fails++; console.log('FAIL rate ' + rate + ': ' + r.errs.join('; ')) }
      }
      console.table(rows);
    }
  } catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
  if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
  console.log(fails ? 'FAIL ' + fails : 'PASS cmp_plan');
  process.exit(fails ? 1 : 0);
}

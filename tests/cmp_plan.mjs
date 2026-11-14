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
  window.__cmpP = P;
  if (!P.nodes[item] || !P.nodes[item].rec) return {errs: ['planner: no node for ' + item]};
  const hasCmp = typeof cmpCompose === 'function';
  if (a.strict && !hasCmp) return {errs: ['strict: cmpCompose does not exist yet']};
  if (hasCmp && a.strict) window.CMP_ENGINE = true;
  const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock || null, bk: a.bk});
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
  const geo = T.blocks.filter(b => floorRect({cls: b.cls, x: 0, y: 0, h: 0, rot: 0})).map(b => { const r = b.rot === 1 || b.rot === 3 ? b.rot : 0, d = dim({cls: b.cls, rot: r}), f = floorRect({cls: b.cls, x: 0, y: 0, h: 0, rot: r}); return {x: b.x * sc, y: b.y * sc, TW: d.w * FC, TH: d.h * FC, Fw: f.w, Fh: f.h, mir: b.rot === 2, mirY: b.rot === 3} });   // rot 2 (west docks / adapters): floor mirrored in x, rot 3 (north docks): mirrored in y. dock blocks have no floor
  let wallHits = 0, outside = 0;
  ms.forEach(b => { if (b.dk === 'p') return; const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) {
    const g = geo.find(g => x >= g.x && x < g.x + g.TW && y >= g.y && y < g.y + g.TH);
    if (!g) { outside++; continue }
    if ((g.mir ? g.TW - 1 - (x - g.x) : x - g.x) >= g.Fw || (g.mirY ? g.TH - 1 - (y - g.y) : y - g.y) >= g.Fh) wallHits++;
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
  const arm = L.bl && L.bl.cmp && L.bl.cmp.arm;   // Armoury: no Armoury machine, one composer sub-factory per component (parts), judged per part
  window.__cmpL = L;
  const stages = arm ? [] : Object.values(P.nodes).filter(n => n.rec && n.crafter);
  const cnt = {}; ms.forEach(m => { if (m.rec) cnt[m.rec] = (cnt[m.rec] || 0) + 1 });
  const K = (L.bl && L.bl.cmp && L.bl.cmp.K) || 1;
  const count = [], cerrs = [];
  const sumN = {}, tn = L.bl && L.bl.cmp && L.bl.cmp.nodes;   // tree: count machines by cell inside each node's FB rect
  if (tn) { tn.forEach(q => {
    const built = ms.filter(m => m.rec && m.x >= q.fb.x && m.x < q.fb.x + q.fb.w && m.y >= q.fb.y && m.y < q.fb.y + q.fb.h).length;
    count.push({item: q.item, key: q.rec, N: q.pN, built, util: +(+q.pU).toFixed(3)});
    if (built !== q.N) cerrs.push('node ' + q.item + ': expected N=' + q.N + ' built ' + built);
    const sk = (q.part || 0) + ':' + q.rec; sumN[sk] = sumN[sk] || {item: q.item, pN: q.pN, n: 0, c: 0}; sumN[sk].n += built; sumN[sk].c++;
  });
  // unrolled fan-out copies (shared product built once per consumer / K strips): total never below the planner N, excess <= (copies-1)*pN and announced by a 'Planner N=.., built ..' note; a single copy equals it exactly
  Object.values(sumN).forEach(v => {
    const ex = v.n - v.pN;
    if (v.c === 1 || a.exactN ? ex !== 0 : ex < 0 || ex > (v.c - 1) * v.pN) cerrs.push('node ' + v.item + ': planner N=' + v.pN + ' built ' + v.n + ' in ' + v.c + ' copies');
    else if (ex > 0 && !L.note.some(n => n.includes('Planner N=' + v.pN + ', built ' + v.n))) cerrs.push('node ' + v.item + ': built ' + v.n + ' > planner N=' + v.pN + ' but no "Planner N=' + v.pN + ', built ' + v.n + '" note');
  });
  }
  if (arm) L.bl.cmp.parts.filter(p => !p.tree || !tn || !tn.some(q => q.part === L.bl.cmp.parts.indexOf(p))).forEach(p => p.stages.forEach((g, si) => {   // linear-chain components: machines per recipe key inside the part's rows vs the stage N (K strips: N..N+K-1, last stage exact)
    const built = ms.filter(m => m.rec === g.rec && m.y >= p.y0 && m.y < p.y1).length;
    count.push({item: p.item + '/' + g.item, key: g.rec, N: g.N, built, util: 0});
    if (p.K === 1 ? built !== g.N : si === p.stages.length - 1 ? built !== g.N : (built < g.N || built > g.N + p.K - 1)) cerrs.push('component ' + p.item + ' stage ' + g.item + ': planner N=' + g.N + ' built ' + built);
  }));
  if (!tn) stages.forEach(n => {
    const key = rk(n.rec), built = cnt[key] || 0;
    count.push({item: plnNm(n.item), key, N: n.machines, built, util: +(+n.util).toFixed(3)});
    const fin = n.item === item;
    if (K === 1 ? built !== n.machines : fin ? built !== n.machines : (built < n.machines || built > n.machines + K - 1)) cerrs.push('stage ' + plnNm(n.item) + ': planner N=' + n.machines + ' built ' + built);
  });
  // (5) flood
  const fl = a.floodFn ? a.floodFn : null;
  const flood = a.flood;   // set by node side through page function below
  return {arm: !!arm, nParts: arm ? L.bl.cmp.parts.length : 0, hard, cerrs, count, K, L: {eng: L.eng || null, blocks: T.blocks.length, ug: pairs.length}, items: ms, nodes: tn || null, routed: (L.bl && L.bl.cmp && L.bl.cmp.routed) || null, pm: P.nodes[item].pmach, finalItems: arm ? L.bl.cmp.parts.map(p => p.key) : [item], recKey: a.recipeKey, rate: a.rate, belts: ms.filter(b => PLC_BELT.includes(b.cls)).length, machines: ms.filter(b => b.rec).length, planBelts: null};
};

// links1 stats on the model loaded by pageRun (containers are sources)
const pageFlow = a => {
  const isLane = c => PLC_BELT.includes(c) || PLC_SPL.includes(c) || PLC_UG.includes(c);
  const K = links1(0, []);
  const ms = S.blocks.filter(q => !isLane(q.cls) && !isStore(q));
  let full = 0, partial = 0, oz = 0; const pl = [];
  ms.forEach(m => { const rows = supplyRows(m, K); const r = rows.length ? Math.min(...rows.map(x => x.need > 0 ? x.have / x.need : 1)) : 0; if (r >= 1 - 1e-9) full++; else { partial++; pl.push((m.rec || m.cls) + ':' + r.toFixed(2)) } if (a && m.rec === a.recKey) oz += Math.min(r, 1) * a.pm });
  let mu = 0; K.load.forEach(e => { if (e.util != null) mu = Math.max(mu, e.util) });
  return {full, partial, mu: +mu.toFixed(3), oz, pl};
};

// stage-wise links1 (spec 6.6): each node's FB alone, planner edge flows injected at its input lane cells; product on its out belts >= 0.99 x node rate
const pageStage = a => {
  const res = [];
  for (const q of a.nodes) {
    const P = q.part != null ? window.__cmpL.bl.cmp.parts[q.part].P : window.__cmpP;
    const its = a.items.filter(b => b.x >= q.fb.x && b.x < q.fb.x + q.fb.w && b.y >= q.fb.y && b.y < q.fb.y + q.fb.h).map(b => ({...b, x: b.x - q.fb.x, y: b.y - q.fb.y})).map(b => PLC_UG.includes(b.cls) && (b.x === 0 || b.x === q.fb.w - 1) ? {...b, cls: PLC_BELT[a.mk]} : b);   // wall UG ends back to belts (isolated block)
    S.blocks = []; let id = 600000; its.forEach(b => S.blocks.push({...b, id: ++id, h: 0}));
    // links1 drops output belts whose chain reaches no other machine (a lone N=1 machine has none): give each out row an empty sink container just east of the block
    const sk = a.items.find(b => isStore(b)); if (sk) q.outRows.forEach(y => S.blocks.push({...sk, x: q.fb.w, y: y - 1, id: ++id, h: 0, ct: []}));
    const idAt = (x, y) => (S.blocks.find(b => { const d = dim(b); return x >= b.x && x < b.x + d.w && y >= b.y && y < b.y + d.h }) || {}).id;
    // inject exactly the planner flow: edge flow x this copy's share of the planner node rate x lane share; growth seed lane = planner cycle flow (self input x rate / net)
    const nd = P.nodes[q.key], sc = nd && nd.rate > 0 ? q.rate / nd.rate : 1, gr = nd.rec.i.find(([x]) => x === q.key), net = gr ? nd.rec.o[1] - gr[1] : 0, selfFlow = net > 0 ? gr[1] * q.rate / net : 0;
    // lanes of one item share its flow by the machines a saturating probe of that lane alone supplies (top face 3 machines, bottom 2 -> 3:2); a lane whose belt chain reaches no machine (the unused second pool face of a lone machine) takes no flow; a key with no live lane keeps all (it then starves and the check turns red)
    const K0 = links1(0, []), live = l => (K0.chainMachines(S.blocks.find(b => b.id === idAt(0, l.y)) || {}) || []).length > 0, wt = l => { const K1 = links1(0, [{id: idAt(0, l.y), item: l.key, rate: 1e4}]); return S.blocks.filter(b => b.rec && (K1.sup.get(b.id) || new Map()).get(l.key) > 0).length || 1 }, kl = key => { const a = q.lanes.filter(z => z.key === key), v = a.filter(live); return v.length ? v : a };
    const injs = [];
    q.lanes.forEach(l => { const e = P.edges.find(e => e.from === l.key && e.to === q.key), ll = kl(l.key); if (!ll.includes(l)) return; const rate = (e ? e.flow * sc : l.key === q.key ? selfFlow : 0) * (l.m == null ? wt(l) / ll.reduce((t, z) => t + wt(z), 0) : l.m / q.N); if (rate > 0) injs.push({id: idAt(0, l.y), item: l.key, rate}) });
    const injSelf = injs.filter(i => i.item === q.key).reduce((s, i) => s + i.rate, 0);   // injected product-item flow: passes through to the out belts, not produced
    const K = links1(0, injs);
    // CAN see: (a) out belts can carry the node rate (links1 makes every live machine a full-speed source, so this is N x pm, minus injected pass-through; it ignores input supply); (b) supply reading = sum over machines of min input ratio x per-machine rate, from the exactly injected flows (non-circular: a lane that starves or over-feeds a machine moves it). CANNOT see: real machine output belts of growth chambers (links1 stops flow at the machine), belt timing, splitter priority at run time.
    const beltCap = Math.max(0, q.outRows.reduce((s, y) => s + (((K.load.get(idAt(q.fb.w - 1, y)) || {}).items || new Map()).get(q.key) || 0), 0) - injSelf);
    const pm = q.rate / (q.N * q.util), gm = S.blocks.filter(b => b.rec);
    const prod = gm.reduce((s, m) => { const rows = supplyRows(m, K); return s + (rows.length ? Math.min(1, ...rows.map(x => x.need > 0 ? x.have / x.need : 1)) : 0) * pm }, 0);
    const growth = S.blocks.some(b => /GrowthChamber/.test(b.cls));
    res.push({item: q.item, rate: q.rate, prod: +prod.toFixed(2), beltCap: growth ? null : +beltCap.toFixed(2), inj: injs.length});
  }
  return res;
};
const pageDelete = a => { const i = S.blocks.findIndex(b => PLC_BELT.includes(b.cls) && b.x + ',' + b.y === a.cell); if (i < 0) return false; S.blocks.splice(i, 1); return true };

export async function printTree(page, name, rate, mk = 1) {
  const r = await page.evaluate(pageTree, {name, rate, mk});
  return r.err ? 'ERR ' + r.err : r.lines.join('\n');
}

// node side: asserts. bk: class of the Blocks select (optional). Returns {ok, errs, row}.
export const PROF = {n: 0, build: 0, flood: 0, flow: 0, stage: 0, mut: 0};   // PROF=1: per-phase ms summed over checkCompose calls (printed on exit)
const tm = async (k, f) => { const t = Date.now(); try { return await f() } finally { PROF[k] += Date.now() - t } };
if (process.env.PROF) process.on('exit', () => console.log('PROF ' + JSON.stringify(PROF)));
export async function checkCompose(page, recipeKey, rate, mk = 1, bk = null, opts = {}) {
  const strict = opts.strict !== false; PROF.n++;
  if (!process.env.NOMEMO) await page.evaluate(() => { window.CMP_MEMO = true });   // page compose memo (js/compose.js): the dock/info recompose of the same case is free
  const r = await tm('build', () => page.evaluate(pageRun, {recipeKey, rate, mk, bk, strict, dock: opts.dock || null, exactN: !!opts.exactN}));
  const errs = [...(r.errs || [])];
  const row = {recipe: recipeKey, rate: +(+rate).toFixed(2)};
  if (r.errs) return {ok: false, errs, row, refused: r.refused};
  errs.push(...r.hard);
  const fl = await tm('flood', () => page.evaluate(floodPage, {items: r.items, finalItems: r.finalItems}));
  const soft = [...r.cerrs, ...fl.errs];
  if (strict) { errs.push(...soft); if (!fl.ozReach.length) errs.push('product reaches no container'); if (r.arm && fl.ozReach.length < r.nParts) errs.push('Armoury: ' + r.nParts + ' components but only ' + fl.ozReach.length + ' reach a container') }
  else if (soft.length) console.log('  (non-strict) ' + soft.length + ' soft errs, first: ' + soft.slice(0, 2).join(' | '));
  if (r.nodes) {   // every machine output reaches its own node's POOL container
    for (const q of r.nodes) for (const m of fl.outAt.filter(m => m.x >= q.fb.x && m.x < q.fb.x + q.fb.w && m.y >= q.fb.y && m.y < q.fb.y + q.fb.h)) if (!m.c.some(c => q.ct.includes(c))) errs.push('node ' + q.item + ': machine @' + m.x + ',' + m.y + ' output misses its POOL');
    const ozc = r.nodes.find(q => q.row === Math.min(...r.nodes.map(z => z.row)) && q.pool === Math.max(...r.nodes.map(z => z.pool)));
    if (!r.arm && ozc && !ozc.ct.length) errs.push('no OZ container');
  }
  const flow = await tm('flow', () => page.evaluate(pageFlow, {recKey: r.recKey, pm: r.pm}));
  if (strict && flow.mu > 1 + 1e-9) errs.push('belt util ' + flow.mu + ' > 1');
  if (r.nodes) {
    const st = await tm('stage', () => page.evaluate(pageStage, {nodes: r.nodes, items: r.items, mk}));
    st.forEach(z => {
      if (z.prod < 0.99 * z.rate) errs.push('stage ' + z.item + ': product ' + z.prod + ' < 0.99 x ' + (+z.rate).toFixed(2));
      if (z.prod > 1.05 * z.rate) errs.push('stage ' + z.item + ': product ' + z.prod + ' > 1.05 x ' + (+z.rate).toFixed(2) + ' (over-feed or injection artifact)');
      if (z.beltCap != null && z.beltCap < 0.99 * z.rate) errs.push('stage ' + z.item + ': out belts carry ' + z.beltCap + ' < 0.99 x ' + (+z.rate).toFixed(2));
    });
    row.stageProd = st.map(z => z.item.slice(0, 8) + ' ' + z.prod + '/' + (+z.rate).toFixed(1) + (z.beltCap != null ? ' belt' + z.beltCap : '') + ' inj' + z.inj).join('; ');
    if (opts.oz) console.log('  stage-wise: ' + row.stageProd);
  }
  Object.assign(row, {eng: r.L.eng, K: r.K, blocks: r.L.blocks, ug: r.L.ug, stages: r.count.map(c => c.item + ' N' + c.N + '/' + c.built + ' u' + c.util).join('; '), belts: r.belts, machines: r.machines,
    beltsPerMach: r.machines ? +(r.belts / r.machines).toFixed(1) : null, floodErrs: fl.errs.length, containers: fl.containers, ozReach: fl.ozReach.length, full: flow.full, partial: flow.partial, maxBelt: flow.mu});
  const t0m = Date.now();
  if (opts.mutate) {
    const reach = new Set(fl.reach), cand = r.items.filter(b => PLC_BELT_NAMES.includes(b.cls) && reach.has(b.x + ',' + b.y));
    // opts.mutate === 'any' (multi-lane: parallel lanes of one item are redundant for an item-level flood): try up to 12 evenly spaced belts, at least one must turn the flood red
    const picks = opts.mutate === 'any' ? Array.from({length: Math.min(MUT, cand.length)}, (_, i) => cand[Math.floor((i + .5) * cand.length / Math.min(MUT, cand.length))]) : [cand[Math.floor(cand.length / 2)]];
    if (!picks[0]) errs.push('mutation: no belt reached by the flood');
    else { let red = false; for (const pick of picks) { const m2 = await page.evaluate(floodPage, {items: r.items.filter(b => b !== pick), finalItems: r.finalItems}); row.mutErrs = m2.errs.length; row.mutOz = m2.ozReach.length; if (m2.errs.length > fl.errs.length || m2.ozReach.length < fl.ozReach.length) { red = true; break } } if (!red) errs.push('mutation (deleted belt @' + picks[0].x + ',' + picks[0].y + (picks.length > 1 ? ' +' + (picks.length - 1) + ' more' : '') + ') did not turn the flood red') }
  }
  if (opts.mutate && r.routed && r.routed.length) {   // router mutations: delete one routed belt, then one routed UG exit
    const isUg = b => b.cls.includes('Underground') || b.cls.includes('UG');
    for (const kind of ['belt', 'exit']) {
      const gone = await page.evaluate(({items, routed, kind, any, mut}) => {
        const ugs = items.filter(b => PLC_UG.includes(b.cls)), ex = new Set(ugPairs(ugs).map(p => p.t.x + ',' + p.t.y)), rs = new Set(routed.map(q => q.x + ',' + q.y));
        const c = items.filter(b => rs.has(b.x + ',' + b.y) && (kind === 'exit' ? ex.has(b.x + ',' + b.y) : PLC_BELT.includes(b.cls)));
        const nn = any ? Math.min(mut, c.length) : 1;
        return Array.from({length: nn}, (_, i) => c[any ? Math.floor((i + .5) * c.length / nn) : Math.floor(c.length / 2)]).filter(Boolean).map(pick => ({x: pick.x, y: pick.y}));
      }, {items: r.items, routed: r.routed, kind, any: opts.mutate === 'any', mut: MUT});
      if (!gone.length) { if (kind === 'belt') errs.push('mutation: no routed belt'); continue }
      let red = false;
      for (const g of gone) { const m2 = await page.evaluate(floodPage, {items: r.items.filter(b => !(b.x === g.x && b.y === g.y)), finalItems: r.finalItems}); row['mut' + kind] = m2.errs.length; if (m2.errs.length > fl.errs.length || m2.ozReach.length < fl.ozReach.length) { red = true; break } }
      if (!red) errs.push('mutation (deleted routed ' + kind + ' @' + gone[0].x + ',' + gone[0].y + ') did not turn the flood red');
    }
  }
  PROF.mut += Date.now() - t0m;
  return {ok: errs.length === 0, errs, row, nodes: r.nodes, count: r.count, items: r.items};
}
const MUT = +process.env.MUT || 12;   // belts tried per 'any' mutation, stops at the first red (cases that go red early cost nothing); MUT=4 for a cheaper run (can miss redundant-lane cases, e.g. Maglev)
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
    } else if (mode === 'c7a') {   // composer S7a gate: all-raw multi-input stages (growth chambers), 2 rates x blocks, strict; seed container finite + note
      await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
      await page.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof placerLayout === 'function');
      const recs = await page.evaluate(() => {
        const r = [];
        for (const rec of [].concat(...Object.values(RECS))) {
          if (rec.i.length < 2) continue;
          const item = rec.o[0], key = rk(rec);
          let P; try { P = plan(item, 60, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false}) } catch (e) { continue }
          const n = P.nodes[item];
          if (!n || !n.rec || !n.crafter || !plnCb(n.crafter)) continue;
          if (rec.i.some(([it]) => it !== item && P.nodes[it] && P.nodes[it].crafter)) continue;
          r.push({key, name: plnNm(item), cls: def(plnCb(n.crafter).id).key, k: rec.i.length, pm: n.pmach, growth: rec.i.some(([it]) => it === item)});
        }
        return r;
      });
      console.log('all-raw k>=2 recipes:'); recs.forEach(r => console.log('  ' + JSON.stringify(r)));
      const BK = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02'}, rows = [];
      for (const rc of recs) for (const mult of [0.5, 7.5]) for (const b in BK) {
        const rate = rc.pm * mult;
        const r = await checkCompose(page, rc.key, rate, 1, BK[b], {strict: true, mutate: true});
        const cs = await page.evaluate(() => { const c = S.blocks.filter(q => q.ct && q.ct.length); return {fin: c.filter(q => q.ct[0].inf === false && q.ct[0].n === 0).length, inf: c.filter(q => q.ct[0].inf).length} });
        if (!r.refused && rc.growth && (cs.fin < 1 || cs.fin >= cs.inf + 1 && rc.k > 1 && cs.inf < cs.fin)) { r.ok = false; r.errs.push('seed containers: ' + JSON.stringify(cs)) }
        rows.push({block: b, tpl: rc.cls, k: rc.k, ...r.row});
        if (r.refused) { console.log('REFUSED ' + rc.name + ' ' + rate.toFixed(1) + ' ' + b + ': ' + r.refused); continue }
        console.log((r.ok ? 'PASS ' : 'FAIL ') + rc.name + ' ' + rate.toFixed(1) + ' ' + b + (r.ok ? '' : ': ' + r.errs.join('; ')));
        if (!r.ok) fails++;
      }
      console.table(rows);
    } else if (mode === 's7b') {   // composer S7b gate: merge trees, strict, 2x2
      await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
      await page.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof cmpAssembleTree === 'function');
      const cand = await page.evaluate(() => {   // step 1 scan: 1 crafted + 1 raw input
        const r = [];
        for (const rec of [].concat(...Object.values(RECS))) {
          if (rec.i.length !== 2) continue;
          const item = rec.o[0], key = rk(rec); let P; try { P = plan(item, 30, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false}) } catch (e) { continue }
          const n = P.nodes[item]; if (!n || !n.rec || !n.crafter || !plnCb(n.crafter)) continue;
          const cr = rec.i.filter(([it]) => it !== item && P.nodes[it] && P.nodes[it].crafter);
          if (cr.length === 1 && rec.i.length === 2 && !rec.i.some(([it]) => it === item)) r.push(key + ' k=2 N=' + n.machines + ' crafted=' + plnNm(cr[0][0]));
        }
        return r;
      });
      console.log('1 crafted + 1 raw candidates (' + cand.length + '):'); cand.slice(0, 12).forEach(c => console.log('  ' + c));
      const want = (process.argv[3] || 'capacitor,bc').split(','), S = {capacitor: ['ITEM_NickelPlates+ITEM_TitaniumPlates>ITEM_Capacitor', 100], bc: ['ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit', 100], enzyme: ['ITEM_Biomass+ITEM_Xenobacteria+ITEM_Nutrients>ITEM_Enzyme', 10], aa: ['ITEM_DetectorArray+ITEM_BasicCircuit+ITEM_Superalloy+ITEM_Coolant>ITEM_AdvancedCircuits', 5]}, rows = [];
      for (const w of want) {
        const [key, rate] = S[w] || [w, 100];
        const r = await checkCompose(page, key, rate, 1, 'BPO_Station_02', {strict: true, mutate: true, oz: true});
        rows.push({tree: w, ...r.row});
        if (r.refused) { console.log('REFUSED ' + w + ': ' + r.refused); fails++; continue }
        console.log((r.ok ? 'PASS ' : 'FAIL ') + w + (r.ok ? '' : ': ' + r.errs.join('; ')));
        if (r.count) console.table(r.count);
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

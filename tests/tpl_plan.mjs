// checkPlan gate: template machines + lanes vs the production planner (plan() in js/planner.js), run in the page with links1/supplyRows (js/model.js).
// Self-test (node tests/tpl_plan.mjs): refinery_1in, Silica>SiliconWafers, blocks 1x1 1x2 2x2 2x2c, rates from the planner (pmach, nMax).
// tpl = {build:'tplBuild', max:'tplMax', cls:'DAT_Refinery'} = names of page-global template functions (template file loaded in the page).
// Planner N = P.nodes[item].machines, pmach = P.nodes[item].pmach, last machine load = rate/pmach-(N-1).
// N > nMax: B = ceil(N/nMax) copies (one per block, stacked vertically in S.blocks), copy j gets ceil(N/B) machines (last gets remainder), each with its own lanes.
// Sources: each in port of each copy injected at planner flow * (n_j/N) * (row machines / n_j), i.e. planner-share mode (saturated mode not built).
// checkPlan(page,tpl,recipeKey,rate,block,mk=1,opts={}): opts = planner opts {proto,enr,obs} (defaults all false; Relic/Protomatter need proto:true) + {fillFirst:true}.
// fillFirst: each lane group (copy, set, port copy) is injected at the planner demand in fill order (copy 0 first, set order, copy order), and per machine it asserts floor(rate/pmach) machines full + one partial = frac.
// rows contract accepted: rows[p.row] (fallback rows[port index]) as a plain number or {m}, in any template; k=0 (no in ports) skips injection.
// Product: sum over machines of min(1,min(have/need over supplyRows)) * pmach (multi-input and growth recipes; growth: pmach = net*1800/t, seed lane injected at gross q_self*rate/net).
// If the planner's recipe differs from the machine's (rk collision, e.g. ReinforcedPlates Assembler vs AdvancedAssembler alt) N/pmach/flows are derived from the machine's recipe (returned as recMismatch).
// Run: node tests/tpl_plan.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEF_TPL = {build: 'tplBuild', max: 'tplMax', cls: 'DAT_Refinery'};

// page side: everything runs in the page (plan, links1, supplyRows are page globals)
const pageRun = async a => {
  const isLane = c => PLC_BELT.includes(c) || PLC_SPL.includes(c) || PLC_UG.includes(c);
  const rec = (recsOf(def({cls: a.cls})).find(r => rk(r) === a.recipeKey)) || [].concat(...Object.values(RECS)).find(r => rk(r) === a.recipeKey);
  if (!rec) return {errs: ['recipe not found: ' + a.recipeKey]};
  const outItem = rec.o[0];
  const P = plan(outItem, a.rate, a.mk, {}, {[outItem]: a.recipeKey}, {proto: false, enr: false, obs: false, ...a.opts});
  const nd = P.nodes[outItem];
  if (!nd || !nd.rec) return {errs: ['planner: no node for ' + outItem]};
  const inEdges = P.edges.filter(e => e.to === outItem);
  const gr = rec.i.find(x => x[0] === outItem), net = gr ? rec.o[1] - gr[1] : 0, G = net > 0;
  const mism = JSON.stringify(nd.rec) !== JSON.stringify(rec);
  let N = nd.machines, pm = nd.pmach, flow = Object.fromEntries(inEdges.map(e => [e.from, e.flow]));
  let belts = Math.max(0, ...inEdges.map(e => e.belts));
  if (mism) {   // planner picked another recipe with the same rk: scale the machine's own recipe
    pm = (G ? net : rec.o[1]) * 1800 / rec.t; N = Math.ceil(a.rate / pm - 1e-9);
    flow = Object.fromEntries(rec.i.filter(([x]) => !(G && x === outItem)).map(([x, q]) => [x, q * a.rate / (G ? net : rec.o[1])]));
    belts = Math.max(0, ...Object.values(flow).map(v => Math.ceil(v / MKS[a.mk][1] - 1e-9)));
  }
  const planIn = Object.values(flow).reduce((s, v) => s + v, 0);
  if (G) flow[outItem] = gr[1] * a.rate / net;   // seed lane: gross rate (growth input is not a planner edge)
  const rowM = (b, p, t) => { const v = b.rows && (b.rows[p.row] !== undefined ? b.rows[p.row] : b.rows[t]); return typeof v === 'number' ? v : v && typeof v.m === 'number' ? v.m : null };
  let U = a.rate / pm; const Utot = U;
  const spec = {block: a.block, cls: a.cls, rec: a.recipeKey, mk: a.mk, spMk: a.mk};
  const nMax = window[a.tpl.max](spec);
  if (!(nMax >= 1)) return {errs: ['nMax 0 for ' + a.block]};
  const B = Math.ceil(N / nMax), per = Math.ceil(N / B), counts = [];
  for (let left = N, j = 0; j < B && left > 0; j++) { const nj = Math.min(per, left); counts.push(nj); left -= nj }
  S.blocks = []; S.dm = [];
  let id = 500000, yoff = 0;
  const outIds = [], injs = [], errs = [];
  const idAt = (x, y) => (S.blocks.find(q => q.x === x && q.y === y && isLane(q.cls)) || {}).id;
  for (const nj of counts) {
    const b = window[a.tpl.build]({...spec, n: nj});
    if (!b.ok) { errs.push('copy n=' + nj + ': ' + b.why); break }
    for (const it of b.items) {
      const q = {...it, id: ++id, h: 0, y: it.y + yoff};
      if (!isLane(q.cls) && q.rec === undefined) q.rec = a.recipeKey;
      S.blocks.push(q);
    }
    const itemOf = p => typeof p.item === 'number' ? rec.i[p.item][0] : p.item;
    if (a.opts && a.opts.fillFirst) {   // demand in fill order: group = (set, port copy), all ports of a group feed the same machines
      const grp = new Map();
      b.ports.in.forEach((p, t) => { const key = (p.set || 0) + '|' + (p.copy || 0), g = grp.get(key) || grp.set(key, {s: p.set || 0, c: p.copy || 0, m: 0, ps: []}).get(key); const m = rowM(b, p, t); g.m = Math.max(g.m, m == null ? nj : m); g.ps.push(p) });
      [...grp.values()].sort((x, y) => x.s - y.s || x.c - y.c).forEach(g => {
        const u = Math.min(g.m, U); U -= u;
        if (u > 0) g.ps.forEach(p => { const item = itemOf(p), rate = (flow[item] || 0) * u / Utot; if (rate > 0) injs.push({id: idAt(p.x, p.y + yoff), item, rate}) });
      });
    } else b.ports.in.forEach((p, t) => {
      const m = rowM(b, p, t), w = m != null ? m / nj : 1 / b.ports.in.length;
      const item = itemOf(p);
      const rate = (flow[item] || 0) * (nj / N) * w;
      if (rate > 0) injs.push({id: idAt(p.x, p.y + yoff), item, rate});
    });
    b.ports.out.forEach(p => outIds.push(idAt(p.x, p.y + yoff)));
    yoff += b.h + 4;
  }
  if (errs.length) return {errs};
  const K = links1(0, injs);
  const ms = S.blocks.filter(q => !isLane(q.cls));
  const ratios = [], statuses = [];
  for (const m of ms) {
    const rows = supplyRows(m, K);
    statuses.push(...rows.map(r => r.st));
    ratios.push(rows.length ? Math.min(...rows.map(r => r.need > 0 ? r.have / r.need : 1)) : 1);
  }
  const prod = outIds.reduce((s, i) => s + ((K.load.get(i) || {}).tot || 0), 0);
  let mu = 0; K.load.forEach(e => { if (e.util != null) mu = Math.max(mu, e.util) });
  const sumHave = ms.reduce((s, m) => s + supplyRows(m, K).filter(x => !(G && x.item === outItem)).reduce((t, x) => t + x.have, 0), 0);   // input actually delivered to machines (growth seed lane excluded: not a planner edge)
  const prodPull = ratios.reduce((s, x) => s + Math.min(1, x) * pm, 0);   // product from delivered input: limiting row ratio x pmach per machine (multi-input + growth)
  return {N, pm, u: a.rate / pm - (N - 1), nMax, B: counts.length, machines: ms.length, ratios, statuses, prod, prodPull, planIn, sumHave, mu, belts, k: rec.i.length, recMismatch: mism, errs};
};

// node side: asserts. tpl = {build, max, cls} (defaults refinery_1in names). Returns a table row, ok, errs.
export async function checkPlan(page, tpl, recipeKey, ratePerMin, blockType, mk = 1, opts = {}) {
  const r = await page.evaluate(pageRun, {tpl: tpl || DEF_TPL, recipeKey, rate: ratePerMin, block: blockType, cls: (tpl || DEF_TPL).cls, mk, opts});
  const errs = [...(r.errs || [])];
  if (!r.errs || r.errs.length === 0) {
    // aggregate gate. Per-machine split is NOT asserted: the flow calc splits equally across machines of a row (fill-first would need priority splitters), see minUtil/maxUtil.
    const tol = 0.01;
    if (r.machines !== r.N) errs.push('machine count ' + r.machines + ' != planner N ' + r.N);
    if (Math.abs(r.sumHave - r.planIn) > tol * r.planIn) errs.push('delivered input ' + r.sumHave.toFixed(2) + ' != planner input ' + r.planIn.toFixed(2));
    if (r.prodPull < ratePerMin * (1 - tol)) errs.push('product ' + r.prodPull.toFixed(2) + ' < rate ' + ratePerMin.toFixed(2));
    if (opts.fillFirst && r.k > 0) {   // exact planner semantics: floor(U) machines full, one partial = frac(U)
      const U = ratePerMin / r.pm, full = Math.floor(U + 1e-9), fr = U - full, part = r.ratios.filter(x => x < 1 - tol), nf = r.ratios.length - part.length;
      if (nf !== full) errs.push('fill-first: ' + nf + ' machines full, want ' + full);
      if (part.length !== (fr > 1e-9 ? 1 : 0)) errs.push('fill-first: ' + part.length + ' partial machines, want ' + (fr > 1e-9 ? 1 : 0) + ' ratios ' + r.ratios.map(x => +x.toFixed(2)).join(','));
      else if (part.length && Math.abs(part[0] - fr) > 0.02) errs.push('fill-first: partial machine at ' + part[0].toFixed(3) + ', want ' + fr.toFixed(3));
    }
    if (r.mu > 1 + 1e-9) errs.push('belt util ' + r.mu.toFixed(4) + ' > 1');
  }
  const row = {block: blockType, recipe: recipeKey, rate: +ratePerMin.toFixed(2), N: r.N, B: r.B, nMax: r.nMax, pmach: r.pm && +r.pm.toFixed(2),
    planUtil: r.N ? +(ratePerMin / (r.N * r.pm)).toFixed(4) : null, minUtil: r.ratios && r.ratios.length ? +Math.min(...r.ratios).toFixed(4) : null,
    maxUtil: r.ratios && r.ratios.length ? +Math.max(...r.ratios).toFixed(4) : null, belts: r.belts,
    maxBeltUtil: r.mu != null ? +r.mu.toFixed(4) : null, supply: r.ratios && r.ratios.every(x => x >= 1 - 1e-9) ? 'full' : 'partial', machines: r.machines};
  return {ok: errs.length === 0, errs, row};
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
  let fails = 0; const pageErrs = [];
  try {
    const page = await (await br.newContext()).newPage();
    page.on('pageerror', e => pageErrs.push(e.message));
    await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=old');
    await page.waitForFunction(() => window.__fb && typeof plan === 'function' && typeof links1 === 'function' && typeof supplyRows === 'function');
    // iface.js is already loaded by index.html
    await page.addScriptTag({path: ROOT + '/js/tpl/refinery_1in.js'});
    const key = await page.evaluate(() => { const r = [].concat(...Object.values(RECS)).find(x => x.i.length === 1 && /Silica/.test(rk(x)) && /SiliconWafers$/.test(rk(x))); return r ? rk(r) : null });
    if (!key) throw new Error('Silica>SiliconWafers recipe not found');
    console.log('recipe ' + key);
    const rows = [];
    for (const block of ['1x1', '1x2', '2x2', '2x2c']) {
      const info = await page.evaluate(([k, blk, t]) => { const r = [].concat(...Object.values(RECS)).find(x => rk(x) === k); const P = plan(r.o[0], 1, 1, {}, {[r.o[0]]: k}, {proto: false, enr: false, obs: false}); return {pm: P.nodes[r.o[0]].pmach, nMax: window[t.max]({block: blk, cls: t.cls, rec: k, mk: 1, spMk: 1})} }, [key, block, DEF_TPL]);
      if (!(info.nMax >= 1)) { console.log(block + ': nMax 0, skipped'); continue }
      const pm = info.pm, nm = info.nMax;
      const sets = [['R1 pmach', pm], ['R1b 0.25 pmach', 0.25 * pm], ['R2 (nMax-1+0.3)', (nm - 1 + 0.3) * pm], ['R3 nMax', nm * pm], ['R4 (nMax+1)', (nm + 1) * pm], ['R4b (2nMax+0.5)', (2 * nm + 0.5) * pm]];
      for (const [tag, rate] of sets) {
        const r = await checkPlan(page, DEF_TPL, key, rate, block, 1);
        r.row.set = tag;
        rows.push(r.row);
        if (!r.ok) { fails++; console.log('FAIL ' + block + ' ' + tag + ': ' + r.errs.join('; ')) }
      }
    }
    console.log('\nset                 block  rate     N   B  nMax  pmach   planUtil minUtil maxUtil belts maxBelt supply machines');
    for (const x of rows) console.log([x.set.padEnd(19), x.block.padEnd(5), String(x.rate).padEnd(8), String(x.N).padEnd(3), String(x.B).padEnd(2), String(x.nMax).padEnd(5), String(x.pmach).padEnd(7), String(x.planUtil).padEnd(8), String(x.minUtil).padEnd(7), String(x.maxUtil).padEnd(7), String(x.belts).padEnd(5), String(x.maxBeltUtil).padEnd(7), x.supply.padEnd(7), x.machines].join(' '));
  } catch (e) { fails++; console.log('FAIL exception ' + e.message) } finally { await br.close() }
  if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
  console.log(fails ? 'FAIL ' + fails : 'PASS tpl_plan');
  process.exit(fails ? 1 : 0);
}

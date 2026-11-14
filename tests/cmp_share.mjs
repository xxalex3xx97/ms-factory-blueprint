// CMP share measure: cmpPlan unrolled vs opts.share (planner DAG) on 2x2. Run: node tests/cmp_share.mjs table. Exit 0 (1 on page error/violation).
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'table';
if (mode !== 'table') { console.log('usage: node tests/cmp_share.mjs table'); process.exit(1) }

const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const page = await (await br.newContext()).newPage(); const pe = [];
page.on('pageerror', e => pe.push(e.message));
await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await page.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof cmpAssembleTree === 'function');

const ADV = 'ITEM_ChromaticAlloy+ITEM_ChitinComposite+ITEM_ReinforcedPlates+ITEM_Multisensor>ITEM_AdvancedPlates';
const EXO = 'ITEM_AdvancedPlates+ITEM_BackpackMk3+ITEM_ExoskeletonMk3>ITEM_Exosuit';
// cfg: {key (exact) | rx (regex source), rate} or {item, rate} (leaf, planner default pick)
const measure = ({cfg, bk}) => {
  const all = [].concat(...Object.values(RECS));
  let item = cfg.item, pick = {};
  if (!item) {
    const rec = all.find(r => cfg.rx ? new RegExp(cfg.rx).test(rk(r)) : rk(r) === cfg.key);
    if (!rec) return {err: 'recipe not found'};
    item = rec.o[0]; pick = {[item]: rk(rec)};
  }
  const block = CMP_BLOCKS[PL_ALL.indexOf(bk)];
  const P = plan(item, cfg.rate, 1, {}, pick, {proto: false, enr: false, obs: false});
  const planSum = Object.values(P.nodes).reduce((s, n) => s + (n.machines || 0), 0);
  const out = {planSum};
  for (const share of [false, true]) {
    const pl = cmpPlan(P, item, 1, share ? {share: true} : {});
    if (!pl.ok) return {err: 'cmpPlan' + (share ? ' share' : '') + ': ' + pl.why};
    const caps = {}; let tz;
    try { tz = cmpTreeSize(pl, 1, 1, block, caps) } catch (e) { tz = {ok: false, why: 'throw ' + e} }
    const ns = pl.nodes.filter(o => !o.raw), by = Object.fromEntries(pl.nodes.map(o => [o.id, o]));
    let gap = 0;
    if (share) gap = pl.maxGap;
    else ns.forEach(o => o.children.forEach(c => { const q = by[c]; if (!q.raw) gap = Math.max(gap, q.depth - o.depth - 1) }));
    out[share ? 'sh' : 'un'] = {machines: ns.reduce((s, o) => s + o.N, 0), blocks: ns.reduce((s, o) => s + (caps[o.key] ? Math.ceil(o.N / caps[o.key]) : 0), 0), maxGap: gap, shared: share ? ns.filter(o => (o.parents || []).length > 1).length : 0, partial: tz.ok ? '' : tz.why};
  }
  return out;
};
const leaves = ({k}) => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === k), item = rec.o[0];
  const P = plan(item, 1, 1, {}, {[item]: k}, {proto: false, enr: false, obs: false}), leaf = new Map();
  const isA = x => { const T = P.nodes[x]; return T && T.crafter && /Armoury/i.test(T.crafter) };
  const walk = (x, r) => { const T = P.nodes[x]; for (const [y, n] of T.rec.i) { const q = r * n / T.rec.o[1]; if (isA(y)) walk(y, q); else leaf.set(y, (leaf.get(y) || 0) + q) } };
  walk(item, P.nodes[item].rate);
  return [...leaf].map(([c, r]) => ({c, r}));
};
const BK = 'BPO_Station_02';
const run = async (label, cfg) => ({label, ...(await page.evaluate(measure, {cfg, bk: BK}))});

const res = [];
res.push(await run('AdvCircuits 30', {rx: '>ITEM_AdvancedCircuits$', rate: 30}));
res.push(await run('Capacitor 100', {rx: '>ITEM_Capacitor$', rate: 100}));
res.push(await run('BC 100', {rx: '>ITEM_BasicCircuit$', rate: 100}));
res.push(await run('AdvPlate 30', {key: ADV, rate: 30}));
const exr = await run('Exosuit 1', {key: EXO, rate: 1}); res.push(exr);
if (exr.err) for (const {c, r} of await page.evaluate(leaves, {k: EXO})) res.push(await run('Exo leaf ' + c.replace('ITEM_', '') + ' ' + (+r.toFixed(2)), {item: c, rate: r}));

let fails = 0; const rows = [];
for (const r of res) {
  if (r.err) { rows.push({case: r.label, err: r.err}); continue }
  const ok = Math.abs(r.sh.machines - r.planSum) < 1e-9 && r.sh.machines <= r.un.machines;
  if (!ok) fails++;
  rows.push({case: r.label, unM: r.un.machines, shM: r.sh.machines, plan: r.planSum, unB: r.un.blocks, shB: r.sh.blocks, unGap: r.un.maxGap, shGap: r.sh.maxGap, shared: r.sh.shared, ok: ok ? 'y' : 'N', partial: r.sh.partial || r.un.partial ? 'caps partial' : ''});
}
console.table(rows);
for (const r of res) if (!r.err && (r.sh.partial || r.un.partial)) console.log('caps partial for ' + r.label + ': ' + (r.sh.partial || r.un.partial));
if (pe.length) { console.log('page errors: ' + pe[0]); fails++ }
await br.close();
console.log(fails ? 'FAIL ' + fails : 'PASS cmp_share table');
process.exit(fails ? 1 : 0);

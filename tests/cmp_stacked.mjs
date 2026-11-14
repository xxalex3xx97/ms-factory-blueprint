// CMP S1 measure: per-node block counts for stacked trees. Prints one row per non-raw node: item, N, caps (max machines one block holds for that node class/k), blocks = ceil(N/caps), k, inKind; then totals.
// Run: node tests/cmp_stacked.mjs table. Exit 0 (1 on page error).
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = {cap: 'ITEM_NickelPlates+ITEM_TitaniumPlates>ITEM_Capacitor', bc: 'ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit', enz: 'ITEM_Biomass+ITEM_Xenobacteria+ITEM_Nutrients>ITEM_Enzyme', aa: 'ITEM_DetectorArray+ITEM_BasicCircuit+ITEM_Superalloy+ITEM_Coolant>ITEM_AdvancedCircuits'};
const BK = {'2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03', '1x1': 'BPO_Station_01', auto: 'auto'};

// Mode exo: Exosuit at 1/min through cmpCompose (cmpArmoury), per case ok/why, machines, blocks, belts, ug, ms, per-leaf ms (cmpCompose wrapped in the page).
// Usage: node tests/cmp_stacked.mjs exo [block 2x2|2x2c] [dock off|nrm|ind]   (no args = all 6 cases, sequential; caller kills on timeout, e.g. `timeout 480 node ...`)
const mode = process.argv[2] || 'table';
if (mode !== 'table' && mode !== 'exo') { console.log('usage: node tests/cmp_stacked.mjs table | exo [2x2|2x2c] [off|nrm|ind]'); process.exit(1) }

const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const page = await (await br.newContext()).newPage(); const pe = [];
page.on('pageerror', e => pe.push(e.message));
page.on('console', m => /^LEAF /.test(m.text()) && console.log(m.text()));
await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await page.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof cmpAssembleTree === 'function');

const ADV = 'ITEM_ChromaticAlloy+ITEM_ChitinComposite+ITEM_ReinforcedPlates+ITEM_Multisensor>ITEM_AdvancedPlates';
const pageTable = ({key, rate, bk}) => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === key);
  if (!rec) return {err: 'recipe not found: ' + key};
  const item = rec.o[0];
  const block = CMP_BLOCKS[PL_ALL.indexOf(bk)];
  const P = plan(item, rate, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false});
  const pl = cmpPlan(P, item, 1, {});
  if (!pl.ok) return {err: 'cmpPlan: ' + pl.why};
  const caps = {};
  const tz = cmpTreeSize(pl, 1, 1, block, caps);
  const rows = pl.nodes.filter(o => !o.raw).map(o => {
    const cap = caps[o.key] || 0;
    return {item: cmpName(o.key), N: o.N, cap, blocks: cap ? Math.ceil(o.N / cap) : null, k: o.k, inKind: o.inKind};
  });
  const machines = rows.reduce((s, r) => s + r.N, 0);
  const blocks = rows.reduce((s, r) => s + (r.blocks || 0), 0);
  return {block, rows, machines, blocks, planMachines: P.nodes[item].machines, treeErr: tz.ok ? null : tz.why};
};

let fails = 0;
if (mode === 'exo') {
  const DK = {off: null, nrm: {in: 'nrm', out: 'nrm'}, ind: {in: 'ind', out: 'ind'}};
  const [ab, ad] = [process.argv[3], process.argv[4]];
  for (const bl of ab ? [ab] : ['2x2', '2x2c']) for (const dn of ad ? [ad] : ['off', 'nrm', 'ind']) {
    const r = await page.evaluate(({bk, dock}) => {
      const rec = [].concat(...Object.values(RECS)).find(r => /Exo.?suit/i.test(plnNm(r.o[0]))), item = rec.o[0], key = rk(rec);
      const leaves = [], orig = window.cmpCompose; let depth = 0;
      window.cmpCompose = function (P, it, ...a) { const t = performance.now(); depth++; try { return orig.call(this, P, it, ...a) } finally { depth--; if (depth) { leaves.push(cmpName(it) + ' ' + Math.round(performance.now() - t) + 'ms'); console.log('LEAF ' + leaves[leaves.length - 1]) } } };
      const P = plan(item, 1, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false});
      const t0 = performance.now(), L = cmpCompose(P, item, 1, 1, {box: 'DAT_Container_2', dock, bk}), ms = Math.round(performance.now() - t0);
      window.cmpCompose = orig;
      return L.ok ? {ok: true, blocks: L.stat.blocks, machines: L.stat.machines, belts: L.stat.belts, ug: L.stat.ug, ms, leaves} : {ok: false, why: L.why, ms, leaves};
    }, {bk: BK[bl], dock: DK[dn]});
    console.log('EXO ' + bl + ' ' + dn + ' ' + JSON.stringify(r));
  }
  if (pe.length) { console.log('page errors: ' + pe[0]); fails++ }
  await br.close(); process.exit(fails ? 1 : 0);
}
for (const [label, bk] of [['2x2c', BK['2x2c']], ['2x2', BK['2x2']]]) {
  const r = await page.evaluate(pageTable, {key: ADV, rate: 900, bk});
  console.log('== AdvancedPlates 900/min on ' + label + ' (' + bk + ')');
  if (r.err) { console.log('ERR ' + r.err); fails++; continue }
  console.table(r.rows);
  console.log('total machines ' + r.machines + ' (planner ' + r.planMachines + '), total blocks ' + r.blocks + (r.treeErr ? ' | tree refused: ' + r.treeErr : ''));
}
// refusal text: capacity refusal shows whole-tree size + lower-rate hint
for (const bk of [BK['2x2'], BK['2x2c']]) {
  const r = await page.evaluate(({key, rate, bk}) => {
    const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === key), item = rec.o[0];
    const P = plan(item, rate, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false});
    const L = cmpCompose(P, item, 1, 1, {bk, box: 'DAT_Container_2'});
    return {ok: L.ok, why: L.why};
  }, {key: ADV, rate: 900, bk});
  const good = !r.ok && /needs ~[\d,]+ machines, ~[\d,]+ blocks on 2x2/.test(r.why) && /lower rate/.test(r.why);
  console.log((good ? 'ok   ' : 'FAIL ') + 'refusal ' + bk + ': ' + r.why);
  if (!good) fails++;
}
// Exosuit leaf components: skipped, no rate given for the Exosuit (cmpArmoury leaves depend on it).
console.log('Exosuit leaf table: skipped (no rate specified for Exosuit)');

if (pe.length) { console.log('page errors: ' + pe[0]); fails++ }
await br.close();
console.log(fails ? 'FAIL ' + fails : 'PASS cmp_stacked table');
process.exit(fails ? 1 : 0);

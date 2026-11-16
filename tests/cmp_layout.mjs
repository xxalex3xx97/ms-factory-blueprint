// CMP S6 gate: cmpPlan (js/cmp_layout.js) on sample plans. Run: node tests/cmp_layout.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof plan === 'function' && typeof plnBy === 'function');
await pg.addScriptTag({path: ROOT + '/js/cmp_layout.js'});   // compose.js is already loaded by index.html
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
// [name, rate, recipe key] (keys as in the C0 sample trees, composer-spec section 11)
const SAMPLES = [['Nickel Plates', 31, 'ITEM_EnrichedNickelOre>ITEM_NickelPlates'], ['Nickel Plates', 480, 'ITEM_EnrichedNickelOre>ITEM_NickelPlates'], ['Basic Circuits', 100, 'ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit'], ['Capacitor', 100, 'ITEM_NickelPlates+ITEM_TitaniumPlates>ITEM_Capacitor'], ['Enzyme', 10, 'ITEM_Biomass+ITEM_Xenobacteria+ITEM_Nutrients>ITEM_Enzyme'], ['Advanced Circuits', 5, 'ITEM_DetectorArray+ITEM_BasicCircuit+ITEM_Superalloy+ITEM_Coolant>ITEM_AdvancedCircuits']];
const R = {};
for (const [name, rate, key] of SAMPLES) {
  R[name + ' ' + rate] = await pg.evaluate(([name, rate, key]) => {
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    if (!item) return {err: 'item not found'};
    const P = plan(item, rate, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false});
    const r = cmpPlan(P, item, 1, {});
    if (!r.ok) return r;
    return {ok: true, D: r.D, rows: r.rows, cols: r.cols, notes: r.notes, nodes: r.nodes};
  }, [name, rate, key]);
}
const grid = (tag, r) => {
  console.log(`== ${tag}: D=${r.D} rows=${r.rows} cols=${r.cols}`);
  console.log('   node item                 col row dep  Nplan Nbuilt  uPlan uBuilt kind  main note');
  for (const o of r.nodes) console.log(`   ${o.id.padEnd(4)} ${o.item.slice(0, 20).padEnd(20)} ${String(o.col).padStart(3)} ${String(o.row).padStart(3)} ${String(o.depth).padStart(3)} ${String(o.raw ? '-' : o.pN).padStart(5)} ${String(o.N).padStart(6)} ${(o.raw ? '-' : o.pU.toFixed(3)).padStart(6)} ${(o.raw ? '-' : o.util.toFixed(3)).padStart(6)}  ${(o.inKind || 'raw').padEnd(5)} ${o.main ? 'Y' : ' '}    ${o.note}`);
};
const rowsOf = (nodes, o) => { const out = new Set([o.row]); for (const c of o.children) for (const x of rowsOf(nodes, nodes.find(n => n.id === c))) out.add(x); return out };
for (const [tag, r] of Object.entries(R)) {
  if (r.err) { check(false, tag + ' ' + r.err); continue }
  if (!r.ok) { console.log(`REFUSED ${tag}: ${r.why}`); continue }
  grid(tag, r);
  const byId = id => r.nodes.find(n => n.id === id);
  // internal consistency: child POOL = parent IN-1, no cell shared, sibling bands disjoint, sides not on parent row
  const cells = new Map();
  let ok1 = true, ok2 = true, ok3 = true;
  // raw leaves of a 'feed' node are dock/container descriptors on the parent's row (no block cell, no band of their own): by design, not a layout clash
  const leaf = o => o.raw && o.parent && byId(o.parent).inKind !== 'merge';   // ENZ: a raw leaf of a src/feed node is that node's own IN hub (no block column of its own)
  for (const o of r.nodes) {
    if (o.parent && !leaf(o)) { const p = byId(o.parent); if (o.pool !== p.col - 1) ok1 = false }
    if (!leaf(o)) for (let c = o.col; c <= o.col + 2; c++) { const k = o.row + ':' + c; if (cells.has(k)) ok2 = false; cells.set(k, o.id) }
    const kids = o.children.map(byId).filter(c => !leaf(c));
    kids.forEach((c, i) => { if (i && c.row === o.row) ok3 = false; });
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = rowsOf(r.nodes, kids[i]), b = rowsOf(r.nodes, kids[j]);
      if ([...a].some(x => b.has(x))) ok3 = false;
    }
  }
  check(r.D === Math.max(...r.nodes.filter(o => !leaf(o)).map(o => o.depth)) && r.cols === 3 * r.D + 3, tag + ': compact columns (no column for raw leaves of src/feed nodes)');
  check(ok1, tag + ': child POOL column = parent IN-1');
  check(ok2, tag + ': no two blocks in one cell');
  check(ok3, tag + ': sibling bands disjoint, sides off parent row');
  if (!/^(Advanced|Enzyme|Capacitor)/.test(tag))
    check(r.nodes.filter(o => !o.raw).every(o => o.N === o.pN && Math.abs(o.util - o.pU) < 1e-9), tag + ': single-consumer nodes N/util = planner exactly');
  if (tag.startsWith('Basic')) {
    const root = r.nodes.find(o => !o.parent);
    check(r.D === 2 && root.col === 6, tag + ': D=2, root merge col 6 (raw leaves of src nodes carry no column)');
    check(rowsOf(r.nodes, root).size === 2, tag + ': root merge spans 2 rows');
  }
  if (tag.startsWith('Capacitor')) {
    const root = r.nodes.find(o => !o.parent);
    const m = r.nodes.find(o => o.parent === root.id && o.main), side = r.nodes.find(o => o.parent === root.id && !o.main);
    check(m.item === 'Nickel Plates' && m.row === root.row && side.item === 'Titanium Plates' && side.row < root.row, tag + ': Nickel main, Titanium above');
  }
  if (tag.startsWith('Enzyme')) check(r.nodes.filter(o => o.raw && o.item === 'Biomass').length === 2, tag + ': Biomass = 2 supplier nodes');
  if (tag.startsWith('Advanced')) {
    const bc = r.nodes.filter(o => o.item === 'Basic Circuits');
    check(bc.length === 2 && bc.every(o => o.N === 2 && o.note.includes('shared product built twice')), tag + ': BC copies N=2+2 with note');
    console.log('   BC copies: ' + bc.map(o => `rate=${o.rate.toFixed(2)} N=${o.N} util=${o.util.toFixed(3)} note="${o.note}"`).join(' | '));
  }
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

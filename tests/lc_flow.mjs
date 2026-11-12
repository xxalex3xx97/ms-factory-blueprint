// LC S1 lcFlow + lcSplitN flow solve (no geometry). Checks on planner output for 5 cases.
// Gates: sum(cells)==planner machines per node; one node per item; node rate == sum of consumer flows;
// raws listed once and rate == sum of raw edge flows; remainder (non-mode) cell at most once per node; lcSplitN unit asserts.
// Run:  node tests/lc_flow.mjs     Exit code 1 on FAIL or page error.
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
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=old');
await pg.waitForFunction(() => window.__fb && typeof plan === 'function' && typeof plnBy === 'function' && typeof lcFlow === 'function' && typeof lcSplitN === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const EPS = 1e-6;
const near = (a, b) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
// non-mode cells: cells not equal to the most common size
const nonMode = cells => { const m = new Map(); for (const k of cells) m.set(k, (m.get(k) || 0) + 1); return cells.length - Math.max(...m.values()) };

// lcSplitN unit asserts
const U = await pg.evaluate(() => [[186, 30], [10, 30], [7, 3]].map(([N, K]) => ({N, K, cells: lcSplitN(N, K)})));
const want = {'186/30': [30, 30, 30, 30, 30, 30, 6], '10/30': [10], '7/3': [3, 3, 1]};
for (const u of U) {
  const key = u.N + '/' + u.K, w = want[key];
  check(JSON.stringify(u.cells) === JSON.stringify(w), 'lcSplitN(' + key + ') = [' + u.cells + '] want [' + w + ']');
  check(u.cells.reduce((a, b) => a + b, 0) === u.N && u.cells.every(k => k <= u.K && k >= 1), 'lcSplitN(' + key + ') sum==N and each<=K');
  check(nonMode(u.cells) <= 1, 'lcSplitN(' + key + ') at most one remainder cell');
}

let cases = [
  {name: 'Basic Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 50},
  {name: 'Magnetic Coils', rate: 30},
  {name: 'Basic Motor', rate: 60},
];
for (const c of cases) {
  const r = await pg.evaluate(c => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    if (it === undefined) return {refused: 'item not found'};
    const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = lcFlow(P, it, 1);
    if (!L.ok) return {refused: L.why};
    const inTree = new Set(L.nodes.map(n => n.item));
    return {
      nodes: L.nodes.map(n => ({name: plnNm(n.item), final: n.item === it, row: n.row, N: n.N, planM: P.nodes[n.item].machines, cells: n.cells, rate: n.rate, consSum: n.cons.reduce((a, q) => a + q.flow, 0), consN: n.cons.length})),
      raws: L.raws.map(q => ({name: plnNm(q.item), rate: q.rate, belts: q.belts, inTree: inTree.has(q.item), edgeSum: P.edges.filter(e => e.from === q.item && inTree.has(e.to)).reduce((a, e) => a + e.flow, 0)})),
    };
  }, c);
  const tag = c.name + ' ' + c.rate;
  console.log(tag, JSON.stringify(r));
  if (r.refused) { check(false, tag + ' refused: ' + r.refused); continue }
  check(r.nodes.length > 0, tag + ': nodes ' + r.nodes.length);
  const names = r.nodes.map(n => n.name);
  check(new Set(names).size === names.length, tag + ': one node per item');
  check(r.nodes.filter(n => n.final).length === 1 && r.nodes.find(n => n.final).row === 0, tag + ': final item is the single row-0 node');
  for (const n of r.nodes) {
    const sum = n.cells.reduce((a, b) => a + b, 0);
    check(sum === n.planM && sum === n.N, tag + ': ' + n.name + ' sum(cells) ' + sum + ' == planner machines ' + n.planM);
    check(nonMode(n.cells) <= 1, tag + ': ' + n.name + ' at most one remainder cell [' + n.cells + ']');
    if (!n.final) check(near(n.rate, n.consSum), tag + ': ' + n.name + ' rate ' + n.rate.toFixed(3) + ' == sum consumer flows ' + n.consSum.toFixed(3) + ' (' + n.consN + ' consumers)');
  }
  if (c.name === 'Advanced Circuits') {
    const bc = r.nodes.filter(n => n.name === 'Basic Circuits');
    check(bc.length === 1, tag + ': Basic Circuits (shared) appears as ONE node (' + bc.length + ')');
  }
  const rn = r.raws.map(q => q.name);
  check(new Set(rn).size === rn.length, tag + ': raws listed once');
  for (const q of r.raws) {
    check(!q.inTree, tag + ': raw ' + q.name + ' is not a tree node');
    check(near(q.rate, q.edgeSum), tag + ': raw ' + q.name + ' rate ' + q.rate.toFixed(3) + ' == edge flows ' + q.edgeSum.toFixed(3));
    check(q.belts >= 1, tag + ': raw ' + q.name + ' belts ' + q.belts);
  }
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// NL1 nlFlow gates. Run: node tests/nl_flow.mjs   Exit 1 on FAIL or page error.
// Gates per case: ok (no refusal); per node sum cell K == N; every cell s<=cap/2 and every head d<=cap/2; heads cover EVERY input item in every cell
// (all columns: heads per item == number of columns); per input item sum of head demand over all cells == planner edge flow; raws belts == ceil(rate/cap).
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
await pg.waitForFunction(() => window.__fb && typeof nlFlow === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [['Basic Motor', 60], ['Basic Circuits', 10], ['Basic Circuits', 100], ['Basic Circuits', 1000], ['Basic Circuits', 10000], ['Advanced Circuits', 10], ['Advanced Circuits', 50], ['Advanced Circuits', 10000]];
const table = [];
for (const [name, rate] of cases) {
  const tag = name + ' ' + rate;
  const r = await pg.evaluate(([name, rate]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    let F;
    try { F = nlFlow(P, it, 1) } catch (e) { return {thrown: e.message} }
    if (!F.ok) return {refused: F.why};
    const cap = F.cap, half = cap / 2 + 1e-9, out = {cap, nodes: [], bad: []};
    for (const n of F.nodes) {
      const nm = plnNm(n.item), sumK = n.cells.reduce((a, c) => a + c.K, 0);
      if (sumK !== n.N) out.bad.push(nm + ': sum K ' + sumK + ' != N ' + n.N);
      const insItems = n.ins.map(i => i.item), got = new Map();
      for (const c of n.cells) {
        if (c.s > half) out.bad.push(nm + ': cell s ' + c.s.toFixed(2) + ' > cap/2');
        for (const h of c.heads) {
          if (h.d > half) out.bad.push(nm + ': head ' + plnNm(h.item) + ' d ' + h.d.toFixed(2) + ' > cap/2');
          got.set(h.item, (got.get(h.item) || 0) + h.d);
        }
        for (const it of insItems) if (c.heads.filter(h => h.item === it).length < c.sizes.length) out.bad.push(nm + ': cell K' + c.K + ' misses a column head for ' + plnNm(it));
      }
      for (const it of insItems) {
        const want = P.edges.filter(e => e.from === it && e.to === n.item).reduce((a, e) => a + e.flow, 0);
        if (Math.abs((got.get(it) || 0) - want) > 1e-6 * Math.max(1, want)) out.bad.push(nm + ': head demand ' + plnNm(it) + ' ' + (got.get(it) || 0).toFixed(3) + ' != edge flow ' + want.toFixed(3));
      }
      out.nodes.push({nm, N: n.N, K: n.K, cells: n.cells.length, heads: [...new Set(n.cells.map(c => c.heads.length))].join('/'), cols: [...new Set(n.cells.map(c => c.sizes.length))].join('/'), over: n.over});
    }
    for (const w of F.raws) if (w.belts !== Math.ceil(w.rate / cap - 1e-9)) out.bad.push('raw ' + plnNm(w.item) + ' belts');
    out.raws = F.raws.map(w => plnNm(w.item) + ' ' + w.rate.toFixed(1) + '/' + w.belts);
    return out;
  }, [name, rate]);
  if (r.thrown || r.refused) { check(false, tag + ': ' + (r.thrown ? 'threw ' + r.thrown : 'refused ' + r.refused)); continue }
  check(r.bad.length === 0, tag + ': flow gates' + (r.bad.length ? ' ' + r.bad.slice(0, 5).join(' | ') : ''));
  table.push({tag, r});
}
console.log('tag | node | N | K | cells | heads/cell | cols | over');
for (const {tag, r} of table) for (const n of r.nodes) console.log([tag, n.nm, n.N, n.K, n.cells, n.heads, n.cols, n.over].join(' | '));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

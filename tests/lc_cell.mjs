// LC S2 lcCellGen: station tile per crafted node, K=1..min(tileM,8).
// Gates: pfCheck ov 0 (ok cells only); K=1..3 fit 60x60 (flag * = >30 in a dimension); head x per input item identical across K for the same rec. Larger K may return ok:false (listed).
// Run:  node tests/lc_cell.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof plan === 'function' && typeof lcFlow === 'function' && typeof lcCellGen === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [{name: 'Basic Circuits', rate: 10}, {name: 'Advanced Circuits', rate: 10}, {name: 'Magnetic Coils', rate: 30}, {name: 'Basic Motor', rate: 60}];
const seen = new Map();   // rec -> ins json of first K
console.log('rec | K | w x h | nb | flag(*=>30)');
for (const c of cases) {
  const rows = await pg.evaluate(c => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = lcFlow(P, it, 1);
    if (!L.ok) return {refused: L.why};
    const out = [];
    for (const n of L.nodes) {
      if (!n.cls) continue;
      const rec = plnNm(n.item) + '[' + n.cls + '|' + n.k + ']';
      for (let K = 1; K <= Math.min(n.cells.length ? Math.max(...n.cells) : 1, 8); K++) {
        const r = lcCellGen(n.cls, n.k, n.flows, K, 1);
        out.push({rec, K, ok: r.ok !== false, why: r.why, w: r.w, h: r.h, nb: r.nb, sizes: r.sizes, ins: r.ins && r.ins.map(q => plnNm(q.item) + '@' + q.x).join(','), outx: r.out && r.out.x});
      }
    }
    return out;
  }, c);
  if (rows.refused) { check(false, c.name + ' refused: ' + rows.refused); continue }
  for (const r of rows) {
    const key = c.name + '/' + r.rec;
    if (!r.ok) { console.log(`${key} | ${r.K} | FAIL ${r.why}`); check(r.K > 1, key + ' K=' + r.K + ' must fit (' + r.why + ')'); continue }
    console.log(`${key} | ${r.K} | ${r.w}x${r.h} | ${r.nb} | ${r.w > 30 || r.h > 30 ? '*' : '-'} | sizes ${r.sizes} | ins ${r.ins} | out ${r.outx}`);
    if (r.K <= 3) check(r.w <= 60 && r.h <= 60, key + ' K=' + r.K + ' fits 60x60');
    if (!seen.has(key)) seen.set(key, r.ins);
    else check(seen.get(key) === r.ins, key + ' K=' + r.K + ' fixed head x [' + r.ins + '] vs [' + seen.get(key) + ']');
  }
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

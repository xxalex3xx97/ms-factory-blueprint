// pfFact2 S2: lanes via pfBusAssign (direct call, no dispatch, no sim).
// Per case: ok; every (consumer, item) head appears exactly once across lanes; raw lane D <= 120; crafted lane count == producer outs;
// per crafted item sum of tap flows == sum of consumer demand (1e-6; reported and failed only when K*M==N); taps non-increasing consumer row.
// Run:  timeout 120 node tests/pff_bus.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactSize2 === 'function' && typeof pfBusAssign === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const runCase = c => {
  const MK = 1, SP = 1;
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const Z = pfFactTree(P, it, MK);
  if (Z.ok === false) return {refused: Z.why};
  const byIt = new Map(Z.nodes.map(n => [n.item, n]));
  const SZ = new Map();
  for (const nd of Z.nodes) {
    const s = pfFactSize2(nd, MK);
    if (s.ok === false) return {refused: s.why};
    SZ.set(nd.item, {T: s.T, M: s.M, K: s.K, nd});
  }
  const F = new Map();
  for (const nd of Z.nodes) {
    const S = SZ.get(nd.item);
    const nd2 = {...nd, ins: nd.ins.map(i => ({...i, crafted: true}))};
    const R = pfFactRow(nd2, S.T, S.K, MK, null, nd.item === it);
    if (R.ok === false) return {refused: 'pfFactRow ' + plnNm(nd.item) + ': ' + R.why};
    F.set(nd.item, R);
  }
  const A = pfBusAssign(Z, F, SZ, MK, SP);
  if (A.ok === false) return {refused: A.why};
  const fails = [], out = {lanes: {}, total: A.lanes.length, raw: 0, maxRawD: 0, diffs: []};
  // head coverage: expected keys from consumers' F.ins, found keys from lane taps
  const exp = new Map(), got = new Map();
  for (const nd of Z.nodes) for (const p of F.get(nd.item).ins) {
    const k = nd.item + '|' + p.item + '|' + p.tile + '|' + p.head;
    exp.set(k, (exp.get(k) || 0) + 1);
  }
  for (const l of A.lanes) for (const t of l.taps) for (const h of t.heads) {
    const k = t.cons + '|' + l.item + '|' + h.tile + '|' + h.head;
    got.set(k, (got.get(k) || 0) + 1);
  }
  let coverBad = 0;
  for (const [k, n] of exp) if (got.get(k) !== n) coverBad++;
  for (const [k, n] of got) if (exp.get(k) !== n) coverBad++;
  if (coverBad) fails.push('head coverage mismatch ' + coverBad);
  // raw lanes
  for (const l of A.lanes) {
    if (!l.raw) continue;
    out.raw++;
    out.maxRawD = Math.max(out.maxRawD, l.D);
    if (l.D > 120 + 1e-9) fails.push('raw lane D ' + l.D.toFixed(3) + ' > 120 (' + plnNm(l.item) + ')');
  }
  // crafted lane counts and tap flow sums
  for (const nd of Z.nodes) {
    if (nd.item === it) continue;
    const nm = plnNm(nd.item);
    const lanesOf = A.lanes.filter(l => l.item === nd.item);
    out.lanes[nm] = lanesOf.length;
    const outs = F.get(nd.item).outs.length;
    if (lanesOf.length !== outs) fails.push(nm + ': lanes ' + lanesOf.length + ' != outs ' + outs);
    const tapSum = lanesOf.reduce((a, l) => a + l.taps.reduce((b, t) => b + t.heads.reduce((x, h) => x + h.flow, 0), 0), 0);
    const demand = nd.cons.reduce((a, c) => a + c.flow, 0);
    const S = SZ.get(nd.item);
    const exact = S.K * S.M === nd.N;
    const bad = Math.abs(tapSum - demand) > 1e-6 * Math.max(1, Math.abs(demand));
    if (bad) {
      out.diffs.push(nm + ' N ' + nd.N + ' K*M ' + S.K * S.M + ' tap ' + tapSum.toFixed(6) + ' demand ' + demand.toFixed(6));
      if (exact) fails.push(nm + ': tap sum ' + tapSum + ' != demand ' + demand);
    }
  }
  // taps: consumer row non-increasing within a lane
  for (const l of A.lanes) {
    const rows = l.taps.map(t => byIt.get(t.cons).row);
    if (rows.some((r, i) => i && r > rows[i - 1])) fails.push('lane ' + plnNm(l.item) + ' taps rows not non-increasing');
  }
  out.exactAll = [...SZ.values()].every(s => s.K * s.M === s.nd.N);
  out.table = [...SZ.values()].map(s => plnNm(s.nd.item) + ' N ' + s.nd.N + ' M ' + s.M + ' K ' + s.K);
  return {fails, out};
};

const cases = [
  {name: 'Basic Circuits', rate: 10},
  {name: 'Magnetic Coils', rate: 30},
  {name: 'Advanced Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 50},
];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(runCase, c);
  if (r.refused) { check(false, tag + ': refused: ' + r.refused); continue }
  const o = r.out;
  console.log(tag + ': lanes total ' + o.total + ' raw ' + o.raw + ' maxRawD ' + o.maxRawD.toFixed(2) + ' per item ' + JSON.stringify(o.lanes));
  if (o.diffs.length) console.log('  tap-sum diffs (report): ' + o.diffs.join(' ; '));
  if (c.name === 'Advanced Circuits' && c.rate === 50) for (const t of o.table) console.log('  ' + t);
  check(r.fails.length === 0, tag + ': lane checks' + (r.fails.length ? ' (' + r.fails.slice(0, 8).join('; ') + ')' : ''));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// pfFact2 S1: exact tile sizing via pfFactSize2 (direct call, no dispatch, no sim).
// Per node: s.ok; K*M is N or N+1; tileOut*K >= rate; BC 10 and MC 30 must be exactly N.
// Run:  timeout 120 node tests/pff_size.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactSize2 === 'function' && typeof pfFactTree === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const runCase = c => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const Z = pfFactTree(P, it, 1);
  if (Z.ok === false) return {refused: Z.why};
  const fails = [], rows = [];
  let plus = 0;
  for (const nd of Z.nodes) {
    const nm = plnNm(nd.item);
    const s = pfFactSize2(nd, 1);
    if (s.ok === false) { fails.push(nm + ': ' + s.why); continue }
    const isPlus = s.K * s.M === nd.N + 1;
    if (isPlus) plus++;
    if (!(s.K * s.M === nd.N || isPlus)) fails.push(nm + ': K*M ' + s.K * s.M + ' not N or N+1');
    if (s.T.tileOut * s.K < nd.rate - 1e-6) fails.push(nm + ': out ' + (s.T.tileOut * s.K) + ' < rate ' + nd.rate);
    if (c.exact && s.K * s.M !== nd.N) fails.push(nm + ': K*M ' + s.K * s.M + ' != N ' + nd.N);
    rows.push({name: nm, N: nd.N, M: s.M, K: s.K, w: s.T.w, straddle: s.straddle, plus: isPlus});
  }
  return {fails, rows, plus};
};

const cases = [
  {name: 'Basic Circuits', rate: 10, exact: true},
  {name: 'Magnetic Coils', rate: 30, exact: true},
  {name: 'Advanced Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 50},
];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(runCase, c);
  if (r.refused) { check(false, tag + ': refused: ' + r.refused); continue }
  console.log(tag + ' (+1 items: ' + r.plus + ')');
  for (const q of r.rows) console.log('  ' + q.name + ' N ' + q.N + ' M ' + q.M + ' K ' + q.K + ' w ' + q.w + ' straddle ' + q.straddle + (q.plus ? ' +1' : ''));
  check(r.fails.length === 0, tag + ': sizing checks' + (r.fails.length ? ' (' + r.fails.slice(0, 8).join('; ') + ')' : ''));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// LC S3 cell library gates (js/lc_cells.js + lcCell).
// Gates: every crafted rec in the 4 trees has entries for K=1..3 for every mk; 10 seeded-random present keys: lcCell(...,0,0) items == lcCellGen items (JSON);
// js/lc_cells.js < 2 MB; lcCell with ox,oy shifts every item x,y exactly (all present keys).
// Run:  node tests/lc_lib.mjs     Exit code 1 on FAIL or page error.
import {createRequire} from 'module';
import fs from 'fs';
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
await pg.waitForFunction(() => window.__fb && typeof plan === 'function' && typeof pfFactTree === 'function' && typeof lcCell === 'function' && typeof lcCellGen === 'function' && typeof LC_CELLS !== 'undefined');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [{name: 'Basic Circuits', rate: 10}, {name: 'Advanced Circuits', rate: 50}, {name: 'Magnetic Coils', rate: 30}, {name: 'Basic Motor', rate: 60}];

const R = await pg.evaluate(cases => {
  // every (crafted node, K, mk) triple of the 4 trees, K=1..max(tileM,6), same enumeration as tools/lc_gen.mjs
  const T = [], errs = [];
  for (const c of cases) {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    if (it === undefined) { errs.push(c.name + ': item not found'); continue }
    for (let mk = 0; mk <= 2; mk++) {
      const P = plan(it, c.rate, mk, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
      const Z = pfFactTree(P, it, mk);
      if (Z.ok === false) { errs.push(c.name + ' mk' + mk + ': ' + Z.why); continue }
      for (const n of Z.nodes) {
        if (!n.cls) continue;
        for (let K = 1; K <= Math.max(n.tileM, 6); K++) T.push({name: c.name, rec: n.rec, K, mk, cls: n.cls, k: n.k, flows: n.flows});
      }
    }
  }
  // gate 1: K=1..3 present for every crafted rec x mk
  const miss = [], recs = new Set();
  for (const t of T) {
    recs.add(t.rec + '|' + t.mk);
    if (t.K <= 3 && !LC_CELLS[t.rec + '|' + t.K + '|' + t.mk]) miss.push(t.rec + '|' + t.K + '|' + t.mk);
  }
  // gate 2: 10 seeded-random present keys, lcCell(...,0,0) items vs lcCellGen items
  const pres = T.filter(t => LC_CELLS[t.rec + '|' + t.K + '|' + t.mk]);
  let s = 0x5eed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000 };
  const pick = new Set();
  while (pick.size < Math.min(10, pres.length)) pick.add(Math.floor(rnd() * pres.length));
  const eq = [...pick].map(i => {
    const t = pres[i];
    const a = lcCell(t.rec, t.K, t.mk, 0, 0, t.cls, t.k, t.flows).items;
    const b = lcCellGen(t.cls, t.k, t.flows, t.K, t.mk).items;
    return {key: t.name + ' ' + t.rec + '|' + t.K + '|' + t.mk, ok: JSON.stringify(a) === JSON.stringify(b), n: a.length};
  });
  // gate 3: ox,oy shift exact over all present keys
  let shifted = 0, bad = 0;
  for (const t of pres) {
    const a = lcCell(t.rec, t.K, t.mk, 0, 0, t.cls, t.k, t.flows).items;
    const b = lcCell(t.rec, t.K, t.mk, 7, -3, t.cls, t.k, t.flows).items;
    if (a.length !== b.length) { bad++; continue }
    for (let i = 0; i < a.length; i++) {
      shifted++;
      const x = Object.assign({}, a[i], {x: 0, y: 0}), y = Object.assign({}, b[i], {x: 0, y: 0});
      if (b[i].x !== a[i].x + 7 || b[i].y !== a[i].y - 3 || JSON.stringify(x) !== JSON.stringify(y)) bad++;
    }
  }
  return {total: T.length, present: pres.length, recs: recs.size, miss, errs, eq, shifted, bad, entries: Object.keys(LC_CELLS).length};
}, cases);

console.log('triples ' + R.total + ' | present ' + R.present + ' | crafted rec x mk ' + R.recs + ' | LC_CELLS entries ' + R.entries);
check(R.errs.length === 0, 'trees plan without error' + (R.errs.length ? ': ' + R.errs.join(' | ') : ''));
check(R.miss.length === 0, 'K=1..3 entries for every crafted rec x mk (missing ' + R.miss.length + (R.miss.length ? ': ' + R.miss.slice(0, 5).join(', ') : '') + ')');
check(R.eq.length === 10, 'sampled 10 keys (got ' + R.eq.length + ')');
for (const q of R.eq) check(q.ok, 'lcCell == lcCellGen items: ' + q.key + ' (' + q.n + ' items)');
const size = fs.statSync(path.join(ROOT, 'js', 'lc_cells.js')).size;
check(size < 2 * 1024 * 1024, 'js/lc_cells.js size ' + size + ' bytes < 2 MB');
check(R.shifted > 0 && R.bad === 0, 'lcCell ox,oy shift exact: ' + R.shifted + ' items checked, ' + R.bad + ' bad');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log('size ' + size + ' bytes | entries ' + R.entries);
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

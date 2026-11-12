// pfFact step 4c: x placement tests. pfFactPlace on 30-grid, same-row order, feed left of heads, lanes skip factories in between rows.
// Checks: x0 % 30 == 0; same-row factories disjoint, left-to-right in Z.rows order; every group: producer out x <= consumer x0 + first head x; no factory in a row strictly between rp and rc covers a lane x; AL group count == producer outs length.
// Run:  timeout 120 node tests/pff_place.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTree === 'function' && typeof pfTileFact === 'function' && typeof pfTileRow === 'function' && typeof pfFactSizeTile === 'function' && typeof pfFactAlloc === 'function' && typeof pfFactPlace === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// page helper (runs in browser): returns {refused} or {fails, info}
const runCase = c => {
  const MK = 1, SP = 1;
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const Z = pfFactTree(P, it, MK);
  if (Z.ok === false) return {refused: Z.why};
  const SZ = new Map();
  for (const nd of Z.nodes) {
    const s = pfFactSizeTile(nd, MK);
    if (s.ok === false) return {refused: 'sizeTile ' + plnNm(nd.item) + ': ' + s.why};
    SZ.set(nd.item, {T: s.T, M: s.M, K: s.K, nd});
  }
  const AL = pfFactAlloc(Z, SZ, MK, SP);
  if (AL.ok === false) return {refused: 'alloc: ' + AL.why};
  const F = new Map();
  for (const nd of Z.nodes) {
    const S = SZ.get(nd.item), al = AL.get(nd.item), fin = nd.item === Z.item;
    const R = pfFactRow(nd, S.T, S.K, MK, fin ? null : al.groups.map(g => g.t), fin);
    if (R.ok === false) return {refused: 'row ' + plnNm(nd.item) + ': ' + R.why};
    F.set(nd.item, R);
  }
  const PL = pfFactPlace(Z, F, AL);
  if (PL.ok === false) return {refused: 'place: ' + PL.why};
  const fails = [], info = [], pos = PL.pos;
  const nm = i => plnNm(i);
  for (const [i, p] of pos) if (p.x0 % 30 !== 0) fails.push(nm(i) + ': x0 ' + p.x0 + ' not on 30-grid');
  for (let r = 0; r < Z.rows.length; r++) {
    const row = Z.rows[r];
    for (let k = 1; k < row.length; k++) {
      const a = pos.get(row[k - 1]), b = pos.get(row[k]);
      if (b.x0 < a.x0 + F.get(row[k - 1]).w) fails.push('row ' + r + ': ' + nm(row[k - 1]) + ' overlaps ' + nm(row[k]));
      if (b.x0 < a.x0) fails.push('row ' + r + ': ' + nm(row[k]) + ' left of ' + nm(row[k - 1]));
    }
  }
  for (const [p, al] of AL) {
    if (al.groups.length !== F.get(p).outs.length) fails.push(nm(p) + ': groups ' + al.groups.length + ' != outs ' + F.get(p).outs.length);
    al.groups.forEach((g, gi) => {
      const outX = pos.get(p).x0 + F.get(p).outs[gi].x, cx = pos.get(g.cons).x0;
      if (outX > cx + g.heads[0].x) fails.push(nm(p) + '->' + nm(g.cons) + ': feed ' + outX + ' right of first head ' + (cx + g.heads[0].x));
    });
  }
  for (const L of PL.lanes) {
    for (const [i, p] of pos) {
      if (p.row <= L.rc || p.row >= L.rp) continue;
      if (L.x >= p.x0 && L.x < p.x0 + F.get(i).w) fails.push('lane x ' + L.x + ' (' + L.rp + '->' + L.rc + ') inside factory ' + nm(i) + ' row ' + p.row);
    }
  }
  info.push('lanes ' + PL.lanes.length);
  for (const [i, p] of pos) info.push(nm(i) + ': row ' + p.row + ' x0 ' + p.x0 + ' w ' + F.get(i).w);
  return {fails, info, nodes: Z.nodes.length, lanes: PL.lanes.length};
};

const cases = [
  {name: 'Advanced Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 50},
  {name: 'Magnetic Coils', rate: 30},
];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(runCase, c);
  if (r.refused) { check(false, tag + ': refused: ' + r.refused); continue }
  console.log(tag + ' nodes ' + r.nodes + ' lanes ' + r.lanes);
  for (const line of r.info) console.log('  ' + line);
  check(r.fails.length === 0, tag + ': place checks' + (r.fails.length ? ' (' + r.fails.join('; ') + ')' : ''));
}

check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

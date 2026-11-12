// pfFact step 1: pfFactTree (DAG, longest-path rows, summed shares, K=ceil(N/min(MB,cap))). Pure data, no layout.
// Checks: tree shape per AC 5/10/40/50, diamond (shared intermediate = one factory, rate summed), cycle refused, Magnetic Coils single stage.
// Run:  timeout 120 node tests/pff_tree.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTree === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// page helpers (run in browser)
const treeOf = c => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const Z = pfFactTree(P, it, 1);
  if (Z.ok === false) return {refused: Z.why};
  return {item: it, nodes: Z.nodes.map(n => ({item: n.item, nm: plnNm(n.item), row: n.row, N: n.N, K: n.K, Kmb: n.Kmb, tileM: n.tileM, mxC: Math.min(n.mxC, 1e9), cons: n.cons, rate: n.rate, pm: P.nodes[n.item].machines, prate: P.nodes[n.item].rate}))};
};
const findDiamond = rate => {
  for (const it of [...plnBy(false).keys()]) {
    let Z;
    try { const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false}); Z = pfFactTree(P, it, 1) } catch (e) { continue }
    if (Z.ok === false) continue;
    const d = Z.nodes.find(n => n.cons.length >= 2);
    if (!d) continue;
    return {name: plnNm(it), rate, node: {item: d.item, nm: plnNm(d.item), row: d.row, N: d.N, K: d.K, Kmb: d.Kmb, tileM: d.tileM, mxC: Math.min(d.mxC, 1e9), rate: d.rate, cons: d.cons}, nodes: Z.nodes.map(n => ({item: n.item, row: n.row}))};
  }
  return null;
};
const cycleOf = () => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Advanced Circuits');
  const P = plan(it, 10, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const y = P.nodes[it].rec.i.map(([x]) => x).find(x => P.nodes[x] && P.nodes[x].crafter);
  if (y === undefined) return {noInput: true};
  P.nodes[y].rec = {...P.nodes[y].rec, i: [...P.nodes[y].rec.i, [it, 1]]};
  const Z = pfFactTree(P, it, 1);
  return {ok: Z.ok, why: Z.why, nm: plnNm(y)};
};

// AC 5 / 10 / 40 / 50 tree shape
const cases = [{name: 'Advanced Circuits', rate: 5}, {name: 'Advanced Circuits', rate: 10}, {name: 'Advanced Circuits', rate: 40}, {name: 'Advanced Circuits', rate: 50}];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(treeOf, c);
  if (r.refused) { check(false, tag + ' refused: ' + r.refused); continue }
  check(true, tag + ': ok (' + r.nodes.length + ' factories)');
  const ids = new Set(r.nodes.map(n => n.item)), rowOf = new Map(r.nodes.map(n => [n.item, n.row]));
  const fin = r.nodes.find(n => n.item === r.item);
  const mid = r.nodes.filter(n => n.item !== r.item);
  check(fin.row === 0 && fin.cons.length === 0, tag + ': final node row 0, no consumers');
  check(ids.size === r.nodes.length, tag + ': items unique (' + ids.size + ')');
  check(mid.every(n => n.cons.length >= 1), tag + ': every non-final node has consumers');
  check(mid.every(n => n.cons.every(q => ids.has(q.to))), tag + ': every consumer in tree');
  check(mid.every(n => n.row === Math.max(...n.cons.map(q => rowOf.get(q.to))) + 1), tag + ': row = max(consumer rows)+1');
  check(mid.every(n => n.rate > 0 && Math.abs(n.rate - n.cons.reduce((a, q) => a + q.flow, 0)) < 1e-6), tag + ': rate = sum of consumer flows, > 0');
  const kBad = r.nodes.filter(n => n.K !== Math.ceil(n.N / Math.min(150, n.mxC)) || n.Kmb !== Math.ceil(n.N / 150) || n.tileM !== Math.ceil(n.N / n.K) || n.tileM * n.K < n.N || n.tileM > 150);
  check(kBad.length === 0, tag + ': K / tileM formulas' + (kBad.length ? ' (bad ' + kBad.map(n => n.nm).join(', ') + ')' : ''));
  check(r.nodes.filter(n => n.mxC >= 150).every(n => n.K === n.Kmb), tag + ': mxC>=150 => K===Kmb');
  console.log(tag + ' tree (item / row / N / K):');
  for (const n of [...r.nodes].sort((a, b) => a.row - b.row)) console.log('  ' + n.nm + ' / ' + n.row + ' / ' + n.N + ' / ' + n.K);
  if (c.rate >= 40) check(r.nodes.reduce((a, n) => a + n.N, 0) === r.nodes.reduce((a, n) => a + n.pm, 0), tag + ': sum N = sum of plan machines over tree');
  for (const n of mid) if (Math.abs(n.rate - n.prate) > 0.01 * n.prate) console.log('WARN ' + tag + ' ' + n.nm + ': tree rate ' + n.rate + ' vs plan rate ' + n.prate);
}

// diamond: a shared intermediate with 2+ consumers must be one factory with summed rate
let dia = null;
for (const rate of [10, 100]) { dia = await pg.evaluate(findDiamond, rate); if (dia) break }
if (!dia) check(false, 'no diamond item found');
else {
  const dn = dia.node, nodes = dia.nodes;
  console.log('diamond: shared ' + dn.nm + ' (' + dn.cons.length + ' consumers) in plan ' + dia.name + ' at rate ' + dia.rate);
  check(nodes.filter(n => n.item === dn.item).length === 1, 'diamond: exactly one factory for ' + dn.nm);
  const cr = dn.cons.map(q => nodes.find(n => n.item === q.to).row);
  check(dn.row === Math.max(...cr) + 1, 'diamond: row = max(consumer rows)+1');
  check(Math.abs(dn.rate - dn.cons.reduce((a, q) => a + q.flow, 0)) < 1e-6, 'diamond: rate = sum of consumer flows');
  check(dn.K === Math.ceil(dn.N / Math.min(150, dn.mxC)) && dn.Kmb === Math.ceil(dn.N / 150) && dn.tileM === Math.ceil(dn.N / dn.K) && dn.tileM * dn.K >= dn.N && dn.tileM <= 150, 'diamond: K formula');
}

// cycle: crafted input of the final item feeds back into it -> refused
const cyc = await pg.evaluate(cycleOf);
check(cyc.noInput !== true, 'cycle: AC 10 has a crafted input');
check(cyc.ok === false && /cycle/.test(cyc.why || ''), 'cycle refused (' + cyc.why + ')');

// single stage
const mc = await pg.evaluate(treeOf, {name: 'Magnetic Coils', rate: 30});
check(!mc.refused && mc.nodes.every(n => n.K >= 1), 'Magnetic Coils 30: ok, K>=1' + (mc.refused ? ' (' + mc.refused + ')' : ''));

check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

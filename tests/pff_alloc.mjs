// pfFact step 4a: allocation tests. Per tree node: pfFactSizeTile tile, pfFactAlloc groups per consumer, K = sum of group tiles.
// Checks: not refused, every consumer head in exactly one group, group D <= capG, heads ascending, producer K = sum t and sum t*tileOut >= sum D, diamond (AC) item with >=2 consumers, Basic Circuits single node -> empty alloc.
// Run:  timeout 120 node tests/pff_alloc.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTree === 'function' && typeof pfTileFact === 'function' && typeof pfTileRow === 'function' && typeof pfFactSizeTile === 'function' && typeof pfFactAlloc === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// page helper (runs in browser): returns {refused} or {fails, info}
const runCase = c => {
  const MK = 1, SP = 1, capG = Math.min(MKS[MK][1], MKS[SP][1]);
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const Z = pfFactTree(P, it, MK);
  if (Z.ok === false) return {refused: Z.why};
  const fails = [], info = [], SZ = new Map();
  for (const nd of Z.nodes) {
    const s = pfFactSizeTile(nd, MK);
    if (s.ok === false) return {refused: 'sizeTile ' + plnNm(nd.item) + ': ' + s.why};
    SZ.set(nd.item, {T: s.T, M: s.M, K: s.K, nd});
  }
  const sized = new Map([...SZ].map(([k, v]) => [k, v.K]));
  const AL = pfFactAlloc(Z, SZ, MK, SP);
  if (AL.ok === false) return {refused: 'alloc: ' + AL.why};
  const cons = nd => [...new Set(nd.cons.map(q => q.to))];
  for (const nd of Z.nodes) {
    if (nd.item === Z.item) continue;
    const nm = plnNm(nd.item), S = SZ.get(nd.item), G = AL.get(nd.item);
    if (!G) { fails.push(nm + ': no alloc entry'); continue }
    let sumT = 0, sumD = 0;
    for (const g of G.groups) {
      sumT += g.t; sumD += g.D;
      if (!g.heads.length) fails.push(nm + ': empty group');
      if (g.D > capG + 1e-9) fails.push(nm + ': group D ' + g.D + ' > capG ' + capG);
      if (!(g.t >= 1 && S.T.tileOut * g.t >= g.D - 1e-9)) fails.push(nm + ': tileOut*t < D');
      const hs = g.heads.reduce((a, h) => a + h.flow, 0);
      if (Math.abs(hs - g.D) > 1e-6) fails.push(nm + ': group D != sum of heads');
      for (let i = 1; i < g.heads.length; i++) if (g.heads[i].x < g.heads[i - 1].x) fails.push(nm + ': heads not ascending');
    }
    if (S.K !== sumT) fails.push(nm + ': K ' + S.K + ' != sum t ' + sumT);
    if (S.K > nd.K + G.groups.length) fails.push(nm + ': overbuild ' + S.K + ' > nd.K ' + nd.K + ' + groups ' + G.groups.length);
    if (sumT * S.T.tileOut < sumD - 1e-9) fails.push(nm + ': under-delivers');
    // every consumer head (tile x head of this item) in exactly one group
    const exp = new Set(), act = [];
    for (const k of cons(nd)) {
      const Sc = SZ.get(k);
      for (let j = 0; j < Sc.K; j++) Sc.T.ins.filter(p => p.item === nd.item).forEach(p => exp.add(k + '|' + j + '|' + p.head));
    }
    for (const g of G.groups) for (const h of g.heads) act.push(g.cons + '|' + h.tile + '|' + h.head);
    if (act.length !== exp.size) fails.push(nm + ': heads ' + act.length + ' != expected ' + exp.size);
    if (new Set(act).size !== act.length) fails.push(nm + ': duplicate head in groups');
    if (act.some(a => !exp.has(a))) fails.push(nm + ': group head not a consumer head');
    info.push(nm + ': tiles S.K ' + S.K + ' vs tree nd.K ' + nd.K + ' (sized ' + sized.get(nd.item) + '), groups ' + G.groups.length + ', sumD ' + sumD.toFixed(3));
  }
  if (c.diamond) {
    const multi = Z.nodes.filter(n => n.item !== Z.item && cons(n).length >= 2);
    if (!multi.length) fails.push('no diamond item (>=2 consumers) in ' + c.name);
    for (const nd of multi) {
      const nm = plnNm(nd.item), G = AL.get(nd.item);
      if (Z.nodes.filter(n => n.item === nd.item).length !== 1) fails.push(nm + ': not exactly one node');
      const dc = new Set(G.groups.map(g => g.cons)).size;
      if (dc < 2) fails.push(nm + ': groups cover ' + dc + ' consumer(s)');
      const sumD = G.groups.reduce((a, g) => a + g.D, 0), share = nd.cons.reduce((a, q) => a + q.flow, 0);
      if (Math.abs(sumD - share) > 1e-6) fails.push(nm + ': sum D ' + sumD.toFixed(6) + ' != tree share ' + share.toFixed(6));
      info.push('diamond ' + nm + ': consumers ' + dc + ', sum D ' + sumD.toFixed(6) + ', tree share ' + share.toFixed(6));
    }
  }
  if (c.single) {
    if (AL.size !== Z.nodes.length - 1) fails.push('alloc size ' + AL.size + ' != non-final nodes ' + (Z.nodes.length - 1));
  }
  return {fails, info, nodes: Z.nodes.length};
};

const cases = [
  {name: 'Advanced Circuits', rate: 10, diamond: true},
  {name: 'Advanced Circuits', rate: 50, diamond: true},
  {name: 'Magnetic Coils', rate: 30},
  {name: 'Basic Circuits', rate: 10, single: true},
  {name: 'Nickel Plates', rate: 30},
];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(runCase, c);
  if (r.refused) { check(false, tag + ': refused: ' + r.refused); continue }
  console.log(tag + ' nodes ' + r.nodes + ' overbuild (per producer):');
  for (const line of r.info) console.log('  ' + line);
  check(r.fails.length === 0, tag + ': alloc checks' + (r.fails.length ? ' (' + r.fails.join('; ') + ')' : ''));
}

check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

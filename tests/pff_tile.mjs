// pfFact step 2: tile tests. Per tree node: pfFactSizeTile tile, K copies via pfTileRow, hand-built pfBands-shaped layout through pfCheck + placerTile.
// Checks: tile ok (placerTile ov 0, span 0), 30-grid w, identical ports and body per copy, cap, segmented out row, no under-delivery, memo, chain (non-final node, M=1, K=7).
// Run:  timeout 120 node tests/pff_tile.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTree === 'function' && typeof pfTileFact === 'function' && typeof pfTileRow === 'function' && typeof pfFactSizeTile === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// page helper (runs in browser): all per-node assertions, returns offending node names per category
const runCase = c => {
  const MK = 1, cap = MKS[MK][1], PFX = PF_GRID.cw;
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const Z = pfFactTree(P, it, MK);
  if (Z.ok === false) return {refused: Z.why};
  const bad = {}, warns = [], rows = [];
  const add = (k, m) => { (bad[k] = bad[k] || []).push(m) };
  // pfBands-shaped layout around one row of K tiles
  const build = (TR, M, K) => {
    let oy = 1;
    while (!pfFitY(oy, TR.h) && oy < 60) oy++;
    return {ok: true, items: TR.items.map(q => ({h: 0, pid: 0, ...q, y: q.y + oy})), lanes: 1, per: [M * K], makes: 0, pitch: oy + TR.h + 1, w: TR.w, h: oy + TR.h, tall: true, mod: false, box: 'DAT_Container_2', mk: MK, ports: TR.outs.map(o => ({edge: 'S', off: o.x, dir: 'out', belts: 1, slot: -1, mk: MK})), note: ['pff tile'], src: {P, item: it, mk: MK, spMk: 0, o: {}}, prefab: true};
  };
  for (const nd of Z.nodes) {
    const nm = plnNm(nd.item);
    const S = pfFactSizeTile(nd, MK);
    if (S.ok === false) { add('S.ok', nm + ' ' + S.why); continue }
    const T = S.T;
    rows.push({item: nm, M: S.M, K: S.K, w: T.w, h: T.h, straddle: !!T.straddle});
    if (T.straddle) {
      if (S.M <= nd.mh && T.w > PFX) warns.push(nm + ': single column straddles, w ' + T.w);
      else add('no straddle', nm + ' M' + S.M + ' w' + T.w);
    }
    if (S.M * S.K < nd.N) add('no under-delivery', nm + ' ' + S.M + '*' + S.K + '<' + nd.N);
    if (pfTileFact(nd, MK, S.M) !== pfTileFact(nd, MK, S.M)) add('memo', nm);
    if (T.tileOut > cap + 1e-9) add('cap', nm + ' tileOut ' + T.tileOut);
    const Ks = [...new Set([1, 3, ...(S.K > 1 ? [S.K] : [])])];
    for (const K of Ks) {
      const tag = nm + ' K' + K;
      const TR = pfTileRow(T, K, MK);
      if (TR.ok === false) { add('pfTileRow ok', tag + ' ' + TR.why); continue }
      if (TR.w % PFX !== 0) add('w on 30-grid', tag);
      if (!TR.outs.every(o => (o.x - T.out.x) % T.w === 0)) add('out row on tile grid', tag);
      if (!TR.outs.every(o => o.tiles * T.tileOut <= cap + 1e-9)) add('cap', tag + ' segment');
      if (TR.outs.length !== Math.ceil(K / TR.g) || TR.outs.reduce((a, o) => a + o.tiles, 0) !== K) add('segments', tag);
      const copyIns = j => JSON.stringify(TR.ins.filter(p => p.tile === j).map(p => [p.item, p.head, p.x - j * T.w, p.y]));
      const body = j => JSON.stringify(TR.items.filter(q => q.y < T.h && q.x >= j * T.w && q.x < (j + 1) * T.w).map(q => JSON.stringify([q.cls, q.x - j * T.w, q.y, q.rot])).sort());
      for (let j = 1; j < K; j++) if (copyIns(j) !== copyIns(0)) { add('ports identical', tag + ' copy' + j); break }
      for (let j = 1; j < K; j++) if (body(j) !== body(0)) { add('body identical', tag + ' copy' + j); break }
      const L = build(TR, S.M, K);
      const chk = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports});
      if (chk.ov !== 0 || chk.seamBad !== 0) add('pfCheck ov/seam', tag + ' ov' + chk.ov + ' seam' + chk.seamBad);
      const T2 = placerTile(L, placerBk());
      if (!T2.ok) add('placerTile ok', tag + ' ' + String(T2.why).slice(0, 100));
      if (T2.ov !== 0 || T2.span !== 0) add('placerTile ov/span', tag + ' ov' + T2.ov + ' span' + T2.span);
    }
  }
  // chain: first non-final node, M=1 tile, K=7
  const nf = Z.nodes.find(n => n.item !== it);
  let chain = {why: 'no non-final node'};
  if (nf) {
    const T1 = pfTileFact(nf, MK, 1);
    if (T1.ok === false) chain = {item: plnNm(nf.item), why: 'M=1 tile refused: ' + T1.why};
    else {
      const TR = pfTileRow(T1, 7, MK), L = build(TR, 1, 7), T2 = placerTile(L, placerBk());
      chain = {item: plnNm(nf.item), g: Math.floor(cap / T1.tileOut), gRow: TR.g, outs: TR.outs.length, want: Math.ceil(7 / Math.floor(cap / T1.tileOut)), ok: !!T2.ok, ov: T2.ov, why: T2.ok ? '' : String(T2.why).slice(0, 100)};
    }
  }
  return {rows, bad, warns, chain};
};

const cases = [
  {name: 'Advanced Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 50},
  {name: 'Magnetic Coils', rate: 30},
  {name: 'Nickel Plates', rate: 30},
];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(runCase, c);
  if (r.refused) { check(false, tag + ': item/tree refused: ' + r.refused); continue }
  console.log(tag + ' tile table (item / M / K / w / h):');
  for (const row of r.rows) console.log('  ' + row.item + ' / ' + row.M + ' / ' + row.K + ' / ' + row.w + ' / ' + row.h + (row.straddle ? ' (straddle)' : ''));
  for (const w of r.warns) console.log('WARN ' + tag + ' ' + w);
  for (const k of ['S.ok', 'no straddle', 'no under-delivery', 'memo', 'cap', 'pfTileRow ok', 'w on 30-grid', 'out row on tile grid', 'segments', 'ports identical', 'body identical', 'pfCheck ov/seam', 'placerTile ok', 'placerTile ov/span']) {
    const list = r.bad[k] || [];
    check(list.length === 0, tag + ': ' + k + (list.length ? ' (bad ' + list.join('; ') + ')' : ''));
  }
  const ch = r.chain;
  if (c.name !== 'Advanced Circuits') continue;   // chain test is for an AC non-final node
  if (ch.why && !ch.g) check(false, tag + ': chain: ' + ch.why);
  else {
    console.log(tag + ' chain ' + ch.item + ' M=1 K=7: g=' + ch.g + ' outs=' + ch.outs + ' ov=' + ch.ov);
    check(ch.g === ch.gRow && ch.outs === ch.want && ch.ok && ch.ov === 0, tag + ': chain g=floor(cap/tileOut)=TR.g, outs=ceil(7/g), placerTile ok, ov 0' + (ch.why ? ' (' + ch.why + ')' : ''));
  }
}

check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

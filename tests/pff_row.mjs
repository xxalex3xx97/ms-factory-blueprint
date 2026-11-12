// pfFact step 3: one factory row tests. Per tree node: pfFactSizeTile tile, K copies via pfFactRow (raw source strip + open crafted heads + out row), hand-built pfBands-shaped layout through pfCheck + placerTile.
// Checks: R.ok, ins = crafted heads x K, raw boxes = raw heads x K, pfCheck ov 0, identical body per copy, placerTile ok (ov 0, span 0).
// Run:  timeout 120 node tests/pff_row.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTree === 'function' && typeof pfTileFact === 'function' && typeof pfTileRow === 'function' && typeof pfFactSizeTile === 'function' && typeof pfFactRow === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// page helper (runs in browser): returns per-node rows, failures per category
const runCase = c => {
  const MK = 1;
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
  if (it === undefined) return {refused: 'item not found'};
  const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const Z = pfFactTree(P, it, MK);
  if (Z.ok === false) return {refused: Z.why};
  const bad = {}, rows = [];
  const add = (k, m) => { (bad[k] = bad[k] || []).push(m) };
  const bodyOf = (items, j, T, bodyY) => JSON.stringify(items.filter(q => q.y >= bodyY && q.y < bodyY + T.h && q.x >= j * T.w && q.x < (j + 1) * T.w).map(q => JSON.stringify([q.cls, q.x - j * T.w, q.y - bodyY, q.rot])).sort());
  for (const nd of Z.nodes) {
    const nm = plnNm(nd.item);
    const S = pfFactSizeTile(nd, MK);
    if (S.ok === false) { add('S.ok', nm + ' ' + S.why); continue }
    const T = S.T, K = S.K, isFin = nd.item === it;
    const R = pfFactRow(nd, T, K, MK, null, isFin);
    if (R.ok === false) {
      add('R.ok', nm + ' K' + K + ' ' + R.why);
      rows.push({item: nm, K, w: T.w, h: T.h, bodyY: '-', raws: '-', crafted: '-', why: R.why});
      continue;
    }
    const craftedHeads = T.ins.filter(p => nd.ins.find(i => i.item === p.item).crafted);
    const rawHeads = T.ins.filter(p => !nd.ins.find(i => i.item === p.item).crafted);
    const rawBoxes = R.items.filter(q => q.cls === PLC_BOX && q.ct && q.ct.some(c => c.inf)).length;   // machine containers have ct [] and are not raw boxes
    rows.push({item: nm, K, w: R.w, h: R.h, bodyY: R.bodyY, raws: rawBoxes, crafted: R.ins.length});
    if (R.ins.length !== craftedHeads.length * K) add('ins count', nm + ' ' + R.ins.length + ' want ' + craftedHeads.length * K);
    if (rawBoxes !== rawHeads.length * K) add('raw box count', nm + ' ' + rawBoxes + ' want ' + rawHeads.length * K);
    const chk = pfCheck({items: R.items, w: R.w + 1, h: R.h, ports: []});
    if (chk.ov !== 0) add('pfCheck ov', nm + ' ov' + chk.ov);
    for (let j = 1; j < K; j++) if (bodyOf(R.items, j, T, R.bodyY) !== bodyOf(R.items, 0, T, R.bodyY)) { add('body identical', nm + ' K' + K + ' copy' + j); break }
    // pfBands-shaped layout around the factory row (oy=0, items already absolute)
    const L = {ok: true, items: R.items, lanes: 1, per: [T.M * K], makes: 0, pitch: R.h + 1, w: R.w + 1, h: R.h, tall: true, mod: false, box: 'DAT_Container_2', mk: MK, ports: R.outs.map(o => ({edge: 'S', off: o.x, dir: 'out', belts: 1, slot: -1, mk: MK})), note: ['pff row'], src: {P, item: it, mk: MK, spMk: 0, o: {}}, prefab: true};
    const T2 = placerTile(L, placerBk());
    if (!T2.ok) add('placerTile ok', nm + ' K' + K + ' ' + String(T2.why).slice(0, 100));
    if (T2.ov !== 0 || T2.span !== 0) add('placerTile ov/span', nm + ' K' + K + ' ov' + T2.ov + ' span' + T2.span);
  }
  return {rows, bad};
};

const cases = [
  {name: 'Advanced Circuits', rate: 10},
  {name: 'Advanced Circuits', rate: 50},
  {name: 'Magnetic Coils', rate: 30},
  {name: 'Basic Circuits', rate: 10},
];
for (const c of cases) {
  const tag = c.name + ' ' + c.rate;
  const r = await pg.evaluate(runCase, c);
  if (r.refused) { check(false, tag + ': item/tree refused: ' + r.refused); continue }
  console.log(tag + ' row table (item / K / w / h / bodyY / raw boxes / crafted ins):');
  for (const row of r.rows) console.log('  ' + row.item + ' / ' + row.K + ' / ' + row.w + ' / ' + row.h + ' / ' + row.bodyY + ' / ' + row.raws + ' / ' + row.crafted + (row.why ? ' (' + row.why + ')' : ''));
  for (const k of ['S.ok', 'R.ok', 'ins count', 'raw box count', 'pfCheck ov', 'body identical', 'placerTile ok', 'placerTile ov/span']) {
    const list = r.bad[k] || [];
    check(list.length === 0, tag + ': ' + k + (list.length ? ' (bad ' + list.join('; ') + ')' : ''));
  }
}

check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

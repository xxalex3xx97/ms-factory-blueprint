// cmp_placed: gate on the PLACED world (what Place -> placerPaste really puts into S.blocks, with STRICT on), not on the composer tile.
// Per case: compose, paste at a hover cell, then check in WORLD coordinates:
//  (1) paste accepted (noBuild: every item on a floor / door area of its block AFTER block rotation, dock port belts included), no refusal toast
//  (2) block list = tile blocks + hover (cls, x, y, rot); every item = tile item + hover*FC with all other fields equal (cls, rot, recipe rec, container ct, priority pr, ...)
//  (3) every item footprint lies inside a block footprint AND on areas(0).rects (floor / open door), machine ports: rot unchanged
//  (4) connectivity flood on the placed world (tests/lib/flood.mjs): same error count, same reached cells, same container reach as the tile
//  (5) mutation: turn one non-square block by one quarter (else shift one block by a unit) in the placed world: the area check (3) must go red
// Run: node tests/cmp_placed.mjs   Exit 1 on FAIL / page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {floodPage} from './lib/flood.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pageCase = a => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key);
  const item = rec.o[0];
  const P = plan(item, a.rate, a.mk, {}, {[item]: a.key}, {proto: false, enr: false, obs: false});
  window.CMP_ENGINE = true;
  const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: a.bk});
  if (!L.ok) return {refused: L.why};
  const T = L.tile || placerTile(L, placerBk());
  if (!T.ok) return {refused: T.why};
  const errs = [], H = 3;
  STRICT = true; S.blocks = []; setView('L'); hover = {x: H, y: H};
  const toasts = []; const t0 = toast; toast = m => toasts.push(m);
  pasting = {rot: 0, fl: false, pl: {blocks: T.blocks, ms: T.ms, plan: {item, rate: a.rate}}};
  try { placerPaste() } finally { toast = t0 }
  const nB = T.blocks.length, n = nB + T.ms.length;
  if (S.blocks.length !== n) return {errs: ['paste refused/short: ' + S.blocks.length + ' of ' + n + ' placed: ' + toasts.join('; ')], row: {tileBlocks: nB}};
  // (2) fields
  const blocks = S.blocks.slice(0, nB), its = S.blocks.slice(nB);
  let d2 = 0;
  T.blocks.forEach((q, i) => { const b = blocks[i]; if (b.cls !== q.cls || b.x !== q.x + H || b.y !== q.y + H || (b.rot || 0) !== (q.rot || 0)) { if (d2++ < 3) errs.push('block ' + i + ' differs from the tile: ' + JSON.stringify([b.x, b.y, b.rot, q.x + H, q.y + H, q.rot])) } });
  const strip = o => { const c = {...o}; ['id', 'mid', 'pid', 'h', 'x', 'y'].forEach(k => delete c[k]); return JSON.stringify(c) };
  T.ms.forEach((m, i) => { const b = its[i]; if (b.x !== m.x + H * FC || b.y !== m.y + H * FC || strip(b) !== strip(m)) { if (d2++ < 6) errs.push('item ' + i + ' ' + m.cls + ' differs from the tile: ' + JSON.stringify([b.x, b.y, m.x + H * FC, m.y + H * FC])) } });
  if (d2) errs.push(d2 + ' placed blocks/items differ from the tile');
  // (3) area check, reused by the mutation
  const areaCheck = () => { const A = areas(0); let off = 0, out = 0; const fp = S.blocks.slice(0, nB).filter(b => !isM(b)).map(b => { const e = dim(b); return {x: b.x * FC, y: b.y * FC, w: e.w * FC, h: e.h * FC} });
    S.blocks.slice(nB).forEach(m => { const e = dim(m); if (!fp.some(f => m.x >= f.x && m.x + e.w <= f.x + f.w && m.y >= f.y && m.y + e.h <= f.y + f.h)) out++; if (!onArea(m.x, m.y, e.w, e.h, A.rects)) off++ }); return {off, out} };
  const base = areaCheck();
  if (base.off) errs.push(base.off + ' placed items off the floor / not in a door slot (world, after block rotation)');
  if (base.out) errs.push(base.out + ' placed items outside every block');
  const rotated = blocks.filter(b => (b.rot || 0) !== 0).length;
  // (4) flood
  const placed = S.blocks.slice(nB).map(b => ({...b}));
  const tileItems = T.ms.map(b => ({...b, x: b.x + H * FC, y: b.y + H * FC}));
  // (5) mutation
  const keep = S.blocks.map(b => ({...b}));
  const cnt = b => { const e = dim(b); return S.blocks.slice(nB).filter(m => m.x >= b.x * FC && m.x < (b.x + e.w) * FC && m.y >= b.y * FC && m.y < (b.y + e.h) * FC).length };   // the non-square block with the most items: turning an empty one proves nothing
  const cand = blocks.filter(b => { const e = dim({cls: b.cls, rot: 0}); return e.w !== e.h && floorRect({cls: b.cls, x: 0, y: 0, h: 0, rot: 0}) }).sort((p, q) => cnt(q) - cnt(p))[0];
  let mut = null;
  if (cand) { window.__cand = [cand.cls, cand.rot, dim(cand), floorRect(cand) && floorRect(cand).w]; const r0 = cand.rot || 0; cand.rot = (r0 + 1) & 3; mut = areaCheck(); cand.rot = r0 }
  else { const b = blocks[0]; b.x += 1; mut = areaCheck(); b.x -= 1 }
  S.blocks = keep;
  if (mut.off + mut.out <= base.off + base.out) errs.push('mutation (one block turned) did not turn the area check red');
  return {cand: window.__cand, errs, placed, tileItems, finalItems: [item], row: {blocks: nB, rotated, items: its.length, mutRed: mut.off + mut.out}};
};

const CASES = [
  ['BC600 Mk2 2x2 ind/ind', 600, 2, 'BPO_Station_02', {in: 'ind', out: 'ind'}],
  ['BC600 Mk2 2x2 no docks', 600, 2, 'BPO_Station_02', null],
  ['BC600 Mk2 2x2 nrm/nrm', 600, 2, 'BPO_Station_02', {in: 'nrm', out: 'nrm'}],
  ['BC600 Mk2 1x2', 600, 2, 'BPO_Station_2x1', null],
  ['BC600 Mk2 2x2c', 600, 2, 'BPO_Station_03', null],
  ['BC600 Mk2 2x2c ind/ind', 600, 2, 'BPO_Station_03', {in: 'ind', out: 'ind'}],
  ['BC100 Mk1 1x2 nrm/nrm', 100, 1, 'BPO_Station_2x1', {in: 'nrm', out: 'nrm'}],
  ['BC100 Mk1 2x2 no docks', 100, 1, 'BPO_Station_02', null],
  ['BC100 Mk1 2x2 ind/ind', 100, 1, 'BPO_Station_02', {in: 'ind', out: 'ind'}],
  ['BC100 Mk1 2x2 nrm in', 100, 1, 'BPO_Station_02', {in: 'nrm', out: null}],
];
const KEY = 'ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit';
const want = process.argv[2];
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [], rows = [];
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
  await page.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof placerPaste === 'function');
  for (const [name, rate, mk, bk, dock] of CASES) {
    if (want && !name.includes(want)) continue;
    const r = await page.evaluate(pageCase, {key: KEY, rate, mk, bk, dock});
    if (r.refused) { console.log('FAIL (refused) ' + name + ': ' + r.refused); fails++; rows.push({name, refused: 1}); continue }
    const errs = [...r.errs]; if (process.env.DBG) console.log(JSON.stringify(r.cand));
    if (r.placed) {
      const f1 = await page.evaluate(floodPage, {items: r.placed, finalItems: r.finalItems}), f0 = await page.evaluate(floodPage, {items: r.tileItems, finalItems: r.finalItems});
      if (f1.errs.length !== f0.errs.length) errs.push('placed flood errs ' + f1.errs.length + ' != tile ' + f0.errs.length);
      if (f1.errs.length) errs.push('placed flood: ' + f1.errs.slice(0, 2).join(' | '));
      if (f1.reach.length !== f0.reach.length || f1.ozReach.length !== f0.ozReach.length) errs.push('placed flood reach ' + f1.reach.length + '/' + f1.ozReach.length + ' != tile ' + f0.reach.length + '/' + f0.ozReach.length);
      if (!f1.ozReach.length) errs.push('product reaches no container in the placed world');
      r.row.reach = f1.reach.length; r.row.floodErrs = f1.errs.length;
    }
    console.log((errs.length ? 'FAIL ' : 'PASS ') + name + (errs.length ? ': ' + errs.join('; ') : ''));
    if (errs.length) fails++;
    rows.push({name, ...r.row});
  }
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
console.table(rows);
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS cmp_placed');
process.exit(fails ? 1 : 0);

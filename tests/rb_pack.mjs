// RB S1: js/rb_pack.js one-module packing vs the current engine. Run: node tests/rb_pack.mjs   Exit 1 on FAIL or page error.
// Per sample (Nickel Plates 31, Basic Circuits 100) x block (2x2, 1x2): old = cmpAssembleTree (CMP_NARROW off, packed) piece widths ww + physical blocks; new = rbPack of each src/feed node alone.
// Hard: no item overlap, items inside the piece width, one-node plan (Nickel): widths, nPhys and item count equal the old build. Multi-node plans: widths printed against the old column width (info).
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = [['Nickel 31', 'ITEM_NickelOre>ITEM_NickelPlates', 31], ['Basic Circuits 100', 'ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit', 100], ['Basic Circuits 40', 'ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit', 40]];
const BKS = [['2x2', 'BPO_Station_02'], ['1x2', 'BPO_Station_2x1']];

const pageRun = a => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key);
  if (!rec) return {err: 'recipe not found ' + a.key};
  const item = rec.o[0], mk = 1, bx = PLC_BOX, P = plan(item, a.rate, mk, {}, {[item]: a.key}, {proto: false, enr: false, obs: false});
  const cls = plcCls(a.bk), f = floorRect({cls, x: 0, y: 0, h: 0, rot: 0}), W = f.w, H = f.h, d = dim({cls, rot: 0}), block = CMP_BLOCKS[PL_ALL.indexOf(a.bk)];
  // old engine: unrolled tree, packed, no narrow hubs
  globalThis.CMP_NARROW = false; globalThis.__cmpDbg = [];
  const pl = cmpPlan(P, item, mk, {}); if (!pl.ok) return {err: 'cmpPlan ' + pl.why};
  const tz = cmpTreeSize(pl, mk, mk, block, null); if (!tz.ok) return {skip: 'cmpTreeSize ' + tz.why + ' (N above one block: stacked rows are a later slice)'};
  const old = cmpAssembleTree({mk, spMk: mk, bx, bk: a.bk, pl, sz: tz.by});
  globalThis.CMP_NARROW = undefined;
  if (!old.ok) return {err: 'old ' + old.why};
  const dbg = globalThis.__cmpDbg[0], oldN = pl.nodes.filter(o => !o.raw);
  const out = {W, H, oldWw: dbg.ww, oldGrp: dbg.grp, oldBlocks: old.T.blocks.length, oldItems: old.T.ms.length, oldNodes: oldN.length, nodes: []};
  // new: shared plan, every src / feed node alone
  const pl2 = cmpPlan(P, item, mk, {share: true}), tz2 = cmpTreeSize(pl2, mk, mk, block, null); if (!tz2.ok) return {err: 'cmpTreeSize2 ' + tz2.why};
  const NBs = {}, byId = Object.fromEntries(pl2.nodes.map(o => [o.id, o]));
  for (const o of pl2.nodes) if (!o.raw) { NBs[o.id] = rbNodeNB(o, tz2.by[o.id], block, W, H); if (!NBs[o.id].ok) return {err: 'NB ' + o.item + ' ' + NBs[o.id].why} }
  for (const o of pl2.nodes) {
    if (o.raw) continue;
    const par = o.parents && o.parents.length ? byId[o.parents[0]] : null, j = par ? par.rec.i.findIndex(([it]) => it === o.key) : -1, R = par ? NBs[par.id].inR[j].length : 0;
    const row = {item: o.item, kind: o.inKind, N: o.N, Rout: R};
    if (o.inKind === 'merge') {   // no IN piece here (caller routes it): pack FB + POOL only, print
      const NB = NBs[o.id], mm = cmpMerge(NB.outRows, NB.outN, NB.gOut);
      const r = rbPack({W, H, mk, dw: d.w, fb: {b: NB.b, bi: NB.bi}, inF: null, poolF: (w, rows) => cmpPool({W: w, H, mk, bx, item: 0, raw: false, inRows: mm.rows, mgIn: mm.mg, outRows: rows}), Rout: R});
      row.ok = r.ok; row.why = r.why; if (r.ok) { row.pw = r.pw0; row.nPhys = r.nPhys; row.poolW = r.poolW; row.items = r.items }
      out.nodes.push(row); continue;
    }
    const r = rbPackNode(o, tz2.by[o.id], NBs[o.id], {block, bx, W, H, mk, Rout: R, dw: d.w});
    row.ok = r.ok; row.why = r.why;
    if (r.ok) { row.pw = r.pw0; row.nPhys = r.nPhys; row.poolW = r.poolW; row.items = r.items }
    out.nodes.push(row);
  }
  for (const row of out.nodes) if (row.ok) { row.count = row.items.in.length + row.items.fb.length + row.items.pool.length; delete row.items }
  return out;
};
// overlap + bounds check at the final widths (needs the live items, Rout 0)
const pageCheck = a => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key), item = rec.o[0], mk = 1, bx = PLC_BOX, P = plan(item, a.rate, mk, {}, {[item]: a.key}, {proto: false, enr: false, obs: false});
  const cls = plcCls(a.bk), f = floorRect({cls, x: 0, y: 0, h: 0, rot: 0}), W = f.w, H = f.h, d = dim({cls, rot: 0}), block = CMP_BLOCKS[PL_ALL.indexOf(a.bk)];
  const pl2 = cmpPlan(P, item, mk, {share: true}), tz2 = cmpTreeSize(pl2, mk, mk, block, null), res = [];
  for (const o of pl2.nodes) {
    if (o.raw || o.inKind === 'merge') continue;
    const NB = rbNodeNB(o, tz2.by[o.id], block, W, H), r = rbPackNode(o, tz2.by[o.id], NB, {block, bx, W, H, mk, Rout: 0, dw: d.w});
    if (!r.ok) { res.push({item: o.item, why: r.why}); continue }
    let bad = 0; const cell = new Map(), ws = r.colW;
    const chk = (its, w, x0) => its.forEach(q => { const e = dim(q); if (q.x < 0 || q.y < 0 || q.x + e.w > w || q.y + e.h > H) bad++; for (let x = q.x; x < q.x + e.w; x++) for (let y = q.y; y < q.y + e.h; y++) { const k = (x + x0) + ',' + y; if (cell.has(k)) bad++; cell.set(k, 1) } });
    const ox = i => r.colP[i] * 1000 + (r.colX[i] - r.colP[i] * FC);   // block-local cell offset (blocks never overlap each other)
    chk(r.items.in, ws[0], ox(0)); chk(r.items.fb, ws[1], ox(1)); chk(r.items.pool, ws[2], ox(2));
    res.push({item: o.item, bad, nPhys: r.nPhys, count: r.items.in.length + r.items.fb.length + r.items.pool.length});
  }
  return res;
};

const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
  await page.waitForFunction(() => window.__fb && typeof cmpAssembleTree === 'function' && typeof placerLayout === 'function');
  check(await page.evaluate(() => typeof rbPack === 'function' && typeof rbGrid === 'function'), 'rbPack and rbGrid loaded by index.html');
  for (const [name, key, rate] of SAMPLES) for (const [bn, bk] of BKS) {
    const tag = name + ' ' + bn, r = await page.evaluate(pageRun, {key, rate, bk});
    if (r.skip) { console.log('skip ' + tag + ': ' + r.skip); continue }
    if (r.err) { check(false, tag + ': ' + r.err); continue }
    const c = await page.evaluate(pageCheck, {key, rate, bk});
    console.log(tag + ' | old: ww(IN,FB,POOL per column)=' + JSON.stringify(r.oldWw) + ' groups=' + r.oldGrp.join(' ') + ' blocks=' + r.oldBlocks + ' items=' + r.oldItems + ' nodes=' + r.oldNodes);
    for (const n of r.nodes) console.log('   new ' + n.item + ' (' + n.kind + ', N=' + n.N + ', Rout=' + n.Rout + '): ' + (n.ok ? 'pw=' + JSON.stringify(n.pw) + ' poolW=' + JSON.stringify(n.poolW) + ' nPhys=' + n.nPhys + ' items=' + n.count : 'refused: ' + n.why));
    c.forEach(q => check(!q.why && q.bad === 0, tag + ' ' + q.item + ': no overlap / inside piece widths' + (q.why ? ' (' + q.why + ')' : '')));
    if (r.oldNodes === 1) {   // single-node plan: must reproduce the old build exactly (Rout 0 = root)
      const n = r.nodes[0], q = c[0];
      check(n.ok && JSON.stringify(n.pw) === JSON.stringify(r.oldWw.slice(0, 3)), tag + ': widths ' + JSON.stringify(n.pw) + ' vs old ' + JSON.stringify(r.oldWw.slice(0, 3)));
      check(q && q.nPhys === r.oldGrp.length, tag + ': nPhys ' + (q && q.nPhys) + ' vs old blocks ' + r.oldGrp.length + ' (' + r.oldGrp.join(' ') + ')');
      check(q && q.count === r.oldItems, tag + ': item count ' + (q && q.count) + ' vs old ' + r.oldItems);
    }
  }
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS rb_pack');
process.exit(fails ? 1 : 0);

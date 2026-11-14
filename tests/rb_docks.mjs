// RB S6a: NORMAL docks (dock {in:'nrm',out:'nrm'}) in the recursive builder (?engine=rb). Industrial docks (S6b) and 2x2c adapter (S6c) stay on the old path.
// Run: node tests/rb_docks.mjs   Exit 1 on FAIL or page error.
// Cases: Nickel Plates 31 / 480, Capacitor 100, Enzyme 10, Basic Circuits 100, Advanced Circuits 5 (2x2, 2x2c).
// Per case: checkCompose strict (planner N exact, ov 0, span 0, flood clean: raw container -> every node, last node -> OZ container) with docks + rb engine used + every raw item docked (one dock container per raw node, never refused, no 'cannot be docked' note)
// + dock belts chain dock <-> container (mutation: deleting a dock belt turns it red) + dock count == containers + no 'dock slot misaligned' + docks on the outer edge only (cmp_dockedge flood: outward face reachable, clearance, no overlap; inputs rot 2 (FEED hubs may use N/S rot 3/1), output rot 0)
// + every item inside a block + no empty block + flow sim: every planner node >= 0.95 x rate.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WARM = +process.env.WARM || 900, MEAS = +process.env.MEAS || 600;
const DOCK = {in: 'nrm', out: 'nrm'};
// [name, key regex, rate, block class]
const CASES = [['Nickel Plates 31 2x2', '^ITEM_NickelOre>ITEM_NickelPlates$', 31, 'BPO_Station_02'], ['Nickel Plates 480 2x2', '^ITEM_NickelOre>ITEM_NickelPlates$', 480, 'BPO_Station_02'], ['Capacitor 100 2x2', '>ITEM_Capacitor$', 100, 'BPO_Station_02'],
  ['Nickel Plates 480 1x2 (stacked B=2)', '^ITEM_NickelOre>ITEM_NickelPlates$', 480, 'BPO_Station_2x1'], ['Nickel Plates 480 1x1 (stacked B=4)', '^ITEM_NickelOre>ITEM_NickelPlates$', 480, 'BPO_Station_01'], ['Enzyme 10 2x2', '>ITEM_Enzyme$', 10, 'BPO_Station_02'], ['Basic Circuits 100 2x2', '>ITEM_BasicCircuit$', 100, 'BPO_Station_02'], ['Advanced Circuits 5 2x2', '>ITEM_AdvancedCircuits$', 5, 'BPO_Station_02'], ['Advanced Circuits 5 2x2c', '>ITEM_AdvancedCircuits$', 5, 'BPO_Station_03']];
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
// page side, on the layout checkCompose just built (window.__cmpL / __cmpP). a.del = 'x,y' dock belt cell removed before the belt-chain check (mutation)
const dockPage = a => {
  const L = window.__cmpL, P = window.__cmpP, T = L.tile, ms = T.ms, cmp = L.bl.cmp;
  const d = dim({cls: plcCls(a.bk), rot: 0}), ad = a.bk === 'BPO_Station_03' ? 1 : 0, A = 16 * ad, adc = plcCls('BPO_StationAdapter_01'), dc = plcCls('BPO_Dock');
  const docks = T.blocks.filter(b => b.cls === dc), errs = [], raw = cmp.raw || [], oz = cmp.oz || [], cell = new Map();
  ms.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) cell.set((b.x + i) + ',' + (b.y + j), b) });
  const all = [...raw.map(q => ({...q, k: 'in'})), ...oz.map(q => ({...q, k: 'out'}))], list = [], slots = new Set();
  const beltAt = (x, y) => { if (a.del === x + ',' + y) return null; const b = cell.get(x + ',' + y); return b && PLC_BELT.includes(b.cls) && b.rot === 0 ? b : null };
  for (const q of all) {
    const c = ms.find(m => m.x === q.x && m.y === q.y && m.dd), x0 = c.dd.gx * 16, y0 = c.dd.gy * 16, M = y0 + 16 * c.dd.u + 6, hb = T.blocks.find(b => b.x === c.dd.gx && b.y === c.dd.gy && b.cls !== dc && b.cls !== adc), hu = dim({cls: hb.cls, rot: hb.rot || 0}).w, Wh = hu * 16 - 2;
    if (c.dd.side === 'N' || c.dd.side === 'S') continue;   // FEED hub vertical dock: checked by the dock-edge flood below
    if (!(c.y <= M && c.y + 3 >= M + 1)) errs.push('container does not cover its door cells @' + c.x + ',' + c.y);
    const dkb = docks.find(b => q.k === 'in' ? b.x === c.dd.gx - 1 - ad && b.y === c.dd.gy + c.dd.u : b.x === c.dd.gx + hu + ad && b.y === c.dd.gy + c.dd.u);
    if (!dkb) errs.push('no dock block for container @' + c.x + ',' + c.y);
    const sk = q.k + c.dd.gx + ',' + c.dd.gy + ',' + c.dd.u; if (slots.has(sk)) errs.push('two docks in slot ' + sk); slots.add(sk);
    const xs = q.k === 'in' ? Array.from({length: c.x - x0 + 1 + A}, (_, i) => x0 - 1 - A + i) : Array.from({length: 2 + A}, (_, i) => x0 + Wh - 1 + i);
    if (q.k === 'out' && c.x + 4 !== x0 + Wh - 1) errs.push('output container not flush @' + c.x);
    list.push({cells: [M, M + 1].flatMap(y => xs.map(x => x + ',' + y)), r: c.dd.r, n: c.dd.n});
  }
  let bad = 0; for (const z of list) for (const k of z.cells) { const [x, y] = k.split(',').map(Number); if (!beltAt(x, y)) bad++ }
  // expected raw items: one dock container per raw planner node (a raw used by two modules = two hubs)
  const pl = cmpPlan(P, L.src.item, a.mk, {share: true});
  const want = {}; pl.nodes.filter(o => o.raw).forEach(o => { want[o.key] = (want[o.key] || 0) + 1 });
  const got = {}; raw.forEach(q => { got[q.item] = (got[q.item] || 0) + 1 });
  const missing = Object.keys(want).filter(k => !(got[k] >= want[k])).map(k => k + ' ' + (got[k] || 0) + '/' + want[k]);
  // outer edge (cmp_dockedge): outward face reachable from outside, clearance, no overlap
  const dcs = [dc, plcCls('BPO_Dock_2')], bl = T.blocks.map(b => { const e = dim({cls: b.cls, rot: b.rot || 0}); return {cls: b.cls, x: b.x, y: b.y, w: e.w, h: e.h, rot: b.rot || 0, dock: dcs.includes(b.cls)} });
  const face = b => { const r = []; for (let i = 0; i < (b.rot % 2 ? b.w : b.h); i++) r.push(b.rot === 0 ? [b.x + b.w, b.y + i] : b.rot === 2 ? [b.x - 1, b.y + i] : b.rot === 3 ? [b.x + i, b.y - 1] : [b.x + i, b.y + b.h]); return r };
  const occ = new Set(); bl.forEach(b => { for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) occ.add((b.x + i) + ',' + (b.y + j)) });
  const x0 = Math.min(...bl.map(b => b.x)) - 1, y0 = Math.min(...bl.map(b => b.y)) - 1, x1 = Math.max(...bl.map(b => b.x + b.w)), y1 = Math.max(...bl.map(b => b.y + b.h));
  const seen = new Set([x0 + ',' + y0]), qq = [[x0, y0]];
  while (qq.length) { const [x, y] = qq.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (nx < x0 || ny < y0 || nx > x1 || ny > y1 || occ.has(k) || seen.has(k)) continue; seen.add(k); qq.push([nx, ny]) } }
  const dl = bl.filter(b => b.dock), enclosed = dl.filter(b => !face(b).every(([x, y]) => seen.has(x + ',' + y))).length;
  const nd = new Set(); bl.filter(b => !b.dock).forEach(b => { for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) nd.add((b.x + i) + ',' + (b.y + j)) });
  const clr = dl.filter(b => { const c = cmpDockClr({cls: b.cls, x: b.x, y: b.y, rot: b.rot}); return c.mid.some(z => nd.has(z)) || c.sides.every(w => w.some(z => nd.has(z))) }).length;
  const cnt = new Map(); let ovl = 0; bl.forEach(b => { for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cnt.has(k)) ovl++; else cnt.set(k, 1) } });
  const outDocks = dl.filter(b => b.rot === 0).length, inDocks = dl.filter(b => b.rot !== 0).length, inWest = dl.filter(b => b.rot === 2).length;
  const dB = b => dim({cls: b.cls, rot: b.rot === 1 || b.rot === 3 ? b.rot : 0}), inB = (x, y) => T.blocks.some(b => { const e = dB(b); return x >= b.x * FC && x < b.x * FC + e.w * FC && y >= b.y * FC && y < b.y * FC + e.h * FC });
  const emptyB = T.blocks.filter(b => !dcs.includes(b.cls) && b.cls !== adc).filter(b => { const e = dB(b); return !T.ms.some(q => q.x >= b.x * FC && q.x < b.x * FC + e.w * FC && q.y >= b.y * FC && q.y < b.y * FC + e.h * FC) }).length;
  return {errs, cells0: list.flatMap(z => z.cells), bad, missing, enclosed, clr, ovl, outDocks, inDocks, inWest, nIn: raw.length, nOut: oz.length, docks: docks.length, rb: !!cmp.rb, asc: cmp.rb ? cmp.rb.ascii : null, mods: cmp.rb ? cmp.rb.mods.map(m => m.letter + ' ' + m.item + ' c' + m.c + ' r' + m.r + ' B' + m.B + ' blocks ' + m.blocks) : [],
    notes: L.note.filter(n => /^Dock/.test(n) && !/^Dock \d+: assign/.test(n)), assigns: L.note.filter(n => /^Dock \d+: assign/.test(n)).length, misaligned: L.note.some(n => /misaligned/.test(n)), cannot: L.note.filter(n => /cannot be docked|not built/.test(n)),
    itemsOut: T.ms.filter(b => !inB(b.x, b.y)).length, emptyB, blocks: T.blocks.length, nodes: cmp.nodes.map(q => q.item + ' ' + q.N)};
};
const simPage = ({nodes, items, warm, meas}) => {
  S.blocks = []; S.dm = []; let bid = 500000; items.forEach(b => S.blocks.push({...b, id: ++bid, h: 0, ...(b.ct ? {ct: b.ct.map(c => c.inf ? c : {...c, n: 1000})} : {})}));   // growth seed container (finite, n 0 as built) = primed by the user: 1000
  __fb.simInit({});
  const Z = __fb.SIM, made = new Set(); Z.M.forEach(M => made.add(M.r.o[0]));
  const raw = new Set(); Z.M.forEach(M => M.r.i.forEach(([it]) => { if (!made.has(it)) raw.add(it) }));
  Z.M.forEach(M => M.r.i.forEach(([it]) => { if (raw.has(it)) M.inb[it] = 1e12 }));   // raw docks: raw belts are not under test (ships are not simulated)
  __fb.simRun(warm);
  const m0 = new Map(Z.mt); __fb.simRun(meas);
  const out = nodes.map(q => {
    let n = 0, got = 0, stv = 0;
    Z.M.forEach((M, id) => { const b = M.b; if (b.x >= q.fb.x && b.x < q.fb.x + q.fb.w && b.y >= q.fb.y && b.y < q.fb.y + q.fb.h) { n++; got += ((Z.mt.get(id) || 0) - (m0.get(id) || 0)) * 60 / meas; if (M.st === 'starved') stv++ } });
    return {id: q.id, item: q.item, rate: q.rate, got, n, stv};
  });
  return {out};
};
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [], rows = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof rbRun === 'function' && typeof placerLayout === 'function' && typeof cmpDockApply === 'function');
  for (const [name, kre, rate, bk] of CASES) {
    if (only && !only.test(name)) continue;
    const key = await page.evaluate(re => [].concat(...Object.values(RECS)).map(rk).find(k => new RegExp(re).test(k)), kre);
    const t0 = Date.now(), r = await checkCompose(page, key, rate, 1, bk, {strict: true, mutate: 'any', exactN: true, dock: DOCK}), ms = Date.now() - t0;
    check(r.ok, name + ': checkCompose strict with docks (planner N exact, ov 0, span 0, flood: raw containers -> nodes -> OZ container)' + (r.ok ? '' : ' -> ' + r.errs.slice(0, 4).join(' | ')));
    if (!r.ok) { rows.push({case: name, note: 'build fail'}); continue }
    const a = await page.evaluate(dockPage, {bk, mk: 1});
    console.log('   ' + name + ': compose+check ' + ms + ' ms, blocks ' + a.blocks + ', rb ' + a.rb + ', docks in ' + a.nIn + ' out ' + a.nOut + ', machines/node: ' + a.nodes.join('; '));
    a.mods.forEach(m => console.log('   module ' + m));
    if (a.asc) console.log(a.asc.map(s => '      ' + s).join('\n'));
    a.notes.forEach(n => console.log('   note ' + n));
    check(a.rb, name + ': built by the recursive builder (not the old path)');
    check(!a.errs.length && a.bad === 0, name + ': dock belts chain dock <-> container (' + a.errs.slice(0, 2).join('; ') + ' bad ' + a.bad + ')');
    check(a.docks >= a.nIn + a.nOut, name + ': dock blocks ' + a.docks + ' for ' + a.nIn + ' input + ' + a.nOut + ' output docked containers');
    check(a.nOut >= 1 && a.assigns === a.nIn + a.nOut, name + ': output docked, one "Dock n: assign" note per dock container (' + a.assigns + '/' + (a.nIn + a.nOut) + ')');
    check(a.missing.length === 0 && a.cannot.length === 0, name + ': every raw item docked, never refused (' + (a.missing.concat(a.cannot).join('; ') || 'all docked') + ')');
    check(!a.misaligned, name + ': no "dock slot misaligned"');
    check(a.enclosed === 0 && a.clr === 0 && a.ovl === 0, name + ': docks on the outer edge (enclosed ' + a.enclosed + ', clearance ' + a.clr + ', overlap ' + a.ovl + ')');
    check(a.outDocks === a.nOut, name + ': output docks east (rot 0): ' + a.outDocks + '/' + a.nOut + ', input docks west (rot 2): ' + a.inWest + '/' + a.inDocks + (a.inWest < a.inDocks ? ' (FEED hub N/S docks on a free outer edge)' : ''));
    check(a.itemsOut === 0 && a.emptyB === 0, name + ': every item inside a block, every block holds an item (' + a.itemsOut + ' out, ' + a.emptyB + ' empty)');
    if (a.cells0.length) { const m = await page.evaluate(dockPage, {bk, mk: 1, del: a.cells0[Math.floor(a.cells0.length / 2)]}); check(m.bad > 0, name + ': mutation: deleting a dock belt turns the dock check red (bad ' + m.bad + ')') }
    const nodes = r.nodes.map(q => ({id: q.id, item: q.item, rate: q.rate, fb: q.fb}));
    const s = await page.evaluate(simPage, {nodes, items: r.items, warm: WARM, meas: MEAS});
    const by = {};
    s.out.forEach(o => { const k = o.item.replace('ITEM_', ''), e = by[k] = by[k] || {plan: 0, got: 0, n: 0, starved: 0, worst: 9}; e.plan += o.rate; e.got += o.got; e.n++; const ratio = o.rate > 0 ? o.got / o.rate : 1; e.worst = Math.min(e.worst, ratio); if (ratio < 0.95) e.starved++ });
    console.table(Object.entries(by).map(([k, e]) => ({item: k, members: e.n, plan: +e.plan.toFixed(1), sim: +e.got.toFixed(1), ratio: +(e.got / e.plan).toFixed(3), worst: +e.worst.toFixed(3), starved: e.starved})));
    const bad = Object.values(by).reduce((x, e) => x + e.starved, 0);
    check(bad === 0, name + ': sim zero starved consumers (' + bad + ' starved)');
    rows.push({case: name, docksIn: a.nIn, docksOut: a.nOut, flood: 'ok', starved: bad, blocks: a.blocks, ms});
  }
  console.table(rows);
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS rb_docks');
process.exit(fails ? 1 : 0);

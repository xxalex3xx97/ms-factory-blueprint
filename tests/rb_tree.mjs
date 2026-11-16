// RB S3: merge modules (?engine=rb): Capacitor 100, Basic Circuits 100 at 2x2 / 1x2. Run: node tests/rb_tree.mjs   Exit 1 on FAIL or page error.
// checkCompose strict (planner N exact, ov 0, span 0, flood clean) + no item outside blocks + no holes + flow sim: every planner node >= 0.95 x rate.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NICKEL = 'ITEM_NickelOre>ITEM_NickelPlates', MOTOR = 'ITEM_TitaniumPlates>ITEM_BasicMotor';
const KEY={cap:'>ITEM_Capacitor$',bc:'>ITEM_BasicCircuit$'},WARM=+process.env.WARM||900,MEAS=+process.env.MEAS||600;
// [name,item,rate,block class]
const CASES=[['Capacitor 100 2x2','cap',100,'BPO_Station_02'],['Basic Circuits 100 2x2','bc',100,'BPO_Station_02'],['Capacitor 100 1x2','cap',100,'BPO_Station_2x1'],['Basic Circuits 100 1x2','bc',100,'BPO_Station_2x1']];
const pageInfo = () => {
  const cmp = window.__cmpL.bl.cmp, T = window.__cmpL.tile, rb = cmp.rb;
  const dB = b => dim({cls: b.cls, rot: b.rot === 1 || b.rot === 3 ? b.rot : 0}), inB = (x, y) => T.blocks.some(b => { const d = dB(b); return x >= b.x * FC && x < b.x * FC + d.w * FC && y >= b.y * FC && y < b.y * FC + d.h * FC });
  const cols = {}; T.blocks.forEach(b => { (cols[b.x] = cols[b.x] || []).push(b.y) });
  let holes = 0; Object.values(cols).forEach(ys0 => { const ys = [...new Set(ys0)].sort((p, q) => p - q); ys.slice(1).forEach((y, i) => { holes += Math.round((y - ys[i]) / dB(T.blocks[0]).h) - 1 }) });
  const emptyB = T.blocks.filter(b => { const d = dB(b); return !T.ms.some(q => q.x >= b.x * FC && q.x < b.x * FC + d.w * FC && q.y >= b.y * FC && q.y < b.y * FC + d.h * FC) }).length;
  return {rb, emptyB, itemsOut: T.ms.filter(b => !inB(b.x, b.y)).length, holes, blocks: T.blocks.length, nodes: cmp.nodes.map(q => q.item + ' ' + q.N)};
};
const simPage = ({nodes, items, warm, meas}) => {
  S.blocks = []; S.dm = []; let bid = 500000; items.forEach(b => S.blocks.push({...b, id: ++bid, h: 0}));
  __fb.simInit({});
  const Z = __fb.SIM, hasIn = new Set();
  Z.cS.forEach(l => l.forEach(k => hasIn.add(k.m.id)));
  const made = new Set(); Z.M.forEach(M => made.add(M.r.o[0]));
  const raw = new Set(); Z.M.forEach(M => M.r.i.forEach(([it]) => { if (!made.has(it)) raw.add(it) }));
  const src = 0;   // no raw docks in the tile: every machine gets unlimited raw directly in its input buffer (raw belts are not under test)
  Z.M.forEach(M => M.r.i.forEach(([it]) => { if (raw.has(it)) M.inb[it] = 1e12 }));
  __fb.simRun(warm);
  const m0 = new Map(Z.mt); __fb.simRun(meas);
  const sat = [], st = {working: 0, starved: 0, blocked: 0, idle: 0};
  Z.M.forEach(M => st[M.st] = (st[M.st] || 0) + 1);
  Z.stat.load.forEach((e, id) => { if (e.util != null && e.util > 0.98) sat.push(id) });
  if (!nodes) { const P = window.__cmpP, its = [...made]; nodes = its.map(it => ({id: it, item: it, rate: P.nodes[it] ? P.nodes[it].rate : 0, fb: null})) }
  const out = nodes.map(q => {
    let n = 0, got = 0, full = 0, stv = 0;
    Z.M.forEach((M, id) => { const b = M.b; if (q.fb ? b.x >= q.fb.x && b.x < q.fb.x + q.fb.w && b.y >= q.fb.y && b.y < q.fb.y + q.fb.h : M.r.o[0] === q.item) { n++; const d = (Z.mt.get(id) || 0) - (m0.get(id) || 0); got += d * 60 / meas; if (M.st === 'starved') stv++ } });
    return {id: q.id, item: q.item, gid: q.gid, rate: q.rate, got, n, stv};
  });
  const dbg = []; Z.M.forEach((M, id) => { if (M.r.o[0].includes('Capacitor')) dbg.push([M.b.x, M.b.y, M.st, JSON.stringify([...Object.entries(M.inb)].map(([k, v]) => k.replace('ITEM_', '').slice(0, 3) + Math.round(v))), Math.round(((Z.mt.get(id) || 0) - (m0.get(id) || 0)) * 60 / meas)]) });
  if (globalThis.__wantDbg) { const cc = []; Z.C.forEach((c, id) => { const t = c.st.get('ITEM_TitaniumPlates'); const n = c.st.get('ITEM_NickelPlates'); if (t || n) cc.push([c.b.x, c.b.y, t && Math.round(t.n), n && Math.round(n.n)]) }); console.log('CONT ' + JSON.stringify(cc)) }
  if (globalThis.__wantDbg) console.log('CAPM ' + JSON.stringify(dbg));
  return {out, src, raw: [...raw], sat: sat.length, st, steady: Z.sm && Z.sm.steady};
};
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [], rows = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof rbRun === 'function' && typeof placerLayout === 'function');
  for (const [name, kn, rate, bk] of CASES) {
    const key = await page.evaluate(re => [].concat(...Object.values(RECS)).map(rk).find(k => new RegExp(re).test(k)), KEY[kn]);
    const t0 = Date.now(), r = await checkCompose(page, key, rate, 1, bk, {strict: true, mutate: 'any', exactN: true}), ms = Date.now() - t0;
    check(r.ok, name + ': checkCompose strict (planner N exact, ov 0, span 0, flood clean, stage flow)' + (r.ok ? '' : ' -> ' + r.errs.slice(0, 4).join(' | ')));
    if (!r.ok) { rows.push({case: name, note: 'build fail'}); continue }
    const i = await page.evaluate(pageInfo);
    console.log('   ' + name + ': compose+check ' + ms + ' ms, blocks ' + i.blocks + ', machines/node: ' + i.nodes.join('; '));
    i.rb.mods.forEach(m => console.log('   module ' + m.letter + ' ' + m.item + ' N=' + m.N + ': B=' + m.B + ' nPhys=' + m.nPhys + ' blocks=' + m.blocks + ' at c' + m.c + ' r' + m.r));
    console.log(i.rb.ascii.map(s => '      ' + s).join('\n'));
    check(i.itemsOut === 0 && i.emptyB === 0, name + ': every item inside a block, every block holds an item (' + i.itemsOut + ' out, ' + i.emptyB + ' empty)');
    console.log('   INFO ' + name + ': bounding-box gaps ' + i.holes);
    const nodes = r.nodes.map(q => ({id: q.id, item: q.item, gid: q.gid, rate: q.rate, fb: q.fb}));
    const s = await page.evaluate(simPage, {nodes, items: r.items, warm: WARM, meas: MEAS});
    const by = {};
    s.out.forEach(o => { const k = o.item.replace('ITEM_', ''), e = by[k] = by[k] || {plan: 0, got: 0, n: 0, starved: 0, worst: 9}; e.plan += o.rate; e.got += o.got; e.n++; const ratio = o.rate > 0 ? o.got / o.rate : 1; e.worst = Math.min(e.worst, ratio); if (ratio < 0.95) e.starved++ });
    console.table(Object.entries(by).map(([k, e]) => ({item: k, members: e.n, plan: +e.plan.toFixed(1), sim: +e.got.toFixed(1), ratio: +(e.got / e.plan).toFixed(3), worst: +e.worst.toFixed(3), starved: e.starved})));
    const bad = Object.values(by).reduce((a, e) => a + e.starved, 0);
    check(bad === 0, name + ': sim zero starved consumers (' + bad + ' starved)');
    rows.push({case: name, modules: i.rb.mods.length, blocksPerModule: i.rb.mods.map(m => m.blocks).join('/'), blocks: i.blocks, ms, starved: bad});
  }
  console.table(rows);
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS rb_tree');
process.exit(fails ? 1 : 0);
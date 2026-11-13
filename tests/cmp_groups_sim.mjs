// Groups static lane split in the site's simulator (js/sim.js, headless via __fb). Builds each case with groups forced (CMP_GROUPS=true) and as control (CMP_GROUPS=false = current engine, GAUTO off),
// loads the tile, gives infinite raw to source containers (containers nothing feeds), runs WARM+MEAS sim seconds, reports per planner node (member): sim items/min vs planner rate.
// Starved = sim < 0.95 x planner. Models: sim.js (1 s steps, belts unbuffered, machine in/out buffers, splitter round-robin/skip-full). Run: node tests/cmp_groups_sim.mjs [ac:30,capacitor:500,basicmotor:100] ; env WARM MEAS
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = {nickel: '^ITEM_NickelOre>ITEM_NickelPlates$', basicmotor: '>ITEM_BasicMotor$', capacitor: '>ITEM_Capacitor$', bc: '>ITEM_BasicCircuit$', ac: '>ITEM_AdvancedCircuits$'};
const WARM = +process.env.WARM || 900, MEAS = +process.env.MEAS || 600;
const cases = (process.argv[2] || 'ac:30,capacitor:500,basicmotor:100').split(',');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [], rows = [];
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
  return {out, src, raw: [...raw], sat: sat.length, st, steady: Z.sm && Z.sm.steady};
};
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
  await page.waitForFunction(() => window.__fb && typeof cmpGroupsRun === 'function' && typeof placerLayout === 'function');
  for (const c of cases) for (const mode of ['groups', 'control']) {
    const [n, rate] = c.split(':');
    const key = await page.evaluate(re => [].concat(...Object.values(RECS)).map(rk).find(k => new RegExp(re).test(k)), KEY[n]);
    await page.evaluate(g => { globalThis.CMP_GROUPS = g }, mode === 'groups');
    const t0 = Date.now(), r = await checkCompose(page, key, +rate, 1, 'BPO_Station_02', {strict: true});
    if (!r.ok) { console.log('REFUSED/FAIL ' + c + ' ' + mode + ': ' + r.errs.slice(0, 2).join(' | ')); rows.push({case: c, mode, note: 'build fail'}); if (mode === 'groups') fails++; continue }
    const nodes = r.nodes && r.nodes.map(q => ({id: q.id, item: q.item, gid: q.gid, rate: q.rate, fb: q.fb}));
    const s = await page.evaluate(simPage, {nodes, items: r.items, warm: WARM, meas: MEAS});
    const by = {};
    s.out.forEach(o => { const k = o.item.replace('ITEM_', ''), e = by[k] = by[k] || {plan: 0, got: 0, blocks: 0, starvedBlocks: 0, worst: 9}; e.plan += o.rate; e.got += o.got; e.blocks++; const ratio = o.rate > 0 ? o.got / o.rate : 1; e.worst = Math.min(e.worst, ratio); if (ratio < 0.95) e.starvedBlocks++ });
    console.log(`== ${c} ${mode}: blocks ${r.row.blocks} belts ${r.row.belts} machines ${r.row.machines} srcContainers ${s.src} raw ${s.raw.map(x => x.replace('ITEM_', '')).join(',')} states ${JSON.stringify(s.st)} satBelts ${s.sat} steady ${s.steady} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    console.table(Object.entries(by).map(([k, e]) => ({item: k, blocks: e.blocks, plan: +e.plan.toFixed(1), sim: +e.got.toFixed(1), ratio: +(e.got / e.plan).toFixed(3), worstBlock: +e.worst.toFixed(3), starved: e.starvedBlocks})));
    const bad = Object.values(by).reduce((a, e) => a + e.starvedBlocks, 0);
    rows.push({case: c, mode, blocks: r.row.blocks, starvedBlocks: bad});
    if (mode === 'groups' && bad) fails++;
  }
  console.table(rows);
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS cmp_groups_sim');
process.exit(fails ? 1 : 0);

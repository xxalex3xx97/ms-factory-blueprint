// Chained splitter demand check: flowLoad water-fill per splitter (check A), and a sim scene of
// 2 splitters feeding 5 refinery chambers (check B): each chamber must load N/min after the fix.
// Run: node tests/flow_split_chain.mjs   Exit 1 on FAIL.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href + '?engine=old';
let total = 0; const fails = [], errs = [];
const chk = (n, c, d = '') => { total++; if (!c) fails.push(n + ' ' + d); console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); };

// helpers copied from tests/harness.mjs (lines 84-97, 1673-1705); toolkit also returns relPort
const lkOn = p => p.evaluate(() => { LK = true; $('lk').classList.add('on'); $('lk').setAttribute('aria-pressed', 'true'); });   // flow links default off; the suite predates that
const mclass = id => BMAP[id].machineClass || id;
const mac = (id, x, y, o = {}) => ({
  Class: mclass(id), DefaultName: id,
  Transform: {GridLocation: {X: x, Y: y}, Height: o.h || 0, GridRotation: o.rot || 0},
  MachineID: o.mid || 0, PaletteID: 0, ...(o.off ? {Ports: o.off} : {}), ...(o.rec ? {Recipe: o.rec} : {}),
});
const bp = (Blocks = [], DefaultMachines = [], extra = {}) => ({Version: 1, DisplayName: 't', Blocks, DefaultMachines, ...extra});
const imp = async (pg, obj) => { const ok = await pg.evaluate(t => __fb.importJson(t), JSON.stringify(obj)); await pg.evaluate(() => { if (!$('lvW').hidden) $('lvWX').click(); }); return ok; };   // import opens Level for 2+ levels; old tests assume closed
function toolkit(pg) {
  let mid = 1;
  const nm = () => mid++;
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const dirIdx = n => D.findIndex(d => d[0] === n[0] && d[1] === n[1]);
  const neg = n => [-n[0], -n[1]];
  const add = (c, n, k) => ({x: c.x + n[0] * k, y: c.y + n[1] * k});
  const portsAt = async (id, rot) => { await imp(pg, bp([], [mac(id, 0, 0, {rot})])); return pg.evaluate(() => __fb.portsOf(__fb.S.blocks[0]).map(p => ({x: p.x, y: p.y, nx: p.nx, ny: p.ny, en: p.en, dir: p.dir, key: p.key}))); };
  const relPort = async (id, n) => {
    for (let rot = 0; rot < 4; rot++) { const p = (await portsAt(id, rot)).find(q => q.en && (!n || (q.nx === n[0] && q.ny === n[1]))); if (p) return {rot, x: p.x, y: p.y, nx: p.nx, ny: p.ny}; }
    throw new Error(`no port ${n} on ${id}`);
  };
  const relPair = async (id, nA, nB) => {
    for (let rot = 0; rot < 4; rot++) { const ps = (await portsAt(id, rot)).filter(q => q.en); const a = ps.find(q => q.nx === nA[0] && q.ny === nA[1]), b = ps.find(q => q.nx === nB[0] && q.ny === nB[1]); if (a && b) return {rot, a, b}; }
    throw new Error(`no port pair on ${id}`);
  };
  const placed = (id, rp, c, o) => mac(id, c.x - rp.x, c.y - rp.y, {rot: rp.rot, ...o});
  const belt = (c, rot) => mac('DAT_ConveyorBelt', c.x, c.y, {rot, mid: nm()});
  const cache = {};
  const cont = async (c, n, contents) => {
    const k = n.join(); const rp = cache[k] || (cache[k] = await relPort('DAT_Container_2', n));
    return {...placed('DAT_Container_2', rp, c, {mid: nm()}), ...(contents ? {Contents: contents} : {})};
  };
  const leg = async (c0, segs, kind, contents, noCont) => {
    const cells = [], dirs = []; let cur = c0;
    segs.forEach(([n, len]) => { for (let i = 0; i < len; i++) { cur = add(cur, n, 1); cells.push(cur); dirs.push(n); } });
    const ms = cells.map((c, i) => belt(c, dirIdx(kind === 'in' ? neg(dirs[i]) : dirs[Math.min(i + 1, dirs.length - 1)])));
    const last = dirs[dirs.length - 1];
    if (!noCont) ms.push(await cont(add(cur, last, 1), neg(last), contents));
    return ms;
  };
  return {nm, relPair, relPort, placed, leg, portsAt, resetMid: () => { mid = 1; }};
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1280, height: 800}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE); await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  await lkOn(pg);
  const C = await pg.evaluate(() => CATALOG);
  globalThis.BMAP = Object.fromEntries(C.buildables.map(b => [b.id, b]));   // mac() needs BMAP in node

  // A) unit: splitter tree 1 -> {2,3,4}, 4 -> {5,6,7,8}. Belt 30/min. 2,3 take 5; 4 takes 20 (=> 4 onward gets 20, 5..8 take 5 each)
  const a = await pg.evaluate(() => {
    const sp = new Map([[1, [2, 3, 4]], [4, [5, 6, 7, 8]]]);
    const A = new Map([[1, Infinity], [2, 5], [3, 5], [4, 20], [5, 5], [6, 5], [7, 5], [8, 5]]);
    const o = __fb.flowLoad(new Map(), [{id: 1, item: 'X', rate: 30}], new Map(), sp, {acc: id => A.get(id), pr: new Map()});
    const r = {}; o.forEach((e, k) => r[k] = Math.round(e.tot * 1000) / 1000); return r;
  });
  console.log(JSON.stringify(a));
  chk('A: splitter 4 onward gets 20 (not less)', a[4] === 20, JSON.stringify(a));
  chk('A: outputs 2 and 3 get 5', a[2] === 5 && a[3] === 5, JSON.stringify(a));
  chk('A: outputs 5..8 get 5 each', a[5] === 5 && a[6] === 5 && a[7] === 5 && a[8] === 5, JSON.stringify(a));

  // B) sim scene: input -> splitter A -> {N, S chambers, E -> splitter B -> {N, E, S chambers}}
  const T = toolkit(pg);
  const KEY = 'ITEM_CobaltOre>ITEM_CobaltPlates';
  const P = {x: 40, y: 40};
  const oldSpeed = await pg.evaluate(() => def('DAT_ConveyorBelt').speed.itemsPerMin);
  try {
    const N = await pg.evaluate(k => {
      const d = def('DAT_Refinery'), r = recsOf(d).find(r => rkm(r, k));
      return pm(r.i.find(q => q[0] === 'ITEM_CobaltOre')[1], r.t);
    }, KEY);
    await pg.evaluate(n => { def('DAT_ConveyorBelt').speed.itemsPerMin = 6 * n; }, N);
    console.log('N=' + N + ' belt speed=' + (6 * N) + ' oldSpeed=' + oldSpeed);

    const rpS = await T.relPort('DAT_Splitter', [-1, 0]);
    const ms = [];
    ms.push(T.placed('DAT_Splitter', rpS, P, {mid: T.nm()}));
    ms.push(...await T.leg(P, [[[-1, 0], 3]], 'in', [{Item: 'ITEM_CobaltOre', Count: 0, Infinite: true}]));
    for (const dir of [[0, -1], [0, 1]]) {
      ms.push(...await T.leg(P, [[dir, 3]], 'out', null, true));
      const rp = await T.relPort('DAT_Refinery', [-dir[0], -dir[1]]);
      ms.push(T.placed('DAT_Refinery', rp, {x: P.x + dir[0] * 4, y: P.y + dir[1] * 4}, {rec: KEY, mid: T.nm()}));
    }
    const PB = {x: 44, y: 40};
    ms.push(...await T.leg(P, [[[1, 0], 3]], 'out', null, true));
    ms.push(T.placed('DAT_Splitter', rpS, PB, {mid: T.nm()}));
    for (const dir of [[0, -1], [1, 0], [0, 1]]) {
      ms.push(...await T.leg(PB, [[dir, 3]], 'out', null, true));
      const rp = await T.relPort('DAT_Refinery', [-dir[0], -dir[1]]);
      ms.push(T.placed('DAT_Refinery', rp, {x: PB.x + dir[0] * 4, y: PB.y + dir[1] * 4}, {rec: KEY, mid: T.nm()}));
    }
    await imp(pg, bp([], ms));

    const res = await pg.evaluate(n => {
      const K = __fb.links();
      const chambers = S.blocks.filter(b => b.cls === 'DAT_Refinery');
      const stat = chambers.map(b => { const r = __fb.supplyRows(b, K)[0] || {}; return {x: b.x, y: b.y, have: r.have, st: r.st}; });
      theoProd(false);
      const Th = theoLevel(0);
      const sim = chambers.map(b => {
        const e = Th.K.ports.find(e => e.m === b && DIR[e.b.rot] && DIR[e.b.rot][0] === -e.port.nx && DIR[e.b.rot][1] === -e.port.ny);
        return {x: b.x, y: b.y, belt: e ? e.b.id : null, load: e ? (Th.load.get(e.b.id) || {tot: 0}).tot : null};
      });
      const spl = S.blocks.filter(b => b.cls === 'DAT_Splitter');
      const splB = spl.reduce((p, q) => q.x > p.x ? q : p);   // splitter B = east-most splitter
      const fe = Th.K.ports.find(e => e.m === splB && DIR[e.b.rot] && DIR[e.b.rot][0] === -e.port.nx && DIR[e.b.rot][1] === -e.port.ny);
      const feedB = fe ? (Th.load.get(fe.b.id) || {tot: 0}).tot : null;
      return {nch: chambers.length, stat, sim, feedB, nspl: spl.length};
    }, N);
    console.log('chambers=' + res.nch + ' static=' + JSON.stringify(res.stat));
    console.log('sim per-chamber loads=' + JSON.stringify(res.sim));
    chk('B: 5 chambers placed', res.nch === 5, String(res.nch));
    chk('B static: each chamber supplyRows have == N and ok', res.stat.length === 5 && res.stat.every(s => Math.abs(s.have - N) <= 0.01 && s.st === 'ok'), JSON.stringify(res.stat));
    console.log('splitters=' + res.nspl + ' feedB load=' + res.feedB);
    chk('B sim: belt feeding splitter B carries 3N', res.feedB !== null && Math.abs(res.feedB - 3 * N) < 1e-6, `load=${res.feedB} 3N=${3 * N}`);
    for (const s of res.sim) chk(`B sim: chamber ${s.x},${s.y} input load == N`, s.load !== null && Math.abs(s.load - N) < 1e-6, `load=${s.load} N=${N}`);
  } finally {
    await pg.evaluate(v => { def('DAT_ConveyorBelt').speed.itemsPerMin = v; }, oldSpeed);
  }
  chk('no page errors', errs.length === 0, errs.join(' | '));
} catch (e) {
  fails.push('exception ' + e.message); console.log('FAIL exception ' + e.message);
} finally {
  await br.close();
}
console.log(`${total - fails.length}/${total} passed`);
if (fails.length) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }

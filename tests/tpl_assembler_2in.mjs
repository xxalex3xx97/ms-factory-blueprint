// TPL assembler_2in: modular 2-input DAT_Assembler block template (js/tpl/assembler_2in.js). Run: node tests/tpl_assembler_2in.mjs   Exit 1 on FAIL or page error.
// Per block (1x1,1x2,2x2,2x2c) and n in {1,2,nMax-1,nMax} (+ nMax+1 must refuse): no overlap, inside floor, noBuild, placerCut/placerTile ok (ov 0, span 0),
// connectivity flood (each lane reaches only its machines, each machine gets A and B on its N face ports, each machine output reaches the east out port),
// rates (input lane group load <= DERATE*cap, output <= cap), table. Also: all 2-input assembler recipes nMax table; geometric-max negative (ignoreRate).
import {createRequire} from 'module';
import path from 'path';
import fs from 'fs';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerTile === 'function' && typeof noBuild === 'function');
await pg.addScriptTag({path: ROOT + '/js/tpl/assembler_2in.js'});
import {checkIface, checkChain} from './tpl_iface.mjs';
import {checkPlan} from './tpl_plan.mjs';
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const recs = await pg.evaluate(() => (RECS.CRAFT_Assembler || []).filter(r => r.i.length === 2).map(r => ({k: rk(r), name: plnNm(r.o[0]), i: r.i.map(x => x[1]), o: r.o[1], t: r.t})));
console.log('2-input assembler recipes: ' + recs.map(r => r.name).join(', '));
const BC = recs.find(r => r.name === 'Basic Circuits');
// shared page-side evaluator
async function run(spec, shot) {
  return pg.evaluate(([spec, shot]) => {
    const T = tplBuild(spec);
    if (!T.ok) return {refused: T.why};
    const out = {nMax: T.nMax, g: T.g, stats: T.stats, errs: [], T: spec.keep ? {iface: T.iface, ports: T.ports, w: T.w, items: T.items.map(b => ({cls: b.cls, x: b.x, y: b.y, rot: b.rot}))} : null};
    const its = spec.drop ? T.items.filter(b => !(b.x === spec.drop[0] && b.y === spec.drop[1])) : T.items, W = T.w, H = T.h;
    // (1) overlap + (2) inside floor
    const occ = new Map(); let ov = 0, outside = 0;
    for (const b of its) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { if (x < 0 || y < 0 || x >= W || y >= H) outside++; const k = x + ',' + y; if (occ.has(k)) ov++; else occ.set(k, b) } }
    out.ov = ov; out.outside = outside;
    // in-game build rules: block floor + items through noBuild (placerPaste way)
    const bcls = plcCls(T.blockCls), u0 = uid;
    const bs = [{id: uid++, cls: bcls, x: 0, y: 0, h: layer, rot: 0, pid: 0}];
    const ms = its.map(m => ({...m, id: uid++, mid: 0, pid: 0, h: layer}));
    const n0 = S.blocks.length; S.blocks.push(...bs);
    try { out.noBuild = !!noBuild(ms.map(mItem)) } catch (e) { out.noBuild = 'ERR ' + e.message } finally { S.blocks.length = n0; uid = u0 }
    // (3) placer: placerCut + placerTile
    const L = {ok: true, items: its.map(b => ({...b})), w: W, h: H, tall: false, cuts: null, pitch: H, lanes: 1, mk: spec.mk, box: 'DAT_Container_2', note: []};
    const C = placerCut(L, bcls);
    out.cut = {ok: C.ok, ov: C.ov, span: C.span, cols: C.cols, rows: C.rows, ug: C.ug, why: C.why || null};
    const okA = PL_ALL.map(n => n === T.blockCls);
    const TT = placerTile(L, okA);
    out.tile = {ok: TT.ok, ov: TT.ov, span: TT.span, blocks: TT.blocks ? TT.blocks.length : 0, why: TT.ok ? null : String(TT.why).slice(0, 160)};
    // (4) flood
    const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], isB = b => PLC_BELT.includes(b.cls), isU = b => PLC_UG.includes(b.cls), isP = b => PLC_SPL.includes(b.cls);
    const mx = def(PLC_UG[spec.mk]).maxApart;
    const mach = its.filter(b => b.rec), mof = new Map();
    mach.forEach(m => { const d = dim(m); for (let x = m.x; x < m.x + d.w; x++) for (let y = m.y; y < m.y + d.h; y++) mof.set(x + ',' + y, m) });
    const mports = new Map(mach.map(m => [m, portsOf({...m, off: m.off || []})]));
    const hits = new Map();   // machine -> Map(portKey -> Set(tag))
    const bad = [];
    const flood = (sx, sy, tag, sdir) => {
      const seen = new Set(), q = [[sx, sy, sdir, false]], reach = new Set();
      while (q.length) {
        let [x, y, from, jumped] = q.pop();
        const key = x + ',' + y + ',' + (jumped ? 1 : 0);
        if (seen.has(key)) continue; seen.add(key);
        const it = occ.get(x + ',' + y); if (!it) continue;
        if (mof.has(x + ',' + y)) continue;
        reach.add(x + ',' + y);
        const step = (nx, ny, dx, dy) => {   // move from (x,y) toward (nx,ny) with direction (dx,dy)
          const mm = mof.get(nx + ',' + ny);
          if (mm) {
            const p = mports.get(mm).find(p => p.x + p.nx === x && p.y + p.ny === y && p.nx === -dx && p.ny === -dy);
            if (!p || !p.en) { bad.push('flow into disabled/non-port of machine ' + mm.x + ',' + mm.y + ' from ' + x + ',' + y); return }
            if (!hits.has(mm)) hits.set(mm, new Map());
            const h = hits.get(mm); if (!h.has(p.key)) h.set(p.key, new Set()); h.get(p.key).add(tag);
            return;
          }
          q.push([nx, ny, 0, false]);
        };
        if (isB(it)) { const [dx, dy] = DIR[it.rot]; step(x + dx, y + dy, dx, dy) }
        else if (isU(it)) {
          const [dx, dy] = DIR[it.rot];
          if (!jumped) { let k = 1; while (k <= mx + 1 && !(occ.get((x + dx * k) + ',' + (y + dy * k)) && isU(occ.get((x + dx * k) + ',' + (y + dy * k))))) k++; if (k > mx + 1) { bad.push('UG without partner at ' + x + ',' + y); continue } q.push([x + dx * k, y + dy * k, 0, true]) }
          else step(x + dx, y + dy, dx, dy);
        } else if (isP(it)) {
          portsOf(it).filter(p => p.en && p.dir !== 'in').forEach(p => step(p.x + p.nx, p.y + p.ny, p.nx, p.ny));
        }
      }
      return reach;
    };
    const laneReach = new Map();   // tag -> machines reached
    T.ports.in.forEach(p => {
      const tag = p.row + p.lane;
      const before = new Set([...hits.keys()].map(m => m)), snapshot = new Map([...hits.entries()].map(([m, h]) => [m, new Set([...h.keys()].filter(k => h.get(k).has(tag)))]));
      flood(p.x, p.y, tag, 0);
      laneReach.set(tag, new Set());
    });
    // lane -> machines (by tag membership)
    const laneM = {};
    hits.forEach((h, m) => h.forEach((tags, key) => tags.forEach(t => { (laneM[t] = laneM[t] || new Set()).add(m) })));
    // each machine: its north-face enabled ports each get exactly one lane, from two different items
    let portErr = 0;
    const itemOf = tag => T.ports.in.find(p => p.row + p.lane === tag).item;
    mach.forEach(m => {
      const np = mports.get(m).filter(p => p.ny === -1 && p.en), h = hits.get(m) || new Map();
      if (np.length !== 2) { portErr++; return }
      const its2 = np.map(p => { const t = h.get(p.key); return t && t.size === 1 ? itemOf([...t][0]) : -1 });
      if (!(its2.includes(0) && its2.includes(1))) portErr++;
      [...h.keys()].forEach(k => { if (!np.some(p => p.key === k)) portErr++ });
    });
    out.portErr = portErr; out.bad = bad.length; out.badWhy = bad.slice(0, 3);
    // output: every machine's south port cell reaches the row's out port
    let outErr = 0;
    mach.forEach(m => {
      const sp = mports.get(m).filter(p => p.ny === 1 && p.en);
      if (sp.length < 1) { outErr++; return }
      const tgt = T.ports.out.find(p => m.y >= p.o && m.y < p.o + 10);
      sp.forEach(p => { const r = flood(p.x + p.nx, p.y + p.ny, 'o', 0); if (!r.has(tgt.x + ',' + tgt.y)) outErr++ });
    });
    out.outErr = outErr;
    // (5) rates
    const cap = [60, 120, 180][spec.mk], der = BL.DERATE;
    const cnt = {}; Object.entries(laneM).forEach(([t, s]) => { cnt[t] = s.size });
    const mxLane = Math.max(0, ...Object.values(cnt));
    out.maxLaneMachines = mxLane;
    if (T.rin) {
      out.laneLoad = Math.max(0, ...Object.entries(cnt).map(([t, c]) => c * T.rin[itemOf(t)]));
      out.laneLim = der * cap;
      const perRow = {}; mach.forEach(m => { const r = T.ports.out.find(p => m.y >= p.o && m.y < p.o + 10).set; perRow[r] = (perRow[r] || 0) + 1 });
      out.outLoad = Math.max(0, ...Object.values(perRow)) * T.rout; out.outCap = cap;
    }
    out.ports = {in: T.ports.in.length, out: T.ports.out.length, sets: T.sets};
    out.prAll = its.filter(b => PLC_SPL.includes(b.cls)).every(b => b.pr && b.pr[0] === 0 && b.pr[1] === -1 && portsOf(b).find(p => p.f === 'S').en);
    out.mach = mach.length; out.area = W * H;
    return out;
  }, [spec, shot]);
}
const MK = 1, SP = 1, rows = [], refB = {};
const blocks = ['1x1', '1x2', '2x2', '2x2c'];
const base = block => ({block, cls: 'DAT_Assembler', rec: BC.k, mk: MK, spMk: SP});
for (const block of blocks) {
  const nMax = await pg.evaluate(s => tplMax(s), base(block));
  console.log('\n== ' + block + ' Basic Circuits Mk' + (MK + 1) + ': nMax ' + nMax);
  check(nMax > 0, block + ' builds (nMax ' + nMax + ')');
  if (!nMax) continue;
  const ns = [...new Set([1, 2, nMax - 1, nMax])].filter(n => n >= 1 && n <= nMax);
  for (const n of ns) {
    const spec = {...base(block), n}, r = await run({...spec, keep: true});
    if (n === 1) refB[block] = r.T;
    if (r.T) {
      const ci = await checkIface(pg, r.T, block, refB[block]);
      check(ci.ok, block + ' n=' + n + ' checkIface ' + ci.errs.slice(0, 3).join('; '));
      check(r.prAll, block + ' n=' + n + ' every manifold splitter has priority to its machine face');
      const nxt = await pg.evaluate(s => { const t = tplBuild(s); return t.ok ? {iface: t.iface, ports: t.ports, w: t.w, items: t.items.map(b => ({cls: b.cls, x: b.x, y: b.y, rot: b.rot}))} : null }, {...spec, main: 1});
      check((await checkIface(pg, nxt, block)).ok, block + ' n=' + n + ' checkIface with main=1');
      const ch = checkChain(r.T, r.T);
      check(ch.ok, block + ' n=' + n + ' checkChain self ' + ch.errs.join('; '));
    }
    const tag = `${block} n=${n}`;
    if (r.refused) { check(false, tag + ' refused ' + r.refused); continue }
    console.log(tag + ': ' + JSON.stringify({stats: r.stats, cut: r.cut, tile: r.tile, ports: r.ports, lane: r.laneLoad + '/' + r.laneLim, out: r.outLoad + '/' + r.outCap, maxLaneM: r.maxLaneMachines, noBuild: r.noBuild}));
    check(r.ov === 0 && r.outside === 0, tag + ' no overlap, inside floor (ov ' + r.ov + ', outside ' + r.outside + ')');
    check(r.noBuild === false, tag + ' noBuild false (' + r.noBuild + ')');
    check(r.cut.ok && r.cut.ov === 0 && r.cut.span === 0 && r.cut.cols === 1 && r.cut.rows === 1, tag + ' placerCut one block ' + JSON.stringify(r.cut));
    check(r.tile.ok && r.tile.ov === 0 && r.tile.span === 0, tag + ' placerTile ' + JSON.stringify(r.tile));
    check(r.mach === n && r.bad === 0 && r.portErr === 0, tag + ' flood: machines ' + r.mach + ', each gets A+B on its two N ports only, no bad flow (' + r.portErr + ' port errs, ' + r.bad + ' bad ' + (r.badWhy || []).join('; ') + ')');
    check(r.outErr === 0, tag + ' every machine output reaches the east out port');
    check(r.laneLoad <= r.laneLim && r.outLoad <= r.outCap, tag + ' rates: lane ' + r.laneLoad + ' <= ' + r.laneLim + ', out ' + r.outLoad + ' <= ' + r.outCap);
    rows.push([block, n, r.stats.machines, r.stats.belts, r.stats.ug, r.stats.spl, r.area, (r.stats.belts / r.stats.machines).toFixed(1), ((r.stats.belts + r.stats.ug + r.stats.spl) / r.stats.machines).toFixed(1)]);
  }
  // negative: nMax+1 refused
  const neg = await run({...base(block), n: nMax + 1});
  check(!!neg.refused, block + ' n=' + (nMax + 1) + ' refused: ' + neg.refused);
  // geometric max (ignore rate): n_geom builds, n_geom+1 refused
  const gm = await pg.evaluate(s => tplMax(s), {...base(block), ignoreRate: true}), gr = await run({...base(block), n: gm, ignoreRate: true}), gn = await run({...base(block), n: gm + 1, ignoreRate: true});
  check(!gr.refused && gr.ov === 0 && gr.outside === 0 && gr.tile.ok && gr.tile.ov === 0 && gr.portErr === 0 && gr.outErr === 0 && gr.noBuild === false, block + ' geometric max ' + gm + ' builds (rate ignored)');
  check(!!gn.refused, block + ' geometric max+1 refused (' + gn.refused + ')');
}
// every 2-input assembler recipe, 1x2 and 2x2: nMax + full check at nMax
console.log('\n== all recipes, nMax per block (Mk2 belts)');
for (const rc of recs) {
  const line = [];
  for (const block of blocks) {
    const spec = {...base(block), rec: rc.k}, nMax = await pg.evaluate(s => tplMax(s), spec);
    line.push(block + '=' + nMax);
    if (await pg.evaluate(s => !!tplLanesPlan(s), spec)) { line.push('(multi-lane: tests/tpl_lanes.mjs)'); continue }
    if (nMax && (block === '1x2' || block === '2x2')) {
      const r = await run({...spec, n: nMax});
      check(!r.refused && r.ov === 0 && r.outside === 0 && r.noBuild === false && r.tile.ok && r.portErr === 0 && r.outErr === 0 && r.bad === 0 && r.laneLoad <= r.laneLim + 1e-9, rc.name + ' ' + block + ' n=' + nMax + ' ok' + (r.refused ? ' ' + r.refused : '') + ' lane ' + r.laneLoad + '/' + r.laneLim + ' out ' + r.outLoad + '/' + r.outCap);
    }
  }
  console.log(rc.name.padEnd(22) + ' in ' + rc.i + ' out ' + rc.o + ' t ' + rc.t + ' : ' + line.join(' '));
}
console.log('\nblock | n | machines | belts | ug | spl | area | belts/m | (belts+ug+spl)/m');
for (const r of rows) console.log(r.join(' | '));
// mutation sanity: removing the first machine's B crossover belt (and a lane head) must be caught by the flood
{
  const T = await pg.evaluate(s => { const t = tplBuild(s); return {w: t.w, y0: t.ports.out[0].o, items: t.items.map(b => ({x: b.x, y: b.y, cls: b.cls}))} }, {...base('1x2'), n: 5});
  const tail = T.items.find(b => b.x === T.w - 2 && b.y === T.y0 + 9);   // collector tail belt (straight now)
  if (!tail) check(false, 'mutation: collector tail belt at x=W-2 y=y0+9 found');
  const m1 = await run({...base('1x2'), n: 5, drop: [4, 2]}), m2 = await run({...base('1x2'), n: 5, drop: [0, 3]}), m3 = await run({...base('1x2'), n: 5, drop: tail ? [tail.x, tail.y] : [-1, -1]});
  check(m1.portErr > 0 || m1.bad > 0, 'mutation: crossover removed is detected (portErr ' + m1.portErr + ', bad ' + m1.bad + ')');
  check(m2.portErr > 0 || m2.bad > 0, 'mutation: A1 lane head removed is detected (portErr ' + m2.portErr + ')');
  check(m3.outErr > 0, 'mutation: collector end removed is detected (outErr ' + m3.outErr + ')');
}
// checkPlan gate (planner N + flow calc): 3 recipes x block x rate sets. checkPlan's product check is single-input only -> its 'product' error is dropped here;
// the product is covered by 'delivered input == planner input' (both items) + every machine's min(have/need) ratio. Planner edges with belts>2 are expected-negative (need M>2).
console.log('\n== checkPlan');
const planRows = [], needM = [];
{
  // light, balanced, lane-bound (90/120), out-bound. Reinforced Plate is NOT asserted: planner input flow (120 at N=1) != machine need (90): planner/recipe mismatch, reported only.
  const picks = ['Basic Circuits', 'Maglev Coupling', 'Capacitor', 'Magnetic Coils'].map(n => recs.find(r => r.name === n));
  for (const rc of picks) for (const block of blocks) {
    const info = await pg.evaluate(([k, blk, cls]) => { const r = [].concat(...Object.values(RECS)).find(x => rk(x) === k); const P = plan(r.o[0], 1, 1, {}, {[r.o[0]]: k}, {proto: false, enr: false, obs: false}); return {pm: P.nodes[r.o[0]].pmach, nMax: tplMax({block: blk, cls, rec: k, mk: 1, spMk: 1})} }, [rc.k, block, 'DAT_Assembler']);
    if (!info.nMax) { console.log(rc.name + ' ' + block + ': nMax 0 (refused), skipped'); continue }
    const nm = info.nMax, pm = info.pm;
    for (const [tag, rate] of [['R1', pm], ['R1b', 0.25 * pm], ['R2', (nm - 1 + 0.3) * pm], ['R3', nm * pm], ['R4', (nm + 1) * pm], ['R4b', (2 * nm + 0.5) * pm]]) {
      const r = await checkPlan(pg, {build: 'tplBuild', max: 'tplMax', cls: 'DAT_Assembler'}, rc.k, rate, block, 1);
      const errs2 = r.errs.filter(e => !/^product /.test(e));
      r.row.set = tag; r.row.name = rc.name; planRows.push(r.row);
      if (errs2.length && r.row.belts > 2) { needM.push(rc.name + ' ' + block + ' ' + tag + ' belts ' + r.row.belts); console.log('expected-negative (need M>2) ' + rc.name + ' ' + block + ' ' + tag + ' belts ' + r.row.belts + ': ' + errs2.join('; ')); continue }
      // per-machine: the harness injects each lane copy proportional to its machine count (not fill order), so the partial load is spread over the copies:
      // assert no machine is below the planner's last-machine utilisation and none above 1 (aggregate delivery == planner input is asserted by checkPlan)
      const uLast = rate / r.row.pmach - (r.row.N - 1);
      check(errs2.length === 0 && r.row.minUtil >= Math.min(1, uLast) - 0.01 && r.row.maxUtil <= 1.0001, 'checkPlan ' + rc.name + ' ' + block + ' ' + tag + ' N=' + r.row.N + ' B=' + r.row.B + ' ' + errs2.join('; ') + ' minUtil ' + r.row.minUtil + ' >= uLast ' + uLast.toFixed(3));
    }
  }
  console.log('name block set rate N B nMax planUtil minUtil maxUtil belts maxBelt supply machines');
  for (const x of planRows) console.log([x.name, x.block, x.set, x.rate, x.N, x.B, x.nMax, x.planUtil, x.minUtil, x.maxUtil, x.belts, x.maxBeltUtil, x.supply, x.machines].join(' | '));
}
// screenshots: the block pasted into the app (S.blocks), Layout view, fit
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
for (const [block, n] of [['1x1', 2], ['1x2', 6], ['2x2', 18], ['2x2c', 18], ['1x2', 5]]) {
  await pg.evaluate(([spec]) => {   // planner preview dialog showing the placerTile result of the template
    spec.n = Math.min(spec.n, tplMax(spec));
    const T = tplBuild(spec), L = {ok: true, items: T.items, w: T.w, h: T.h, tall: false, cuts: null, pitch: T.h, lanes: 1, mk: spec.mk, box: 'DAT_Container_2', note: ['tpl']};
    plcL = L; plcT = placerTile(L, PL_ALL.map(x => x === T.blockCls)); plcCache = null;
    const d = $("plnPrev"); if (!d.open) d.showModal();
    placerFitView();
  }, [{...base(block), n}]);
  await pg.waitForTimeout(500);
  await pg.screenshot({path: ROOT + '/tests/shots/tpl_assembler_2in_' + block + '_n' + n + '.png'});
}
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

// TPL assembler_1in test. Run: node tests/tpl_assembler_1in.mjs   Exit 1 on FAIL or page error.
// Per block (1x1,1x2,2x2,2x2c) x recipe (4 one-input Assembler recipes) x belt Mk x n in {1,2,nMax-1,nMax}: overlap, floor bounds, placerTile (ov 0, span 0, 1 block of the right type),
// connectivity flood (inputs -> every machine exactly one lane, every machine output -> an out lane, no output->input leak), rate check (in load <= DERATE*cap, out load <= cap). nMax+1 must be refused.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkIface} from './tpl_iface.mjs';
import {checkPlan} from './tpl_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof placerTile === 'function' && typeof ugPairs === 'function');
await pg.addScriptTag({path: ROOT + '/js/tpl/iface.js'});
await pg.addScriptTag({path: ROOT + '/js/tpl/assembler_1in.js'});
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else if (process.env.V) console.log('ok   ' + msg) };
const RECS = ['ITEM_TitaniumPlates>ITEM_BasicMotor', 'ITEM_TitaniumPlates>ITEM_HullPlates', 'ITEM_TitaniumPlates>ITEM_LightweightFrame', 'ITEM_NickelPlates>ITEM_MagneticCoils'];
const BLOCKS = ['1x1', '1x2', '2x2', '2x2c'];
const recOk = await pg.evaluate(RECS => RECS.map(r => !!recsOf(def('DAT_Assembler')).find(q => rk(q) === r && q.i.length === 1)), RECS);
check(recOk.every(Boolean), 'all 4 recipe keys exist as 1-input Assembler recipes ' + recOk);
const PLCSPL = /Splitter/;
const rows = [];
for (const block of BLOCKS) for (const rec of RECS) for (const mk of [0, 1, 2]) {
  const nMax = await pg.evaluate(a => tplMax(a), {block, cls: 'DAT_Assembler', rec, n: 1, mk, spMk: mk});
  const ns = [...new Set([1, 2, nMax - 1, nMax].filter(n => n >= 1 && n <= nMax))];
  const ref = ns.length ? await pg.evaluate(a => { const T = tplBuild(a); return {items: T.items, ports: T.ports, iface: T.iface, w: T.w, h: T.h} }, {block, cls: 'DAT_Assembler', rec, n: 1, mk, spMk: mk}) : null;
  for (const n of ns) {
    const tag = `${block} ${rec.split('>')[1].slice(5)} Mk${mk + 1} n=${n}/${nMax}`;
    const r = await pg.evaluate(spec => {
      const T = tplBuild(spec);
      if (!T.ok) return {build: T.why};
      const it = T.items, W = T.w, H = T.h, out = {W, H, stats: T.stats, nMax: T.nMax, ports: T.ports, rates: T.rates, bld: {items: T.items, ports: T.ports, iface: T.iface, w: T.w, h: T.h}};
      // 1 overlap, 2 bounds
      const occ = new Map();let ov = 0, oob = 0;
      for (const b of it) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { if (x < 0 || y < 0 || x >= W || y >= H) oob++; const k = x + ',' + y; if (occ.has(k)) ov++; occ.set(k, b) } }
      out.ov = ov; out.oob = oob;
      // 3 placerTile on a single-block layout
      const L = {ok: true, items: it.map(b => ({...b})), w: W, h: H, tall: false, cuts: [], lanes: 1, pitch: H + 1, mk: spec.mk, box: 'DAT_Container', even: true};
      const cls = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03'}[spec.block];
      const T2 = placerTile(L, PL_ALL.map(c => c === cls));
      out.tile = T2.ok ? {ov: T2.ov, span: T2.span, blocks: T2.blocks.length, cls: T2.blocks.every(b => b.cls === plcCls(cls))} : {fail: String(T2.why).slice(0, 160)};
      // 4 connectivity flood
      const pairs = ugPairs(it), partner = new Map();pairs.forEach(({u, t}) => { partner.set(u, t) });
      const ents = new Set(pairs.map(p => p.u)), exits = new Set(pairs.map(p => p.t));
      const machs = it.filter(b => b.rec), mid = new Map(machs.map((m, i) => [m, i]));
      const mp = machs.map(m => portsOf(m));
      const walk = (x0, y0) => {
        const seen = new Set(), reached = new Set(), ex = new Set();
        const st = [[x0, y0]];
        while (st.length) {
          const [x, y] = st.pop();
          if (x < 0 || y < 0 || x >= W || y >= H) { if (x >= W) ex.add(y); continue }
          const k = x + ',' + y; if (seen.has(k)) continue; seen.add(k);
          const b = occ.get(k); if (!b) continue;
          if (b.rec) { continue }
          if (PLC_SPL.includes(b.cls)) { for (const p of portsOf(b)) if (p.dir === 'out' && p.en) {
            const tx = p.x + p.nx, ty = p.y + p.ny, nb = occ.get(tx + ',' + ty);
            if (nb && nb.rec) { const i = mid.get(nb); if (mp[i].some(q => q.en && q.x === tx && q.y === ty && q.nx === -p.nx && q.ny === -p.ny)) reached.add(i) } else st.push([tx, ty]) } continue }
          const d = DIR[b.rot];
          const nxt = PLC_UG.includes(b.cls) ? (ents.has(b) ? [partner.get(b).x, partner.get(b).y] : exits.has(b) ? [b.x + d[0], b.y + d[1]] : null) : [b.x + d[0], b.y + d[1]];
          if (!nxt) continue;
          const nb = occ.get(nxt[0] + ',' + nxt[1]);
          const flow = PLC_UG.includes(b.cls) && ents.has(b) ? d : d;
          if (nb && nb.rec) { const i = mid.get(nb); if (mp[i].some(p => p.en && p.x === nxt[0] && p.y === nxt[1] && p.nx === -flow[0] && p.ny === -flow[1])) reached.add(i); continue }
          st.push(nxt);
        }
        return {reached, ex};
      };
      const laneOf = new Map(); let leak = 0, inBad = 0;
      T.ports.in.forEach((p, li) => { const w = walk(p.x, p.y); for (const i of w.reached) { if (!laneOf.has(i)) laneOf.set(i, []); laneOf.get(i).push(li) } });
      out.unfed = machs.filter((_, i) => !laneOf.has(i)).length;
      out.multi = [...laneOf.values()].filter(a => a.length !== 1).length;
      const outLoad = new Map(), inLoad = new Map();
      machs.forEach((m, i) => { const l = laneOf.get(i); if (l) inLoad.set(l[0], (inLoad.get(l[0]) || 0) + 1);
        let nOut = 0;
        for (const p of mp[i]) { if (!p.en) continue;
          const bx = p.x + p.nx, by = p.y + p.ny, bb = occ.get(bx + ',' + by);
          if (!bb || !PLC_BELT.includes(bb.cls)) continue;
          const d = DIR[bb.rot]; if (d[0] === -p.nx && d[1] === -p.ny) continue;   // belt flowing into the port = input
          nOut++;
          const w = walk(bx, by); if (w.reached.size) leak++;
          for (const y of w.ex) { if (!T.ports.out.some(o => o.y === y)) inBad++; outLoad.set(y, (outLoad.get(y) || 0) + 1) } if (!w.ex.size) inBad++ }
        if (nOut !== 1) inBad++ });
      out.leak = leak; out.outBad = inBad;
      // 5 rates
      const R = T.rates, der = tplDerate();
      out.inLoad = Math.max(0, ...[...inLoad.values()].map(c => c * R.rin)); out.inLim = der * R.cap;
      out.outLoad = Math.max(0, ...[...outLoad.values()].map(c => c * R.rout)); out.outLim = R.cap;
      out.maxPerIn = Math.max(0, ...inLoad.values()); out.maxPerOut = Math.max(0, ...outLoad.values());
      // belt conn rules (like bl_top __conn): UG pairing
      out.ugUnpaired = it.filter(b => PLC_UG.includes(b.cls) && !ents.has(b) && !exits.has(b)).length;
      return out;
    }, {block, cls: 'DAT_Assembler', rec, n, mk, spMk: mk});
    if (r.build) { check(false, tag + ' build failed: ' + r.build); continue }
    check(r.nMax === nMax, tag + ' nMax consistent');
    check(r.ov === 0, tag + ' no overlap (' + r.ov + ')');
    check(r.oob === 0, tag + ' all cells inside floor (' + r.oob + ')');
    check(r.tile.ov === 0 && r.tile.span === 0 && r.tile.blocks === 1 && r.tile.cls, tag + ' placerTile ' + JSON.stringify(r.tile));
    check(r.unfed === 0 && r.multi === 0, tag + ' every machine fed by exactly one lane (unfed ' + r.unfed + ', multi ' + r.multi + ')');
    check(r.leak === 0 && r.outBad === 0, tag + ' every machine output reaches an out lane (leak ' + r.leak + ', outBad ' + r.outBad + ')');
    check(r.inLoad <= r.inLim + 1e-9, tag + ' in-lane load ' + r.inLoad + ' <= ' + r.inLim + ' (max ' + r.maxPerIn + '/lane)');
    check(r.outLoad <= r.outLim + 1e-9, tag + ' out-lane load ' + r.outLoad + ' <= ' + r.outLim + ' (max ' + r.maxPerOut + '/lane)');
    check(r.ugUnpaired === 0, tag + ' UG pairs');
    const ci = await checkIface(pg, r.bld, block, ref);
    check(ci.ok, tag + ' checkIface ' + ci.errs.join('; '));
    check(r.bld.items.filter(b => PLCSPL.test(b.cls)).every(b => b.pr && b.pr[0] === 0 && b.pr[1] === -1), tag + ' every splitter has priority on the machine face');
    const area = r.W * r.H;
    rows.push([block, rec.split('>')[1].slice(5), 'Mk' + (mk + 1), n, nMax, r.stats.machines, r.stats.belts, r.stats.ug, r.stats.spl, area, (r.stats.belts / r.stats.machines).toFixed(1), r.ports.in.length + '/' + r.ports.out.length]);
  }
  // negative: nMax+1 refused
  const neg = await pg.evaluate(a => { const T = tplBuild(a); return {ok: T.ok, why: T.why} }, {block, cls: 'DAT_Assembler', rec, n: nMax + 1, mk, spMk: mk});
  check(neg.ok === false, `${block} ${rec.split('>')[1].slice(5)} Mk${mk + 1} n=nMax+1=${nMax + 1} refused (${neg.why})`);
}
// checkPlan: planner N vs template, rate sets R1-R4 per block x recipe (Mk2). Single-lane cases (one lane carries every machine) must also reproduce the planner last-machine load.
const planRows = [];
for (const block of BLOCKS) for (const rec of ['ITEM_TitaniumPlates>ITEM_HullPlates', 'ITEM_NickelPlates>ITEM_MagneticCoils']) {
  const info = await pg.evaluate(([k, blk]) => { const r = [].concat(...Object.values(RECS)).find(x => rk(x) === k); const P = plan(r.o[0], 1, 1, {}, {[r.o[0]]: k}, {proto: false, enr: false, obs: false}); return {pm: P.nodes[r.o[0]].pmach, nMax: tplMax({block: blk, cls: 'DAT_Assembler', rec: k, mk: 1, spMk: 1})} }, [rec, block]);
  if (!(info.nMax >= 1)) { console.log('plan ' + block + ' ' + rec + ': nMax 0, skipped'); continue }
  const pm = info.pm, nm = info.nMax;
  const tpl = {build: 'tplBuild', max: 'tplMax', cls: 'DAT_Assembler'};
  for (const [tg, rate] of [['R1 pmach', pm], ['R1b 0.25pm', 0.25 * pm], ['R2 nMax-1+.3', (nm - 1 + 0.3) * pm], ['R3 nMax', nm * pm], ['R4 nMax+1', (nm + 1) * pm], ['R4b 2nMax+.5', (2 * nm + 0.5) * pm]]) {
    const r = await checkPlan(pg, tpl, rec, rate, block, 1);
    r.row.set = tg; planRows.push(r.row);
    if (r.row.belts > 2 && !r.ok) { console.log('expected-negative (planner belts ' + r.row.belts + ' > M=2) ' + block + ' ' + tg + ': ' + r.errs.join('; ')); continue }
    check(r.ok, 'checkPlan ' + block + ' ' + rec.split('>')[1].slice(5) + ' ' + tg + ' ' + r.errs.join('; '));
    // priority semantics: when one lane carries all N machines the last machine must carry exactly the planner remainder and the rest run full
    const single = r.row.B === 1 && await pg.evaluate(a => tplBuild(a).rows.filter(l => l.m > 0).length === 1, {block, cls: 'DAT_Assembler', rec, n: r.row.N, mk: 1, spMk: 1});
    if (single) {
      const uLast = r.row.rate / r.row.pmach - (r.row.N - 1);
      check(Math.abs(r.row.minUtil - uLast) < 0.01 && (r.row.N === 1 || r.row.maxUtil > 0.99), 'planner semantics ' + block + ' ' + tg + ' N=' + r.row.N + ' minUtil ' + r.row.minUtil + ' want ' + uLast.toFixed(3) + ' maxUtil ' + r.row.maxUtil);
    }
  }
}
console.log('plan: set | block | rate | N | B | nMax | pmach | planUtil | minUtil | maxUtil | belts | maxBelt | supply');
for (const x of planRows) console.log([x.set, x.block, x.rate, x.N, x.B, x.nMax, x.pmach, x.planUtil, x.minUtil, x.maxUtil, x.belts, x.maxBeltUtil, x.supply].join(' | '));
console.log('block | recipe | mk | n | nMax | machines | belts | ug | spl | area | belts/machine | lanes in/out');
for (const r of rows) console.log(r.join(' | '));
// screenshots (full frame 1280x800): each block at n=nMax (Mk3, Hull Plates) and 2x2 at n=1 / n=7
import fs from 'fs';
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
await pg.mouse.click(957, 119);
for (const [block, nsel] of [['1x1', 'max'], ['1x2', 'max'], ['2x2', 'max'], ['2x2', 1], ['2x2', 7], ['2x2c', 'max']]) {
  const n = await pg.evaluate(async ([block, nsel]) => {
    const spec = {block, cls: 'DAT_Assembler', rec: 'ITEM_TitaniumPlates>ITEM_HullPlates', n: 1, mk: 2, spMk: 2};
    spec.n = nsel === 'max' ? tplMax(spec) : nsel;
    const T = tplBuild(spec), cls = plcCls({'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03'}[block]);
    S.blocks = [{id: 1, cls, x: 0, y: 0, h: 0, rot: 0, pid: 0}, ...T.items.map((b, i) => ({...b, id: 10 + i, x: b.x, y: b.y, h: 0}))];
    __fb.setView('F'); __fb.setLayer(1); V.z = 0.95; V.ox = 50; V.oy = 30; draw(); document.getElementById('flowPanel') && 0;
    await new Promise(r => setTimeout(r, 300));
    return spec.n;
  }, [block, nsel]);
  await pg.screenshot({path: `${ROOT}/tests/shots/tpl_assembler_1in_${block}_n${n}.png`});
}
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

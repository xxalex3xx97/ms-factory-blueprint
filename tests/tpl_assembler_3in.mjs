// TPL assembler_3in gate (page). Run: node tests/tpl_assembler_3in.mjs   Exit 1 on FAIL.
// Per recipe (6 DAT_Assembler 3-input recipes) x block (1x1,1x2,2x2,2x2c) x n in {1,2,nMax-1,nMax}: overlap 0, inside floor, placerCut ok/ov 0/span 0, connectivity flood
// (lane i reaches exactly its machine port, outputs reach the east edge cell), rate table; nMax+1 must be refused.
// Sim (6): not run (no cheap harness for a bare template); flood only.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerCut === 'function' && typeof pfSplOff === 'function');
await pg.addScriptTag({path: ROOT + '/js/tpl/assembler_3in.js'});
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } };
const res = await pg.evaluate(() => {
  const NAMES = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03'};
  const recs = [];
  plnBy(false).forEach((l, it) => l.forEach(({c, r}) => { if (c === 'CRAFT_Assembler' && r.i.length === 3) recs.push({name: plnNm(it), rec: r.i.map(x => x[0]).join('+') + '>' + r.o[0], r}) }));
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const isB = b => PLC_BELT.includes(b.cls), isU = b => PLC_UG.includes(b.cls), isS = b => PLC_SPL.includes(b.cls);
  const out = [];
  for (const R of recs) for (const blk of Object.keys(NAMES)) {
    for (const MK of [0, 1, 2]) { const SM = MK, nMax = tplMax({block: blk});
    const ns = [...new Set((MK === 1 ? [1, 2, nMax - 1, nMax] : [1, nMax]).filter(n => n >= 1 && n <= nMax))];
    for (const n of ns) {
      const spec = {block: blk, cls: 'DAT_Assembler', rec: R.rec, n, mk: MK, spMk: SM};
      const T = tplBuild(spec), g = {recipe: R.name, blk, n, nMax, ok: T.ok, why: T.why || null, f: []};
      out.push(g);
      if (!T.ok) continue;
      const occ = new Map();
      for (const b of T.items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) g.f.push('overlap ' + k); occ.set(k, b); if (x < 0 || y < 0 || x >= T.w || y >= T.h) g.f.push('outside ' + k) } }
      const fl = floorRect({cls: plcCls(NAMES[blk]), x: 0, y: 0, h: 0, rot: 0});
      g.floor = fl.w + 'x' + fl.h;
      if (fl.w !== T.w || fl.h !== T.h) g.f.push('floor mismatch ' + fl.w + 'x' + fl.h);
      const L = {ok: true, items: T.items.map(b => ({...b})), w: T.w, h: T.h, pitch: 1, lanes: 1, tall: false, cuts: undefined, mk: MK};
      const cut = placerCut(L, plcCls(NAMES[blk]));
      g.cut = cut.ok && !cut.ov && !cut.span; if (!g.cut) g.f.push('placerCut ' + (cut.why || 'ov ' + cut.ov + ' span ' + cut.span));
      // flood
      const mach = T.items.filter(b => b.cls === 'DAT_Assembler');
      const flood = (sx, sy, sd) => {
        const seen = new Set(), reach = [], edge = [], q = [[sx, sy, sd, null]];
        const entry = (x, y, d) => {   // entering cell (x,y) moving d
          const b = occ.get(x + ',' + y);
          if (!b) return;
          const k = x + ',' + y + ',' + d; if (seen.has(k)) return; seen.add(k);
          if (b.cls === 'DAT_Assembler') { const pp = portsOf(b).find(p => p.x === x && p.y === y && p.nx === -DIR[d][0] && p.ny === -DIR[d][1] && p.en && !(b.off || []).includes(p.key)); if (pp) reach.push(mach.indexOf(b) + ':' + pp.key); return }
          if (isB(b)) { if ((b.rot + 2) % 4 === d) return; q.push([x + DIR[b.rot][0], y + DIR[b.rot][1], b.rot]); if (x === T.w - 1 && b.rot === 0) edge.push(x + ',' + y) ; return }
          if (isU(b)) { if (b.rot !== d) return; for (let k2 = 1; k2 <= def(b.cls).maxApart; k2++) { const e = occ.get((x + k2 * DIR[d][0]) + ',' + (y + k2 * DIR[d][1])); if (e && isU(e) && e.rot === d) { q.push([x + (k2 + 1) * DIR[d][0], y + (k2 + 1) * DIR[d][1], d]); return } } return }
          if (isS(b)) { if ((b.rot + 2) % 4 === d) return; for (const p of portsOf({...b, off: b.off || []})) { if (p.dir === 'in' || !p.en) continue; const nd = (p.wf + 3) % 4; q.push([x + DIR[nd][0], y + DIR[nd][1], nd]) } }
        };
        while (q.length) { const [x, y, d] = q.shift(); entry(x, y, d) }
        return {reach, edge};
      };
      const want = [i => 'S5', i => 'N1', i => 'N0'];   // lane 0 east face S5, lane 1 west row r+1 = N1 (y=1), lane 2 west row r+3 = N0
      T.ports.in.forEach(p => {
        const fr = flood(0, p.y, 0), exp = mach.map((_, i) => i + ':' + want[p.item]()).sort(), got = [...fr.reach].sort();
        if (JSON.stringify(exp) !== JSON.stringify(got)) g.f.push('lane ' + p.item + ' reaches ' + got.join(' ') + ' want ' + exp.join(' '));
      });
      // outputs: from each machine S4 out cell (X+5, r+3) heading east must hit the east edge cell
      let outOk = 0;
      for (const m of mach) { const fr = flood(m.x + 5, m.y + 3, 0); if (fr.edge.includes((T.w - 1) + ',' + T.ports.out[0].y)) outOk++ }
      if (outOk !== n) g.f.push('outputs reach edge ' + outOk + '/' + n);
      // rates per machine per min, lane load vs cap and derate
      const cap = [60, 120, 180][MK], rin = R.r.i.map(([, q]) => q * 1800 / R.r.t), rout = R.r.o[1] * 1800 / R.r.t;
      g.rin = rin; g.rout = rout;
      g.load = rin.map(r => r * n); g.loadOut = rout * n;
      g.derateMax = tplGroup({mk: MK, rates: rin}); g.mk = MK;
      g.overCap = g.load.some(l => l > cap) || g.loadOut > cap;
      g.overDerate = g.load.some(l => l > 0.5 * cap);
      g.cnt = T.stats; g.area = T.w * T.h; g.bpm = +(T.stats.belts / n).toFixed(1);
    }
    const over = tplBuild({block: blk, cls: 'DAT_Assembler', rec: R.rec, n: nMax + 1, mk: MK, spMk: SM});
    out.push({recipe: R.name, blk, n: nMax + 1, neg: true, refused: !over.ok, f: []});
    }
  }
  return out;
});
const tab = [];
for (const g of res) {
  if (g.neg) { check(g.refused, `${g.recipe} ${g.blk} n=${g.n} (nMax+1) must be refused`); continue }
  check(g.ok, `${g.recipe} ${g.blk} n=${g.n} built (${g.why})`);
  if (!g.ok) continue;
  g.f.forEach(f => check(false, `${g.recipe} ${g.blk} n=${g.n}: ${f}`));
  if (g.recipe === res[0].recipe && g.mk === 1) tab.push([g.blk, g.n, g.nMax, g.cnt.machines, g.cnt.belts, g.cnt.ug, g.cnt.spl, g.area, g.bpm, g.cut ? 'cut ok' : 'cut BAD'].join(' | '));
}
console.log('block | n | nMax | machines | belts | ug | spl | area | belts/machine | placerCut');
tab.forEach(t => console.log(t));
console.log('\nrate (Mk2 lanes, cap 120, derate 60): recipe | per-machine in/min | out | derate-max machines per lane group | n at which a lane exceeds derate / cap');
const seen = new Set();   // per recipe+Mk: g = max machines per lane at derate (0 = one machine already over derate)
for (const g of res) { if (g.neg || !g.ok || seen.has(g.recipe + g.mk)) continue; seen.add(g.recipe + g.mk); const all = res.filter(x => x.recipe === g.recipe && x.mk === g.mk && x.blk === '2x2' && x.ok), mx = all[all.length - 1]; console.log(`Mk${g.mk + 1} ${g.recipe} | ${g.rin.join('/')} | ${g.rout} | g=${g.derateMax} | nMax(2x2)=${mx.n}: loads ${mx.load.join('/')} out ${mx.loadOut} overDerate=${mx.overDerate} overCap=${mx.overCap}`); }
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

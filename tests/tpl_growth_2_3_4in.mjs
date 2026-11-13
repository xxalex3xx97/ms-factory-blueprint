// TPL growth_2_3_4in gates (page). Run: node tests/tpl_growth_2_3_4in.mjs   Exit 1 on FAIL or page error.
// DAT_GrowthChamber template, k=2 (Xenobacteria growth, Xenoeukarya, Xenoarchaea), k=3 (Enzyme, Nutrients, Biolattice), k=4 (Alpha Protein, Beta Protein), blocks 1x1 1x2 2x2 2x2c, n in {1,2,nMax-1,nMax}, nMax+1 negative.
// Per build: no overlap, inside floor, placerCut ok/ov 0/span 0/one block, connectivity flood (lanes -> machine ports, one item per port, no lane merge, outputs reach the east edge), rates, pasteability (same n, other block = same lane rows).
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof placerCut === 'function' && typeof pfSplOff === 'function');
await pg.addScriptTag({content: fs.readFileSync(path.join(ROOT, 'js/tpl/growth_2_3_4in.js'), 'utf8').replace(/^const (TPLG_\w+)=/gm, 'var $1=')});
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const RECS = {2: ['Xenobacteria', 'Xenoeukarya', 'Xenoarchaea'], 3: ['Enzyme', 'Nutrients', 'Biolattice'], 4: ['Alpha Protein', 'Beta Protein']};
const BLOCKS = ['1x1', '1x2', '2x2', '2x2c'];
const PLCLS = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03'};
const table = [];
for (const k of [2, 3, 4]) for (const name of RECS[k]) for (const block of BLOCKS) for (const mk of [0, 1]) {
  const res = await pg.evaluate(([k, name, block, mk, PLCLS]) => {
    let rec = null, item = null;
    plnBy(false).forEach((l, it) => l.forEach(({c, r}) => { if (/Growth/.test(c) && plnNm(it) === name) { rec = r; item = it } }));
    if (!rec) return {missing: true};
    const key = rec.i.map(x => x[0]).join('+') + '>' + rec.o[0];
    const spec = {block, cls: 'DAT_GrowthChamber', rec: key, recObj: rec, mk, spMk: mk, n: 1};
    const nMax = tplMax(spec);
    const out = {k, name, block, mk, nMax, growth: rec.i.some(([x]) => x === rec.o[0]), runs: []};
    const ns = [...new Set([1, 2, nMax - 1, nMax].filter(n => n >= 1 && n <= nMax))];
    const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const cls = plcCls(PLCLS[block]), F = floorRect({cls, x: 0, y: 0, h: 0, rot: 0});
    const isB = b => PLC_BELT.includes(b.cls), isS = b => PLC_SPL.includes(b.cls), isU = b => PLC_UG.includes(b.cls);
    for (const n of ns) {
      const T = tplBuild({...spec, n});
      const g = {n, ok: T.ok, why: T.why, errs: []};
      out.runs.push(g);
      if (!T.ok) continue;
      const occ = new Map(); let ov = 0;
      for (const b of T.items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const q = x + ',' + y; if (occ.has(q)) ov++; else occ.set(q, b) } }
      g.ov = ov;
      g.outside = T.items.filter(b => { const d = dim(b); return b.x < 0 || b.y < 0 || b.x + d.w > F.w || b.y + d.h > F.h }).length;
      g.machines = T.items.filter(b => b.rec).length;
      g.stats = T.stats; g.W = F.w; g.H = F.h;
      // placerCut on a wrapped layout (single block expected)
      const w = Math.max(...T.items.map(b => b.x + dim(b).w)), h = Math.max(...T.items.map(b => b.y + dim(b).h));
      const L = {ok: true, items: T.items.map(b => ({...b})), w, h, tall: true, pitch: 1, lanes: 1, cuts: [], mk, box: 'DAT_Container_2'};
      const C = placerCut(L, cls);
      g.cut = {ok: C.ok, ov: C.ov, span: C.span, blocks: C.blocks ? C.blocks.length : null, why: C.why || null};
      // flood
      const ugList = ugPairs(T.items.filter(b => isU(b))), ugPartner = new Map();
      ugList.forEach(p => ugPartner.set(p.u, p));
      const ugExit = new Set(ugList.map(p => p.t));
      const flow = (sx, sy, tag, lane) => {   // walk belts; returns {cells:Set, deliv:[{m,p}], reached:Set of ends}
        const seen = new Set(), deliv = [], q = [[sx, sy]];
        const first = occ.get(sx + ',' + sy);
        if (!first) return {seen, deliv, miss: true};
        seen.add(sx + ',' + sy);
        const push = (fx, fy, tx, ty) => {
          const dx = tx - fx, dy = ty - fy, t = occ.get(tx + ',' + ty);
          if (!t) return;
          if (t.rec) {   // machine: accept only through an enabled port cell facing us
            for (const p of portsOf(t)) if (p.en && p.x === tx && p.y === ty && p.x + p.nx === fx && p.y + p.ny === fy) deliv.push({m: t, p: p.key});
            return;
          }
          const k2 = tx + ',' + ty;
          if (isB(t)) { const [bx, by] = DIR[t.rot]; if (bx === -dx && by === -dy) return }
          else if (isS(t)) { const [bx, by] = DIR[t.rot]; if (bx !== dx || by !== dy) return }
          else if (isU(t)) { if (ugExit.has(t)) return; const [bx, by] = DIR[t.rot]; if (bx !== dx || by !== dy) return }
          else return;
          if (!seen.has(k2)) { seen.add(k2); q.push([tx, ty]) }
        };
        while (q.length) {
          const [x, y] = q.pop(), b = occ.get(x + ',' + y);
          if (isB(b)) { const [dx, dy] = DIR[b.rot]; push(x, y, x + dx, y + dy) }
          else if (isS(b)) { for (const p of portsOf(b)) if (p.en && p.dir !== 'in') push(x, y, p.x + p.nx, p.y + p.ny) }
          else if (isU(b)) {
            const pr = ugPartner.get(b);
            if (pr) { const [dx, dy] = DIR[b.rot], t = pr.t, k2 = t.x + ',' + t.y; if (!seen.has(k2)) { seen.add(k2); q.push([t.x, t.y]) } }
            else { const [dx, dy] = DIR[b.rot]; push(x, y, x + dx, y + dy) }   // exit cell: continue forward
          }
        }
        return {seen, deliv};
      };
      const lanes = T.ports.in.map((p, i) => ({i, ...flow(0, p.y)}));
      if (lanes.some(l => l.miss)) g.errs.push('lane entry cell empty');
      const laneOf = new Map();
      lanes.forEach(l => l.seen && l.seen.forEach(c => { if (laneOf.has(c)) g.errs.push('lanes merge at ' + c); laneOf.set(c, l.i) }));
      // each machine: classify ports
      let outNotEast = 0, portBad = 0, miss = 0;
      const outFlows = [];
      for (const m of T.items.filter(b => b.rec)) {
        const got = {}, outs = [];
        for (const p of portsOf(m)) {
          if (!p.en) continue;
          const cx = p.x + p.nx, cy = p.y + p.ny, c = occ.get(cx + ',' + cy);
          if (!c) { g.errs.push('enabled port ' + p.key + ' has no cell'); continue }
          let inward = false;
          if (isB(c) || isU(c)) { const [dx, dy] = DIR[c.rot]; inward = dx === -p.nx && dy === -p.ny }
          else if (isS(c)) inward = portsOf(c).some(q => q.en && q.dir !== 'in' && q.x + q.nx === p.x && q.y + q.ny === p.y);
          if (inward) got[p.key] = lanes.filter(l => l.deliv && l.deliv.some(d => d.m === m && d.p === p.key)).map(l => l.i);
          else outs.push([cx, cy]);
        }
        const used = Object.values(got);
        if (used.length !== k) g.errs.push('machine@' + m.x + ',' + m.y + ' input ports ' + used.length + ' != k');
        if (used.some(a => a.length !== 1)) g.errs.push('machine@' + m.x + ',' + m.y + ' port without exactly one lane ' + JSON.stringify(got));
        if (new Set(used.map(a => a[0])).size !== k) g.errs.push('machine@' + m.x + ',' + m.y + ' lanes not all different ' + JSON.stringify(got));
        if (outs.length !== 1) g.errs.push('machine@' + m.x + ',' + m.y + ' output ports ' + outs.length);
        else outFlows.push(flow(outs[0][0], outs[0][1]));
      }
      const E = T.ports.out[0], endKey = (F.w - 1) + ',' + E.y, eb = occ.get(endKey);
      g.outEnd = !!eb && isB(eb) && eb.rot === 0;
      let outBad = 0; const outCells = new Set();
      outFlows.forEach(f => { f.seen.forEach(c => outCells.add(c)); if (!f.seen.has(endKey)) outBad++ });
      g.outReach = outFlows.length - outBad + '/' + outFlows.length;
      lanes.forEach(l => l.seen && l.seen.forEach(c => { if (outCells.has(c)) g.errs.push('lane cell ' + c + ' is also in the output flow') }));
      if (!g.outEnd) g.errs.push('no rot-0 belt at east out port ' + endKey);
      if (outBad) g.errs.push(outBad + ' machine outputs do not reach the east edge');
      // the lane entry cells are rot-0 belts at x=0
      T.ports.in.forEach(p => { const b = occ.get('0,' + p.y); if (!b || !isB(b) || b.rot !== 0) g.errs.push('in port y=' + p.y + ' is not a rot-0 belt at x=0') });
      // rates
      g.rates = T.rates; g.ports = T.ports;
      g.area = F.w * F.h; g.bpm = +((T.stats.belts + T.stats.ug + T.stats.spl) / n).toFixed(1);
    }
    // negative: nMax+1 refused and, forced, does not fit
    const neg = tplBuild({...spec, n: nMax + 1});
    const F2 = tplBuild({...spec, n: nMax + 1, _force: true});
    let outside = 0;
    if (F2.ok) outside = F2.items.filter(b => { const d = dim(b); return b.x < 0 || b.y < 0 || b.x + d.w > F.w || b.y + d.h > F.h }).length;
    out.neg = {refused: !neg.ok, why: neg.why, forcedOutside: outside};
    return out;
  }, [k, name, block, mk, PLCLS]);
  if (res.missing) { check(false, name + ' recipe not found'); continue }
  const tag = `k=${k} ${name}${res.growth ? ' (growth)' : ''} ${block} mk${mk}`;
  if (!res.nMax) { console.log('INFO ' + tag + ': does not build (nMax 0)'); table.push([k, name, block, mk, 0]); continue }
  for (const g of res.runs) {
    const t2 = tag + ' n=' + g.n;
    if (!g.ok) { if (/exceeds the belt Mk/.test(g.why)) { console.log('INFO ' + t2 + ' refused: ' + g.why); continue } check(false, t2 + ' build refused: ' + g.why); continue }
    const errs2 = g.errs.slice(0, 3).join('; ');
    check(g.ov === 0 && g.outside === 0 && g.machines === g.n, t2 + ` overlap ${g.ov} outside ${g.outside} machines ${g.machines}/${g.n}`);
    check(g.cut.ok && g.cut.ov === 0 && g.cut.span === 0 && g.cut.blocks === 1, t2 + ' placerCut ' + JSON.stringify(g.cut));
    check(g.errs.length === 0, t2 + ' flood (' + (errs2 || 'all lanes reach all machines, one item per port, outputs ' + g.outReach) + ')');
    const R = g.rates;
    check(!R.derateOk || R.capOk, t2 + ` lane loads ${R.load.map(x => x.toFixed(0)).join('/')} out ${R.outLoad.toFixed(0)} cap ${R.cap} (derate g=${R.g}${R.derateOk ? ' ok' : ', n>g: one lane group cannot feed all, see WARN'})`);
    if (!R.derateOk) console.log('WARN ' + t2 + ` n=${g.n} > g=${R.g}: lane over the ${R.cap * 0.5} derate (rates in/out ${R.in.map(x => x.toFixed(0))}/${R.out.toFixed(0)})`);
    table.push([k, name, block, mk, g.n, g.stats.machines, g.stats.belts, g.stats.ug, g.stats.spl, g.area, g.bpm, 'g=' + R.g, 'in y=' + g.ports.in.map(p => p.y).join(','), 'out y=' + g.ports.out[0].y]);
  }
  check(res.neg.refused && res.neg.forcedOutside > 0, `${tag} nMax=${res.nMax}: n=${res.nMax + 1} refused (${res.neg.why}) and forced build leaves the floor (${res.neg.forcedOutside} items)`);
}
// screenshots (own canvas render: floor outline, belts with direction ticks, splitters orange, UG purple, machines blue)
fs.mkdirSync(path.join(ROOT, 'tests/shots'), {recursive: true});
const shots = [['Xenobacteria', '1x1', 'max'], ['Xenobacteria', '1x2', 'max'], ['Xenobacteria', '2x2', 'max'], ['Xenobacteria', '1x2', 1], ['Enzyme', '1x1', 'max'], ['Enzyme', '1x2', 'max'], ['Enzyme', '2x2', 1], ['Alpha Protein', '1x1', 'max'], ['Alpha Protein', '1x2', 'max'], ['Alpha Protein', '2x2', 1]];
for (const [name, block, nn] of shots) {
  const r = await pg.evaluate(([name, block, nn]) => {
    let rec = null;
    plnBy(false).forEach((l, it) => l.forEach(({c, r}) => { if (/Growth/.test(c) && plnNm(it) === name) rec = r }));
    const spec = {block, cls: 'DAT_GrowthChamber', rec: rec.i.map(x => x[0]).join('+') + '>' + rec.o[0], recObj: rec, mk: 2, spMk: 2, n: 1};
    const n = nn === 'max' ? tplMax(spec) : nn, T = tplBuild({...spec, n}), S = 14, W = T.w, H = T.h;
    const c = document.createElement('canvas'); c.width = W * S + 2; c.height = H * S + 2;
    const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#222'; g.fillRect(1, 1, W * S, H * S);
    g.strokeStyle = '#2a2a2a'; for (let x = 0; x <= W; x++) { g.beginPath(); g.moveTo(1 + x * S, 1); g.lineTo(1 + x * S, 1 + H * S); g.stroke() } for (let y = 0; y <= H; y++) { g.beginPath(); g.moveTo(1, 1 + y * S); g.lineTo(1 + W * S, 1 + y * S); g.stroke() }
    const tick = (b, col) => { const x = 1 + b.x * S + S / 2, y = 1 + b.y * S + S / 2, d = [[1, 0], [0, 1], [-1, 0], [0, -1]][b.rot]; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x - d[0] * 4, y - d[1] * 4); g.lineTo(x + d[0] * 4, y + d[1] * 4); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(x + d[0] * 4, y + d[1] * 4, 2.5, 0, 7); g.fill() };
    for (const b of T.items) {
      const e = dim(b);
      if (b.rec) { g.fillStyle = '#2a5d9a'; g.fillRect(1 + b.x * S + 1, 1 + b.y * S + 1, e.w * S - 2, e.h * S - 2); g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText('GC', 1 + b.x * S + 4, 1 + b.y * S + 14); for (const p of portsOf(b)) if (p.en) { g.fillStyle = '#7fd'; g.fillRect(1 + p.x * S + 4 + p.nx * 5, 1 + p.y * S + 4 + p.ny * 5, 6, 6) } }
      else if (PLC_SPL.includes(b.cls)) { g.fillStyle = '#e8923a'; g.fillRect(1 + b.x * S + 1, 1 + b.y * S + 1, S - 2, S - 2); tick(b, '#000') }
      else if (PLC_UG.includes(b.cls)) { g.fillStyle = '#9a5de8'; g.fillRect(1 + b.x * S + 1, 1 + b.y * S + 1, S - 2, S - 2); tick(b, '#fff') }
      else { g.fillStyle = '#888'; g.fillRect(1 + b.x * S + 1, 1 + b.y * S + 1, S - 2, S - 2); tick(b, '#fff') }
    }
    g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText(name + ' ' + block + ' n=' + n, 4, H * S - 4);
    return {url: c.toDataURL('image/png'), n, k: rec.i.length};
  }, [name, block, nn]);
  const f = `tests/shots/tpl_growth_2_3_4in_${block}_k${r.k}_${name.replace(/ /g, '')}_n${r.n}.png`;
  fs.writeFileSync(path.join(ROOT, f), Buffer.from(r.url.split(',')[1], 'base64'));
  console.log('shot ' + f);
}
// pasteability: lane rows identical for every n and block (per k)
const same = await pg.evaluate(() => {
  const o = {};
  for (const k of [2, 3, 4]) {
    const key = {2: 'ITEM_A+ITEM_B>ITEM_X', 3: 'ITEM_A+ITEM_B+ITEM_C>ITEM_X', 4: 'ITEM_A+ITEM_B+ITEM_C+ITEM_D>ITEM_X'}[k], set = new Set();
    for (const b of ['1x1', '1x2', '2x2', '2x2c']) for (let n = 1; n <= tplMax({block: b, rec: key}); n++) { const T = tplBuild({block: b, rec: key, n, mk: 1, spMk: 1}); set.add(JSON.stringify(T.ports)) }
    o[k] = set.size;
  }
  return o;
});
for (const k of [2, 3, 4]) check(same[k] === 1, `k=${k} ports (lane rows + out row) identical for every n and every block (${same[k]} variant)`);
console.log('\nk | recipe | block | mk | n | machines | belts | ug | spl | floor area | (belts+ug+spl)/machine | lane g | in rows | out row');
for (const r of table) console.log(r.join(' | '));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

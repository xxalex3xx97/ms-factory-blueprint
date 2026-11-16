// TPL advassembler_4in gates (page). Run: node tests/tpl_advassembler_4in.mjs   Exit 1 on FAIL or page error.
// DAT_AdvancedAssembler 4-input templates (js/tpl/advassembler_4in.js) per block 1x1/1x2/2x2/2x2c: n in {1,2,nMax-1,nMax}: overlap, inside floor, placerCut ok/ov/span, connectivity flood (lanes -> machine ports, machine out -> east port), rate check, nMax+1 refused.
// No sim harness is called (sim needs a full layout with containers; template has none): skipped.
import {createRequire} from 'module';
import path from 'path';
import fs from 'fs';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkIface, checkChain} from './tpl_iface.mjs';
import {checkPlan} from './tpl_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof placerCut === 'function' && typeof pfSplOff === 'function');
await pg.waitForFunction(() => typeof plan === 'function' && typeof links1 === 'function' && typeof supplyRows === 'function');
await pg.addScriptTag({path: ROOT + '/js/tpl/advassembler_4in.js'});
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
const RECS = {
  ac: 'ITEM_DetectorArray+ITEM_BasicCircuit+ITEM_Superalloy+ITEM_Coolant>ITEM_AdvancedCircuits',
  chitin: 'ITEM_Biolattice+ITEM_Graphene+ITEM_ReinforcedGlass+ITEM_Enzyme>ITEM_ChitinComposite',
  plates: 'ITEM_ChromaticAlloy+ITEM_ChitinComposite+ITEM_ReinforcedPlates+ITEM_Multisensor>ITEM_AdvancedPlates',
  multi: 'ITEM_ChromaticAlloy+ITEM_Lonsdaleite+ITEM_EncodedSimulationMatrix+ITEM_SuperconductorCoil>ITEM_Multisensor'};
// in-page analysis of one build
const analyse = (spec) => pg.evaluate((spec) => {
  const T = tplBuild(spec);
  if (!T.ok) return {refused: T.why};
  if (spec.mut === 'dropUG') T.items.splice(T.items.findIndex(b => PLC_UG.includes(b.cls)), 1);
  if (spec.mut === 'dropSpl') T.items.splice(T.items.findIndex(b => PLC_SPL.includes(b.cls)), 1);
  const G = tplAAGeo(spec), Fw = T.w, Fh = T.h;
  const out = {n: spec.n, nMax: T.nMax, geomMax: T.geomMax, g: T.g, stats: T.stats, w: Fw, h: Fh, errs: []};
  const occ = new Map(); let ov = 0, outside = 0;
  for (const b of T.items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { if (x < 0 || y < 0 || x >= Fw || y >= Fh) outside++; const k = x + ',' + y; if (occ.has(k)) ov++; else occ.set(k, b) } }
  out.ov = ov; out.outside = outside;
  const isB = b => PLC_BELT.includes(b.cls), isS = b => PLC_SPL.includes(b.cls), isU = b => PLC_UG.includes(b.cls), isM = b => b.cls === 'DAT_AdvancedAssembler';
  out.machines = T.items.filter(isM).length;
  // placerCut (single block floor)
  const blk = plcCls({'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03'}[spec.block]);
  const cut = placerCut({ok: true, items: T.items.map(b => ({...b})), w: Fw, h: Fh, tall: true, pitch: 1, lanes: 1, mk: spec.mk, cuts: null}, blk);
  out.cut = {ok: cut.ok, ov: cut.ov, span: cut.span, why: cut.why || null};
  // connectivity flood
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], mxA = def(PLC_UG[spec.mk]).maxApart;
  const flood = (sx, sy) => {   // returns {arr:Set 'midx|key', cells:Set}
    const arr = new Set(), seen = new Set(), q = [[sx, sy, 0]]; const cells = new Set();
    while (q.length) {
      const [x, y, j] = q.pop(), k = x + ',' + y + ',' + j; if (seen.has(k)) continue; seen.add(k);
      const b = occ.get(x + ',' + y); if (!b) continue; cells.add(x + ',' + y);
      let nexts = [];
      if (isB(b)) nexts = [[x + DIR[b.rot][0], y + DIR[b.rot][1]]];
      else if (isS(b)) nexts = portsOf(b).filter(p => p.dir !== 'in' && p.en).map(p => [p.x + p.nx, p.y + p.ny]);
      else if (isU(b)) {
        if (j) nexts = [[x + DIR[b.rot][0], y + DIR[b.rot][1]]];
        else { let kk = 1; while (kk < mxA) { const c = occ.get((x + DIR[b.rot][0] * kk) + ',' + (y + DIR[b.rot][1] * kk)); if (c && isU(c)) break; kk++ }
          if (kk >= mxA) continue; q.push([x + DIR[b.rot][0] * kk, y + DIR[b.rot][1] * kk, 1]); continue }
      } else continue;
      for (const [nx, ny] of nexts) {
        const t = occ.get(nx + ',' + ny); if (!t) continue;
        if (isM(t)) { const p = portsOf(t).find(p => p.en && p.x + p.nx === x && p.y + p.ny === y && p.x === nx && p.y === ny); if (p) arr.add(t.x + '_' + t.y + '|' + p.key); continue }
        if (isB(t)) { const d = DIR[t.rot]; if (nx + d[0] === x && ny + d[1] === y) continue }   // head on
        q.push([nx, ny, 0]);
      }
    }
    return {arr, cells};
  };
  // inputs: each lane port cell x=0 at ports.in[*].y
  const got = new Map();   // 'midx|port' -> Set(items)
  const outCell = new Set(T.ports.out.map(o => (Fw - 1) + ',' + o.y));
  for (const p of T.ports.in) {
    const f = flood(0, p.y);
    for (const a of f.arr) { if (!got.has(a)) got.set(a, new Set()); got.get(a).add(p.item) }
    for (const c of f.cells) if (outCell.has(c)) out.errs.push('lane ' + p.item + ' reaches out');
  }
  const wantKeys = ['N0', 'N1', 'N2', 'S6'];
  const ms = T.items.filter(isM); let inBad = 0;
  for (const m of ms) {
    const its = [];
    for (const k of wantKeys) { const s = got.get(m.x + '_' + m.y + '|' + k); if (!s || s.size !== 1) inBad++; else its.push([...s][0]) }
    if (new Set(its).size !== 4) inBad++;
    for (const [a] of got) if (a.startsWith(m.x + '_' + m.y + '|') && !wantKeys.includes(a.split('|')[1])) inBad++;
  }
  out.inBad = inBad;
  // outputs: from the S8 port cell of each machine
  let outBad = 0;
  for (const m of ms) {
    const pp = portsOf(m).find(p => p.key === 'S8'), cx = pp.x + pp.nx, cy = pp.y + pp.ny, c0 = occ.get(cx + ',' + cy);
    if (!c0 || !isB(c0) || c0.rot !== 1) { outBad++; continue }
    const f = flood(cx, cy); if (![...f.cells].some(c => outCell.has(c))) outBad++; if (f.arr.size) outBad++;
  }
  out.outBad = outBad;
  // edge rule (first/last row and column of the floor: only plain belts, no splitter/UG/machine)
  out.edge = T.items.filter(b => { const d = dim(b); return (b.x === 0 || b.y === 0 || b.x + d.w === Fw || b.y + d.h === Fh) && !isB(b) }).length;
  out.edgeSpl = T.items.filter(b => (isS(b) || isU(b)) && (b.x === 0 || b.y === 0 || b.x === Fw - 1 || b.y === Fh - 1)).length;
  // rate: per band lane group load vs der*cap, output load vs cap
  const c = Math.min(T.per, T.g > 0 ? T.g : T.per), c0 = spec.noRate ? T.per : c, rates = T.rates;
  const grp = Math.min(spec.n, c0), der = tplDerate(), cap = [60, 120, 180][spec.mk];
  out.laneLoad = Math.max(...rates) * grp; out.laneLim = der * cap; out.outLoad = spec.n * T.orate; out.outCap = cap;
  out.rateOk = out.laneLoad <= out.laneLim + 1e-9 && out.outLoad <= out.outCap;
  out.ports = T.ports;
  // picture
  const cv = document.createElement('canvas'), S = 20; cv.width = Fw * S; cv.height = Fh * S; const cx2 = cv.getContext('2d');
  cx2.fillStyle = '#111'; cx2.fillRect(0, 0, cv.width, cv.height);
  for (const b of T.items) { const d = dim(b); cx2.fillStyle = isM(b) ? '#3a5' : isS(b) ? '#e80' : isU(b) ? '#a5f' : '#58f'; cx2.fillRect(b.x * S + 1, b.y * S + 1, d.w * S - 2, d.h * S - 2);
    if (!isM(b)) { cx2.fillStyle = '#fff'; cx2.font = '12px sans-serif'; cx2.fillText(isS(b) ? 'Y' : isU(b) ? 'U' : ['>', 'v', '<', '^'][b.rot], b.x * S + 6, b.y * S + 15) } else { cx2.fillStyle = '#fff'; cx2.fillText('AA', b.x * S + 4 * S, b.y * S + 4.5 * S) } }
  out.png = cv.toDataURL('image/png');
  return out;
}, spec);

const rows = [], chain = [];
const run = async (tag, spec, shotAt) => {
  const r = await analyse(spec);
  if (r.refused) { check(false, `${tag} refused (${r.refused})`); return r }
  const pre = `${tag} n=${spec.n}`;
  check(r.ov === 0, `${pre} no overlap (${r.ov})`);
  check(r.outside === 0, `${pre} all cells inside floor ${r.w}x${r.h} (${r.outside} outside)`);
  check(r.machines === spec.n, `${pre} machines == n (${r.machines})`);
  check(r.cut.ok && !r.cut.ov && !r.cut.span, `${pre} placerCut ok ov ${r.cut.ov} span ${r.cut.span} ${r.cut.why || ''}`);
  check(r.inBad === 0, `${pre} each machine: N0,N1,N2,S6 get 4 distinct lanes, only those (bad ${r.inBad})`);
  check(r.outBad === 0 && !r.errs.length, `${pre} each machine out S8 reaches east port, no lane leak (bad ${r.outBad} ${r.errs.join(';')})`);
  check(r.rateOk, `${pre} lane load ${r.laneLoad}/${r.laneLim} per min, out ${r.outLoad}/${r.outCap}`);
  const bl = await pg.evaluate(s => tplBuild(s), spec), ref = await pg.evaluate(s => tplBuild({...s, n: 1}), spec);
  const ci = await checkIface(pg, bl, spec.block, ref);
  check(ci.ok, `${pre} Edge Interface v1 ${ci.errs.join('; ')}`);
  chain.push([bl, spec.block]);
  if (r.edgeSpl) console.log(`WARN ${pre} ${r.edgeSpl} splitter/UG on a floor edge row/col (row-stack cut rule)`);
  rows.push({tag, n: spec.n, m: r.stats.machines, belts: r.stats.belts, ug: r.stats.ug, spl: r.stats.spl, area: r.w * r.h, bpm: (r.stats.belts + r.stats.ug + r.stats.spl) / r.stats.machines});
  if (shotAt) fs.writeFileSync(ROOT + '/tests/shots/tpl_advassembler_4in_' + shotAt + '.png', Buffer.from(r.png.split(',')[1], 'base64'));
  return r;
};
const mkSpec = (block, rec, mk, n, extra = {}) => ({block, cls: 'DAT_AdvancedAssembler', rec: RECS[rec], n, mk, spMk: mk, ...extra});
const nm = async (spec) => pg.evaluate(s => ({max: tplMax(s), geom: tplAAGeo(s).geom}), spec);

for (const block of ['1x1', '1x2', '2x2', '2x2c']) {
  // geometry max (noRate) with AC on Mk3, then rate-limited matrices
  for (const [recK, mk, extra] of [['ac', 2, {noRate: true}], ['ac', 2, {}], ['chitin', 2, {}], ['plates', 1, {}], ['multi', 2, {}], ['ac', 0, {}]]) {
    const base = mkSpec(block, recK, mk, 1, extra), {max} = await nm(base), tag = `${block} ${recK} Mk${mk + 1}${extra.noRate ? ' geom' : ''}`;
    console.log(`-- ${tag}: nMax ${max}`);
    if (!max) { const r = await analyse(base); check(!!r.refused, `${tag} nMax 0 refused (${r.refused})`); continue }
    const ns = [...new Set([1, 2, max - 1, max].filter(n => n >= 1 && n <= max))];
    for (const n of ns) await run(tag, {...base, n}, extra.noRate && n === max ? `${block}_n${n}` : (recK === 'ac' && !extra.noRate && n === 1 ? `${block}_n1` : null));
    const neg = await analyse({...base, n: max + 1});
    check(!!neg.refused, `${tag} n=${max + 1} refused (${neg.refused})`);
  }
}
// chain: block next to itself (same S, same height)
let nch = 0;
for (const [bl, blk] of chain) { const c = checkChain(bl, bl); nch++; if (!c.ok) check(false, 'chain ' + blk + ' ' + c.errs.join(';')) }
check(nch > 0, 'chain self-adjacency checked for ' + nch + ' builds');
// spec.main relabel + S variants
{
  const bld = s => pg.evaluate(x => tplBuild(x), s);
  const b = await bld(mkSpec('2x2', 'ac', 2, 2, {main: 2}));
  check(b.ok && (await checkIface(pg, b, '2x2')).ok && b.ports.in.filter(p => p.copy === 0 && p.y === b.iface.sets[0].o)[0].item === 2, '2x2 main=2 relabels main row item');
  const b1 = await bld(mkSpec('2x2', 'ac', 2, 2, {S: 1}));
  check(b1.ok && (await checkIface(pg, b1, '2x2')).ok, '2x2 S=1 conforms');
  const b3 = await bld(mkSpec('2x2', 'ac', 2, 2, {S: 3}));
  check(!b3.ok, '2x2 S=3 refused (' + b3.why + ')');
  const b2 = await bld(mkSpec('2x2c', 'ac', 2, 1, {S: 2}));
  check(!b2.ok, '2x2c S=2 refused (' + b2.why + ')');
}
// checkPlan vs planner: rate sets R1 (pmach) R1b R2 (nMax-1+0.3) R3 nMax R4 nMax+1 per block and recipe. Planner e.belts>1 = expected negative (M=1, report only).
// checkPlan's single-input product check does not apply to 4-input recipes: dropped here; instead last machine load == planner tail, rest full.
const tplD = {build: 'tplBuild', max: 'tplMax', cls: 'DAT_AdvancedAssembler'};
const prow = [];
for (const block of ['1x1', '1x2', '2x2', '2x2c']) for (const [recK, mk] of [['ac', 1], ['plates', 1], ['chitin', 2]]) {
  const info = await pg.evaluate(([k, blk, mk]) => { const r = [].concat(...Object.values(RECS)).find(x => rk(x) === k); const P = plan(r.o[0], 1, mk, {}, {[r.o[0]]: k}, {proto: false, enr: false, obs: false}); return {pm: P.nodes[r.o[0]].pmach, nMax: tplMax({block: blk, cls: 'DAT_AdvancedAssembler', rec: k, mk, spMk: mk})} }, [RECS[recK], block, mk]);
  if (!(info.nMax >= 1)) { console.log(`plan ${block} ${recK}: nMax 0, skipped`); continue }
  const nm = info.nMax, pm = info.pm;
  for (const [tag, rate] of [['R1', pm], ['R1b', 0.25 * pm], ['R2', (nm - 1 + 0.3) * pm], ['R3', nm * pm], ['R4', (nm + 1) * pm]]) {
    const r = await checkPlan(pg, tplD, RECS[recK], rate, block, mk);
    const errs2 = r.errs.filter(e => !/^product /.test(e));
    const w = r.row, tail = rate / w.pmach - (w.N - 1);
    // 2x2 with N>per uses 2 sets: checkPlan injects each set equally, so each set's last machine is partial (aggregate gate only there)
    if (w.B === 1 && w.N >= 1 && !(block === '2x2' && w.N > 3) && !(Math.abs(w.minUtil - Math.min(1, tail)) <= 0.01)) errs2.push(`last machine ${w.minUtil} != planner ${tail.toFixed(3)}`);
    const neg = w.belts > 1;
    prow.push({block, recK, tag, rate: w.rate, N: w.N, B: w.B, nMax: nm, belts: w.belts, tail: +tail.toFixed(3), minU: w.minUtil, maxU: w.maxUtil, mb: w.maxBeltUtil, supply: w.supply, res: errs2.length ? (neg ? 'neg-expected' : 'FAIL') : 'ok', errs: errs2});
    if (errs2.length && !neg) check(false, `checkPlan ${block} ${recK} ${tag}: ${errs2.join('; ')}`);
    else check(true, `checkPlan ${block} ${recK} ${tag} N=${w.N} B=${w.B}${neg ? ' (belts ' + w.belts + ' > 1: ' + (errs2.length ? 'expected negative' : 'passes anyway') + ')' : ''}`);
  }
}
console.log('\nblock recipe set | rate N B nMax | planner belts | planner tail | minUtil maxUtil | maxBelt supply | result');
for (const r of prow) console.log(`${r.block} ${r.recK} ${r.tag} | ${r.rate} ${r.N} ${r.B} ${r.nMax} | ${r.belts} | ${r.tail} | ${r.minU} ${r.maxU} | ${r.mb} ${r.supply} | ${r.res}${r.errs.length ? ' ' + r.errs.join(';') : ''}`);
console.log('\nblock/recipe/n | machines belts ug spl | area | (belts+ug+spl)/machine');
for (const r of rows) console.log(`${r.tag} n=${r.n} | ${r.m} ${r.belts} ${r.ug} ${r.spl} | ${r.area} | ${r.bpm.toFixed(1)}`);
check(!errs.length, 'no page errors ' + errs.join('|'));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL OK');
process.exit(fails ? 1 : 0);

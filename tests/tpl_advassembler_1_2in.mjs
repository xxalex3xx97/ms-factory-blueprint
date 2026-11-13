// TPL advassembler (DAT_AdvancedAssembler, 1/2-input) page test. Run: node tests/tpl_advassembler_1_2in.mjs   Exit 1 on FAIL or page error.
// Per block (1x1,1x2,2x2,2x2c) x recipe: n in {1,2,nMax-1,nMax} (geometry nMax = derate ignored) full checks, nMax+1 negative (refused AND a forced build leaves the floor / overlaps),
// then the rate-limited nMax per recipe x belt Mk (n=1 and n=nMax checked). Checks: overlap, inside floor, placerCut (1 block, ov 0, span 0), connectivity flood (each machine port gets only its item, product reaches the out port), lane rates.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkIface, checkChain} from './tpl_iface.mjs';
import {checkPlan} from './tpl_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof placerCut === 'function' && typeof pfSplOff === 'function');
await pg.addScriptTag({path: ROOT + '/js/tpl/iface.js'});
await pg.addScriptTag({path: ROOT + '/js/tpl/advassembler_1_2in.js'});
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const REC = {
  esm: 'ITEM_AdvancedCircuits+ITEM_Lonsdaleite>ITEM_EmptySimulationMatrix',
  maglev: 'ITEM_BasicMotor+ITEM_Superalloy>ITEM_MaglevCoupling',
  reinf: 'ITEM_HullPlates+ITEM_Superalloy>ITEM_ReinforcedPlates',
  servo: 'ITEM_ReinforcedPlates+ITEM_MaglevCoupling>ITEM_ServoPlates',
  frame: 'ITEM_Superalloy>ITEM_SuperalloyFrame',
};
// all checks for one build, runs in the page
const runCase = (a) => pg.evaluate(([spec]) => {
  const T = tplBuild(spec);
  if (!T.ok) return {refused: T.why};
  if (spec.mut) { const i = T.items.findIndex(b => spec.mut === 'spl' ? PLC_SPL.includes(b.cls) : spec.mut === 'ug' ? PLC_UG.includes(b.cls) : PLC_BELT.includes(b.cls) && b.x === 12 && b.y === 3); if (spec.mut === 'rot') T.items[i].rot = 2; else T.items.splice(i, 1) }
  const res = {stats: T.stats, nMax: T.nMax, k: T.k};
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], cls = plcCls(TPL_BLK[spec.block]), F = floorRect({cls, x: 0, y: 0, h: 0, rot: 0});
  // 1,2: overlap + inside the floor
  const occ = new Map(); let ov = 0, out = 0;
  for (const b of T.items) { const d = dim(b); for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) { const x = b.x + i, y = b.y + j; if (x < 0 || y < 0 || x >= F.w || y >= F.h) out++; const k = x + ',' + y; if (occ.has(k)) ov++; else occ.set(k, b) } }
  res.ov = ov; res.out = out; res.floor = F.w + 'x' + F.h; res.area = F.w * F.h;
  // no vertical belt on the west/east edge columns (the placer wall only crosses rot-0 pairs there)
  res.edgeBad = T.items.filter(b => (PLC_BELT.includes(b.cls) || PLC_UG.includes(b.cls) || PLC_SPL.includes(b.cls)) && (b.x === 0 || b.x === F.w - 1) && b.rot !== 0).length;
  // 3: placerCut as the planner tiles it
  const c = placerCut({items: T.items.map(b => ({...b})), w: T.w, h: T.h, pitch: 1, lanes: 1, tall: true, mk: spec.mk}, cls);
  res.cut = {ok: c.ok, ov: c.ov, span: c.span, cols: c.cols, rows: c.rows, why: c.why || null};
  // 4: connectivity flood
  const isB = b => b && PLC_BELT.includes(b.cls), isU = b => b && PLC_UG.includes(b.cls), isS = b => b && PLC_SPL.includes(b.cls), isM = b => b && b.cls === TPL_ADV;
  const up = new Map(); ugPairs(T.items.filter(b => isU(b)).map(b => ({...b}))).forEach(p => { const u = T.items.find(b => b.x === p.u.x && b.y === p.u.y), t = T.items.find(b => b.x === p.t.x && b.y === p.t.y); up.set(u, t) });
  const at = (x, y) => occ.get(x + ',' + y);
  const machines = T.items.filter(isM);
  const flood = (sx, sy) => {   // flood from cell (sx,sy) carrying one item: returns {cells:Set, arr:Map machine-cell -> true}
    const seen = new Set(), arr = new Set(), st = [[sx, sy]];
    while (st.length) {
      const [x, y] = st.pop(), k = x + ',' + y; if (seen.has(k)) continue;
      const b = at(x, y); if (!b) continue;
      if (isM(b)) { arr.add(k); continue }
      seen.add(k);
      let outs = [];
      if (isB(b)) outs = [DIR[b.rot]];
      else if (isU(b)) { const t = up.get(b); if (t) { seen.add(t.x + ',' + t.y); outs = []; const d = DIR[t.rot]; st.push([t.x + d[0], t.y + d[1], 'ug']); } else { const d = DIR[b.rot]; outs = [d] } }
      else if (isS(b)) outs = portsOf(b).filter(p => p.dir !== 'in' && p.en).map(p => [p.nx, p.ny]);
      for (const d of outs) {
        const tx = x + d[0], ty = y + d[1], t = at(tx, ty); if (!t) continue;
        if (isB(t) && t.rot === (DIR.findIndex(q => q[0] === -d[0] && q[1] === -d[1]))) continue;   // head-on
        if (isU(t) && t.rot !== DIR.findIndex(q => q[0] === d[0] && q[1] === d[1])) continue;   // a UG only takes belts from behind
        if (isM(t)) { const pr = portsOf(t).find(p => p.en && p.x === tx && p.y === ty && p.nx === -d[0] && p.ny === -d[1]); if (pr) arr.add(tx + ',' + ty); continue }
        st.push([tx, ty]);
      }
    }
    return {seen, arr};
  };
  const lanes = T.ports.in.map(p => flood(0, p.y));
  let mix = 0; if (lanes.length === 2) for (const k of lanes[0].seen) if (lanes[1].seen.has(k)) mix++;
  res.mix = mix;
  const bad = [];
  for (const m of machines) {
    const ps = portsOf(m).filter(p => p.en), pin = ps.filter(p => p.y !== m.y + 6), pout = ps.find(p => p.y === m.y + 6);
    if (pin.length !== T.k) bad.push('m' + m.x + ',' + m.y + ' in-ports ' + pin.length);
    for (const p of pin) {
      const key = p.x + ',' + p.y, which = lanes.map(l => l.arr.has(key));
      const want = T.k === 1 ? 0 : p.y === m.y + 4 ? 0 : 1;   // Edge v1: slot 0 (row 0) = column XB -> port y+4; slot 1 (row 1) = column XA -> port y+2; k=1 slot 0 = XA -> y+2
      if (!which[want] || which.some((v, i) => v && i !== want)) bad.push('m' + m.x + ',' + m.y + ' port y' + (p.y - m.y) + ' gets ' + JSON.stringify(which));
    }
    // product: from the cell outside the out port to the east-edge out lane cell
    const sx = pout.x + pout.nx, sy = pout.y + pout.ny, sb = at(sx, sy);
    if (!isB(sb) || (DIR[sb.rot][0] === -pout.nx && DIR[sb.rot][1] === -pout.ny)) { bad.push('m' + m.x + ',' + m.y + ' out cell'); continue }
    const f = flood(sx, sy), op = T.ports.out[0];
    if (!f.seen.has((F.w - 1) + ',' + op.y)) bad.push('m' + m.x + ',' + m.y + ' product does not reach out lane');
    if (f.arr.size) bad.push('m' + m.x + ',' + m.y + ' product enters a machine');
  }
  const ob = at(F.w - 1, T.ports.out[0].y); if (!(isB(ob) && ob.rot === 0)) bad.push('out port cell');
  for (const p of T.ports.in) { const ib = at(0, p.y); if (!(isB(ib) && ib.rot === 0)) bad.push('in port cell y' + p.y) }
  res.bad = bad;
  res.prio = T.items.filter(b => PLC_SPL.includes(b.cls)).every(b => { const q = portsOf(b).find(p => p.pr); return q && q.nx === 1 && q.ny === 0 });
  res.build = {w: T.w, h: T.h, items: T.items, ports: T.ports, iface: T.iface};
  // 5: rates
  const L = tplLimits({...spec, derate: 1}), n = spec.n;
  res.rate = {in: L.rin.map(r => r * n), cap: L.cap, derCap: L.cap * BL.DERATE, out: L.rout * n, inOk: L.rin.every(r => r * n <= L.cap * BL.DERATE + 1e-9), outOk: L.rout * n <= L.cap + 1e-9, outDer: L.rout * n <= L.cap * BL.DERATE + 1e-9};
  return res;
}, [a]);
const rows = [];
const report = async (tag, a, r) => {
  if (r.refused) { console.log(tag + ' refused: ' + r.refused); return }
  const s = r.stats, belts = s.belts + s.ug + s.spl;
  rows.push({tag, mach: s.machines, belts: s.belts, ug: s.ug, spl: s.spl, area: r.area, bpm: (belts / s.machines).toFixed(1)});
  check(r.ov === 0, tag + ' no overlap');
  check(r.out === 0, tag + ' all cells inside floor ' + r.floor);
  check(r.edgeBad === 0, tag + ' edge columns hold rot-0 belts only');
  check(r.cut.ok && r.cut.ov === 0 && r.cut.span === 0 && r.cut.cols === 1 && r.cut.rows === 1, tag + ' placerCut 1 block ov 0 span 0 ' + JSON.stringify(r.cut));
  check(r.mix === 0, tag + ' lane cells never carry two items');
  check(r.prio, tag + ' every splitter has priority on its E (machine) output');
  const ifr = await checkIface(pg, r.build, a.block, a.n === 1 ? undefined : await pg.evaluate(s => { const b = tplBuild({...s, n: 1}); return {w: b.w, h: b.h, items: b.items, ports: b.ports, iface: b.iface} }, a));
  check(ifr.ok, tag + ' checkIface ' + ifr.errs.join('; '));
  const chn = checkChain(r.build, r.build);
  check(chn.ok, tag + ' checkChain self ' + chn.errs.join('; '));
  check(!r.bad.length, tag + ' connectivity' + (r.bad.length ? ' ' + r.bad.slice(0, 4).join(' | ') : ''));
  console.log('     rate in ' + r.rate.in.map(x => x.toFixed(0)).join('/') + ' (derate cap ' + r.rate.derCap + ', cap ' + r.rate.cap + ') out ' + r.rate.out.toFixed(0) + ' inOk@derate ' + r.rate.inOk + ' outOk@cap ' + r.rate.outOk);
};
const BLK = ['1x1', '1x2', '2x2', '2x2c'];
// A: geometry sweeps (derate ignored): ESM (2-input) and Superalloy Frame (1-input), Mk3
for (const block of BLK) for (const rk of ['esm', 'frame']) {
  const base = {block, cls: 'DAT_AdvancedAssembler', rec: REC[rk], mk: 2, spMk: 2, derate: 100};
  const nG = await pg.evaluate(s => tplMax(s), base);
  console.log(`\n== ${block} ${rk} geometry nMax ${nG}`);
  check(nG >= 1, `${block} ${rk} geometry nMax ${nG}`);
  for (const n of [...new Set([1, 2, nG - 1, nG])].filter(v => v >= 1 && v <= nG)) await report(`${block} ${rk} n=${n}`, {...base, n}, await runCase({...base, n}));
  const neg = await pg.evaluate(s => { const a = tplBuild({...s, n: tplMax(s) + 1}), f = tplBuild({...s, n: tplMax(s) + 1, force: true}); if (!f.ok) return {ref: !a.ok, forced: false};
    const F = floorRect({cls: plcCls(TPL_BLK[s.block]), x: 0, y: 0, h: 0, rot: 0}), occ = new Set(); let bad = 0;
    for (const b of f.items) { const d = dim(b); for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) { const x = b.x + i, y = b.y + j, k = x + ',' + y; if (x >= F.w || y >= F.h || occ.has(k)) bad++; occ.add(k) } } return {ref: !a.ok, bad} }, base);
  check(neg.ref && neg.bad > 0, `${block} ${rk} n=nMax+1 (${nG + 1}) refused and a forced build leaves the floor/overlaps (${JSON.stringify(neg)})`);
}
// B: rate-limited nMax per recipe x belt Mk (derate = BL.DERATE), n=1 and n=nMax checked
console.log('\n== rate-limited nMax (BL.DERATE) per block x recipe x belt Mk (Mk1/Mk2/Mk3)');
for (const block of BLK) {
  for (const rk of Object.keys(REC)) {
    const mx = [];
    for (const mk of [0, 1, 2]) {
      const sp = {block, cls: 'DAT_AdvancedAssembler', rec: REC[rk], mk, spMk: mk};
      const L = await pg.evaluate(s => { const r = tplBuild({...s, n: 1}); return {nMax: tplMax(s), ok: r.ok, why: r.why} }, sp);
      mx.push(L.nMax + (L.ok ? '' : '(' + (L.why || '').replace(/^tpl: /, '').slice(0, 40) + ')'));
      if (rk === 'maglev') { check(!L.ok && /unsupported/.test(L.why), `${block} maglev Mk${mk + 1} reported unsupported (${L.why})`); continue }
      for (const n of [...new Set([1, L.nMax])].filter(v => v >= 1)) await report(`${block} ${rk} Mk${mk + 1} n=${n}`, {...sp, n}, await runCase({...sp, n}));
    }
    console.log(`   ${block} ${rk}: nMax Mk1/Mk2/Mk3 = ${mx.join(' / ')}`);
  }
}
// P: checkPlan gate (planner N, delivered input, belt util). 2-input recipes: product check skipped (shared checkPlan derives product for 1-input only), delivered input == planner input still asserted.
console.log('\n== checkPlan (planner) rate sets');
const TPL = {build: 'tplBuild', max: 'tplMax', cls: 'DAT_AdvancedAssembler'};
const planRows = [];
for (const block of BLK) for (const rk of ['frame', 'esm', 'reinf', 'servo']) for (const mk of [1, 2]) {
  const key = REC[rk];
  const info = await pg.evaluate(([k, blk, mk]) => { const r = [].concat(...Object.values(RECS)).find(x => rk(x) === k); const P = plan(r.o[0], 1, mk, {}, {[r.o[0]]: k}, {proto: false, enr: false, obs: false}); return {pm: P.nodes[r.o[0]].pmach, nMax: tplMax({block: blk, cls: 'DAT_AdvancedAssembler', rec: k, mk, spMk: mk}), k: r.i.length} }, [key, block, mk]);
  if (!(info.nMax >= 1)) { console.log(`${block} ${rk} Mk${mk + 1}: nMax 0, skipped`); continue }
  const pm = info.pm, nm = info.nMax;
  const sets = [['R1 pmach', pm], ['R1b 0.25 pmach', 0.25 * pm], ['R2 (nMax-1+0.3)', (nm - 1 + 0.3) * pm], ['R3 nMax', nm * pm], ['R4 (nMax+1)', (nm + 1) * pm], ['R4b (2nMax+0.5)', (2 * nm + 0.5) * pm]];
  for (const [tag, rate] of sets) {
    const r = await checkPlan(pg, TPL, key, rate, block, mk);
    const errs2 = info.k === 2 ? r.errs.filter(e => !/^product /.test(e)) : r.errs;
    r.row.set = tag; r.row.rk = rk; r.row.mk = mk + 1; planRows.push(r.row);
    check(errs2.length === 0, `plan ${block} ${rk} Mk${mk + 1} ${tag}${errs2.length ? ': ' + errs2.join('; ') : ''}`);
  }
}
console.log('\nblock rec   Mk set                rate     N  B nMax planUtil minUtil maxUtil belts maxBelt supply');
for (const x of planRows) console.log([x.block.padEnd(5), x.rk.padEnd(5), x.mk, x.set.padEnd(18), String(x.rate).padEnd(8), String(x.N).padEnd(2), String(x.B).padEnd(2), String(x.nMax).padEnd(4), String(x.planUtil).padEnd(8), String(x.minUtil).padEnd(7), String(x.maxUtil).padEnd(7), String(x.belts).padEnd(5), String(x.maxBeltUtil).padEnd(7), x.supply].join(' '));
// C: the flood must catch broken wiring (mutations of a good 2x2 ESM n=6 build)
for (const mut of ['spl', 'ug', 'rot']) { const r = await runCase({block: '2x2', cls: 'DAT_AdvancedAssembler', rec: REC.esm, mk: 2, spMk: 2, derate: 100, n: 6, mut}); check(r.bad.length > 0 || r.mix > 0, 'mutation ' + mut + ' detected by connectivity (' + r.bad.length + ' bad, mix ' + r.mix + ')') }
// D: screenshots of n=1 and n=nMax (own cell renderer: machine grey, belt arrows, splitter orange, UG blue)
import fs from 'fs';
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
for (const block of BLK) for (const pick of ['one', 'max']) {
  const spec = {block, cls: 'DAT_AdvancedAssembler', rec: REC.esm, mk: 2, spMk: 2, derate: 100};
  const n = await pg.evaluate(([s, p]) => p === 'one' ? 1 : tplMax(s), [spec, pick]);
  const dataUrl = await pg.evaluate(([s, n]) => {
    const T = tplBuild({...s, n}), Z = 20, c = document.createElement('canvas'); c.width = T.w * Z; c.height = T.h * Z; const g = c.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = '#333'; for (let i = 0; i <= T.w; i++) { g.beginPath(); g.moveTo(i * Z, 0); g.lineTo(i * Z, c.height); g.stroke() } for (let j = 0; j <= T.h; j++) { g.beginPath(); g.moveTo(0, j * Z); g.lineTo(c.width, j * Z); g.stroke() }
    const arrow = (x, y, rot, col) => { g.fillStyle = col; g.fillRect(x * Z + 2, y * Z + 2, Z - 4, Z - 4); g.fillStyle = '#000'; g.save(); g.translate(x * Z + Z / 2, y * Z + Z / 2); g.rotate(rot * Math.PI / 2); g.beginPath(); g.moveTo(6, 0); g.lineTo(-5, -5); g.lineTo(-5, 5); g.fill(); g.restore() };
    for (const b of T.items) { const d = dim(b);
      if (b.cls === 'DAT_AdvancedAssembler') { g.fillStyle = '#566'; g.fillRect(b.x * Z + 1, b.y * Z + 1, d.w * Z - 2, d.h * Z - 2); g.fillStyle = '#fff'; g.fillText('AA', b.x * Z + 6, b.y * Z + 14) }
      else arrow(b.x, b.y, b.rot, PLC_SPL.includes(b.cls) ? '#f90' : PLC_UG.includes(b.cls) ? '#39f' : '#9d9') }
    return c.toDataURL('image/png');
  }, [spec, n]);
  fs.writeFileSync(`${ROOT}/tests/shots/tpl_advassembler_1_2in_${block}_n${n}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('shot tests/shots/tpl_advassembler_1_2in_' + block + '_n' + n + '.png');
}
console.log('\nTABLE (tag | machines | belts | ug | spl | floor area | (belts+ug+spl)/machine)');
for (const r of rows.filter(r => /geometry|^(\S+) (esm|frame) n=/.test(r.tag) && !/Mk/.test(r.tag))) console.log(`${r.tag.padEnd(22)} ${String(r.mach).padStart(2)} ${String(r.belts).padStart(4)} ${String(r.ug).padStart(3)} ${String(r.spl).padStart(3)} ${String(r.area).padStart(4)} ${r.bpm}`);
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

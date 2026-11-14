// TPL assembler_3in gate (page). Run: node tests/tpl_assembler_3in.mjs   Exit 1 on FAIL.
// 6 DAT_Assembler 3-input recipes x blocks (1x1,1x2,2x2,2x2c) x Mk1..3. GEOMETRY mode (no rates): n in {1,2,nMax-1,nMax} (Mk2), {1,nMax} (Mk1/3); nMax+1 refused.
// RATE mode (spec.rates): n = rate-clamped nMax (one lane group at DERATE*cap), nMax+1 refused, single machine above the belt cap -> ok:false.
// Per build: overlap 0, inside floor, floor size, port rows inside the real wall doors, placerCut ok/ov 0/span 0, connectivity flood (lane i reaches only its machine port on every machine; outputs reach the east edge cell).
// Screenshots: tests/shots/tpl_assembler_3in_<block>_n<N>.png (n=1 and n=nMax, Mk2, Containment Coil). Sim (item 6): not run, no harness for a bare template.
import {createRequire} from 'module';
import path from 'path';
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
  const runCase = (R, blk, MK, n, mode, main) => {
    const rin = R.r.i.map(([, q]) => q * 1800 / R.r.t), rout = R.r.o[1] * 1800 / R.r.t, cap = [60, 120, 180][MK];
    const spec = {block: blk, cls: 'DAT_Assembler', rec: R.rec, n, mk: MK, spMk: MK, main: main || 0, ...(mode === 'rate' ? {rates: rin, rout} : {geom: true})};
    const T = tplBuild(spec), g = {recipe: R.name, blk, n, mk: MK, mode, ok: T.ok, why: T.why || null, f: [], rin, rout};
    if (!T.ok) return g;
    const occ = new Map();
    for (const b of T.items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) g.f.push('overlap ' + k); occ.set(k, b); if (x < 0 || y < 0 || x >= T.w || y >= T.h) g.f.push('outside ' + k) } }
    const fl = floorRect({cls: plcCls(NAMES[blk]), x: 0, y: 0, h: 0, rot: 0});
    if (fl.w !== T.w || fl.h !== T.h) g.f.push('floor mismatch');
    const spls = T.items.filter(b => PLC_SPL.includes(b.cls));
    spls.forEach(b => { const en = portsOf({...b}).filter(p => p.dir === 'out' && p.en).length; if (en > 1 && !b.pr) g.f.push('splitter ' + b.x + ',' + b.y + ' with 2 outputs has no priority') });
    g.nPr = spls.filter(b => b.pr).length;
    g.T = MK === 1 ? JSON.parse(JSON.stringify(T)) : null;
    const L = {ok: true, items: T.items.map(b => ({...b})), w: T.w, h: T.h, pitch: 1, lanes: 1, tall: false, mk: MK};
    const cut = placerCut(L, plcCls(NAMES[blk]));
    g.cut = cut.ok && !cut.ov && !cut.span; if (!g.cut) g.f.push('placerCut ' + (cut.why || 'ov ' + cut.ov + ' span ' + cut.span));
    const mach = T.items.filter(b => b.cls === 'DAT_Assembler');
    const flood = (sx, sy) => {
      const seen = new Set(), reach = [], edge = [], q = [[sx, sy, 0]];
      const entry = (x, y, d) => {
        const b = occ.get(x + ',' + y); if (!b) return;
        const k = x + ',' + y + ',' + d; if (seen.has(k)) return; seen.add(k);
        if (b.cls === 'DAT_Assembler') { const pp = portsOf(b).find(p => p.x === x && p.y === y && p.nx === -DIR[d][0] && p.ny === -DIR[d][1] && p.en && !(b.off || []).includes(p.key)); if (pp) reach.push(mach.indexOf(b) + ':' + pp.key); return }
        if (isB(b)) { if ((b.rot + 2) % 4 === d) return; if (x === T.w - 1 && b.rot === 0) edge.push(x + ',' + y); q.push([x + DIR[b.rot][0], y + DIR[b.rot][1], b.rot]); return }
        if (isU(b)) { if (b.rot !== d) return; for (let k2 = 1; k2 <= def(b.cls).maxApart; k2++) { const e = occ.get((x + k2 * DIR[d][0]) + ',' + (y + k2 * DIR[d][1])); if (e && isU(e) && e.rot === d) { q.push([x + (k2 + 1) * DIR[d][0], y + (k2 + 1) * DIR[d][1], d]); return } } return }
        if (isS(b)) { if ((b.rot + 2) % 4 === d) return; for (const p of portsOf({...b, off: b.off || []})) { if (p.dir === 'in' || !p.en) continue; const nd = (p.wf + 3) % 4; q.push([x + DIR[nd][0], y + DIR[nd][1], nd]) } }
      };
      while (q.length) { const [x, y, d] = q.shift(); entry(x, y, d) }
      return {reach, edge};
    };
    const want = ['S5', 'N1', 'N0'];
    T.ports.in.forEach((p, t) => {
      const perm = [main || 0, ...[0, 1, 2].filter(i => i !== (main || 0))];
      if (p.item !== perm[t]) g.f.push('port ' + t + ' item ' + p.item + ' want ' + perm[t]);
      const fr = flood(0, p.y), exp = mach.map((_, i) => i + ':' + want[t]).sort(), got = [...fr.reach].sort();
      if (JSON.stringify(exp) !== JSON.stringify(got)) g.f.push('lane ' + p.item + ' reaches ' + got.join(' ') + ' want ' + exp.join(' '));
    });
    let outOk = 0;
    for (const m of mach) { const fr = flood(m.x + 5, m.y + 3); if (fr.edge.includes((T.w - 1) + ',' + T.ports.out[0].y)) outOk++ }
    if (outOk !== n) g.f.push('outputs reach edge ' + outOk + '/' + n);
    g.load = rin.map(r => r * n); g.loadOut = rout * n;
    g.overCap = g.load.some(l => l > cap) || g.loadOut > cap; g.overDerate = g.load.some(l => l > cap) || g.loadOut > cap;
    if (mode === 'rate' && g.overCap) g.f.push('rate mode but a lane over the belt cap');
    
    g.cnt = T.stats; g.cols = T.cols; g.nMax = T.nMax; g.bpm = +(T.stats.belts / n).toFixed(1); g.area = T.w * T.h;
    return g;
  };
  for (const R of recs) for (const blk of Object.keys(NAMES)) for (const MK of [0, 1, 2]) {
    const nMax = tplMax({block: blk, mk: MK, geom: true});
    const ns = [...new Set((MK === 1 ? [1, 2, nMax - 1, nMax] : [1, nMax]).filter(n => n >= 1 && n <= nMax))];
    for (const n of ns) { const g = runCase(R, blk, MK, n, 'geom'); g.nMax = nMax; out.push(g) }
    if (MK === 1) { const g = runCase(R, blk, MK, nMax, 'geom', 2); g.main = 2; g.nMax = nMax; out.push(g) }
    out.push({recipe: R.name, blk, mk: MK, mode: 'geom', n: nMax + 1, neg: true, refused: !tplBuild({block: blk, cls: 'DAT_Assembler', rec: R.rec, n: nMax + 1, mk: MK, spMk: MK, geom: true}).ok, f: []});
    // rate mode
    const rin = R.r.i.map(([, q]) => q * 1800 / R.r.t), nR = tplMax({block: blk, mk: MK, rec: R.rec, rates: rin, rout: R.r.o[1] * 1800 / R.r.t});
    if (nR === 0) { out.push({recipe: R.name, blk, mk: MK, mode: 'rate', n: 1, neg: true, refused: !tplBuild({block: blk, cls: 'DAT_Assembler', rec: R.rec, n: 1, mk: MK, spMk: MK, rates: rin, rout: R.r.o[1] * 1800 / R.r.t}).ok, f: [], over: true}); continue }
    const g = runCase(R, blk, MK, nR, 'rate'); g.nMax = nR; out.push(g);
    if (nR < tplMax({block: blk, mk: MK, geom: true})) out.push({recipe: R.name, blk, mk: MK, mode: 'rate', n: nR + 1, neg: true, refused: !tplBuild({block: blk, cls: 'DAT_Assembler', rec: R.rec, n: nR + 1, mk: MK, spMk: MK, rates: rin, rout: R.r.o[1] * 1800 / R.r.t}).ok, f: []});
  }
  return out;
});
const tab = [], rt = [];
for (const g of res) {
  if (g.neg) { check(g.refused, `${g.recipe} ${g.blk} Mk${g.mk + 1} ${g.mode} n=${g.n}${g.over ? ' (machine over cap)' : ' (nMax+1)'} must be refused`); continue }
  check(g.ok, `${g.recipe} ${g.blk} Mk${g.mk + 1} ${g.mode} n=${g.n} built (${g.why})`);
  if (!g.ok) continue;
  g.f.forEach(f => check(false, `${g.recipe} ${g.blk} Mk${g.mk + 1} ${g.mode} n=${g.n}: ${f}`));
  if (g.recipe === res[0].recipe && g.mk === 1 && g.mode === 'geom') tab.push([g.blk, g.n, g.nMax, g.cols, g.cnt.machines, g.cnt.belts, g.cnt.ug, g.cnt.spl, g.area, g.bpm, g.cut ? 'cut ok' : 'cut BAD'].join(' | '));
  if (g.mode === 'rate') rt.push(`Mk${g.mk + 1} ${g.blk} ${g.recipe}: rate nMax=${g.nMax} cols=${g.cols} loads ${g.load.join('/')} out ${g.loadOut} belts/machine ${g.bpm}`);
}
console.log('GEOMETRY (Containment Coil, Mk2): block | n | nMax | cols | machines | belts | ug | spl | area | belts/machine | placerCut');
tab.forEach(t => console.log(t));
console.log('\nRATE mode (one lane group at derate):');
rt.filter(l => /Mk2/.test(l)).forEach(l => console.log(l));
console.log('rate mode refusals (single machine > belt cap): ' + res.filter(g => g.over).map(g => g.recipe + ' Mk' + (g.mk + 1) + ' ' + g.blk).join(', '));
// Edge v1 gate: checkIface for every Mk2 build (n=1 reference), nMax+1 refused, chain with itself
const refs = {};
for (const g of res) if (g.T && g.n === 1 && g.mode === 'geom' && !g.main) refs[g.recipe + g.blk] = g.T;
let nIf = 0;
for (const g of res) {
  if (!g.T) continue;
  const r = await checkIface(pg, g.T, g.blk, refs[g.recipe + g.blk]); nIf++;
  check(r.ok, `iface ${g.recipe} ${g.blk} ${g.mode} n=${g.n}${g.main ? ' main=' + g.main : ''}: ${r.errs.join('; ')}`);
}
console.log('checkIface runs: ' + nIf);
for (const blk of ['1x1', '1x2', '2x2', '2x2c']) {
  const T = res.find(g => g.T && g.blk === blk && g.n > 1 && !g.main);
  if (T) { const c = checkChain(T.T, T.T); check(c.ok, 'chain ' + blk + ' -> itself: ' + c.errs.join('; ')) }
  const big = res.find(g => g.neg && g.blk === blk && g.mode === 'geom'); check(big && big.refused, 'nMax+1 stays ok:false ' + blk);
}
// checkPlan (tests/tpl_plan.mjs). Shared file assumes single-input: build.rows=[{m:n}] gives every lane weight 1; its product check (prodPull=0 for multi-input) is filtered out locally, delivered input == planner input is still asserted
const TPL = {build: 'tplBuild', max: 'tplMax', cls: 'DAT_Assembler'};
const keys = await pg.evaluate(() => { const o = []; plnBy(false).forEach(l => l.forEach(({c, r}) => { if (c === 'CRAFT_Assembler' && r.i.length === 3) o.push(r.i.map(x => x[0]).join('+') + '>' + r.o[0]) })); return [...new Set(o)] });
const prow = [];
for (const key of [keys[0], keys[Math.floor(keys.length / 2)], keys[keys.length - 1]]) for (const block of ['1x1', '1x2', '2x2', '2x2c']) {
  const info = await pg.evaluate(([k, blk]) => { const r = [].concat(...Object.values(RECS)).find(x => rk(x) === k); const P = plan(r.o[0], 1, 1, {}, {[r.o[0]]: k}, {proto: false, enr: false, obs: false}); return {pm: P.nodes[r.o[0]].pmach, nMax: tplMax({block: blk, cls: 'DAT_Assembler', rec: k, mk: 1, spMk: 1})} }, [key, block]);
  if (!(info.nMax >= 1)) { console.log('plan ' + block + ' ' + key + ': nMax 0 (refused)'); continue }
  const pm = info.pm, nm = info.nMax;
  for (const [tag, rate] of [['R1 pmach', pm], ['R1b .25', .25 * pm], ['R2 (nMax-1+.3)', (nm - 1 + .3) * pm], ['R3 nMax', nm * pm], ['R4 (nMax+1)', (nm + 1) * pm], ['R4b (2nMax+.5)', (2 * nm + .5) * pm]]) {
    const r = await checkPlan(pg, TPL, key, rate, block, 1);
    const errs2 = r.errs.filter(e => !/^product /.test(e));
    r.row.set = tag; r.row.key = key; prow.push(r.row);
    check(errs2.length === 0, `plan ${block} ${key} ${tag}: ${errs2.join('; ')}`);
  }
}
console.log('\nset | recipe | block | rate | N | B | nMax | pmach | planUtil | minUtil | maxUtil | belts | maxBelt | supply | machines');
for (const x of prow) console.log([x.set, x.key.slice(0, 40), x.block, x.rate, x.N, x.B, x.nMax, x.pmach, x.planUtil, x.minUtil, x.maxUtil, x.belts, x.maxBeltUtil, x.supply, x.machines].join(' | '));
// screenshots: n=1 and n=nMax per block, Containment Coil, Mk2 (geometry mode)
for (const blk of ['1x1', '1x2', '2x2', '2x2c']) {
  const nM = await pg.evaluate(b => tplMax({block: b, geom: true}), blk);
  for (const n of [...new Set([1, nM])]) {
    await pg.evaluate(([blk, n]) => {
      const rr = plnBy(false); let rec = null;
      rr.forEach((l, it) => l.forEach(({c, r}) => { if (c === 'CRAFT_Assembler' && r.i.length === 3 && !rec) rec = r.i.map(x => x[0]).join('+') + '>' + r.o[0] }));
      const T = tplBuild({block: blk, cls: 'DAT_Assembler', rec, n, mk: 1, spMk: 1, geom: true}), S = 22, c = document.createElement('canvas'); c.id = 'tplshot';
      c.width = T.w * S + 2; c.height = T.h * S + 2; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#10151c';
      const g = c.getContext('2d'); g.translate(1, 1);
      g.strokeStyle = '#243040'; for (let x = 0; x <= T.w; x++) { g.beginPath(); g.moveTo(x * S, 0); g.lineTo(x * S, T.h * S); g.stroke() } for (let y = 0; y <= T.h; y++) { g.beginPath(); g.moveTo(0, y * S); g.lineTo(T.w * S, y * S); g.stroke() }
      const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (const b of T.items) {
        const d = dim(b), x = b.x * S, y = b.y * S;
        if (PLC_BELT.includes(b.cls)) { g.fillStyle = '#3b6ea5'; g.fillRect(x + 2, y + 2, S - 4, S - 4); g.strokeStyle = '#fff'; g.beginPath(); const cx = x + S / 2, cy = y + S / 2, [dx, dy] = D[b.rot]; g.moveTo(cx - dx * 6, cy - dy * 6); g.lineTo(cx + dx * 6, cy + dy * 6); g.stroke(); g.fillStyle = '#fff'; g.fillRect(cx + dx * 6 - 2, cy + dy * 6 - 2, 4, 4) }
        else if (PLC_UG.includes(b.cls)) { g.fillStyle = '#7a4fa0'; g.fillRect(x + 2, y + 2, S - 4, S - 4) }
        else if (PLC_SPL.includes(b.cls)) { g.fillStyle = '#d9a441'; g.fillRect(x + 2, y + 2, S - 4, S - 4) }
        else { g.fillStyle = '#4a7c59'; g.fillRect(x + 1, y + 1, d.w * S - 2, d.h * S - 2); g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText('A', x + d.w * S / 2 - 3, y + d.h * S / 2 + 4) }
      }
      g.fillStyle = '#e66'; for (const p of T.ports.in) g.fillRect(-1, p.y * S, 3, S); g.fillStyle = '#6e6'; for (const p of T.ports.out) g.fillRect(T.w * S - 2, p.y * S, 3, S);
      document.body.appendChild(c);
    }, [blk, n]);
    await pg.locator('#tplshot').screenshot({path: ROOT + '/tests/shots/tpl_assembler_3in_' + blk + '_n' + n + '.png'});
    await pg.evaluate(() => document.getElementById('tplshot').remove());
  }
}
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

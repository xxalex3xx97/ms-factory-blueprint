// TPL assembler_3in gate (page). Run: node tests/tpl_assembler_3in.mjs   Exit 1 on FAIL.
// 6 DAT_Assembler 3-input recipes x blocks (1x1,1x2,2x2,2x2c) x Mk1..3. GEOMETRY mode (no rates): n in {1,2,nMax-1,nMax} (Mk2), {1,nMax} (Mk1/3); nMax+1 refused.
// RATE mode (spec.rates): n = rate-clamped nMax (one lane group at DERATE*cap), nMax+1 refused, single machine above the belt cap -> ok:false.
// Per build: overlap 0, inside floor, floor size, port rows inside the real wall doors, placerCut ok/ov 0/span 0, connectivity flood (lane i reaches only its machine port on every machine; outputs reach the east edge cell).
// Screenshots: tests/shots/tpl_assembler_3in_<block>_n<N>.png (n=1 and n=nMax, Mk2, Containment Coil). Sim (item 6): not run, no harness for a bare template.
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
  const runCase = (R, blk, MK, n, mode) => {
    const rin = R.r.i.map(([, q]) => q * 1800 / R.r.t), rout = R.r.o[1] * 1800 / R.r.t, cap = [60, 120, 180][MK];
    const spec = {block: blk, cls: 'DAT_Assembler', rec: R.rec, n, mk: MK, spMk: MK, ...(mode === 'rate' ? {rates: rin} : {})};
    const T = tplBuild(spec), g = {recipe: R.name, blk, n, mk: MK, mode, ok: T.ok, why: T.why || null, f: [], rin, rout};
    if (!T.ok) return g;
    const occ = new Map();
    for (const b of T.items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) g.f.push('overlap ' + k); occ.set(k, b); if (x < 0 || y < 0 || x >= T.w || y >= T.h) g.f.push('outside ' + k) } }
    const fl = floorRect({cls: plcCls(NAMES[blk]), x: 0, y: 0, h: 0, rot: 0});
    if (fl.w !== T.w || fl.h !== T.h) g.f.push('floor mismatch');
    const doorOk = y => TPL_DOOR[blk].some(([a, b]) => y >= a && y <= b);
    [...T.ports.in, ...T.ports.out].forEach(p => { if (!doorOk(p.y)) g.f.push('port row ' + p.y + ' not in a wall door') });
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
    T.ports.in.forEach(p => {
      const fr = flood(0, p.y), exp = mach.map((_, i) => i + ':' + want[p.item]).sort(), got = [...fr.reach].sort();
      if (JSON.stringify(exp) !== JSON.stringify(got)) g.f.push('lane ' + p.item + ' reaches ' + got.join(' ') + ' want ' + exp.join(' '));
    });
    let outOk = 0;
    for (const m of mach) { const fr = flood(m.x + 5, m.y + 3); if (fr.edge.includes((T.w - 1) + ',' + T.ports.out[0].y)) outOk++ }
    if (outOk !== n) g.f.push('outputs reach edge ' + outOk + '/' + n);
    g.load = rin.map(r => r * n); g.loadOut = rout * n;
    g.overCap = g.load.some(l => l > cap) || g.loadOut > cap; g.overDerate = g.load.some(l => l > 0.5 * cap) || g.loadOut > 0.5 * cap;
    if (mode === 'rate' && g.overCap) g.f.push('rate mode but a lane over the belt cap');
    if (mode === 'rate' && g.overDerate && n > 1) g.f.push('rate mode but a lane over the derate with n>1');
    g.cnt = T.stats; g.cols = T.cols; g.nMax = T.nMax; g.bpm = +(T.stats.belts / n).toFixed(1); g.area = T.w * T.h;
    return g;
  };
  for (const R of recs) for (const blk of Object.keys(NAMES)) for (const MK of [0, 1, 2]) {
    const nMax = tplMax({block: blk, mk: MK});
    const ns = [...new Set((MK === 1 ? [1, 2, nMax - 1, nMax] : [1, nMax]).filter(n => n >= 1 && n <= nMax))];
    for (const n of ns) { const g = runCase(R, blk, MK, n, 'geom'); g.nMax = nMax; out.push(g) }
    out.push({recipe: R.name, blk, mk: MK, mode: 'geom', n: nMax + 1, neg: true, refused: !tplBuild({block: blk, cls: 'DAT_Assembler', rec: R.rec, n: nMax + 1, mk: MK, spMk: MK}).ok, f: []});
    // rate mode
    const rin = R.r.i.map(([, q]) => q * 1800 / R.r.t), nR = tplMax({block: blk, mk: MK, rates: rin});
    if (nR === 0) { out.push({recipe: R.name, blk, mk: MK, mode: 'rate', n: 1, neg: true, refused: !tplBuild({block: blk, cls: 'DAT_Assembler', rec: R.rec, n: 1, mk: MK, spMk: MK, rates: rin}).ok, f: [], over: true}); continue }
    const g = runCase(R, blk, MK, nR, 'rate'); g.nMax = nR; out.push(g);
    if (nR < tplMax({block: blk, mk: MK})) out.push({recipe: R.name, blk, mk: MK, mode: 'rate', n: nR + 1, neg: true, refused: !tplBuild({block: blk, cls: 'DAT_Assembler', rec: R.rec, n: nR + 1, mk: MK, spMk: MK, rates: rin}).ok, f: []});
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
// screenshots: n=1 and n=nMax per block, Containment Coil, Mk2 (geometry mode)
for (const blk of ['1x1', '1x2', '2x2', '2x2c']) {
  const nM = await pg.evaluate(b => tplMax({block: b}), blk);
  for (const n of [...new Set([1, nM])]) {
    await pg.evaluate(([blk, n]) => {
      const rr = plnBy(false); let rec = null;
      rr.forEach((l, it) => l.forEach(({c, r}) => { if (c === 'CRAFT_Assembler' && r.i.length === 3 && !rec) rec = r.i.map(x => x[0]).join('+') + '>' + r.o[0] }));
      const T = tplBuild({block: blk, cls: 'DAT_Assembler', rec, n, mk: 1, spMk: 1}), S = 22, c = document.createElement('canvas'); c.id = 'tplshot';
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

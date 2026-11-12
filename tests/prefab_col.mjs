// Prefab COL (step 3): pfCol builds for AdvancedAssembler k=4 (m=2, Mk2), Assembler k=3, Refinery k=1 (m=2); Refinery k=2 refused (N overflow). Checks: ov 0, seams ok, two columns side by side ov 0, every machine input port has a belt pointing in, one item per trunk, collector reaches the N-edge sink, UG pairs span <= maxApart (inclusive). Sim not run here.
// Run:  node tests/prefab_col.mjs     Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof pfCol === 'function' && typeof pfCheck === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [['AdvancedAssembler', 4, 2, 1], ['Assembler', 3, 2, 1], ['Refinery', 1, 2, 1], ['Refinery', 2, 2, 1], ['GrowthChamber', 4, 2, 1]];
const r = await pg.evaluate(cases => {
  const clsOf = n => Object.keys(BASE).find(x => BASE[x].name === n);
  const flows = k => Array.from({length: k}, (_, i) => ({item: 'I' + (i + 1), flow: 20}));
  const out = [];
  for (const [name, k, m, mk] of cases) {
    const c = clsOf(name), P = pfCol(c, k, flows(k), m, mk);
    const row = {name, k, ok: P.ok !== false, why: P.ok === false ? P.why : ''};
    if (P.ok === false) { out.push(row); continue }
    const A = pfAssign(c, k, flows(k)), B2 = pfPrefab('pfCol', [c, k, flows(k), m, mk]);
    const at = new Map(P.items.map(b => [b.x + ',' + b.y, b]));
    const ov = pfCheck(P), twoItems = {w: 2 * PF_GRID.cw, h: P.h, items: [...pfPlace({proto: 'pfCol', args: [c, k, flows(k), m, mk], at: {gx: 0, gy: 0}}), ...pfPlace({proto: 'pfCol', args: [c, k, flows(k), m, mk], at: {gx: 1, gy: 0}})], ports: P.ports};
    const two = pfCheck(twoItems);
    const mach = P.items.filter(b => b.cls === c), x0 = mach[0].x, Wd = dim({cls: c, rot: 0}).w;
    let inOk = 0, inN = 0, nOk = 0;
    for (const mc of mach) {
      for (const p of A.W) { inN++; const b = at.get((mc.x - 1) + ',' + (mc.y + p.row)); if (b && b.rot === 0) inOk++ }
      for (const p of A.E) { inN++; const b = at.get((mc.x + Wd) + ',' + (mc.y + p.row)); if (b && b.rot === 2) inOk++ }
      for (const p of A.N) { inN++; const b = at.get((mc.x + p.row) + ',' + (mc.y - 1)); const s = at.get(P.nIn.tx + ',' + (mc.y - 2)); if (b && b.rot === 1 && s && PLC_SPL.includes(s.cls)) { inOk++; nOk++ } }
    }
    const heads = P.items.filter(b => b.cls === 'DAT_Container' && b.ct && b.ct.length && b.ct[0].inf);
    const heapItems = heads.map(h => h.ct[0].item).sort();
    const sink = P.items.find(b => b.cls === 'DAT_Container' && b.ct && b.ct.length === 0);
    let collOk = !!sink, collN = 0;
    if (sink) for (let y = 2; y <= mach[mach.length - 1].y + A.out.row; y++) { const b = at.get(sink.x + ',' + y); if (b && b.rot === 3 && PLC_BELT.includes(b.cls)) collN++ }
    collOk = collOk && collN === mach[mach.length - 1].y + A.out.row - 1;
    // UG pairs per row: sorted by x, consecutive pairs, inclusive span = exit - entrance + 1
    const ugs = P.items.filter(b => PLC_UG.includes(b.cls)), rows = new Map();
    ugs.forEach(b => { if (!rows.has(b.y)) rows.set(b.y, []); rows.get(b.y).push(b) });
    let maxSpan = 0, pairs = 0;
    for (const xs of rows.values()) { xs.sort((a, b) => a.x - b.x); for (let i = 0; i + 1 < xs.length; i += 2) { pairs++; maxSpan = Math.max(maxSpan, xs[i + 1].x - xs[i].x + 1) } }
    Object.assign(row, {
      ov: ov.ov, seamBad: ov.seamBad, pfOk: ov.ok, twoOv: two.ov, twoSeam: two.seamBad, w: P.w, h: P.h,
      machines: mach.length, mx: x0, inOk, inN, heads: heapItems.join(' '), flowItems: flows(k).map(f => f.item).sort().join(' '),
      sink: !!sink, collOk, collN, pairs, maxSpan, maxApart: def(PLC_UG[mk]).maxApart, memo: B2 === P,
      W: A.W.map(p => p.row).join(','), E: A.E.map(p => p.row).join(','), outRow: A.out.row,
    });
    out.push(row);
  }
  return out;
}, cases);
for (const row of r) {
  console.log(JSON.stringify(row));
  const tag = `${row.name} k=${row.k}`;
  if (!row.ok) { check(row.name === 'Refinery' && row.k === 2 && /overflow/.test(row.why), `${tag} refused: ${row.why}`); continue }
  check(row.pfOk && row.ov === 0 && row.seamBad === 0, `${tag} single column ov ${row.ov} seam ${row.seamBad}`);
  check(row.twoOv === 0 && row.twoSeam === 0, `${tag} two columns at gx 0,1 ov ${row.twoOv} seam ${row.twoSeam}`);
  check(row.machines === 2 && row.inOk === row.inN, `${tag} machines ${row.machines}, input ports with a belt pointing in ${row.inOk}/${row.inN}`);
  check(row.heads === row.flowItems, `${tag} one source container per input item (${row.heads})`);
  check(row.sink && row.collOk, `${tag} collector north to the sink container (${row.collN} belts)`);
  check(row.maxSpan <= row.maxApart, `${tag} UG pairs ${row.pairs}, max inclusive span ${row.maxSpan} <= maxApart ${row.maxApart}`);
  check(row.memo, `${tag} memo returns the same object`);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// H6b horizontal (zoned) normal docks, page. Run: node tests/bl_dockh.mjs   Exit 1 on FAIL or page error.
// Nickel Plates 480 (R=4, 1 container/side) and 720 (R=6, 2 containers/side), Large Container, zones engine and Auto. Cases in=nrm, out=nrm, in+out=nrm.
// Per case: L.bl.zoned, placerTile ok, ov 0, span 0, noBuild false, BPO_Dock count == containers per side, every in container has rot-0 belts on its lane rows (x-1), every out container rot-0 belts east of it, all cells x>=0.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof blTop === 'function' && typeof pfCompose === 'function' && typeof placerTile === 'function' && typeof noBuild === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const cases = [['Nickel Plates', 480], ['Nickel Plates', 720]];
const docks = {in: {in: 'nrm', out: null}, out: {in: null, out: 'nrm'}, both: {in: 'nrm', out: 'nrm'}};
for (const [name, rate] of cases) for (const dk of Object.keys(docks)) for (const eng of ['zones', 'auto']) {
  const tag = `${name} ${rate} ${dk} ${eng}`;
  const r = await pg.evaluate(([name, rate, dock, eng]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const o = {dock, box: 'DAT_Container_2'};
    if (eng === 'zones') o.eng = 'zones';
    const L = pfCompose(P, it, 1, 0, o);
    if (!L.ok) return {refused: L.why};
    if (!L.bl || !L.bl.zoned) return {notZoned: L.note && L.note[0]};
    const T = placerTile(L, placerBk());
    if (!T.ok) return {tileFail: String(T.why).slice(0, 200), ov: T.ov, span: T.span, zoned: true, rows: L.bl.r};
    const belt = (x, y) => T.ms.find(q => PLC_BELT.includes(q.cls) && q.x === x && q.y === y);
    const ins = T.ms.filter(q => q.dk === 'in'), outs = T.ms.filter(q => q.dk === 'out');
    const inBad = ins.filter(q => ![q.y + 1, q.y + 2].every(y => { const b = belt(q.x - 1, y); return b && b.rot === 0 })).map(q => q.x + ',' + q.y);
    const outBad = outs.filter(q => ![[q.y + 1, 0], [q.y + 2, 1]].every(([y, dx]) => { const b = belt(q.x + dim(q).w + dx, y); return b && b.rot === 0 })).map(q => q.x + ',' + q.y);
    const dockN = T.blocks.filter(b => b.cls === plcCls('BPO_Dock')).length;
    const minX = Math.min(...T.ms.map(q => q.x), ...T.blocks.map(b => b.x * 16));
    return {zoned: true, rows: L.bl.r, M: L.bl.M, blocks: T.blocks.length, ov: T.ov, span: T.span, noBuild: noBuild(T.ms.filter(isM).map(mItem)),
      inN: ins.length, outN: outs.length, dockN, inBad, outBad, minX, note: L.note[0], tileBlocks: T.blocks.length};
  }, [name, rate, docks[dk], eng]);
  console.log(tag + ': ' + JSON.stringify(r));
  if (r.refused) { check(false, tag + ' refused (' + r.refused + ')'); continue }
  if (r.notZoned) { check(false, tag + ' not zoned (' + r.notZoned + ')'); continue }
  if (r.tileFail) { check(false, tag + ' placerTile (' + r.tileFail + ') ov ' + r.ov + ' span ' + r.span); continue }
  const wantIn = dk === 'out' ? 0 : (rate === 480 ? 1 : 2), wantOut = dk === 'in' ? 0 : (rate === 480 ? 1 : 2);
  check(r.ov === 0 && r.span === 0, tag + ' ov 0 span 0 (ov ' + r.ov + ', span ' + r.span + ')');
  check(!r.noBuild, tag + ' noBuild false');
  check(r.inN === wantIn && r.outN === wantOut, tag + ' containers in/out ' + r.inN + '/' + r.outN + ' (want ' + wantIn + '/' + wantOut + ')');
  check(r.dockN === r.inN + r.outN, tag + ' BPO_Dock count ' + r.dockN + ' == containers ' + (r.inN + r.outN));
  check(!r.inBad.length, tag + ' input lanes (' + r.inBad.join(' ') + ')');
  check(!r.outBad.length, tag + ' output lanes (' + r.outBad.join(' ') + ')');
  check(r.minX >= 0, tag + ' all x >= 0 (min ' + r.minX + ')');
}
// H6c industrial input (BPO_Dock_2 west of block 0, 8-lane asm transposed, one lane per row). Nickel 480 and 720, zones and Auto.
for (const [name, rate] of cases) for (const eng of ['zones', 'auto']) {
  const tag = `${name} ${rate} ind ${eng}`;
  const r = await pg.evaluate(([name, rate, eng]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const o = {dock: {in: 'ind', out: null}, box: 'DAT_Container_2'};
    if (eng === 'zones') o.eng = 'zones';
    const L = pfCompose(P, it, 1, 0, o);
    if (!L.ok) return {refused: L.why};
    if (!L.bl || !L.bl.zoned) return {notZoned: L.note && L.note[0]};
    const T = placerTile(L, placerBk());
    if (!T.ok) return {tileFail: String(T.why).slice(0, 200), ov: T.ov, span: T.span};
    const occ = new Map(), DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], isB = b => PLC_BELT.includes(b.cls) || PLC_SPL.includes(b.cls);
    for (const b of T.ms) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) occ.set(x + ',' + y, b) }
    const MX = 30 + 16 * 3;   // IZ manifold column after the x shift (block -3 -> 48 cells)
    // underground pairs (placer wall hop): an entrance jumps to the next UG cell along its rot (<=12 cells), then steps on
    const isUG = b => !!b && /UndergroundBelt/.test(b.cls);
    const flood = (x, y) => { let jumped = false; for (let n = 0; n < 400; n++) { if (x === MX && occ.get(x + ',' + y) && isB(occ.get(x + ',' + y))) return y; const b = occ.get(x + ',' + y); if (!b || !(isB(b) || isUG(b))) return null; const [dx, dy] = DIR[b.rot];
      if (isUG(b) && !jumped) { let k = 1; while (k <= 12 && !isUG(occ.get((x + dx * k) + ',' + (y + dy * k)))) k++; if (k > 12) return null; if (dx && Math.sign(MX - x) === dx && Math.abs(MX - x) <= Math.abs(dx * k)) return y; x += dx * k; y += dy * k; jumped = true; continue }
      jumped = false; x += dx; y += dy } return null };
    const lanes = T.ms.filter(q => q.dk === 'ie').map(q => [q.x, q.y]);
    const reached = lanes.map(([x, y]) => flood(x, y));
    // H6c strengthened: tail start is u=-3 (x-3); the cell at u=-4 (x-4) must be an asm belt or a container (report what is there)
    const asm = lanes.map(([x, y]) => { const b = occ.get((x - 4) + "," + y); return b ? {cls: b.cls, x: b.x, y: b.y, adj: PLC_BELT.includes(b.cls) || /Container/.test(b.cls)} : null });
    const rows = [...new Set(reached.filter(v => v !== null))].sort((a, b) => a - b);
    const minX = Math.min(...T.ms.map(q => q.x), ...T.blocks.map(b => b.x * 16));
    return {zoned: true, K: L.bl.K, R: L.bl.r[0], rows: L.bl.r, ov: T.ov, span: T.span, noBuild: noBuild(T.ms.filter(isM).map(mItem)),
      dock2: T.blocks.filter(b => b.cls === plcCls('BPO_Dock_2')).length, lanes: lanes.length, reachedRows: rows, laneReach: reached.map(v => v !== null), asmReach: asm, minX};
  }, [name, rate, eng]);
  console.log(tag + ': ' + JSON.stringify(r));
  if (r.refused) { check(false, tag + ' refused (' + r.refused + ')'); continue }
  if (r.notZoned) { check(false, tag + ' not zoned (' + r.notZoned + ')'); continue }
  if (r.tileFail) { check(false, tag + ' placerTile (' + r.tileFail + ') ov ' + r.ov + ' span ' + r.span); continue }
  check(r.ov === 0 && r.span === 0, tag + ' ov 0 span 0 (ov ' + r.ov + ', span ' + r.span + ')');
  check(!r.noBuild, tag + ' noBuild false');
  check(r.dock2 === r.K, tag + ' BPO_Dock_2 count ' + r.dock2 + ' == K ' + r.K);
  check(r.lanes === r.R && r.laneReach.every(Boolean), tag + ' every lane (' + r.lanes + ') floods to an IZ row');
  check(r.reachedRows.length === r.R, tag + ' rows reached ' + r.reachedRows.length + '/' + r.R);
  check(r.asmReach.every(a => a && a.adj), tag + ' u=-4 cell next to tail start is asm belt/container (u=-4: ' + JSON.stringify(r.asmReach) + ')');
  check(r.minX >= 0, tag + ' all x >= 0 (min ' + r.minX + ')');
}
// H6d industrial output (BPO_Dock_2 east of the last FB, transposed asm, lane per row, tails to the dock). Nickel 480 and 720, zones and Auto; out=ind, and in=ind+out=ind.
for (const [name, rate] of cases) for (const eng of ['zones', 'auto']) for (const both of [false, true]) {
  const tag = `${name} ${rate} ${both ? 'in+out ind' : 'out ind'} ${eng}`;
  const r = await pg.evaluate(([name, rate, eng, both]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const o = {dock: {in: both ? 'ind' : null, out: 'ind'}, box: 'DAT_Container_2'};
    if (eng === 'zones') o.eng = 'zones';
    const L = pfCompose(P, it, 1, 0, o);
    if (!L.ok) return {refused: L.why};
    if (!L.bl || !L.bl.zoned) return {notZoned: L.note && L.note[0]};
    const T = placerTile(L, placerBk());
    if (!T.ok) return {tileFail: String(T.why).slice(0, 200), ov: T.ov, span: T.span};
    const occ = new Map(), DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], isB = b => PLC_BELT.includes(b.cls) || PLC_SPL.includes(b.cls);
    for (const b of T.ms) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) occ.set(x + ',' + y, b) }
    // forward walk along belt rots from a lane cell; returns the last belt x reached
    const fwd = (x, y) => { let last = x; for (let n = 0; n < 400; n++) { const b = occ.get(x + ',' + y); if (!b || !isB(b)) break; last = x; const [dx, dy] = DIR[b.rot]; x += dx; y += dy } return last };
    const outs = T.ms.filter(q => q.dk === 'oe');
    const dock2 = T.blocks.filter(b => b.cls === plcCls('BPO_Dock_2'));
    const dockX = dock2.length ? Math.max(...dock2.map(b => b.x * 16)) : null;   // output dock is the east-most one
    const reached = outs.map(q => fwd(q.x, q.y) === dockX);
    const minX = Math.min(...T.ms.map(q => q.x), ...T.blocks.map(b => b.x * 16));
    return {zoned: true, K: L.bl.K, rowsOut: L.bl.r[L.bl.r.length - 1], outRows: outs.length, dockX, reached, dock2: dock2.length, ov: T.ov, span: T.span, noBuild: noBuild(T.ms.filter(isM).map(mItem)), minX};
  }, [name, rate, eng, both]);
  console.log(tag + ': ' + JSON.stringify(r));
  if (r.refused) { check(false, tag + ' refused (' + r.refused + ')'); continue }
  if (r.notZoned) { check(false, tag + ' not zoned (' + r.notZoned + ')'); continue }
  if (r.tileFail) { check(false, tag + ' placerTile (' + r.tileFail + ') ov ' + r.ov + ' span ' + r.span); continue }
  check(r.ov === 0 && r.span === 0, tag + ' ov 0 span 0 (ov ' + r.ov + ', span ' + r.span + ')');
  check(!r.noBuild, tag + ' noBuild false');
  check(r.dock2 === r.K * (both ? 2 : 1), tag + ' BPO_Dock_2 count ' + r.dock2 + ' == K ' + r.K + (both ? ' x2' : ''));
  check(r.outRows === r.rowsOut, tag + ' output lane rows ' + r.outRows + ' == rows ' + r.rowsOut);
  check(r.reached.every(Boolean), tag + ' every output row reaches the dock (dockX ' + r.dockX + ', reached ' + r.reached.filter(Boolean).length + '/' + r.reached.length + ')');
  check(r.minX >= 0, tag + ' all x >= 0 (min ' + r.minX + ')');
}
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

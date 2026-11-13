// BL Z1 zone geometry gates (page). Run: node tests/bl_zone.mjs   Exit 1 on FAIL or page error.
// Refinery rows R=1..5 at Large Container (IZ at Y0, FB at Y30, OZ at Y60, one canvas): cell clash 0; machines == R*M; every input column ends in exactly one manifold; every ex column ends in exactly one OZ container port; no horizontal belt on y%30 in {29,0}; placerCut ok, ov 0, span 0; blFlip of the FB keeps clash 0 and the machine count.
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
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof blZL === 'function' && typeof blFB === 'function' && typeof blIZ === 'function' && typeof blOZ === 'function' && typeof blFlip === 'function' && typeof placerCut === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const res = await pg.evaluate(() => {
  const mc = blMachine('DAT_Refinery');
  const CB = 'DAT_Container_2', MK = 1, SM = 1, REC = 'ITEM_Silica>ITEM_SiliconWafers';
  const cells = items => {   // cell -> item, and the clash count
    const occ = new Map(); let clash = 0;
    for (const b of items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) clash++; else occ.set(k, b) } }
    return {occ, clash};
  };
  const out = [];
  for (let R = 1; R <= 5; R++) {
    const L = blZL(R), g0 = Math.floor(R / 2), X0 = L.PS[R - 1] + (mc.xin === 0 ? 1 : 0), rx = L.c === 1 ? 4 : g0 + 4;
    const M = Math.floor((30 - X0 - rx) / mc.w);
    const fb = blFB({mk: MK, spMk: SM, cls: 'DAT_Refinery', rec: REC, mc, M, R, cx: 0, Y: 30});
    const iz = blIZ({mk: MK, bx: CB, cx: 0, Y: 0, R, raw: 'ITEM_Silica'});
    const oz = blOZ({mk: MK, bx: CB, Y: 60, R, E0: fb.E0});
    const g = {R, M, ok: fb.ok && iz.ok && oz.ok, why: fb.why || null, errs: []};
    if (!g.ok) { out.push(g); continue }
    const all = [...iz.items, ...fb.items, ...oz.items];
    const {occ, clash} = cells(all);
    g.clash = clash;
    g.machines = all.filter(b => b.cls === 'DAT_Refinery').length;
    g.want = R * M;
    g.wallH = all.filter(b => PLC_BELT.includes(b.cls) && (b.rot === 0 || b.rot === 2) && (b.y % 30 === 0 || b.y % 30 === 29)).length;
    g.inOk = L.PS.every((p, _) => true) && fb.yIn.every((yi, j) => {
      const col = L.PS[R - 1 - j], m = occ.get(col + ',' + yi), up = occ.get(col + ',' + (yi - 1));
      return !!m && ((PLC_BELT.includes(m.cls) && m.rot === 0) || PLC_SPL.includes(m.cls)) && !!up && up.rot === 1;
    });
    g.exOk = fb.exCols.every(ex => {
      const down = occ.get(ex + ',' + 61), cover = oz.items.filter(b => b.cls === CB && ex >= b.x && ex <= b.x + 3);
      return !!down && down.rot === 1 && cover.length === 1;
    });
    const w = Math.max(...all.map(b => b.x + dim(b).w)) + 1;
    const cut = placerCut({items: all, w, h: 90, pitch: 1, lanes: 1, tall: true, mk: MK}, plcCls('BPO_Station_02'));
    g.cut = {ok: cut.ok, ov: cut.ov, span: cut.span, why: cut.why || null, ug: cut.ug};
    const mcF = blMachine('DAT_Refinery', 1, true);
    const fl = blFlip(fb.items, 29, mcF);
    g.flip = {ok: fl.ok, clash: fl.ok ? cells(fl.items).clash : null, machines: fl.ok ? fl.items.filter(b => b.cls === 'DAT_Refinery').length : null, spl2: fl.ok ? fl.items.filter(b => PLC_SPL.includes(b.cls) && b.rot === 2).length : null};
    out.push(g);
  }
  return out;
});
for (const g of res) {
  console.log(`R=${g.R} M=${g.M} ${JSON.stringify({clash: g.clash, machines: g.machines, want: g.want, wallH: g.wallH, inOk: g.inOk, exOk: g.exOk, cut: g.cut, flip: g.flip})}`);
  check(g.ok, `R=${g.R} zones built (${g.why || 'ok'})`);
  if (!g.ok) continue;
  check(g.clash === 0, `R=${g.R} cell clash 0`);
  check(g.machines === g.want, `R=${g.R} machines == R*M (${g.machines}/${g.want})`);
  check(g.wallH === 0, `R=${g.R} no horizontal belt on wall rows`);
  check(g.inOk, `R=${g.R} every input column ends in exactly one manifold`);
  check(g.exOk, `R=${g.R} every ex column ends in exactly one OZ container port`);
  check(g.cut.ok && g.cut.ov === 0 && g.cut.span === 0, `R=${g.R} placerCut ok, ov 0, span 0 ${g.cut.why || ''}`);
  check(g.flip.ok && g.flip.clash === 0 && g.flip.machines === g.want, `R=${g.R} blFlip clash 0, machines kept`);
}
// H1: horizontal zones (blHIZ west | blHFB east, one 30x30 block), Refinery, Large Container, M=6, R=1..6
const h1 = await pg.evaluate(() => {
  const mc = blMachine('DAT_Refinery'), CB = 'DAT_Container_2', MK = 1, SM = 1, REC = 'ITEM_Silica>ITEM_SiliconWafers', P = mc.h + 2, M = 6, X0 = 31 + (mc.xin === 0 ? 1 : 0);
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], isB = b => PLC_BELT.includes(b.cls) || PLC_SPL.includes(b.cls);
  const out = [];
  for (let R = 1; R <= 6; R++) {
    const y0 = R * P === 30 ? 0 : 1, yR = Array.from({length: R}, (_, j) => y0 + P * j);
    const iz = blHIZ({mk: MK, bx: CB, raw: 'ITEM_Silica', R, P, y0, Y: 0});
    const fb = blHFB({mk: MK, spMk: SM, cls: 'DAT_Refinery', rec: REC, mc, M, R, Y: 0, y0, bx: CB});
    const g = {R, y0, yIn: yR.join(','), ok: !!(iz.ok && fb.ok), why: iz.why || fb.why || null, fails: []};
    out.push(g);
    if (!g.ok) continue;
    const all = [...iz.items, ...fb.items], occ = new Map();
    let clash = 0;
    for (const b of all) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) clash++; else occ.set(k, b) } }
    g.clash = clash;
    g.machines = all.filter(b => b.cls === 'DAT_Refinery').length;
    g.belts = all.filter(b => PLC_BELT.includes(b.cls)).length;
    g.bpm = +(g.belts / Math.max(1, g.machines)).toFixed(2);
    g.wallBad = all.filter(b => PLC_BELT.includes(b.cls) && [29, 0, 1].includes(b.x % 30) && b.rot !== 0).length;
    g.wallNonBelt = all.filter(b => (b.y % 30 === 0 || b.y % 30 === 29) && !isB(b)).length;
    g.wallRows = [...new Set(all.filter(b => isB(b) && (b.y % 30 === 0 || b.y % 30 === 29)).map(b => b.y))].sort((a, b) => a - b);
    g.manifoldStarts = all.filter(b => b.x === 30 && PLC_BELT.includes(b.cls) && b.rot === 0 && yR.includes(b.y)).length;
    const eOut = new Set(), wOut = new Set();
    for (const b of all) if (b.cls === CB) for (const p of portsOf(b)) { const c = (p.x + p.nx) + ',' + (p.y + p.ny); if (p.f === 'E') eOut.add(c); if (p.f === 'W') wOut.add(c) }
    const flood = (x, y, stop) => {   // follow belt rot from (x,y); path of cells visited
      const path = [];
      for (let n = 0; n < 400; n++) {
        path.push(x + ',' + y);
        if (stop(x, y)) return {hit: true, path};
        const b = occ.get(x + ',' + y);
        if (!b || !isB(b)) return {hit: false, path};
        const [dx, dy] = DIR[b.rot]; x += dx; y += dy;
      }
      return {hit: false, path};
    };
    g.inRows = iz.py.map((py, j) => { const r = flood(iz.xp, py, x => x === 30); return r.hit && r.path[r.path.length - 1] === '30,' + yR[j] && eOut.has(iz.xp + ',' + py) });
    g.outRows = fb.py.map((py, j) => { const r = flood(X0 + mc.xout, fb.yOut[j], (x, y) => { const b = occ.get(x + ',' + y); return !!b && b.cls === CB }); return r.hit && r.path[r.path.length - 2] === '54,' + py && wOut.has('54,' + py) });
    g.uniquePorts = new Set(iz.py).size === R && new Set(fb.py).size === R;
    if (clash) g.fails.push('clash ' + clash);
    if (g.machines !== R * M) g.fails.push('machines ' + g.machines + '/' + R * M);
    if (g.wallBad) g.fails.push('non-rot0 belt on wall column');
    if (g.wallNonBelt) g.fails.push('non-belt on wall row');
    if (g.manifoldStarts !== R) g.fails.push('manifold starts ' + g.manifoldStarts);
    if (!g.inRows.every(Boolean)) g.fails.push('input rows ' + g.inRows.map(Number).join(''));
    if (!g.outRows.every(Boolean)) g.fails.push('output rows ' + g.outRows.map(Number).join(''));
    if (!g.uniquePorts) g.fails.push('port reused');
    if (R === 6) { if (yR.join() !== '0,5,10,15,20,25' || fb.yOut[5] !== 29) g.fails.push('R6 rows ' + yR.join() + ' last collector ' + fb.yOut[5]); if (g.wallRows.join() !== '0,29') g.fails.push('R6 wall rows used ' + g.wallRows.join()) }
    g.ex = [...fb.exCols];
  }
  return out;
});
for (const g of h1) {
  console.log('H1 ' + JSON.stringify(g));
  check(g.ok, `H1 R=${g.R} built (${g.why || 'ok'})`);
  if (!g.ok) continue;
  check(!g.fails.length, `H1 R=${g.R} gates (${g.fails.join('; ') || 'all'})`);
}
// Z3: S1 Nickel Plates 480 through pfCompose (zoned tower), tiled with placerTile
const z = await pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Nickel Plates');
  const P = plan(it, 480, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfCompose(P, it, 1, 0, {box: 'DAT_Container_2'});   // zones need the Large Container (Z3 condition)
  if (!L.ok) return {refused: L.why};
  const T = placerTile(L, placerBk());
  const bl = L.bl || {};
  return {note: String(L.note[0]), zoned: !!bl.zoned, rows: bl.r, M: bl.M, machines: L.stat.machines, belts: L.stat.belts, bpm: L.stat.belts / L.stat.machines,
    tileOk: T.ok, tileWhy: T.ok ? null : String(T.why).slice(0, 160), ov: T.ov, span: T.span, blocks: T.blocks ? T.blocks.map(b => [b.cls, b.x, b.y]) : null, cols: T.cols, tileRows: T.rows, ug: T.ug};
});
console.log('Z3 S1 Nickel Plates 480: ' + JSON.stringify(z));
if (z.refused) { console.log('FAIL Nickel 480 refused: ' + z.refused); fails++ }
else {
  check(z.zoned, 'Nickel 480 uses the zoned tower');
  check(z.machines === 24, 'Nickel 480 24 machines (' + z.machines + ')');
  check(z.rows && z.rows[0] === 4, 'Nickel 480 rows 4 (' + z.rows + ')');
  check(z.tileOk, 'Nickel 480 placerTile ok' + (z.tileOk ? '' : ' (' + z.tileWhy + ')'));
  check(z.tileOk && z.ov === 0 && z.span === 0, 'Nickel 480 tile ov 0, span 0');
  check(z.tileOk && z.blocks && z.blocks.length === 3, 'Nickel 480 3 blocks');
}
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

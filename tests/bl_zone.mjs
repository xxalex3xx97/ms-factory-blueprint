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
// Z3 (H3): S1 Nickel Plates 480 (R=4) and 720 (R=6) through pfCompose (zoned single-stage tower: IZ west | FB east, 2 blocks), tiled with placerTile. Connectivity = rows whose input or output flood fails.
for (const [rate, rows, mach] of [[480, 4, 24], [720, 6, 36]]) {
  const z = await pg.evaluate(rate => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Nickel Plates');
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = pfCompose(P, it, 1, 0, {box: 'DAT_Container_2'});   // zones need the Large Container (Z3 condition)
    if (!L.ok) return {refused: L.why};
    const T = placerTile(L, placerBk());
    const bl = L.bl || {};
    // connectivity: each IZ container port with a belt must flood to x=30; each refinery output must flood to a container
    const occ = new Map(), DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], isB = b => PLC_BELT.includes(b.cls) || PLC_SPL.includes(b.cls);
    for (const b of L.items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) occ.set(x + ',' + y, b) }
    const flood = (x, y, stop) => {
      for (let n = 0; n < 400; n++) {
        if (stop(x, y)) return true;
        const b = occ.get(x + ',' + y);
        if (!b || !isB(b)) return false;
        const [dx, dy] = DIR[b.rot]; x += dx; y += dy;
      }
      return false;
    };
    let connFail = 0, inOk = 0, outOk = 0;
    for (const b of L.items) if (b.cls === 'DAT_Container_2' && b.ct) for (const p of portsOf(b)) if (p.f === 'E' && occ.get((p.x + p.nx) + ',' + (p.y + p.ny)) && isB(occ.get((p.x + p.nx) + ',' + (p.y + p.ny)))) {
      if (flood(p.x + p.nx, p.y + p.ny, x => x === 30)) inOk++; else connFail++;
    }
    for (const b of L.items) if (b.cls === 'DAT_Refinery') {
      if (flood(b.x + 1, b.y + 3, (x, y) => { const c = occ.get(x + ',' + y); return !!c && c.cls === 'DAT_Container_2' })) outOk++; else connFail++;
    }
    return {note: String(L.note[0]), zoned: !!bl.zoned, rows: bl.r, M: bl.M, stacks: bl.stacks, machines: L.stat.machines, belts: L.stat.belts, bpm: +(L.stat.belts / L.stat.machines).toFixed(2), connFail, inOk, outOk,
      tileOk: T.ok, tileWhy: T.ok ? null : String(T.why).slice(0, 160), ov: T.ov, span: T.span, blocks: T.blocks ? T.blocks.map(b => [b.cls, b.x, b.y]) : null, cols: T.cols, tileRows: T.rows, ug: T.ug};
  }, rate);
  console.log(`Z3 S1 Nickel Plates ${rate}: ` + JSON.stringify(z));
  if (z.refused) { console.log(`FAIL Nickel ${rate} refused: ` + z.refused); fails++; continue }
  check(z.zoned, `Nickel ${rate} uses the zoned tower`);
  check(z.machines === mach, `Nickel ${rate} ${mach} machines (${z.machines})`);
  check(z.rows && z.rows[0] === rows, `Nickel ${rate} rows ${rows} (${z.rows})`);
  check(z.connFail === 0, `Nickel ${rate} connectivity 0 (fail ${z.connFail}, in ${z.inOk}, out ${z.outOk})`);
  check(z.tileOk, `Nickel ${rate} placerTile ok` + (z.tileOk ? '' : ' (' + z.tileWhy + ')'));
  check(z.tileOk && z.ov === 0 && z.span === 0, `Nickel ${rate} tile ov 0, span 0`);
  check(z.tileOk && z.blocks && z.blocks.length === 2, `Nickel ${rate} 2 blocks`);
}
// H4 geometry: 2-stage zone (IZ block 0 | FB_0 block 1 | FB_1 block 2), stage pairs (R=4 -> 6) and (R=6 -> 1). Cell clash 0; every input row floods to its manifold; every stage output row floods to its sink W port; blHIN rows flood from the sink E port to the next manifold; rot-0 belts only on x%30 in {29,0,1}.
const h4 = await pg.evaluate(() => {
  const mc = blMachine('DAT_Refinery'), CB = 'DAT_Container_2', MK = 1, SM = 1, REC = 'ITEM_Silica>ITEM_SiliconWafers', w = mc.w, P = mc.h + 2;
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], isB = b => PLC_BELT.includes(b.cls) || PLC_SPL.includes(b.cls);
  const xo = mc.xin === 0 ? 1 : 0;   // manifold start offset inside a block (blHFB X0 = B+1+xo)
  const out = [];
  for (const [R0, R1] of [[4, 6], [6, 1]]) {
    const y0a = R0 * P === 30 ? 0 : 1, y0b = R1 * P === 30 ? 0 : 1, yA = Array.from({length: R0}, (_, j) => y0a + P * j), yB = Array.from({length: R1}, (_, j) => y0b + P * j);
    const M0 = blRW(R0, w, R1).M, M1 = blRW(R1, w).M, c0 = Math.ceil(Math.max(R0, R1) / 4);
    const g = {R0, R1, M0, M1, fails: []};
    out.push(g);
    if (M0 < 1 || M1 < 1) { g.fails.push('M<1'); continue }
    const iz = blHIZ({mk: MK, bx: CB, raw: 'ITEM_Silica', R: R0, P, y0: y0a, Y: 0});
    const f0 = blHFB({mk: MK, spMk: SM, cls: 'DAT_Refinery', rec: REC, mc, M: M0, R: R0, Y: 0, y0: y0a, bx: CB, B: 30, nextR: R1, c: c0});
    if (!f0.ok) { g.fails.push('f0 ' + f0.why); continue }
    const hin = blHIN({mk: MK, bx: CB, xc0: f0.xc0, ya: f0.ya, c: f0.c, R: R1, P, y0: y0b, Y: 0, B: 30});
    const f1 = blHFB({mk: MK, spMk: SM, cls: 'DAT_Refinery', rec: REC, mc, M: M1, R: R1, Y: 0, y0: y0b, bx: CB, B: 60});
    if (!f1.ok) { g.fails.push('f1 ' + f1.why); continue }
    const all = [...iz.items, ...f0.items, ...hin.items, ...f1.items], occ = new Map();
    let clash = 0;
    for (const b of all) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) clash++; else occ.set(k, b) } }
    g.clash = clash;
    g.machines = all.filter(b => b.cls === 'DAT_Refinery').length;
    g.want = R0 * M0 + R1 * M1;
    g.wallBad = all.filter(b => PLC_BELT.includes(b.cls) && [29, 0, 1].includes(b.x % 30) && b.rot !== 0).length;
    const flood = (x, y, stop) => {
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
    const cont = (x, y) => { const b = occ.get(x + ',' + y); return !!b && b.cls === CB };
    g.inA = iz.py.map((py, j) => { const r = flood(iz.xp, py, x => x === 30); return r.hit && r.path[r.path.length - 1] === '30,' + yA[j] });
    g.outA = f0.py.map((py, j) => { const r = flood(31 + xo + mc.xout, f0.yOut[j], cont); return r.hit && r.path[r.path.length - 2] === (f0.xc0 - 1) + ',' + py });
    g.inB = hin.py.map((py, j) => { const r = flood(f0.xc0 + 4, py, x => x === 60); return r.hit && r.path[r.path.length - 1] === '60,' + yB[j] });
    g.outB = f1.py.map((py, j) => { const r = flood(61 + xo + mc.xout, f1.yOut[j], cont); return r.hit && r.path[r.path.length - 2] === '84,' + py });
    if (clash) g.fails.push('clash ' + clash);
    if (g.machines !== g.want) g.fails.push('machines ' + g.machines + '/' + g.want);
    if (g.wallBad) g.fails.push('non-rot0 belt on wall column ' + g.wallBad);
    if (!g.inA.every(Boolean)) g.fails.push('stage0 input rows ' + g.inA.map(Number).join(''));
    if (!g.outA.every(Boolean)) g.fails.push('stage0 output rows ' + g.outA.map(Number).join(''));
    if (!g.inB.every(Boolean)) g.fails.push('stage1 in rows ' + g.inB.map(Number).join(''));
    if (!g.outB.every(Boolean)) g.fails.push('stage1 output rows ' + g.outB.map(Number).join(''));
  }
  return out;
});
for (const g of h4) {
  console.log('H4 ' + JSON.stringify(g));
  check(!g.fails.length, `H4 R${g.R0}->R${g.R1} gates (${g.fails.join('; ') || 'all'})`);
}
// H4 chains through pfCompose (zoned, Large Container): discover 2-stage (CH2) and 3-stage (CH3) single-input chains at 120 and 1000/min
const disc = await pg.evaluate(() => {
  const found = [];
  for (const rate of [120, 1000]) for (const want of [2, 3]) {
    let n = 0, name = null;
    for (const it of plnBy(false).keys()) {
      if (++n > 400) break;
      try {
        const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
        const T = P.nodes[it];
        if (!T || !T.rec || T.rec.i.some(([x]) => x === it)) continue;
        const Z = pfFactTree(P, it, 1);
        if (Z.ok === false || Z.nodes.length !== want) continue;
        const L = pfCompose(P, it, 1, 0, {box: 'DAT_Container_2'});
        if (L.ok && L.bl && L.bl.zoned) { name = plnNm(it); break }
      } catch (e) {}
    }
    found.push({rate, want, name});
  }
  return found;
});
console.log('H4 discovered chains: ' + JSON.stringify(disc));
for (const d of disc) {
  if (!d.name) { console.log(`H4 no zoned ${d.want}-stage chain at ${d.rate}/min`); continue }
  const z = await pg.evaluate(([name, rate]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = pfCompose(P, it, 1, 0, {box: 'DAT_Container_2'});
    const O = pfCompose(P, it, 1, 0, {box: 'DAT_Container_2', eng: 'tower'});
    if (!L.ok) return {refused: L.why};
    const T = placerTile(L, placerBk());
    const bl = L.bl, occ = new Map(), DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], isB = b => PLC_BELT.includes(b.cls) || PLC_SPL.includes(b.cls);
    const isM = b => !isB(b) && !PLC_UG.includes(b.cls) && !b.cls.startsWith('DAT_Container');
    for (const b of L.items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) occ.set(x + ',' + y, b) }
    const flood = (x, y) => { for (let n = 0; n < 600; n++) { const c = occ.get(x + ',' + y); if (!c) return false; if (c.cls.startsWith('DAT_Container')) return true; if (!isB(c)) return false; const [dx, dy] = DIR[c.rot]; x += dx; y += dy } return false };
    let outOk = 0, outFail = 0, inOk = 0, inFail = 0;
    for (const b of L.items) if (isM(b)) {
      for (const p of portsOf(b)) {
        const cx = p.x + p.nx, cy = p.y + p.ny, c = occ.get(cx + ',' + cy);
        const isIn = p.nx === 0 && p.ny === -1 && p.dir !== 'out' && !(b.off || []).includes(p.key), isOut = p.nx === 0 && p.ny === 1 && p.dir !== 'in';   // machine N face = input (unless toggled off), S face = output (blMachine rule)
        if (isOut) { if (c && isB(c) && flood(cx, cy)) outOk++; else outFail++ }
        else if (isIn) { if (c && isB(c)) inOk++; else inFail++ }
      }
    }
    const want = bl.r.reduce((a, v, s) => a + v * bl.M[s], 0);
    return {rate, name, stages: bl.n.length, K: bl.K, rows: bl.r, M: bl.M, zoned: !!bl.zoned, machines: L.stat.machines, want, belts: L.stat.belts, bpm: +(L.stat.belts / L.stat.machines).toFixed(2), area: L.w * L.h, w: L.w, h: L.h, makes: +L.makes.toFixed(1), request: rate, blocks: L.stat.blocks, blocksWant: bl.K * (bl.n.length + 1), outFail, inFail, outOk, inOk, tileOk: T.ok, tileWhy: T.ok ? null : String(T.why).slice(0, 160), ov: T.ov, span: T.span, tileBlocks: T.blocks ? T.blocks.length : null, oldBpm: O.ok ? +(O.stat.belts / O.stat.machines).toFixed(2) : null, oldArea: O.ok ? O.w * O.h : null, oldBlocks: O.ok ? O.stat.blocks : null};
  }, [d.name, d.rate]);
  console.log(`H4 chain ${d.want}-stage ${d.rate}/min: ` + JSON.stringify(z));
  if (z.refused) { check(false, `H4 ${d.name} ${d.rate} refused: ${z.refused}`); continue }
  check(z.zoned, `H4 ${d.name} ${d.rate} uses the zoned path`);
  check(z.machines === z.want, `H4 ${d.name} ${d.rate} machines == sum(r*M) (${z.machines}/${z.want})`);
  check(z.blocks === z.blocksWant, `H4 ${d.name} ${d.rate} stat.blocks == K*${z.stages + 1} (${z.blocks}/${z.blocksWant})`);
  check(z.makes >= z.request, `H4 ${d.name} ${d.rate} makes ${z.makes} >= ${z.request}`);
  check(z.outFail === 0 && z.inFail === 0, `H4 ${d.name} ${d.rate} connectivity (out ok ${z.outOk} fail ${z.outFail}, in ok ${z.inOk} fail ${z.inFail})`);
  check(z.tileOk, `H4 ${d.name} ${d.rate} placerTile ok` + (z.tileOk ? '' : ' (' + z.tileWhy + ')'));
  check(z.tileOk && z.ov === 0 && z.span === 0, `H4 ${d.name} ${d.rate} tile ov 0, span 0`);
}
// H6a: blHA explicit py[] (non-adjacent containers, R=6). Port rows are the given ones; dir = sign of the row move; columns unique within each direction group.
{
  const yRow = [0, 5, 10, 15, 20, 25], ya = 6, py = [6, 7, 8, 14, 15, 16];
  const A = await pg.evaluate(([yRow, ya, py]) => blHA(yRow, 2, ya, 'in', 28 - 3, py), [yRow, ya, py]);
  const dirOk = yRow.every((y, i) => A.dir[i] === Math.sign(y - py[i]));
  const colsOk = [-1, 1].every(d => { const cs = yRow.map((_, i) => i).filter(i => A.dir[i] === d).map(i => A.col[i]); return new Set(cs).size === cs.length });
  const g = {py: A.py.join(','), dir: A.dir.join(','), col: A.col.join(',')};
  console.log('H6a ' + JSON.stringify(g));
  check(A.py.join() === py.join(), `H6a blHA explicit py kept (${A.py.join()})`);
  check(dirOk && colsOk, 'H6a blHA dir sign and unique columns per group');
}
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

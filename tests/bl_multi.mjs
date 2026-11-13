// BL8 two-input gates (page, ?engine=bl). Run: node tests/bl_multi.mjs   Exit 1 on FAIL or page error.
// BL8a: blMachine k=2 (Assembler: xin-xinB===2, off 5) and k=1 unchanged; Refinery k=2 refuses; lane stage (Rs 3, M 2, m [2,2,1]): cell clash 0, pfCheck ov 0, connectivity 0, 5 machines, 10 splitters, 10 UG.
import fs from 'fs';
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
await pg.waitForFunction(() => window.__fb && typeof blMachine === 'function' && typeof blStage === 'function' && typeof pfCheck === 'function' && typeof ugPairs === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
// connectivity: tests/bl_top.mjs __conn, boxNoBelt only for containers with an enabled S port
await pg.evaluate(() => {
  window.__conn = items => {
    const occ = new Map();
    for (const b of items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) occ.set(x + ',' + y, b) }
    const isBelt = b => PLC_BELT.includes(b.cls), isUG = b => PLC_UG.includes(b.cls), isSpl = b => PLC_SPL.includes(b.cls), isBox = b => b.cls.startsWith('DAT_Container');
    const pairs = ugPairs(items), partner = new Map();
    pairs.forEach(({u, t}) => { partner.set(u, t); partner.set(t, u) });
    const exitUG = new Set(pairs.map(p => p.t)), entUG = new Set(pairs.map(p => p.u));
    const out = {dangEnd: 0, noSrc: 0, ugUnpaired: 0, boxNoBelt: 0, ex: []};
    const pm = new Map();
    for (const b of items) if (!isBelt(b) && !isUG(b)) pm.set(b, portsOf(b));
    const fed = new Set(), mark = (x, y) => fed.add(x + ',' + y);
    for (const b of items) if (isSpl(b)) { const d = dim(b); for (let x = b.x - 1; x <= b.x + d.w; x++) for (let y = b.y - 1; y <= b.y + d.h; y++) mark(x, y) }
    for (const b of items) {
      if (isBelt(b)) { const [dx, dy] = DIR[b.rot]; mark(b.x + dx, b.y + dy) }
      else if (isUG(b)) { if (entUG.has(b)) { const t = partner.get(b); mark(t.x, t.y) } else if (exitUG.has(b)) { const [dx, dy] = DIR[b.rot]; mark(b.x + dx, b.y + dy) } }
    }
    for (const [b, ps] of pm) for (const p of ps) if (p.en) mark(p.x + p.nx, p.y + p.ny);
    for (const b of items) {
      if (!isBelt(b) && !isUG(b)) continue;
      const pos = b.cls.slice(-4) + '(' + b.x + ',' + b.y + ')';
      if (isUG(b) && !entUG.has(b) && !exitUG.has(b)) { out.ugUnpaired++; out.ex.push('ugUnpaired ' + pos) }
      if (!(isUG(b) && entUG.has(b))) {
        const [dx, dy] = DIR[b.rot], tx = b.x + dx, ty = b.y + dy, Q = occ.get(tx + ',' + ty);
        let ok = !!Q;
        if (Q && !isBelt(Q) && !isUG(Q) && !isSpl(Q)) ok = (pm.get(Q) || []).some(p => p.en && p.x === tx && p.y === ty && p.nx === -dx && p.ny === -dy && p.dir !== 'out');
        if (!ok) { out.dangEnd++; out.ex.push('dangEnd ' + pos) }
      }
      if (!(isUG(b) && exitUG.has(b)) && !fed.has(b.x + ',' + b.y)) { out.noSrc++; out.ex.push('noSrc ' + pos) }
    }
    const emp = items.filter(b => isBox(b) && b.y > 1 && !(b.ct && b.ct[0]));
    const sinkY = emp.length ? Math.max(...emp.map(b => b.y)) : -1;
    for (const b of emp) {
      if (b.y === sinkY) continue;
      const s = pm.get(b).find(p => p.f === 'S' && p.en);
      if (!s) continue;
      const q = occ.get((s.x + s.nx) + ',' + (s.y + s.ny));
      if (!q || !(isBelt(q) || isUG(q) || isSpl(q))) { out.boxNoBelt++; out.ex.push('boxNoBelt (' + b.x + ',' + b.y + ')') }
    }
    return out;
  };
});
// machine ports
const m2 = await pg.evaluate(() => {
  const a = blMachine('DAT_Assembler', 2), r = blMachine('DAT_Refinery', 2), a1 = blMachine('DAT_Assembler');
  return {a, r, a1};
});
console.log('blMachine(DAT_Assembler,2) = ' + JSON.stringify(m2.a));
check(m2.a.ok && m2.a.rot === 0 && m2.a.w === 5 && m2.a.h === 5 && m2.a.xin - m2.a.xinB === 2 && m2.a.off.length === 5, 'blMachine(DAT_Assembler,2): rot 0, 5x5, xin-xinB 2, off 5');
check(m2.r.ok === false, 'blMachine(DAT_Refinery,2) refuses');
check(m2.a1.ok && m2.a1.xin === 1 && m2.a1.xinB === undefined, 'blMachine(DAT_Assembler) k=1 unchanged (xin ' + m2.a1.xin + ')');
// lane stage: LC lane container at (5,1) (W ports out, S ports off), DC direct container at (5,6), sink at Yc
const st = await pg.evaluate(() => {
  const cp = portsOf({cls: 'DAT_Container_2', x: 0, y: 0, rot: 0, off: []});
  const PS = cp.filter(p => p.f === 'S').map(p => p.x).sort((a, b) => a - b).slice(0, 3);
  const PN = cp.filter(p => p.f === 'N').map(p => p.x).sort((a, b) => a - b).slice(0, 3);
  const LCoff = cp.filter(p => p.f === 'S').map(p => p.key);
  const mc = blMachine('DAT_Assembler', 2);
  const S = {mk: 1, spMk: 1, bx: 'DAT_Container_2', cx: 5, Y: 6, mc, cls: 'DAT_Assembler', rec: 'ITEM_A+ITEM_B>ITEM_C', rowsM: [2, 2, 1], PS, PN, first: false, ind: false, item: null, M: 2, lane: {y: 1}};
  const r = blStage(S);
  if (!r.ok) return {fail: r.why};
  const LC = {cls: 'DAT_Container_2', x: 5, y: 1, rot: 0, h: 0, pid: 0, ct: [], off: LCoff};
  const DC = {cls: 'DAT_Container_2', x: 5, y: 6, rot: 0, h: 0, pid: 0, ct: [{item: 'ITEM_A', n: 0, inf: true}]};
  const SK = {cls: 'DAT_Container_2', x: 5, y: r.Yc, rot: 0, h: 0, pid: 0, ct: []};
  const items = [LC, DC, ...r.items, SK];
  const occ = new Map();
  let clash = 0;
  for (const b of items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) clash++; else occ.set(k, b) } }
  const w = Math.max(...items.map(b => b.x + dim(b).w)), h = Math.max(...items.map(b => b.y + dim(b).h));
  const pf = pfCheck({items, w, h, ports: []});
  const conn = window.__conn(items);
  const cnt = c => items.filter(b => b.cls === c).length;
  return {Yc: r.Yc, clash, pfOv: pf.ov, conn, machines: cnt('DAT_Assembler'), spl: items.filter(b => PLC_SPL.includes(b.cls)).length,
    ug: items.filter(b => PLC_UG.includes(b.cls)).length, PS, PN, LCoff, lcW: items.filter(b => b.x === 4).map(b => b.cls.slice(-4) + '@' + b.y + ' r' + b.rot)};
}, null);
if (st.fail) check(false, 'lane stage builds (' + st.fail + ')');
else {
  console.log('stage: Yc ' + st.Yc + ', PS ' + st.PS + ', PN ' + st.PN + ', LC off ' + st.LCoff + ', belts at x=4: ' + st.lcW.join(' '));
  check(st.clash === 0, 'lane stage cell clash 0 (' + st.clash + ')');
  check(st.pfOv === 0, 'lane stage pfCheck ov 0 (' + st.pfOv + ')');
  check(st.conn.dangEnd === 0 && st.conn.noSrc === 0 && st.conn.ugUnpaired === 0 && st.conn.boxNoBelt === 0, 'lane stage connectivity 0 (' + JSON.stringify(st.conn).slice(0, 600) + ')');
  check(st.machines === 5, 'lane stage 5 machines (' + st.machines + ')');
  check(st.spl === 10, 'lane stage 10 splitters (' + st.spl + ')');
  check(st.ug === 10, 'lane stage 10 UG (' + st.ug + ')');
}
// built trees (real route pfCompose -> placerTile). Wall rule on layout items before placerTile: no item except rot-1 belt/UG may cover a row with y%30 in {29,0}; empty containers y%30>=2.
const built = async (name, rate, dock) => pg.evaluate(([name, rate, dock]) => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
  const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const o = dock ? {dock} : {};
  const L = pfCompose(P, it, 1, 0, o);
  if (!L.ok || !L.bl) return {refused: L.why || 'not BL', note: String(L.note && L.note[0])};
  const wallBad = L.items.filter(q => { const d = dim(q), br1 = (PLC_BELT.includes(q.cls) || PLC_UG.includes(q.cls)) && q.rot === 1; if (br1) return false; for (let y = q.y; y < q.y + d.h; y++) if (y % 30 === 29 || y % 30 === 0) return true; return false }).map(q => q.cls.slice(-6) + '@' + q.x + ',' + q.y);
  const emptyLow = L.items.filter(q => q.cls === 'DAT_Container' && q.ct && !q.ct.length && q.y % 30 < 2).map(q => q.x + ',' + q.y);
  const T = placerTile(L, placerBk());
  const conts = L.items.filter(q => q.cls === 'DAT_Container');
  const nl = nlTop(P, it, 1, 0, {});
  const r = {K: L.bl.K, stages: L.bl.n.length, rows: L.bl.r.join('/'), nSum: L.bl.n.reduce((a, v) => a + v, 0), machines: L.stat.machines, belts: L.stat.belts, ug: L.stat.ug,
    contsPerTower: conts.length / L.bl.K, dkOut: conts.filter(q => q.dk === 'out').length, w: L.w, h: L.h, makes: L.makes, request: rate, ports: L.ports.length,
    portsS: L.ports.every(p => p.edge === 'S'), wallBad, emptyLow, tileOk: T.ok, tileWhy: T.ok ? null : String(T.why).slice(0, 160), nlBelts: nl.ok ? nl.stat.belts : null, nlMach: nl.ok ? nl.stat.machines : null, note: String(L.note[0])};
  if (T.ok) { r.tileOv = T.ov; r.tileSpan = T.span; r.conn = window.__conn(T.ms.map(q => ({h: 0, ...q}))) }
  return r;
}, [name, rate, dock || null]);
const bcases = [['Basic Circuits', 100], ['Basic Circuits', 20], ['Basic Circuits', 1000]];
const bres = {};
for (const [name, rate] of bcases) {
  const tag = name + ' ' + rate, r = await built(name, rate, null);
  bres[tag] = r;
  if (r.refused) { check(false, tag + ' refused (' + r.refused + ')'); continue }
  check(r.wallBad.length === 0, tag + ': no non-belt item on a wall row (' + r.wallBad.slice(0, 5).join(' ') + ')');
  check(r.emptyLow.length === 0, tag + ': empty containers at y%30>=2 (' + r.emptyLow.join(' ') + ')');
  check(r.tileOk, tag + ': placerTile ok' + (r.tileOk ? '' : ' (' + r.tileWhy + ')'));
  if (!r.tileOk) continue;
  check(r.tileOv === 0 && r.tileSpan === 0, tag + ': tile ov ' + r.tileOv + ' span ' + r.tileSpan);
  check(r.conn.dangEnd === 0 && r.conn.noSrc === 0 && r.conn.ugUnpaired === 0 && r.conn.boxNoBelt === 0, tag + ': connectivity 0 (' + JSON.stringify(r.conn).slice(0, 200) + ')');
  check(r.machines === r.K * r.nSum, tag + ': machines ' + r.machines + ' == K*sum(n_s) ' + (r.K * r.nSum));
  check(r.ports === r.K && r.portsS, tag + ': ports ' + r.ports + ' == K ' + r.K + ', all S');
  check(r.makes >= r.request, tag + ': planned ' + r.makes.toFixed(1) + ' >= request ' + r.request);
  console.log('     ' + tag + ': K ' + r.K + ', stages ' + r.stages + ', rows ' + r.rows + ', h ' + r.h + ', belts/machine BL ' + (r.belts / r.machines).toFixed(1) + ' vs NL ' + (r.nlBelts / r.nlMach).toFixed(1) + ', UG ' + r.ug + ', containers/tower ' + r.contsPerTower);
}
const b100 = bres['Basic Circuits 100'];
if (b100 && !b100.refused) {
  check(b100.stages === 4, 'Basic Circuits 100: 4 stages (' + b100.stages + ')');
  check(b100.contsPerTower === 6, 'Basic Circuits 100: 6 containers per tower (' + b100.contsPerTower + ')');
  check(b100.ug >= 1, 'Basic Circuits 100: at least one UG (' + b100.ug + ')');
}
// dock cases on Basic Circuits 100
const dIn = await pg.evaluate(() => { const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits'); const P = plan(it, 100, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false}); const L = pfCompose(P, it, 1, 0, {dock: {in: 'nrm'}}); return {ok: L.ok, bl: !!L.bl, note: String(L.note && L.note[0]), blWhy: blTop(P, it, 1, 0, {dock: {in: 'nrm'}}).why} });
check(!dIn.bl && dIn.ok && /No Limits/.test(dIn.note), 'Basic Circuits 100 dock in=nrm: refused, NL returned (' + dIn.blWhy + ')');
const dOut = await built('Basic Circuits', 100, {out: 'nrm'});
if (dOut.refused) check(false, 'Basic Circuits 100 dock out=nrm refused (' + dOut.refused + ')');
else check(dOut.dkOut === dOut.K && dOut.tileOk, 'Basic Circuits 100 dock out=nrm: built, ' + dOut.dkOut + ' dk out containers == K ' + dOut.K + ' (tileOk ' + dOut.tileOk + ')');
// Enzyme 10: 3 inputs stay on NL
const en = await pg.evaluate(() => { const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Enzyme'); const P = plan(it, 10, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false}); const bl = blTop(P, it, 1, 0, {}); const L = pfCompose(P, it, 1, 0, {}); return {why: bl.why, ok: L.ok, note: String(L.note && L.note[0])} });
check(/^BL: .* \(NL used\)$/.test(en.why) && /No Limits/.test(en.note), 'Enzyme 10 refused (' + en.why + '), pfCompose NL (' + en.note.slice(0, 30) + ')');
// sim: Basic Circuits 100 (untiled), sink = bottom containers, measure from t=300
const WIN = Number(process.env.WIN || 900);
const sim = await pg.evaluate(WIN => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits');
  const P = plan(it, 100, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfCompose(P, it, 1, 0, {});
  if (!L.ok || !L.bl) return {refused: L.why};
  const sinks = L.items.map((q, i) => ({q, id: i + 1})).filter(({q}) => q.cls === L.box && q.ct && !q.ct.length && q.y + dim(q).h === L.h);
  S.blocks = L.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
  try { smSet(true) } catch (e) {}
  simReset && simReset();
  const stock = () => sinks.reduce((a, {id}) => { const cn = SIM.C.get(id); const x = cn && cn.st.get(it); return a + (x ? x.n : 0) }, 0);
  let n300 = 0;
  for (let t = 0; t < WIN; t++) { simAdvance(1, 1); if (t === 299) n300 = stock() }
  return {measured: (stock() - n300) * 60 / (WIN - 300), planned: L.makes, sinks: sinks.length};
}, WIN);
if (sim.refused) check(false, 'Basic Circuits 100 sim: ' + sim.refused);
else check(Math.abs(sim.measured - sim.planned) <= 0.15 * sim.planned, 'Basic Circuits 100 sim: measured ' + sim.measured.toFixed(1) + '/min vs planned ' + sim.planned.toFixed(1) + ' (' + sim.sinks + ' sinks, WIN ' + WIN + ')');
console.log('     sim: measured ' + (sim.measured || 0).toFixed(1) + ' planned ' + (sim.planned || 0).toFixed(1));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

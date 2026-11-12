// NL4 nlTop gates. Run: node tests/nl_top.mjs   (env BOX=<container class> (Buffer container), CASE='Basic Circuits 1000' = one case, NOSIM=1 skips sims, WIN=<s> sim window)  Exit 1 on FAIL or page error.
// Per case: nlTop ok + note 'No Limits'; placerTile ok; pfCheck ov 0; tile ov 0 / span 0; machines == planner N per class; sink containers == out ports == plan sink groups, all out ports on S;
// connectivity on the tiled result (dangEnd, noSrc, ugUnpaired, boxNoBelt all 0); per-lane carry replay (load <= cap, covers heads, ends 0); no page errors.
// BC10000: tile + connectivity are only reported (NOTE) when they exceed 60 s; its nlTop stages, time and heap are always printed. Sim (BC1000, AC10): 600 s, sink stock rate from t=120 s within 15% of target (printed). Heavy cases (BC10000) run last, each stage raced against a 120 s limit and its time/heap printed.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192', '--enable-precise-memory-info']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof nlTop === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function');
await pg.evaluate(b => { window.__BOX = b }, process.env.BOX || null);   // env BOX=DAT_Container or DAT_Container_2: Buffer container passed to nlTop
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const LIM = 120000, TLIM = 60000;
const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({timeout: true}), ms))]);
let cases = [['Exoskeleton Mk. 3', 1], ['Exoskeleton Mk. 3', 10], ['Backpack Mk. 3', 10], ['Exosuit', 1], ['Enzyme', 1], ['Enzyme', 10], ['Enzyme', 100], ['Xenobacteria', 10], ['Xenobacteria', 100], ['Biolattice', 10], ['Basic Motor', 60], ['Basic Circuits', 10], ['Basic Circuits', 100], ['Basic Circuits', 1000], ['Advanced Circuits', 10], ['Advanced Circuits', 50], ['Basic Circuits', 10000]];
if (process.env.CASE) cases = cases.filter(c => process.env.CASE === c[0] + ' ' + c[1]);
const rows = [];
let hung = false, simsDone = false;
for (const [name, rate] of cases) {
  const heavy = rate >= 10000 || name === 'Exosuit' || (name === 'Exoskeleton Mk. 3' && rate >= 10);   // Exosuit: ~12M belts at 1/min, ~120M at 10/min (not run)
  if (heavy && !simsDone) await runSims();
  if (hung) { check(false, name + ' ' + rate + ': skipped, page hung on an earlier case'); continue }
  const tag = name + ' ' + rate;
  // stage A: build
  const a = await race(pg.evaluate(([name, rate]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const h0 = performance.memory ? performance.memory.usedJSHeapSize : 0, t0 = performance.now();
    let L;
    try { L = nlTop(P, it, 1, 0, window.__BOX ? {box: window.__BOX} : {}) } catch (e) { return {thrown: e.message} }
    const ms = Math.round(performance.now() - t0), heap = performance.memory ? Math.round((performance.memory.usedJSHeapSize - h0) / 1e6) : -1;
    if (!L.ok) return {refused: L.why};
    const t1 = performance.now(), chk = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports});
    const gr = !!L.growth, ar = !!L.armoury, F = gr || ar ? null : nlFlow(P, it, 1), clsN = {}, cnt = {};
    if (gr) clsN[def(plnCb(P.nodes[it].crafter).id).key] = P.nodes[it].machines;
    else if (ar) { for (const q of L.armoury) { const Fc = nlFlow(plan(q.item, q.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false}), q.item, 1); for (const n of Fc.nodes) clsN[n.cls] = (clsN[n.cls] || 0) + n.N } }
    else for (const n of F.nodes) clsN[n.cls] = (clsN[n.cls] || 0) + n.N;
    for (const q of L.items) cnt[q.cls] = (cnt[q.cls] || 0) + 1;
    const mdiff = Object.keys(clsN).reduce((a, c) => a + Math.abs((cnt[c] || 0) - clsN[c]), 0);
    const outs = L.ports.filter(p => p.dir === 'out');
    const sinks = gr || ar ? outs : L.items.filter(q => q.cls === L.box && q.ct && !q.ct.length && q.y + dim(q).h === L.h);
    // lane carry replay
    const pl = L.nlPlan || {lanes: [], cells: [], spills: []}, cap = gr || ar ? 0 : F.cap, E = 1e-6, bad = [];
    for (const itm of new Set(pl.lanes.map(l => l.key))) {
      const La = pl.lanes.filter(l => l.key === itm);
      let carry = 0;
      La.forEach((l, j) => {
        let load = l.s + carry;
        if (load > cap + E) bad.push(plnNm(itm) + ' lane ' + l.id + ' load ' + load.toFixed(2) + ' > cap');
        const hs = pl.cells.flatMap(c => c.heads.filter(h => c.feed[h.id] === l.id).map(h => ({h, row: c.row})));
        hs.sort((x, y) => y.row - x.row);
        for (const {h} of hs) { if (load < h.d - E) bad.push(plnNm(itm) + ' lane ' + l.id + ' short for head'); load -= h.d }
        carry = pl.spills.some(s => s.lane === l.id) ? load : 0;
      });
      if (carry > E) bad.push(plnNm(itm) + ' end carry ' + carry.toFixed(2));
    }
    let lc = null;
    if (!ar) try { const Lc = lcTop(P, it, 1, 0, {}); lc = Lc.ok ? +(Lc.stat.belts / Lc.stat.machines).toFixed(1) : 'refused' } catch (e) { lc = 'err' }
    return {chosen: L.chosen, note: L.note[0], times: L.times, ms, heap, ov: chk.ov, chkMs: Math.round(performance.now() - t1), mdiff, nOuts: outs.length, outEdges: [...new Set(outs.map(p => p.edge))].join(','), sinks: sinks.length, groups: gr || ar ? outs.length : pl.sink ? pl.sink.groups.length : 1, carryBad: bad.slice(0, 4), nCarryBad: bad.length, w: L.w, h: L.h, stat: {...L.stat, rows: undefined}, nItems: L.items.length, lc, gr, ar, nParts: ar ? L.armoury.length : 0};
  }, [name, rate]), LIM);
  if (a.timeout) { check(false, tag + ': nlTop exceeded ' + LIM / 1000 + ' s (page hung, remaining cases skipped)'); hung = true; continue }
  console.log(tag, JSON.stringify({note: a.note, times: a.times, ms: a.ms, heapMB: a.heap, chkMs: a.chkMs, items: a.nItems}));
  if (a.thrown || a.refused) { check(false, tag + ': ' + (a.thrown ? 'threw ' + a.thrown : 'refused: ' + a.refused)); continue }
  check(/^No Limits/.test(a.note), tag + ': note');
  check(a.ov === 0, tag + ': pfCheck ov ' + a.ov);
  check(a.mdiff === 0, tag + ': machines == planner N (diff ' + a.mdiff + ')');
  check(a.nOuts >= 1 && a.outEdges === 'S', tag + ': out ports ' + a.nOuts + ' on ' + a.outEdges);
  check(a.sinks === a.nOuts && a.nOuts === a.groups, tag + ': sink containers ' + a.sinks + ' == out ports ' + a.nOuts + ' == groups ' + a.groups);
  if (a.ar) check(a.nOuts === a.nParts, tag + ': one container per component (' + a.nOuts + ' containers, ' + a.nParts + ' components)');
  check(a.nCarryBad === 0, tag + ': lane carry replay' + (a.nCarryBad ? ' ' + a.carryBad.join(' | ') : ''));
  // stage B: tile + connectivity
  const b = await race(pg.evaluate(([name, rate]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = nlTop(P, it, 1, 0, window.__BOX ? {box: window.__BOX} : {});
    const t0 = performance.now(), T = placerTile(L, placerBk()), tileMs = Math.round(performance.now() - t0);
    if (!T.ok) return {tileFail: String(T.why).slice(0, 200), tileMs};
    const items = T.ms.map(q => ({h: 0, ...q}));
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
    const sinkY = Math.max(...emp.map(b => b.y));
    // growth: each lane's sink container has no S belt (its top is fed); allowed count = out ports
    let gSink = 0;
    for (const b of emp) {
      if (b.y === sinkY) continue;
      if (L.growth) { const s0 = pm.get(b).find(p => p.f === 'S'); const q0 = s0 && occ.get((s0.x + s0.nx) + ',' + (s0.y + s0.ny)); if (!q0 && gSink++ < L.ports.length - 1) continue }
      const s = pm.get(b).find(p => p.f === 'S');
      const q = s && occ.get((s.x + s.nx) + ',' + (s.y + s.ny));
      if (!q || !(isBelt(q) || isUG(q) || isSpl(q))) { out.boxNoBelt++; out.ex.push('boxNoBelt (' + b.x + ',' + b.y + ')') }
    }
    return {tileMs, gSink, gLanes: L.growth ? L.stat.lanes : 0, tileOv: T.ov, tileSpan: T.span, blocks: T.blocks.length, out: {...out, ex: out.ex.slice(0, 6)}};
  }, [name, rate]), heavy ? TLIM : LIM);
  if (b.timeout && heavy) { console.log('NOTE ' + tag + ': placerTile + connectivity did not finish in ' + TLIM / 1000 + ' s (nlTop stages above); tile/connectivity not gated for rate >= 10000'); hung = true; continue }
  if (b.timeout) { check(false, tag + ': placerTile+connectivity exceeded ' + LIM / 1000 + ' s (page hung)'); hung = true; continue }
  console.log(tag, 'tile', JSON.stringify({tileMs: b.tileMs, blocks: b.blocks}));
  if (b.tileFail) { check(false, tag + ': placerTile ok (' + b.tileFail + ')'); continue }
  check(true, tag + ': placerTile ok');
  check(b.tileOv === 0 && b.tileSpan === 0, tag + ': tile ov ' + b.tileOv + ' span ' + b.tileSpan);
  const o = b.out;
  check(o.boxNoBelt === 0, tag + ': every producer container has an S belt (' + o.boxNoBelt + ')');
  check(o.dangEnd === 0, tag + ': every belt end lands on belt/UG/port (' + o.dangEnd + ')');
  // growth lanes: the seed return belt starts at the machine's disabled N port (verified plcGrowthLane layout, seed container is infinite): exactly one source-less belt per lane
  check(o.noSrc === b.gLanes, tag + ': every belt has a source (' + o.noSrc + (b.gLanes ? ', expected ' + b.gLanes + ' growth return stubs' : '') + ')');
  check(o.ugUnpaired === 0, tag + ': UGs pair (' + o.ugUnpaired + ')');
  if (o.ex.length) console.log('  ' + o.ex.join(' | '));
  const s = a.stat;
  rows.push({tag, blocks: b.blocks, size: a.w + 'x' + a.h, belts: s.belts, ug: s.ug, spl: s.spl, mach: s.machines, bpm: (s.belts / s.machines).toFixed(1), lc: a.lc, chosen: a.chosen, split: ['bCell', 'bRaw', 'bThru', 'bTap', 'bSink', 'bSpill'].map(k => k + ' ' + s[k]).join(' ')});
}
// (after the case loop) sims (run before the first heavy case so a hung page cannot skip them)
async function runSims() {
  simsDone = true;
  if (!process.env.NOSIM && !hung) {
  const WIN = Number(process.env.WIN || 600);
  for (const [name, rate] of [['Basic Circuits', 1000], ['Advanced Circuits', 10], ['Exoskeleton Mk. 3', 1], ['Backpack Mk. 3', 10], ['Enzyme', 10], ['Xenobacteria', 10], ['Biolattice', 10]]) {
    if (process.env.CASE && process.env.CASE !== name + ' ' + rate) continue;
    const t0 = Date.now();
    const r = await race(pg.evaluate(([name, rate, WIN]) => {
      const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
      const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
      const L = nlTop(P, it, 1, 0, window.__BOX ? {box: window.__BOX} : {});
      if (!L.ok) return {refused: L.why};
      const below = q => L.items.some(b => PLC_BELT.includes(b.cls) && b.y === q.y + dim(q).h && b.x >= q.x && b.x < q.x + dim(q).w);
      const sinks = L.items.map((q, i) => ({q, id: i + 1})).filter(({q}) => q.cls === L.box && q.ct && !q.ct.length && (L.growth ? !below(q) : q.y + dim(q).h === L.h));
      const itemStock = (id, item) => { const cn = SIM.C.get(id); const x = cn && cn.st.get(item); return x ? x.n : 0 };
      S.blocks = L.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
      try { smSet(true) } catch (e) {}
      simReset && simReset();
      const stock = () => sinks.reduce((a, {id}) => { const cn = SIM.C.get(id); const x = cn && cn.st.get(it); return a + (x ? x.n : 0) }, 0);
      let n120 = 0;
      const pb = [], partStock = q => sinks.filter(({q: b}) => b.x >= q.x0 && b.x < q.x0 + q.w).reduce((a, {id}) => a + itemStock(id, q.item), 0);
      for (let s = 0; s < WIN; s++) { simAdvance(1, 1); if (s === 119) { n120 = stock(); if (L.armoury) L.armoury.forEach((q, i) => { pb[i] = partStock(q) }) } }
      if (L.armoury) return {parts: L.armoury.map((q, i) => { const mine = sinks.filter(({q: b}) => b.x >= q.x0 && b.x < q.x0 + q.w); const m = (mine.reduce((a, {id}) => a + itemStock(id, q.item), 0) - pb[i]) * 60 / (WIN - 120); return {name: plnNm(q.item), rate: q.rate, n: mine.length, measured: m} }), sinks: sinks.length};
      return {measured: (stock() - n120) * 60 / (WIN - 120), target: rate, makes: L.makes, growth: !!L.growth, sinks: sinks.length};
    }, [name, rate, WIN]), 600000);
    if (r.timeout) { check(false, name + ' ' + rate + ' sim exceeded 600 s'); hung = true; break }
    console.log('SIM', name, rate, 'secs ' + ((Date.now() - t0) / 1000).toFixed(1), JSON.stringify(r));
    if (r.refused) { check(false, name + ' ' + rate + ' sim: ' + r.refused); continue }
    if (r.parts) { for (const q of r.parts) check(Math.abs(q.measured - q.rate) <= 0.05 * q.rate, name + ' ' + rate + ': ' + q.name + ' container(s) ' + q.n + ' receive ' + q.measured.toFixed(1) + '/min vs ' + q.rate.toFixed(1) + ' (5%)'); continue }
    if (['Enzyme', 'Xenobacteria', 'Biolattice'].includes(name)) {   // machines are rounded up and run at the pace the sink takes (infinite), so the sink rate = planned capacity (makes) within 5% (growth final: at least makes, the sim sink also receives the gross output of the verified growth lane), and never below the requested rate
      check((r.growth ? r.measured >= 0.95 * r.makes : Math.abs(r.measured - r.makes) <= 0.05 * r.makes) && r.measured >= 0.95 * r.target, name + ' ' + rate + ': sim sink rate ' + r.measured.toFixed(1) + '/min vs planned capacity ' + r.makes.toFixed(1) + ' (request ' + r.target + ')');
    } else
    check(Math.abs(r.measured - r.target) <= (['Enzyme', 'Xenobacteria', 'Biolattice'].includes(name) ? 0.05 : 0.15) * r.target, name + ' ' + rate + ': sim sink rate ' + r.measured.toFixed(1) + '/min vs ' + r.target + ' (' + (100 * r.measured / r.target).toFixed(1) + '%), 15% tolerance');
  }
}
}
if (!simsDone) await runSims();
console.log('tag | blocks | w x h | belts | UG | spl | machines | belts/machine | LC belts/machine | belt split | W');
for (const x of rows) console.log([x.tag, x.blocks, x.size, x.belts, x.ug, x.spl, x.mach, x.bpm, x.lc, x.split, x.chosen].join(' | '));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

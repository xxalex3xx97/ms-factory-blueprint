// BL4 blTop gates (page, ?engine=bl). Run: node tests/bl_top.mjs   Exit 1 on FAIL or page error.
// Refusals (Basic Circuits 100, Enzyme 10, Exoskeleton Mk. 3 1): blTop ok false, pfCompose returns the NL result.
// Built (Silicon Wafers 120/360/720, first auto-discovered 2-stage chain at 120 and 1000): placerTile ok, tile ov 0, span 0, machines == K*sum(n_s), ports == K all S, connectivity 0, makes >= request.
// Sim (Silicon Wafers 360, chain at 120): sink rate from t=120 s within 15% of planned makes. Prints the BL vs NL belts/machine table.
import fs from 'fs';
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
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof blTop === 'function' && typeof pfCompose === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
// connectivity: same rules as tests/nl_top.mjs stage B (dangEnd, noSrc, ugUnpaired, boxNoBelt), on a plain item list
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
      const s = pm.get(b).find(p => p.f === 'S');
      const q = s && occ.get((s.x + s.nx) + ',' + (s.y + s.ny));
      if (!q || !(isBelt(q) || isUG(q) || isSpl(q))) { out.boxNoBelt++; out.ex.push('boxNoBelt (' + b.x + ',' + b.y + ')') }
    }
    return out;
  };
});
// planned case: plan + blTop-or-NL via pfCompose (the real route), with BL/NL stats
const caseFn = ([name, rate]) => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
  const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfCompose(P, it, 1, 0, {});
  const NL = nlTop(P, it, 1, 0, {});
  const bl = blTop(P, it, 1, 0, {});
  if (!L.ok) return {refused: L.why, blWhy: bl.why};
  const T = placerTile(L, placerBk());
  const out = {note: String(L.note[0]), blWhy: bl.ok ? null : bl.why, bl: !!L.bl, makes: L.makes, request: rate, ports: L.ports.length,
    portsEdge: [...new Set(L.ports.map(p => p.edge))], K: L.bl ? L.bl.K : null, nSum: L.bl ? L.bl.n.reduce((a, v) => a + v, 0) : null,
    stages: L.bl ? L.bl.n.length : 0, rows: L.bl ? L.bl.r.join('/') : '', machines: L.stat.machines, belts: L.stat.belts, spl: L.stat.spl,
    nlBelts: NL.ok ? NL.stat.belts : null, nlMach: NL.ok ? NL.stat.machines : null, w: L.w, h: L.h, tileOk: T.ok, tileWhy: T.ok ? null : String(T.why).slice(0, 160)};
  if (T.ok) {
    out.tileOv = T.ov; out.tileSpan = T.span;
    out.conn = window.__conn(T.ms.map(q => ({h: 0, ...q})));
  }
  return out;
};
const discover = rate => pg.evaluate(rate => {
  let n = 0;
  for (const it of plnBy(false).keys()) {
    if (++n > 400) break;
    try {
      const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
      const T = P.nodes[it];
      if (!T || !T.rec || T.rec.i.some(([x]) => x === it)) continue;
      const Z = pfFactTree(P, it, 1);
      if (Z.ok === false || Z.nodes.length !== 2) continue;
      if (blTop(P, it, 1, 0, {}).ok) return plnNm(it);
    } catch (e) {}
  }
  return null;
}, rate);
const cases = [['Silicon Wafers', 120], ['Silicon Wafers', 360], ['Silicon Wafers', 720]];
const chain120 = await discover(120), chain1000 = await discover(1000);
console.log('discovered 2-stage chains: 120/min = ' + chain120 + ', 1000/min = ' + chain1000);
if (chain120) cases.push([chain120, 120]);
if (chain1000) cases.push([chain1000, 1000]);
const rows = [];
for (const [name, rate] of cases) {
  const r = await pg.evaluate(caseFn, [name, rate]);
  const tag = name + ' ' + rate;
  if (r.refused) { check(false, tag + ': refused (' + r.refused + ')'); continue }
  check(r.bl, tag + ': built by blTop (' + r.note.slice(0, 60) + ')' + (r.blWhy ? ' blWhy ' + r.blWhy : ''));
  if (!r.bl) continue;
  check(r.tileOk, tag + ': placerTile ok' + (r.tileOk ? '' : ' (' + r.tileWhy + ')'));
  if (!r.tileOk) continue;
  check(r.tileOv === 0 && r.tileSpan === 0, tag + ': tile ov ' + r.tileOv + ' span ' + r.tileSpan);
  check(r.machines === r.K * r.nSum, tag + ': machines ' + r.machines + ' == K*sum(n_s) ' + (r.K * r.nSum));
  check(r.ports === r.K && r.portsEdge.length === 1 && r.portsEdge[0] === 'S', tag + ': ports ' + r.ports + ' == K ' + r.K + ', all S');
  check(r.conn.dangEnd === 0 && r.conn.noSrc === 0 && r.conn.ugUnpaired === 0 && r.conn.boxNoBelt === 0, tag + ': connectivity 0 (' + JSON.stringify(r.conn).slice(0, 160) + ')');
  check(r.makes >= r.request, tag + ': planned ' + r.makes.toFixed(1) + '/min >= request ' + r.request);
  rows.push({tag, K: r.K, stages: r.stages, rows: r.rows, wh: r.w + ' x ' + r.h, belts: r.belts, spl: r.spl, machines: r.machines,
    bpm: (r.belts / r.machines).toFixed(1), nlbpm: r.nlBelts != null ? (r.nlBelts / r.nlMach).toFixed(1) : '-'});
}
// refusals: blTop refuses, pfCompose falls through to NL
for (const [name, rate] of [['Basic Circuits', 100], ['Enzyme', 10], ['Exoskeleton Mk. 3', 1]]) {
  const r = await pg.evaluate(caseFn, [name, rate]);
  const tag = name + ' ' + rate;
  if (r.refused) { check(false, tag + ': pfCompose refused (' + r.refused + ')'); continue }
  check(!r.bl && r.blWhy && /^BL: .* \(NL used\)$/.test(r.blWhy), tag + ': blTop refuses (' + r.blWhy + ')');
  check(/No Limits/.test(r.note), tag + ': pfCompose returns NL (' + r.note.slice(0, 40) + ')');
}
// sim: sink rate from t=120 s vs planned makes (copy of tests/nl_top.mjs runSims, one case per call)
const WIN = Number(process.env.WIN || 600);
for (const [name, rate] of [['Silicon Wafers', 360], [chain120, 120]]) {
  if (!name) continue;
  const s = await pg.evaluate(([name, rate, WIN]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = pfCompose(P, it, 1, 0, {});
    if (!L.ok || !L.bl) return {refused: L.why || 'not BL'};
    const sinks = L.items.map((q, i) => ({q, id: i + 1})).filter(({q}) => q.cls === L.box && q.ct && !q.ct.length && q.y + dim(q).h === L.h);
    S.blocks = L.items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
    try { smSet(true) } catch (e) {}
    simReset && simReset();
    const stock = () => sinks.reduce((a, {id}) => { const cn = SIM.C.get(id); const x = cn && cn.st.get(it); return a + (x ? x.n : 0) }, 0);
    let n120 = 0;
    for (let t = 0; t < WIN; t++) { simAdvance(1, 1); if (t === 119) n120 = stock() }
    return {measured: (stock() - n120) * 60 / (WIN - 120), makes: L.makes, sinks: sinks.length};
  }, [name, rate, WIN]);
  const tag = name + ' ' + rate;
  if (s.refused) { check(false, tag + ' sim: ' + s.refused); continue }
  check(Math.abs(s.measured - s.makes) <= 0.15 * s.makes, tag + ' sim: sink rate ' + s.measured.toFixed(1) + '/min vs planned ' + s.makes.toFixed(1) + ' (' + s.sinks + ' sink(s))');
}
// table
console.log('tag | K | stages | rows | w x h | belts | splitters | machines | BL belts/machine | NL belts/machine');
for (const r of rows) console.log([r.tag, r.K, r.stages, r.rows, r.wh, r.belts, r.spl, r.machines, r.bpm, r.nlbpm].join(' | '));
// BL6 fallbacks: growth (recipe consumes its own item), Armoury (above), in=nrm with out=ind, ?engine=nl pin
const growth = await pg.evaluate(() => { for (const it of plnBy(false).keys()) if ((plnBy(false).get(it) || []).some(e => e.r.i.some(([x]) => x === it))) return plnNm(it); return null });
console.log('growth item: ' + growth);
if (growth) {
  const g = await pg.evaluate(name => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, 10, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const bl = blTop(P, it, 1, 0, {}), L = pfCompose(P, it, 1, 0, {});
    return {blWhy: bl.why, ok: L.ok, note: String(L.note && L.note[0]), bl: !!L.bl};
  }, growth);
  check(g.blWhy === 'BL: growth (NL used)' && !g.bl, growth + ' growth: blTop refuses (' + g.blWhy + ')');
  check(g.ok && /No Limits/.test(g.note), growth + ' growth: pfCompose returns NL (' + g.note.slice(0, 40) + ')');
}
const fb = await pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Silicon Wafers');
  const P = plan(it, 360, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfCompose(P, it, 1, 0, {dock: {in: 'nrm', out: 'ind'}});
  return {ok: L.ok, bl: !!L.bl, note: String(L.note && L.note[0])};
});
check(fb.ok && !fb.bl && /No Limits/.test(fb.note), 'Silicon Wafers 360 in=nrm out=ind: NL result (' + fb.note.slice(0, 40) + ')');
const pgN = await (await br.newContext()).newPage();
pgN.on('pageerror', e => errs.push(e.message));
await pgN.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=nl');
await pgN.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof plan === 'function');
const nl = await pgN.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Silicon Wafers');
  const P = plan(it, 360, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfCompose(P, it, 1, 0, {});
  return {bl: BL_ENGINE, nl: NL_ENGINE, ok: L.ok, note: String(L.note && L.note[0])};
});
check(nl.bl === false && nl.nl === true && nl.ok && /No Limits/.test(nl.note) && !/Block engine/.test(nl.note), '?engine=nl: BL off, NL result (' + nl.note.slice(0, 40) + ')');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

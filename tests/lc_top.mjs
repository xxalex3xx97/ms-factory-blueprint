// LC S6 lcBuild + lcTop gates. Run: node tests/lc_top.mjs   Exit 1 on FAIL or page error.
// Gates: L.ok; placerTile ok; pfCheck ov 0; tile ov 0 / span 0; machines == planner N per item (AC50 +1 max); one S out port; one sink container; no stack overflow.
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
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=old');
await pg.waitForFunction(() => window.__fb && typeof lcTop === 'function' && typeof placerTile === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [['Basic Motor', 60, 0, 2, 55], ['Basic Circuits', 10, 0, 0, 0], ['Advanced Circuits', 10, 0, 0, 62], ['Advanced Circuits', 50, 1, 0, 310]];
const rows = [], splits = [];
let rowsAC50 = null;
for (const [name, rate, slack, , oldBelts] of cases) {
  const r = await pg.evaluate(([name, rate]) => {
    LC_ENGINE = true;
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    let L;
    try { L = lcTop(P, it, 1, 0, {}) } catch (e) { return {thrown: e.message} }
    if (!L.ok) return {refused: L.why};
    const T = placerTile(L, placerBk());
    const chk = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports});
    const F = lcFlow(P, it, 1);
    const cnt = {};
    for (const q of L.items) cnt[q.cls] = (cnt[q.cls] || 0) + 1;
    const mach = F.nodes.map(n => ({n: plnNm(n.item), N: n.N, got: 0, cls: n.cls}));
    const clsN = {};
    for (const n of F.nodes) clsN[n.cls] = (clsN[n.cls] || 0) + n.N;
    const clsGot = {};
    for (const c of Object.keys(clsN)) clsGot[c] = cnt[c] || 0;
    const outs = L.ports.filter(p => p.dir === 'out');
    const empty = L.items.filter(q => q.cls === PLC_BOX && q.ct && !q.ct.length && q.y + dim(q).h === L.h);
    return {note: L.note[0], prefab: L.prefab, tileOk: T.ok, tileWhy: T.ok ? '' : String(T.why).slice(0, 160), ov: chk.ov, tileOv: T.ov, tileSpan: T.span, clsN, clsGot, nOuts: outs.length, outEdges: outs.map(p => p.edge).join(','), sinks: empty.length, sinkOnOut: empty.filter(q => q.x === outs[0].off || q.x <= outs[0].off && q.x + 9 > outs[0].off).length, w: L.w, h: L.h, stat: L.stat, boxes: L.items.filter(q => q.cls === PLC_BOX).length, tileBlocks: T.blocks && T.blocks.length};
  }, [name, rate]);
  const tag = name + ' ' + rate;
  console.log(tag, JSON.stringify(r));
  if (r.thrown || r.refused) { check(false, tag + ' ' + (r.thrown ? 'threw ' + r.thrown : 'refused: ' + r.refused)); continue }
  check(/^Layout compiler/.test(r.note) && r.prefab, tag + ': ok + note');
  check(r.tileOk, tag + ': placerTile ok' + (r.tileOk ? '' : ' (' + r.tileWhy + ')'));
  check(r.ov === 0, tag + ': pfCheck ov ' + r.ov);
  check(r.tileOv === 0 && r.tileSpan === 0, tag + ': tile ov ' + r.tileOv + ' span ' + r.tileSpan);
  let mdiff = 0;
  for (const c of Object.keys(r.clsN)) mdiff += Math.abs(r.clsGot[c] - r.clsN[c]);
  const tot = Object.values(r.clsGot).reduce((a, b) => a + b, 0);
  check(mdiff <= slack, tag + ': machines ' + tot + ' vs planner ' + Object.values(r.clsN).reduce((a, b) => a + b, 0) + ' (diff ' + mdiff + ', allowed ' + slack + ')');
  check(r.nOuts === 1 && r.outEdges === 'S', tag + ': one S out port');
  check(r.sinks === 1, tag + ': single sink container (' + r.sinks + ')');
  rows.push({tag, blocks: r.stat.blocks, size: r.w + 'x' + r.h, belts: r.stat.belts, ug: r.stat.ug, spl: r.stat.spl, boxes: r.boxes, machines: r.stat.machines, bpm: (r.stat.belts / r.stat.machines).toFixed(1), old: oldBelts});
  const grpsK = ['bCell', 'bRaw', 'bThru', 'bTap', 'bSink', 'bOther'];
  const gSum = grpsK.reduce((a, k) => a + r.stat[k], 0);
  check(gSum === r.stat.belts, tag + ': belt groups sum ' + gSum + ' == belts ' + r.stat.belts);
  if (name !== 'Basic Motor') splits.push({tag, s: r.stat});
  if (tag === 'Advanced Circuits 50') rowsAC50 = r.stat.rows;
}
// Connectivity (user bug 2026-11-12: producer lane with no consumer = output belt-less container). Full placerLayout + placerTile, then walk the tile.
// Checked only when the compiler ran; a refusal falls back to the old engine (its own layout, not under test here).
for (const [name, rate] of [['Basic Circuits', 100], ['Basic Circuits', 150], ['Basic Circuits', 200], ['Basic Circuits', 500], ['Basic Circuits', 1000]]) {
  const r = await pg.evaluate(([name, rate]) => {
    LC_ENGINE = true; PLC_PREFAB = true; PF_FACT = true;
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = placerLayout(P, it, 1, 1, {box: 'DAT_Container_2', mod: false});
    if (!L.ok) return {refused: L.why};
    if (!/^Layout compiler/.test((L.note && L.note[0]) || '')) return {fallback: (L.note && L.note[0]) || '?'};
    const T = placerTile(L, placerBk());
    if (!T.ok) return {tileFail: String(T.why)};
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
    for (const b of emp) {
      if (b.y === sinkY) continue;
      const s = pm.get(b).find(p => p.f === 'S');
      const q = s && occ.get((s.x + s.nx) + ',' + (s.y + s.ny));
      if (!q || !(isBelt(q) || isUG(q) || isSpl(q))) { out.boxNoBelt++; out.ex.push('boxNoBelt (' + b.x + ',' + b.y + ')') }
    }
    return {ok: true, out: {...out, ex: out.ex.slice(0, 6)}, belts: L.stat.belts, size: L.w + 'x' + L.h, spl: L.stat.spl, ug: L.stat.ug, lanes: L.stat.lanes};
  }, [name, rate]);
  const tag = name + ' ' + rate + ' connectivity';
  console.log(tag, JSON.stringify(r));
  if (r.refused || r.tileFail) { check(false, tag + ': ' + (r.refused || r.tileFail)); continue }
  if (r.fallback) { console.log('NOTE ' + tag + ': compiler refused, old engine used (' + r.fallback.slice(0, 50) + '), not checked'); continue }
  check(r.out.boxNoBelt === 0, tag + ': every producer container has an S belt (' + r.out.boxNoBelt + ' dead)');
  check(r.out.dangEnd === 0, tag + ': every belt end lands on belt/UG/port (' + r.out.dangEnd + ' dangling)');
  check(r.out.noSrc === 0, tag + ': every belt has a source (' + r.out.noSrc + ' orphan)');
  check(r.out.ugUnpaired === 0, tag + ': UGs pair (' + r.out.ugUnpaired + ' unpaired)');
  if (r.out.ex.length) console.log('  ' + r.out.ex.join(' | '));
}
console.log('belt split (count (%)) | belts | bCell | bRaw | bThru | bTap | bSink | bOther');
for (const {tag, s} of splits) {
  const cell = k => s[k] + ' (' + (100 * s[k] / s.belts).toFixed(1) + '%)';
  console.log([tag, s.belts, cell('bCell'), cell('bRaw'), cell('bThru'), cell('bTap'), cell('bSink'), cell('bOther')].join(' | '));
}
console.log('AC50 per row (top-down) | row | width | height | cells | tracks');
for (let r = rowsAC50.rowW.length - 1; r >= 0; r--)
  console.log('row ' + r + ' | ' + rowsAC50.rowW[r] + ' | ' + rowsAC50.rowH[r] + ' | ' + rowsAC50.cellsPerRow[r] + ' | ' + rowsAC50.tracksPerRow[r]);
console.log('tag | blocks | w x h | belts | UG | spl | containers | machines | belts/machine | old belts');
for (const x of rows) console.log([x.tag, x.blocks, x.size, x.belts, x.ug, x.spl, x.boxes, x.machines, x.bpm, x.old].join(' | '));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// NL3 nlPlan gates. Run: node tests/nl_plan.mjs   Exit 1 on FAIL or page error.
// Gates: ok (no refusal); every head of every cell has a lane of its item and a route (straight/jog/tap); replayed lane load (supply + incoming spill, minus heads in tap order)
// stays within belt cap and covers each head, ends at 0 per item; spills only j -> next lane of the same item; cells in a row do not overlap; no lane column runs through a foreign cell.
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
await pg.waitForFunction(() => window.__fb && typeof nlPlan === 'function' && typeof nlFlow === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [['Basic Circuits', 10], ['Basic Circuits', 100], ['Basic Circuits', 1000], ['Basic Circuits', 10000], ['Advanced Circuits', 10], ['Advanced Circuits', 50]];
const table = [];
for (const [name, rate] of cases) {
  const tag = name + ' ' + rate;
  const r = await pg.evaluate(([name, rate]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    let F, pl;
    const t0 = performance.now();
    try { F = nlFlow(P, it, 1); if (!F.ok) return {refused: 'flow ' + F.why}; pl = nlPlan(F, 1) } catch (e) { return {thrown: e.message + ' ' + (e.stack || '').split('\n')[1]} }
    if (!pl.ok) return {refused: pl.why};
    const ms = Math.round(performance.now() - t0), cap = F.cap, E = 1e-6, bad = [];
    const byId = new Map(pl.lanes.map(l => [l.id, l]));
    // heads -> lane + route
    let nHeads = 0;
    for (const c of pl.cells) for (const h of c.heads) {
      nHeads++;
      const lid = c.feed[h.id], l = byId.get(lid);
      if (l === undefined) { bad.push('head ' + h.id + ' no lane'); continue }
      if (l.item !== h.item) bad.push('head ' + h.id + ' lane item mismatch');
      if (!pl.routes.some(q => q.head === h.id && q.lane === lid)) bad.push('head ' + h.id + ' no route');
      if (l.x === null || l.y0 === null) bad.push('lane ' + lid + ' unplaced');
    }
    if (pl.routes.length !== nHeads) bad.push('routes ' + pl.routes.length + ' != heads ' + nHeads);
    // replay lane load per item in lane order
    const items = [...new Set(pl.lanes.map(l => l.item))];
    for (const it of items) {
      const L = pl.lanes.filter(l => l.item === it);
      let carry = 0;
      L.forEach((l, j) => {
        let load = l.s + carry;
        if (load > cap + E) bad.push(plnNm(it) + ' lane ' + l.id + ' load ' + load.toFixed(2) + ' > cap ' + cap);
        const hs = pl.cells.flatMap(c => c.heads.filter(h => c.feed[h.id] === l.id));
        // tap order = by consumer row top-down, then as listed (same order nlAssign swept); demand must be covered at each tap
        hs.sort((a, b) => pl.cells.find(c => c.heads.includes(b)).row - pl.cells.find(c => c.heads.includes(a)).row);
        for (const h of hs) { if (load < h.d - E) bad.push(plnNm(it) + ' lane ' + l.id + ' load ' + load.toFixed(2) + ' < head d ' + h.d.toFixed(2)); load -= h.d }
        if (load < -E) bad.push(plnNm(it) + ' lane ' + l.id + ' negative carry');
        const sp = pl.spills.find(s => s.lane === l.id);
        if (load > E && !sp && j + 1 < L.length) bad.push(plnNm(it) + ' lane ' + l.id + ' carry ' + load.toFixed(2) + ' without spill');
        if (sp && sp.to !== L[j + 1].id) bad.push('spill from ' + l.id + ' goes to ' + sp.to + ' not next lane');
        carry = sp ? load : 0;
      });
      if (carry > E) bad.push(plnNm(it) + ' end carry ' + carry.toFixed(2));
    }
    // cells in a row do not overlap
    const byRow = new Map();
    for (const c of pl.cells) { if (!byRow.has(c.row)) byRow.set(c.row, []); byRow.get(c.row).push(c) }
    for (const [row, cs] of byRow) { cs.sort((a, b) => a.ox - b.ox); for (let i = 1; i < cs.length; i++) if (cs[i].ox < cs[i - 1].ox + cs[i - 1].w) bad.push('row ' + row + ' cells overlap') }
    // lane column through a foreign cell
    let thru = 0;
    for (const l of pl.lanes) {
      if (l.x === null) continue;
      let end = Math.max(l.y1 || 0, ...pl.routes.filter(q => q.lane === l.id).map(q => pl.cells[q.toCell].oy));
      for (const c of pl.cells) if (c.id !== l.src && c.oy < end && c.oy + c.h > l.y0 && l.x >= c.ox && l.x < c.ox + c.w) thru++;
    }
    if (thru) bad.push(thru + ' lanes run through foreign cells');
    const rs = pl.rowStat;
    return {bad: bad.slice(0, 6), nbad: bad.length, ms, rows: rs.rowW.length, lanes: pl.lanes.length, spills: pl.spills.length, cells: pl.cells.length, heads: nHeads, taps: pl.taps.length, tracks: pl.tracks.length, ug: pl.ug, w: pl.w, h: pl.h, dock: pl.dock.length, rowW: rs.rowW, rowH: rs.rowH, cellsPerRow: rs.cellsPerRow, tracksPerRow: rs.tracksPerRow, spillsPerRow: rs.spillsPerRow};
  }, [name, rate]);
  if (r.thrown || r.refused) { check(false, tag + ': ' + (r.thrown ? 'threw ' + r.thrown : 'refused ' + r.refused)); continue }
  check(r.nbad === 0, tag + ': plan gates' + (r.nbad ? ' (' + r.nbad + ') ' + r.bad.join(' | ') : ''));
  table.push({tag, r});
}
console.log('tag | rows | lanes | spills | cells | heads | docks | taps | tracks | UG est | w x h | ms');
for (const {tag, r} of table) console.log([tag, r.rows, r.lanes, r.spills, r.cells, r.heads, r.dock, r.taps, r.tracks, r.ug, r.w + 'x' + r.h, r.ms].join(' | '));
for (const {tag, r} of table) if (/ (100|1000|50)$/.test(tag)) console.log(tag + ' rows(0..n) w ' + r.rowW + ' h ' + r.rowH + ' cells ' + r.cellsPerRow + ' tracks ' + r.tracksPerRow + ' spills ' + r.spillsPerRow);
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// B0 baseline: plan-only tap/row stats. Run: node tests/nl_tap_stat.mjs (env CASE='Exosuit 1' = one case). Gate: no throw.
// Armoury items (Exosuit) are split like nlArmoury: one plan per leaf component at rate N x recipe amount, each measured on its own.
// env TREE=<dir with index.html+js>: measure another tree. HEAD planner.js plnCb refuses machines with unknown footprint (Deep Space Observatory, needed by Advanced Plate), so Advanced Plate / Exosuit need a tree copy whose plnCb lacks the 'b.w!=null' check.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = process.env.TREE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192', '--enable-precise-memory-info']});
const cases = [['Basic Circuits', 1000], ['Advanced Circuits', 50], ['Advanced Plate', 30], ['Exosuit', 0.1], ['Exosuit', 1]].filter(c => !process.env.CASE || process.env.CASE === c[0] + ' ' + c[1]);
let fails = 0;
// page function: returns {parts:[stat]} or {thrown}/{noflow}
const measure = ([name, rate]) => {
  const ks = [...plnBy(false).keys()], it = ks.find(i => plnNm(i) === name);
  const P0 = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const jobs = [], isA = x => { const T = P0.nodes[x]; return T && T.crafter && /Armoury/i.test(T.crafter) };
  if (isA(it)) {
    const leaf = new Map(), walk = (x, r) => { const T = P0.nodes[x]; for (const [y, n] of T.rec.i) { const q = r * n / T.rec.o[1]; if (isA(y)) walk(y, q); else leaf.set(y, (leaf.get(y) || 0) + q) } };
    walk(it, P0.nodes[it].rate);
    for (const [c, r] of leaf) jobs.push([c, r]);
  } else jobs.push([it, rate]);
  const parts = [];
  for (const [c, r] of jobs) {
    const P = plan(c, r, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const t0 = performance.now();
    let p, F;
    try { F = nlFlow(P, c, 1); if (!F.ok) return {noflow: plnNm(c) + ': ' + F.why}; p = nlPlanAll(F, 1)[0] } catch (e) { return {thrown: plnNm(c) + ': ' + e.message} }
    const ms = Math.round(performance.now() - t0);
    if (!p || p.ok === false) return {thrown: plnNm(c) + ': no plan ' + (p && p.why)};
    const L = p.tracks.map(t => Math.abs(t.x1 - t.x0)).sort((a, b) => a - b), n = L.length, sum = L.reduce((a, b) => a + b, 0);
    const pc = q => n ? L[Math.min(n - 1, Math.floor(q * n))] : 0;
    const rows = {};
    for (const q of p.cells) { const R = rows[q.row] || (rows[q.row] = {mn: 1e9, mx: -1e9, n: 0}); R.mn = Math.min(R.mn, q.ox); R.mx = Math.max(R.mx, q.ox + q.w); R.n++ }
    const rowTxt = Object.keys(rows).map(k => ({row: +k, n: rows[k].n, minOx: rows[k].mn, maxX: rows[k].mx, overflow: Math.max(0, rows[k].mx - p.w)}));
    const bi = {};
    for (const t of p.tracks) { const k = plnNm(p.lanes[t.lane].item); bi[k] = (bi[k] || 0) + Math.abs(t.x1 - t.x0) }
    const top5 = Object.entries(bi).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const mach = F.nodes.reduce((a, q) => a + q.N, 0), score = nlPlanScore(p);
    parts.push({part: plnNm(c), r, chosen: p.chosen, w: p.w, h: p.h, rowW: p.rowStat.rowW, cells: p.cells.length, lanes: p.lanes.length, mach, ms, taps: n, mean: n ? sum / n : 0, p50: pc(0.5), p90: pc(0.9), max: L[n - 1] || 0, sum, meanW: n ? sum / n / p.w : 0, rowTxt, top5, score, spm: score / mach});
  }
  return {parts};
};
for (const [name, rate] of cases) {
  const pg = await (await br.newContext()).newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(ROOT + '/index.html').href);
  await pg.waitForFunction(() => window.__fb && typeof nlPlanAll === 'function' && typeof nlFlow === 'function');
  const r = await Promise.race([pg.evaluate('(' + measure.toString() + ')(' + JSON.stringify([name, rate]) + ')'), new Promise(r => setTimeout(() => r({timeout: true}), 300000))]).catch(e => ({thrown: String(e.message)}));
  const tag = name + ' ' + rate;
  if (r.timeout) console.log('NOTE ' + tag + ': skipped, exceeded 300 s');
  else if (r.noflow) console.log('NOTE ' + tag + ': nlFlow refused (' + r.noflow + ')');
  else if (r.thrown) { console.log('FAIL ' + tag + ': threw ' + r.thrown); fails++ }
  else {
    const f = x => +x.toFixed(3);
    console.log('== ' + tag);
    for (const q of r.parts) {
      console.log(`-- part ${q.part} rate ${f(q.r)}: chosen ${q.chosen} w ${q.w} h ${q.h} machines ${q.mach} cells ${q.cells} lanes ${q.lanes} planMs ${q.ms}`);
      console.log('rowW ' + JSON.stringify(q.rowW));
      console.log(`taps ${q.taps} mean ${f(q.mean)} p50 ${q.p50} p90 ${q.p90} max ${q.max} sum ${q.sum} mean/w ${f(q.meanW)}`);
      console.log('rows (row,n,minOx,maxX,overflow vs w=' + q.w + '): ' + q.rowTxt.map(x => [x.row, x.n, x.minOx, x.maxX, x.overflow].join(',')).join(' | '));
      console.log('top5 tap sum: ' + q.top5.map(x => x[0] + ' ' + x[1]).join(' | '));
      console.log(`score ${q.score} score/machine ${f(q.spm)}`);
    }
    if (r.parts.length > 1) {
      const S = k => r.parts.reduce((a, q) => a + q[k], 0), sc = S('score'), m = S('mach');
      console.log(`SUM parts ${r.parts.length}: machines ${m} cells ${S('cells')} lanes ${S('lanes')} taps ${S('taps')} tapSum ${S('sum')} score ${sc} score/machine ${f(sc / m)} widths ${r.parts.map(q => q.part + ' ' + q.w).join(', ')}`);
    }
  }
  if (errs.length) { console.log('FAIL page errors: ' + errs.slice(0, 3).join(' | ')); fails++ }
  await pg.close();
}
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails ? 1 : 0);

// B0 baseline: plan-only tap/row stats. Run: node tests/nl_tap_stat.mjs (env CASE='Exosuit 1' = one case). Gate: no throw.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192', '--enable-precise-memory-info']});
const cases = [['Basic Circuits', 1000], ['Advanced Circuits', 50], ['Advanced Plate', 30], ['Exosuit', 0.1], ['Exosuit', 1]].filter(c => !process.env.CASE || process.env.CASE === c[0] + ' ' + c[1]);
let fails = 0;
for (const [name, rate] of cases) {
  const pg = await (await br.newContext()).newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(ROOT + '/index.html').href);
  await pg.waitForFunction(() => window.__fb && typeof nlPlanAll === 'function' && typeof nlFlow === 'function');
  const r = await Promise.race([pg.evaluate(([name, rate]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const t0 = performance.now();
    let p, F;
    try { F = nlFlow(P, it, 1); if (!F.ok) return {noflow: String(F.why)}; p = nlPlanAll(F, 1)[0] } catch (e) { return {thrown: e.message} }
    const ms = Math.round(performance.now() - t0);
    if (!p) return {thrown: 'no plan'};
    const L = p.tracks.map(t => Math.abs(t.x1 - t.x0)).sort((a, b) => a - b), n = L.length, sum = L.reduce((a, b) => a + b, 0);
    const pc = q => n ? L[Math.min(n - 1, Math.floor(q * n))] : 0;
    const rows = {};
    for (const c of p.cells) { const R = rows[c.row] || (rows[c.row] = {mn: 1e9, mx: -1e9, n: 0}); R.mn = Math.min(R.mn, c.ox); R.mx = Math.max(R.mx, c.ox + c.w); R.n++ }
    const rowTxt = Object.keys(rows).map(k => ({row: +k, n: rows[k].n, minOx: rows[k].mn, maxX: rows[k].mx, overflow: Math.max(0, rows[k].mx - p.w)}));
    const bi = {};
    for (const t of p.tracks) { const k = plnNm(p.lanes[t.lane].item); bi[k] = (bi[k] || 0) + Math.abs(t.x1 - t.x0) }
    const top5 = Object.entries(bi).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const mach = F.nodes.reduce((a, q) => a + q.N, 0), score = nlPlanScore(p);
    return {chosen: p.chosen, w: p.w, h: p.h, rowW: p.rowStat.rowW, cells: p.cells.length, lanes: p.lanes.length, mach, ms, taps: n, mean: n ? sum / n : 0, p50: pc(0.5), p90: pc(0.9), max: L[n - 1] || 0, sum, meanW: n ? sum / n / p.w : 0, rowTxt, top5, score, spm: score / mach};
  }, [name, rate]), new Promise(r => setTimeout(() => r({timeout: true}), 300000))]).catch(e => ({thrown: String(e.message)}));
  const tag = name + ' ' + rate;
  if (r.timeout) console.log('NOTE ' + tag + ': skipped, exceeded 300 s');
  else if (r.noflow) console.log('NOTE ' + tag + ': nlFlow refused (' + r.noflow + '), not measurable plan-only');
  else if (r.thrown) { console.log('FAIL ' + tag + ': threw ' + r.thrown); fails++ }
  else {
    const f = x => +x.toFixed(3);
    console.log('== ' + tag);
    console.log(`chosen ${r.chosen} w ${r.w} h ${r.h} machines ${r.mach} cells ${r.cells} lanes ${r.lanes} planMs ${r.ms}`);
    console.log('rowW ' + JSON.stringify(r.rowW));
    console.log(`taps ${r.taps} mean ${f(r.mean)} p50 ${r.p50} p90 ${r.p90} max ${r.max} sum ${r.sum} mean/w ${f(r.meanW)}`);
    console.log('rows (row,n,minOx,maxX,overflow vs w=' + r.w + '): ' + r.rowTxt.map(x => [x.row, x.n, x.minOx, x.maxX, x.overflow].join(',')).join(' | '));
    console.log('top5 tap sum: ' + r.top5.map(x => x[0] + ' ' + x[1]).join(' | '));
    console.log(`score ${r.score} score/machine ${f(r.spm)}`);
  }
  if (errs.length) { console.log('FAIL page errors: ' + errs.slice(0, 3).join(' | ')); fails++ }
  await pg.close();
}
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails ? 1 : 0);

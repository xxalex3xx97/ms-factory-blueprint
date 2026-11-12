// NL pods gates (slice B1). Run: node tests/nl_pods.mjs   (env BASE=1: print measured numbers only, no gates; SWEEP=1: sweep NL_PODW over 300/600/1200 first and keep the best)
// Plan-only at Mk3 (mk index 2) for Advanced Plate 30 and Exosuit 1 (Mk2 refuses: one machine out 180/min > 120 belt cap); full nlTop builds for Exosuit 0.1 (Mk3), BC/AC cases (Mk2 = mk index 1).
// Gates vs the baseline measured on HEAD before the pods change: G1 score <= 0.50 x base (AP-30, Exosuit 1 sum of parts); G2 AP-30 mean tap/w <= 0.08; G3 Exo 0.1 belts <= 0.6 x base;
// G5 new area (w*h) <= old area (pods trade width for height, so w alone may grow while the footprint shrinks); G6 BC100/BC10/AC10/AC50 belts EXACTLY the baseline, BC1000 <= baseline.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// BASELINE measured on HEAD 6a5eaef (before nl_plan.js pods), BASE=1 run
const BASE = {"plans":{"Advanced Plate 30":{"parts":[{"part":"Advanced Plate","w":16016,"h":2371,"score":6321387}]},"Exosuit 1":{"parts":[{"part":"Advanced Plate","w":16016,"h":2371,"score":6321387},{"part":"Superalloy Frame","w":82,"h":120,"score":101},{"part":"Biolattice","w":390,"h":176,"score":3447},{"part":"Chitin Composite","w":1436,"h":355,"score":59174},{"part":"Chromatic Alloy","w":120,"h":114,"score":443}]}},"builds":{"Basic Circuits 10":{"belts":152,"w":82,"h":49},"Basic Circuits 100":{"belts":1892,"w":233,"h":101},"Advanced Circuits 10":{"belts":2287,"w":202,"h":156},"Advanced Circuits 50":{"belts":19311,"w":967,"h":228},"Basic Circuits 1000":{"belts":30843,"w":2063,"h":134},"Exosuit 0.1":{"belts":162108,"w":2730,"h":687}}};   // AP-30 baseline mean tap/w 0.115
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192', '--enable-precise-memory-info']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof nlPlanAll === 'function' && typeof nlTop === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({timeout: true}), ms))]);
// plan-only: armoury items split into leaf parts (like nlArmoury), each nlFlow + nlPlanAll[0]
const planOnly = ([name, rate, mk]) => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
  const P0 = plan(it, rate, mk, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const jobs = [], isA = x => { const T = P0.nodes[x]; return T && T.crafter && /Armoury/i.test(T.crafter) };
  if (isA(it)) {
    const leaf = new Map(), walk = (x, r) => { const T = P0.nodes[x]; for (const [y, n] of T.rec.i) { const q = r * n / T.rec.o[1]; if (isA(y)) walk(y, q); else leaf.set(y, (leaf.get(y) || 0) + q) } };
    walk(it, P0.nodes[it].rate);
    for (const [c, r] of leaf) jobs.push([c, r]);
  } else jobs.push([it, rate]);
  const parts = [];
  for (const [c, r] of jobs) {
    const P = plan(c, r, mk, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const t0 = performance.now();
    let p;
    try { const F = nlFlow(P, c, mk); if (!F.ok) return {err: plnNm(c) + ': ' + F.why}; p = nlPlanAll(F, mk)[0] } catch (e) { return {err: plnNm(c) + ': ' + e.message} }
    if (!p || p.ok === false) return {err: plnNm(c) + ': no plan'};
    const L = p.tracks.map(t => Math.abs(t.x1 - t.x0)), sum = L.reduce((a, b) => a + b, 0);
    parts.push({part: plnNm(c), chosen: p.chosen, w: p.w, h: p.h, ms: Math.round(performance.now() - t0), score: nlPlanScore(p), meanW: L.length ? sum / L.length / p.w : 0});
  }
  return {parts};
};
const build = ([name, rate, mk]) => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
  const P = plan(it, rate, mk, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const t0 = performance.now();
  let L;
  try { L = nlTop(P, it, mk, 0, {}) } catch (e) { return {err: e.message} }
  if (!L.ok) return {err: L.why};
  return {belts: L.stat.belts, w: L.w, h: L.h, chosen: L.chosen, ms: Math.round(performance.now() - t0)};
};
const run = (fn, a, ms = 600000) => race(pg.evaluate('(' + fn.toString() + ')(' + JSON.stringify(a) + ')'), ms);
const PLANS = [['Advanced Plate', 30, 2], ['Exosuit', 1, 2]];
const BUILDS = [['Basic Circuits', 10, 1], ['Basic Circuits', 100, 1], ['Advanced Circuits', 10, 1], ['Advanced Circuits', 50, 1], ['Basic Circuits', 1000, 1], ['Exosuit', 0.1, 2]];
const measure = async () => {
  const M = {plans: {}, builds: {}};
  for (const a of PLANS) { const r = await run(planOnly, a); M.plans[a[0] + ' ' + a[1]] = r; console.log('plan', a[0], a[1], JSON.stringify(r)) }
  for (const a of BUILDS) { const r = await run(build, a); M.builds[a[0] + ' ' + a[1]] = r; console.log('build', a[0], a[1], JSON.stringify(r)) }
  return M;
};
if (process.env.BASE) { const M = await measure(); console.log('BASE ' + JSON.stringify(M)); await br.close(); process.exit(0) }
if (process.env.SWEEP) {
  let best = null;
  for (const w of [300, 600, 1200]) {
    await pg.evaluate(w => { NL_PODW = w }, w);
    const s = [];
    for (const a of [['Exosuit', 0.1, 2], ['Advanced Plate', 30, 2]]) { const r = await run(planOnly, a); s.push(r.parts ? r.parts.reduce((x, q) => x + q.score, 0) : 1e18) }
    console.log('NL_PODW', w, 'scores Exo0.1 / AP30', s.join(' / '));
    const t = s[0] + s[1]; if (!best || t < best.t) best = {w, t};
  }
  console.log('best NL_PODW', best.w);
  await pg.evaluate(w => { NL_PODW = w }, best.w);
}
if (process.env.PODMIN) await pg.evaluate(v => { NL_PODMIN = v }, +process.env.PODMIN);   // env PODMIN=<n>: try another NL_PODMIN
const M = await measure();
const sum = r => r.parts.reduce((a, q) => a + q.score, 0);
for (const k of Object.keys(BASE.plans || {})) {
  const n = M.plans[k], b = BASE.plans[k];
  if (!n.parts) { check(false, k + ': ' + JSON.stringify(n)); continue }
  console.log(k, 'score', sum(n), 'base', sum(b), 'ratio', (sum(n) / sum(b)).toFixed(3));
  check(sum(n) <= 0.5 * sum(b), 'G1 ' + k + ' score <= 0.50 x base');
  n.parts.forEach((q, i) => check(q.w * q.h <= b.parts[i].w * b.parts[i].h, 'G5 ' + k + ' ' + q.part + ' area ' + q.w * q.h + ' <= ' + b.parts[i].w * b.parts[i].h));
}
if (BASE.plans) {
  const ap = M.plans['Advanced Plate 30'];
  if (ap.parts) check(ap.parts[0].meanW <= 0.08, 'G2 AP-30 mean tap/w ' + ap.parts[0].meanW.toFixed(3) + ' <= 0.08');
}
for (const k of Object.keys(BASE.builds || {})) {
  const n = M.builds[k], b = BASE.builds[k];
  if (n.belts === undefined) { check(false, k + ': ' + JSON.stringify(n)); continue }
  check(n.w * n.h <= b.w * b.h, 'G5 ' + k + ' area ' + n.w * n.h + ' <= ' + b.w * b.h);
  if (k === 'Exosuit 0.1') check(n.belts <= 0.6 * b.belts, 'G3 ' + k + ' belts ' + n.belts + ' <= 0.6 x ' + b.belts);
  else if (k === 'Basic Circuits 1000') check(n.belts <= b.belts, 'G6 ' + k + ' belts ' + n.belts + ' <= ' + b.belts);
  else check(n.belts === b.belts, 'G6 ' + k + ' belts ' + n.belts + ' == ' + b.belts);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails ? 1 : 0);

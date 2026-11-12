// NL6 u-axis gates. Run: node tests/nl_u.mjs   Exit 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof nlPlan1 === 'function' && typeof nlCellU === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [['Basic Circuits', 100], ['Advanced Circuits', 10], ['Advanced Circuits', 50], ['Basic Circuits', 1000]];
for (const [name, rate] of cases) {
  const tag = name + ' ' + rate;
  const r = await pg.evaluate(([name, rate]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const F = nlFlow(P, it, 1), bw = def(PLC_BOX).w, bad = [];
    const WB = nlWBase(F, bw);
    for (const n of F.nodes) {
      const u = nlCellU(n);
      if (u.length !== n.cells.length) bad.push('u length');
      u.forEach((v, i) => { if (!(v > 0 && v < 1)) bad.push('u out of (0,1): ' + v); if (i && !(v > u[i - 1])) bad.push('u not increasing') });
    }
    const rs = [];
    for (const n of F.nodes) rs[n.row] = (rs[n.row] || 0) + n.cells.reduce((a, g) => a + g.w + 1, 0);
    for (const v of rs) if (v !== undefined && WB < v) bad.push('WBase ' + WB + ' < row ' + v);
    const out = {bad: bad.slice(0, 5), nbad: bad.length, WB};
    const tapLen = p => { let s = 0, n = 0; for (const t of p.tracks) { s += Math.abs(t.x1 - t.x0); n++ } return n ? s / n : 0 };
    const p0 = nlPlan1(F, 1, null);
    out.old = p0.ok ? tapLen(p0) : null; out.oldScore = p0.ok ? nlPlanScore(p0) : null;
    if (typeof nlPlan1 === 'function' && nlPlan1.length >= 4) {
      const p = nlPlan1(F, 1, null, WB);
      if (!p.ok) { out.why = p.why; return out }
      out.W = tapLen(p); out.score = nlPlanScore(p); out.ug = p.ug; out.dim = p.w + 'x' + p.h;
      const lane = new Map(p.lanes.map(l => [l.id, l]));
      for (const it2 of new Set(p.lanes.map(l => l.item))) {
        const L = p.lanes.filter(l => l.item === it2);
        for (let i = 1; i < L.length; i++) if (!(L[i].x > L[i - 1].x)) { out.badOrder = (out.badOrder || 0) + 1 }
      }
      let nh = 0; for (const c of p.cells) for (const h of c.heads) if (c.feed[h.id] === undefined) nh++;
      out.unfed = nh;
    }
    return out;
  }, [name, rate]);
  check(r.nbad === 0, tag + ': u + WBase ' + r.WB + (r.nbad ? ' ' + r.bad.join(' | ') : ''));
  if (r.W !== undefined || r.why) {
    check(!r.why, tag + ': nlPlan1 with W ok ' + (r.why || ''));
    if (!r.why) {
      check(r.unfed === 0 && !r.badOrder, tag + ': every head has a lane, lane x increases with u (' + (r.badOrder || 0) + ' bad)');
      console.log(tag + ' mean |tap| old ' + r.old.toFixed(1) + ' W ' + r.W.toFixed(1) + ' | score old ' + r.oldScore + ' W ' + r.score + ' | ' + r.dim);
      if (/ (50|1000)$/.test(tag)) check(r.W < r.old, tag + ': mean tap below non-W plan');
    }
  }
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// pfBands step 5b: pfBandAtom (grp/hub/raw atoms)
// Run:  node tests/pfb_atoms.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfBandAtom === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

for (const x0 of [1, 20, 27, 58]) {
  const r = await pg.evaluate(x0 => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Magnetic Coils');
    const P = plan(it, 30, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const G = pfBandGraph(P, it, 1);
    if (G.ok === false) return {refused: G.why};
    const Hl = Math.max(...G.nodes.map(n => n.h));
    const o = {x0, Hl, grp: 0, hub: 0, raw: 0, bad: [], erows: null};
    for (const n of G.nodes) {
      const nOut = G.edges.filter(e => e.from === n.id).length, nIn = G.edges.filter(e => e.to === n.id).length;
      const A = pfBandAtom(n, x0, Hl, nOut, nIn, 1);
      const bad = m => o.bad.push(n.id + ': ' + m);
      if (A.ok === false) { bad('refused ' + A.why); continue }
      o[n.kind]++;
      if (pfCheck({items: A.items, w: A.x1 + 1, h: Hl, ports: []}).ov !== 0) bad('overlap');
      if (A.x0 < x0) bad('x0 < start');
      if (A.outs.length !== nOut) bad('outs ' + A.outs.length + ' != ' + nOut);
      for (const q of A.items) {
        const d = dim(q);
        if (q.y + d.h > Hl || q.y < 0) bad('y out of band ' + q.cls + '@' + q.x + ',' + q.y);
        if (q.x < A.x0 || q.x + d.w > A.x1) bad('x out of span');
        if (q.cls !== PLC_BELT[1] && q.cls !== PLC_UG[1]) {
          const c = PF_GRID.cw;
          if (Math.floor(q.x / c) !== Math.floor((q.x + d.w - 1) / c) || pfMod(q.x, c) < 1 || pfMod(q.x + d.w - 1, c) > c - 2) bad('straddles wall ' + q.cls + '@' + q.x);
        }
      }
      if (n.kind === 'grp') {
        if (A.items.some(q => q.cls === PLC_BOX && q.ct && q.ct.length)) bad('head box left');
        if (A.ins.length !== n.sizes.length * n.k) bad('ins ' + A.ins.length);
        if (A.items.filter(q => q.cls === n.cls).some(q => !q.rec)) bad('machine without rec');
      } else {
        if (A.ins.length !== 5) bad('hub ins ' + A.ins.length);
        const Hn = pfHubNode(), E = Hn.outs.filter(p => p.edge === 'E');
        if (!o.erows) o.erows = E.map(p => p.y);
        const ex = A.outs.slice(Hn.outs.filter(p => p.edge === 'S').length).map(p => p.x);
        if (new Set(ex).size !== ex.length) bad('E risers share a column');
        if (n.kind === 'raw' && !A.items.some(q => q.ct && q.ct.length && q.ct[0].inf)) bad('raw has no inf source');
      }
    }
    // synthetic hub (graph has none): 8 outs, 6 ins
    const S = pfBandAtom({id: 'H:x', kind: 'hub', item: it}, x0, Hl, 8, 6, 1);
    if (S.ok === false) o.bad.push('synthetic hub refused ' + S.why);
    else {
      if (pfCheck({items: S.items, w: S.x1 + 1, h: Hl, ports: []}).ov !== 0) o.bad.push('synthetic hub overlap');
      if (S.outs.length !== 8 || new Set(S.outs.map(p => p.x)).size !== 8) o.bad.push('synthetic hub outs not 8 distinct');
      if (S.items.some(q => q.y >= Hl)) o.bad.push('synthetic hub y out of band');
      o.synth = S.outs.map(p => p.x);
    }
    return o;
  }, x0);
  if (r.refused) { check(false, 'refused ' + r.refused); continue }
  console.log(JSON.stringify(r));
  check(r.bad.length === 0, 'x0=' + x0 + ' grp ' + r.grp + ' hub ' + r.hub + ' raw ' + r.raw + (r.bad.length ? ' ' + r.bad.slice(0, 5).join(' | ') : ''));
  check(r.erows && r.erows.every((y, i) => i === 0 || y > r.erows[i - 1]), 'E port rows distinct ascending ' + JSON.stringify(r.erows));
  check(r.grp > 0 && r.raw > 0, 'both grp and raw nodes covered');
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

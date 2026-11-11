// Prefab HUB/WALL (step 5): pfLine = source hub (4 containers) -> 4 belt rows -> WALL_X (UG pair, L=4) in the middle -> sink hub. Container Mk1 and Large Mk2.
// Checks: no overlap (pfCheck ov 0), every UG pair span (exit-entrance+1) <= maxApart, 60 s sim: items must reach the sink hub (zero = wiring bug, FAIL).
// Run:  node tests/prefab_hub.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfLine === 'function' && typeof simAdvance === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [
  {name: 'Container Mk1 n=4 wall', box: 'DAT_Container', mk: 0, n: 4, len: 12, wall: true},
  {name: 'Large Mk2 n=4 wall', box: 'DAT_Container_2', mk: 1, n: 4, len: 12, wall: true},
];
for (const c of cases) {
  const r = await pg.evaluate(c => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Xenoeukarya');
    const L = pfLine(c.n, c.box, c.mk, it, c.len, c.wall);
    if (L.ok === false) return {refused: L.why};
    const chk = pfCheck(L);
    const ug = L.items.filter(b => PLC_UG.includes(b.cls));
    const pairs = ug.reduce((a, b) => { (a[b.y] = a[b.y] || []).push(b.x); return a }, {});
    const maxApart = def(PLC_UG[c.mk]).maxApart;
    const spans = Object.values(pairs).map(xs => Math.max(...xs) - Math.min(...xs) + 1);
    const items = pfPlace({id: 1, proto: 'pfLine', args: [c.n, c.box, c.mk, it, c.len, c.wall], at: {gx: 0, gy: 0}});
    S.blocks = items.map(b => ({id: b.id, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined, rec: b.rec}));
    try { smSet(true) } catch (e) {}
    simReset && simReset();
    for (let s = 0; s < 60; s++) simAdvance(1, 1);
    const sinkStock = [...SIM.C.values()].reduce((a, cn) => a + ([...cn.st.values()].filter(x => !x.inf).reduce((b, x) => b + x.n, 0)), 0);
    return {w: L.w, h: L.h, items: L.items.length, ov: chk.ov, ugPairs: Object.keys(pairs).length, maxSpan: spans.length ? Math.max(...spans) : 0, maxApart, sinkStock, produced: simProd().byItem};
  }, c);
  console.log(c.name, JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' refused: ' + r.refused); continue }
  check(r.ov === 0, c.name + ': no overlap (ov ' + r.ov + ')');
  check(r.ugPairs === 4 && r.maxSpan <= r.maxApart, c.name + ': UG pairs ' + r.ugPairs + ' (expect 4), span ' + r.maxSpan + ' <= maxApart ' + r.maxApart);
  check(r.sinkStock > 0, c.name + ': items reached the sink hub: ' + r.sinkStock);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

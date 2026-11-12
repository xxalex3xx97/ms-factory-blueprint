// LC S4 adapters (lcJog, lcUnder, lcTap, lcMerge, lcSink) on blank floors: infinite source box, sink boxes, sim 120 s, rate over last 60 s, tolerance 3%.
// Run:  node tests/lc_adapt.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof lcJog === 'function' && typeof lcTap === 'function' && typeof lcMerge === 'function' && typeof lcSink === 'function' && typeof lcUnder === 'function' && typeof simAdvance === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// cases built in page. Each returns {items, srcs:[[x,y]] (belt start under an infinite box), sinks:[idx into items], full:[idx]}.
const run = name => pg.evaluate(name => {
  const mk = 0, sp = 0, cap = MKS[mk][1];
  const RAW = [...plnBy(false).keys()][0];
  const pS = portsOf({cls: PLC_BOX, x: 0, y: 0, rot: 0, off: []}).find(p => p.f === 'S');
  let items = [], srcs = [], sinkAt = [], full = [];
  const add = r => { items.push(...r.items) };
  const sink = (x0, y, x1) => { const r = lcSink(x0, y, x1, mk); add(r); sinkAt.push(items.length - 1) };
  if (name === 'straight') { srcs = [[10, 2]]; add(lcJog(10, 2, 10, 0, 12, mk)); sink(10, 12, 10) }
  if (name === 'jog') { srcs = [[10, 2]]; add(lcJog(10, 2, 16, 6, 12, mk)); sink(16, 12, 16) }
  if (name === 'jog-west') { srcs = [[16, 2]]; add(lcJog(16, 2, 10, 6, 12, mk)); sink(10, 12, 10) }
  if (name === 'tap' || name === 'tap-full') {
    srcs = [[10, 2]]; add(lcJog(10, 2, 10, 0, 6, mk));
    add(lcTap(10, 6, 'e', 14, 12, 12, mk, sp)); sink(10, 12, 10); sink(14, 12, 14);
    if (name === 'tap-full') full = [sinkAt[0]];
  }
  if (name === 'merge') {   // tap splits 30 into 15+15, merge puts them back
    srcs = [[10, 2]]; add(lcJog(10, 2, 10, 0, 4, mk));
    add(lcTap(10, 4, 'e', 14, 5, 8, mk, sp));
    add(lcMerge(10, 5, 14, 14, 8, mk)); sink(10, 14, 10);
  }
  if (name === 'merge-side') {   // side feed alone (no main source) must carry full flow
    srcs = [[14, 8]]; add(lcMerge(10, 5, 14, 14, 8, mk)); sink(10, 14, 10);
  }
  if (name === 'ug') {
    srcs = [[10, 2], [6, 2]];
    add(lcUnder(10, 2, 14, 8, mk)); add(lcJog(6, 2, 14, 8, 14, mk));
    sink(10, 14, 10); sink(14, 14, 14);
  }
  srcs.forEach(([x, y]) => items.push({cls: PLC_BOX, x: x - pS.x, y: y - 1 - pS.y, rot: 0, ct: [{item: RAW, n: 0, inf: true}]}));
  // full sink: DAT_Container_2 (has a capacity, PLC_BOX is unlimited) pre-filled past capacity, N port on the same cell as the belt end
  full.forEach(i => { const b = items[i], pn = portsOf({cls: PLC_BOX, x: 0, y: 0, rot: 0, off: []}).find(p => p.f === 'N'), p2 = portsOf({cls: 'DAT_Container_2', x: 0, y: 0, rot: 0, off: []}).find(p => p.f === 'N'); items[i] = {cls: 'DAT_Container_2', x: b.x + pn.x - p2.x, y: b.y + pn.y - p2.y, rot: 0, ct: [{item: RAW, n: 1e7}]} });
  S.blocks = items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined}));
  try { smSet(true) } catch (e) {}
  simReset && simReset();
  const stock = i => { const cn = SIM.C.get(i + 1); const x = cn && cn.st.get(RAW); return x ? x.n : 0 };
  let base = null;
  for (let s = 0; s < 120; s++) { simAdvance(1, 1); if (s === 59) base = sinkAt.map(stock) }
  const rates = sinkAt.map((i, k) => stock(i) - base[k]);
  return {rates, cap, ov: pfCheck({items, w: 40, h: 30, ports: []}).ov};
}, name);

const near = (v, e) => Math.abs(v - e) <= 0.03 * e;
// name, expected per sink as fraction of cap (null = sink full/skipped: expected 0 change)
const cases = [['straight', [1]], ['jog', [1]], ['jog-west', [1]], ['tap', [.5, .5]], ['tap-full', [0, 1]], ['merge', [1]], ['merge-side', [1]], ['ug', [1, 1]]];
for (const [n, exp] of cases) {
  const r = await run(n);
  console.log(n + ' rates/min ' + r.rates.join(', ') + ' (belt cap ' + r.cap + ', pfCheck ov ' + r.ov + ')');
  check(r.rates.length === exp.length && r.rates.every((v, i) => exp[i] === 0 ? Math.abs(v) <= 0.03 * r.cap : near(v, exp[i] * r.cap)), n + ' rates ' + r.rates.join('/') + ' vs ' + exp.map(e => e * r.cap).join('/'));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

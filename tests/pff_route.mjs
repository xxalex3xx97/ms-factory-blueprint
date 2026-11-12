// pfFact step 4b/4c: route tests. pfSplOff + pfFactRoute (manifold trunk, straight/L feeds, UG crossings, no UG on wall columns).
// Checks: geometry cases S/M/L/X/W/C, pfCheck overlap 0 on M and X, sim even split of a manifold (3 empty sinks, 600 s).
// Run:  timeout 300 node tests/pff_route.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTree === 'function' && typeof pfFactAlloc === 'function' && typeof pfFactRoute === 'function' && typeof pfSplOff === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// geometry cases (runs in page): returns [[ok,msg],...]
const geo = () => {
  const out = [], ok = (c, m) => out.push([!!c, m]);
  const R = links => pfFactRoute(links, 1, 1);
  const B = PLC_BELT[1], U = PLC_UG[1], SP = PLC_SPL[1];
  const at = (items, x, y) => items.filter(q => q.x === x && q.y === y);
  // world faces of the off keys of a splitter item (rot taken from the item)
  const offFaces = q => {
    const pp = portsOf({cls: q.cls, x: 0, y: 0, rot: q.rot, off: []});
    return q.off.map(k => { const p = pp.find(p => p.key === k); return p ? FN[p.wf] : '?' }).sort().join('');
  };
  // S: straight
  let r = R([{xp: 10, yp: 2, heads: [10], y1: 8, t: -1}]);
  let S = r.ok ? r.items : [];
  ok(r.ok, 'S ok' + (r.ok ? '' : ' (' + r.why + ')'));
  ok(S.length === 6 && S.every(q => q.cls === B && q.rot === 1 && q.x === 10), 'S 6 belts rot1 at x10 (' + S.length + ')');
  // M: manifold
  r = R([{xp: 10, yp: 2, heads: [10, 14, 18], y1: 12, t: 6}]);
  ok(r.ok, 'M ok' + (r.ok ? '' : ' (' + r.why + ')'));
  const M = r.ok ? r.items : [];
  ok(M.filter(q => q.cls === SP).length === 3, 'M 3 splitters (' + M.filter(q => q.cls === SP).length + ')');
  const s10 = at(M, 10, 6)[0], s14 = at(M, 14, 6)[0], s18 = at(M, 18, 6)[0];
  ok(s10 && s10.cls === SP && s10.rot === 1 && s10.off.length === 1 && offFaces(s10) === 'W', 'M T splitter (10,6) rot1 off 1 key = W (' + (s10 && s10.off && s10.off.length) + ', ' + (s10 && offFaces(s10)) + ')');
  ok(s14 && s14.cls === SP && s14.rot === 0 && s14.off.length === 1 && offFaces(s14) === 'N', 'M splitter (14,6) rot0 off 1 key = N (' + (s14 && s14.off && s14.off.length) + ')');
  ok(s18 && s18.cls === SP && s18.rot === 0 && s18.off.length === 2 && offFaces(s18) === 'EN', 'M splitter (18,6) rot0 off 2 keys = E,N (' + (s18 && s18.off && s18.off.length) + ')');
  ok([11, 12, 13, 15, 16, 17].every(x => { const q = at(M, x, 6)[0]; return q && q.cls === B && q.rot === 0 }), 'M trunk belts rot0 at 11-13, 15-17');
  ok([10, 14, 18].every(x => [7, 8, 9, 10, 11].every(y => { const q = at(M, x, y)[0]; return q && q.cls === B && q.rot === 1 })), 'M drops rot1 at x 10,14,18 rows 7..11');
  ok(at(M, 10, 2).length === 1 && at(M, 10, 5).length === 1 && at(M, 10, 2)[0].rot === 1, 'M producer leg rot1 at x10 rows 2..5');
  // L: corner feed
  r = R([{xp: 8, yp: 2, heads: [10, 14], y1: 12, t: 6}]);
  ok(r.ok, 'L ok' + (r.ok ? '' : ' (' + r.why + ')'));
  const L = r.ok ? r.items : [];
  const c8 = at(L, 8, 6)[0];
  ok(c8 && c8.cls === B && c8.rot === 0, 'L corner belt (8,6) rot0');
  ok(L.filter(q => q.cls === SP).length === 2 && at(L, 10, 6)[0].cls === SP && at(L, 14, 6)[0].cls === SP, 'L splitters at 10 and 14');
  ok(at(L, 10, 6)[0].rot === 0 && offFaces(at(L, 10, 6)[0]) === 'N' && offFaces(at(L, 14, 6)[0]) === 'EN', 'L splitter offs: 10 -> N, 14 -> E,N');
  // X: crossing a trunk with a straight leg
  r = R([{xp: 10, yp: 2, heads: [10, 14], y1: 12, t: 6}, {xp: 12, yp: 2, heads: [12], y1: 12, t: -1}]);
  ok(r.ok, 'X ok' + (r.ok ? '' : ' (' + r.why + ')'));
  const X = r.ok ? r.items : [];
  ok(at(X, 12, 5)[0] && at(X, 12, 5)[0].cls === U && at(X, 12, 7)[0] && at(X, 12, 7)[0].cls === U, 'X UG pair at (12,5) and (12,7)');
  ok(at(X, 12, 6).length === 1 && at(X, 12, 6)[0].cls === B && at(X, 12, 6)[0].rot === 0, 'X only the trunk belt at (12,6)');
  // W: wall column crossing
  r = R([{xp: 10, yp: 2, heads: [10, 40], y1: 12, t: 6}, {xp: 30, yp: 2, heads: [30], y1: 12, t: -1}]);
  ok(!r.ok && /wall column/.test(r.why), 'W refused on wall column (' + (r.ok ? 'ok' : r.why) + ')');
  // C: leg through a splitter
  r = R([{xp: 10, yp: 2, heads: [10, 14, 18], y1: 12, t: 6}, {xp: 14, yp: 2, heads: [14], y1: 12, t: -1}]);
  ok(!r.ok, 'C leg through splitter refused (' + (r.ok ? 'ok' : r.why) + ')');
  // overlap
  const pc = items => pfCheck({items, w: 40, h: 14, ports: []});
  const cM = pc(M), cX = pc(X);
  ok(cM.ov === 0, 'pfCheck M ov 0 (ov ' + cM.ov + ', seamBad ' + cM.seamBad + ')');
  ok(cX.ov === 0, 'pfCheck X ov 0 (ov ' + cX.ov + ', seamBad ' + cX.seamBad + ')');
  return out;
};

// sim: manifold M, source box above, 3 empty sinks below the drops. Returns sink deltas over the last 480 s.
const simEven = () => {
  const DY = 4, raw = [...plnBy(false).keys()].find(i => plnNm(i) === 'Nickel Plates');
  if (raw === undefined) return {refused: 'Nickel Plates not found'};
  const RAW = plnBy(false).get(raw)[0].r.i[0][0];
  const L0 = {xp: 10, yp: 2 + DY, heads: [10, 14, 18], y1: 12 + DY, t: 6 + DY};
  const r = pfFactRoute([L0], 1, 1);
  if (!r.ok) return {refused: r.why};
  const sp = portsOf({cls: PLC_BOX, x: 0, y: 0, rot: 0, off: []});
  const pS = sp.find(p => p.f === 'S'), pN = sp.find(p => p.f === 'N');
  const items = [...r.items];
  items.push({cls: PLC_BOX, x: L0.xp - pS.x, y: L0.yp - 1 - pS.y, rot: 0, ct: [{item: RAW, n: 0, inf: true}]});
  const sinkIdx = [];
  for (const h of L0.heads) { items.push({cls: PLC_BOX, x: h - pN.x, y: L0.y1 - pN.y, rot: 0, ct: []}); sinkIdx.push(items.length - 1) }
  S.blocks = items.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot, pid: 0, off: b.off, ct: b.ct ? b.ct.map(q => ({...q})) : undefined}));
  try { smSet(true) } catch (e) {}
  simReset && simReset();
  const stock = id => { const cn = SIM.C.get(id); const x = cn && cn.st.get(RAW); return x ? x.n : 0 };
  const ids = sinkIdx.map(i => i + 1);
  let base = null;
  for (let s = 0; s < 600; s++) { simAdvance(1, 1); if (s === 119) base = ids.map(stock) }
  const end = ids.map(stock);
  return {v: end.map((e, i) => e - base[i]), raw: plnNm(RAW), cap: MKS[1][1]};
};

const g = await pg.evaluate(geo);
for (const [o, m] of g) check(o, m);

const sim = await pg.evaluate(simEven);
if (sim.refused) check(false, 'sim refused: ' + sim.refused);
else {
  const sum = sim.v.reduce((a, b) => a + b, 0), mean = sum / sim.v.length;
  console.log('sim sink values over last 480 s (item ' + sim.raw + '): ' + sim.v.join(', ') + ' sum ' + sum + ' mean ' + mean.toFixed(1));
  const even = sim.v.every(v => Math.abs(v - mean) <= 0.15 * mean);
  check(even, even ? 'sim splitter even (each within 15% of mean)' : 'sim splitter not even: ' + sim.v.join(', '));
  check(sum >= 0.95 * sim.cap * 8, 'sim sum ' + sum + ' >= 95% of belt cap ' + sim.cap + ' x 8 min (' + (0.95 * sim.cap * 8) + ')');
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

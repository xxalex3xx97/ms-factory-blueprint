// pfBands step 2: node builders pfGrpNode (outDown column group) and pfHubNode (Large container), plus tile-fit helpers pfFitX/pfFitY/pfTrackOk.
// Group: Nickel Plates 40/min, Magnetic Coils 30/min, one column per sizes[] entry, no overlap, input count = columns x inputs, out on S edge, org shift moves columns.
// Hub: DAT_Container_2 with 4 N + 1 W in, 4 S + 4 E out. Fit helpers: boolean table.
// Run:  node tests/pfb_nodes.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfGrpNode === 'function' && typeof pfHubNode === 'function' && typeof pfFitX === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const cases = [{name: 'Nickel Plates', rate: 40}, {name: 'Magnetic Coils', rate: 30}];
for (const c of cases) {
  const r = await pg.evaluate(c => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const T = P.nodes[it], cb = plnCb(T.crafter), cls = def(cb.id).key, N = T.machines, mk = 1, cap = MKS[mk][1];
    const ins = T.rec.i.map(([x]) => x), flows = ins.map(x => ({item: x, flow: P.edges.find(e => e.from === x && e.to === it).flow / N}));
    const k = ins.length, m = Math.min(...flows.map(f => Math.floor(cap / f.flow + 1e-9)));
    const Fh = floorRect({cls: plcCls(PL_STD[PL_STD.length - 1]), x: 0, y: 0, h: 0, rot: 0}).h, pwb = portsOf({cls: PLC_BOX, x: 0, y: 0, rot: 0, off: []}).find(p => p.f === 'W'), SH = pwb ? pwb.y + 1 : 0;
    let mh = Math.min(m, N);
    while (mh > 1) { const C = pfCol(cls, k, flows, mh, mk, true); if (C.ok === false || C.h + SH <= Fh) break; mh-- }
    const sizes = []; for (let r = N; r > 0; r -= mh) sizes.push(Math.min(mh, r));
    const outF = P.edges.find(e => e.to == null).flow;
    const G = pfGrpNode(cls, k, flows, sizes, mk, outF);
    if (G.ok === false) return {refused: G.why};
    const chk = pfCheck({items: G.items, w: G.w, h: G.h, ports: []});
    const same = JSON.stringify(pfGrpNode(cls, k, flows, sizes, mk, outF, G.cx).items) === JSON.stringify(G.items);
    let shifted = null;
    if (sizes.length > 1) {
      const G2 = pfGrpNode(cls, k, flows, sizes, mk, outF, G.cx.map((x, i) => x + 2 * i));
      shifted = G2.ok === false ? G2.why : {ov: pfCheck({items: G2.items, w: G2.w, h: G2.h, ports: []}).ov, dw: G2.w - G.w, want: 2 * (sizes.length - 1)};
    }
    return {name: c.name, sizes, w: G.w, h: G.h, ov: chk.ov, nIns: G.ins.length, want: sizes.length * k, outEdge: G.out.edge, outX: G.out.x, same, shifted, nOuts: G.outs.length, outsX0: G.outs[0].x};
  }, c);
  console.log(c.name, c.rate, JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' ' + c.rate + ' refused: ' + r.refused); continue }
  check(r.ov === 0, c.name + ' ' + c.rate + ': no overlap (ov ' + r.ov + ')');
  check(r.nIns === r.want, c.name + ' ' + c.rate + ': input terminals ' + r.nIns + ' = columns x inputs ' + r.want);
  check(r.outEdge === 'S' && r.outX >= 0 && r.outX < r.w, c.name + ' ' + c.rate + ': out on S edge inside width (x ' + r.outX + ')');
  check(r.same === true, c.name + ' ' + c.rate + ': org = cx reproduces items');
  check(r.nOuts >= 1 && r.outsX0 === r.outX, c.name + ' ' + c.rate + ': outs[] present, out = outs[0] (outs ' + r.nOuts + ')');
  if (r.shifted !== null) {
    check(typeof r.shifted === 'object' && r.shifted.ov === 0, c.name + ' ' + c.rate + ': shifted columns no overlap');
    check(typeof r.shifted === 'object' && r.shifted.dw === r.shifted.want, c.name + ' ' + c.rate + ': shifted width grows by ' + (r.shifted.want) + ' (dw ' + (r.shifted.dw) + ')');
  }
}

const hub = await pg.evaluate(() => {
  const H = pfHubNode();
  return {nIns: H.ins.length, nOuts: H.outs.length, insEdges: H.ins.map(p => p.edge).join(','), outNames: H.outs.map(p => p.name).join(','), ov: pfCheck({items: H.items, w: H.w, h: H.h, ports: []}).ov};
});
console.log('hub ' + JSON.stringify(hub));
check(hub.nIns === 5, 'hub ins = 5 (' + hub.nIns + ')');
check(hub.nOuts === 8, 'hub outs = 8 (' + hub.nOuts + ')');
check(hub.insEdges === 'N,N,N,N,W', 'hub ins edges N,N,N,N,W (' + hub.insEdges + ')');
check(hub.outNames === 'S0,S1,S2,S3,E0,E1,E2,E3', 'hub out names S0..S3 then E0..E3 (' + hub.outNames + ')');
check(hub.ov === 0, 'hub no overlap (ov ' + hub.ov + ')');

const fit = await pg.evaluate(() => [
  pfFitX(1, 5, false), pfFitX(24, 5, false), pfFitX(25, 5, false), pfFitX(60, 3, false),
  pfFitX(2, 1, true), pfFitX(27, 1, true), pfFitX(28, 1, true), pfFitX(1, 1, true), pfFitX(32, 1, true),
  pfFitY(1, 28), pfFitY(1, 29), pfFitY(30, 2), pfFitY(31, 2),
  pfTrackOk(5, 3), pfTrackOk(4, 3), pfTrackOk(27, 0), pfTrackOk(28, 0), pfTrackOk(32, 0), pfTrackOk(31, 0)]);
const want = [true, true, false, false, true, true, false, false, true, true, false, false, true, true, false, true, false, true, false];
const names = ['FitX(1,5)', 'FitX(24,5)', 'FitX(25,5)', 'FitX(60,3)', 'FitXd(2,1)', 'FitXd(27,1)', 'FitXd(28,1)', 'FitXd(1,1)', 'FitXd(32,1)', 'FitY(1,28)', 'FitY(1,29)', 'FitY(30,2)', 'FitY(31,2)', 'Track(5,3)', 'Track(4,3)', 'Track(27,0)', 'Track(28,0)', 'Track(32,0)', 'Track(31,0)'];
fit.forEach((v, i) => check(v === want[i], 'fit ' + names[i] + ' = ' + want[i] + ' (got ' + v + ')'));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

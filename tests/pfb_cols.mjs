// pfBands step 3: pfGrpNode org shift (uniform and per-column)
// Run:  node tests/pfb_cols.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfGrpNode === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const r = await pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Magnetic Coils');
  const P = plan(it, 30, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const T = P.nodes[it], cb = plnCb(T.crafter), cls = def(cb.id).key, N = T.machines, mk = 1;
  const ins = T.rec.i.map(([x]) => x), flows = ins.map(x => ({item: x, flow: P.edges.find(e => e.from === x && e.to === it).flow / N}));
  const k = ins.length, sizes = [2, 2];
  const B = pfGrpNode(cls, k, flows, sizes, mk, 0);
  if (B.ok === false) return {refused: B.why};
  const bounds = G => G.items.every(q => { const d = dim(q); return q.x >= 0 && q.y >= 0 && q.x + d.w <= G.w && q.y + d.h <= G.h });
  const ov = G => pfCheck({items: G.items, w: G.w, h: G.h, ports: []}).ov;
  const d = 5;
  const U = pfGrpNode(cls, k, flows, sizes, mk, 0, B.cx.map(x => x + d));
  const V = pfGrpNode(cls, k, flows, sizes, mk, 0, [B.cx[0], B.cx[1] + 3]);
  const Z = pfGrpNode(cls, k, flows, sizes, mk, 0, B.cx);
  const col = i => Math.floor(i / k);
  return {
    k, base: {ov: ov(B), inb: bounds(B)},
    same: JSON.stringify(Z.items) === JSON.stringify(B.items) && Z.w === B.w,
    uni: {ov: ov(U), inb: bounds(U), ins: U.ins.every((p, i) => p.x === B.ins[i].x + d && p.item === B.ins[i].item), out: U.out.x === B.out.x + d, cx: U.cx.every((x, i) => x === B.cx[i] + d), dw: U.w - B.w},
    one: {ov: ov(V), inb: bounds(V), ins: V.ins.every((p, i) => p.x === B.ins[i].x + (col(i) === 1 ? 3 : 0)), out: V.out.x === B.out.x + 3, cx: V.cx[0] === B.cx[0] && V.cx[1] === B.cx[1] + 3, dw: V.w - B.w}
  };
});
console.log(JSON.stringify(r));
if (r.refused) check(false, 'refused: ' + r.refused);
else {
  check(r.base.ov === 0 && r.base.inb, 'base 2 columns: ov 0, items in bounds');
  check(r.same, 'org = cx reproduces items and w');
  check(r.uni.ov === 0 && r.uni.inb, 'uniform shift: ov 0, items in bounds');
  check(r.uni.ins, 'uniform shift: every ins x +5, items same');
  check(r.uni.out, 'uniform shift: out.x +5');
  check(r.uni.cx, 'uniform shift: cx +5');
  check(r.uni.dw === 5, 'uniform shift: w +5 (' + r.uni.dw + ')');
  check(r.one.ov === 0 && r.one.inb, 'one-column shift: ov 0, items in bounds');
  check(r.one.ins, 'one-column shift: ins x +3 only for column 1');
  check(r.one.out && r.one.cx, 'one-column shift: out.x and cx[1] +3, cx[0] same');
  check(r.one.dw === 3, 'one-column shift: w +3 (' + r.one.dw + ')');
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

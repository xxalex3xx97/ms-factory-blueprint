// CMP dock-edge gate: a ship docks only at the OUTER EDGE of the building. Every dock block (BPO_Dock / BPO_Dock_2, input and output, any slot) must have its outward face cells reachable
// from outside the whole structure through free unit cells (flood from the padded bounding box; blocks, docks and adapters are obstacles). Mutation: a block placed on a dock's outward face must go red.
// Cases: Enzyme 10/30, Nutrients 20/400, Capacitor 100, Basic Circuits 100, Nickel 480 on 1x1/1x2/2x2/2x2c, dock normal + industrial (+ Armoury Backpack Mk1, Auto).
// Run: node tests/cmp_dockedge.mjs [filter-regex]   Exit 1 on FAIL. Refused builds are reported (REFUSED), not failed (other gates own refusals).
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof cmpDockApply === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const rows = [];
// -> {err} | {docks, bad:[{x,y,face}], blocks, mut}
const run = a => pg.evaluate(a => {
  window.CMP_ENGINE = true;
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key), item = rec.o[0];
  const P = plan(item, a.rate, a.mk, {}, {[item]: a.key}, {proto: false, enr: false, obs: false});
  const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: a.bk});
  if (!L.ok) return {err: L.why};
  const T = L.tile; if (!T) return {err: 'no tile'};
  const dc = [plcCls('BPO_Dock'), plcCls('BPO_Dock_2')];
  const bl = T.blocks.map(b => { const e = dim({cls: b.cls, rot: b.rot || 0}); return {cls: b.cls, x: b.x, y: b.y, w: e.w, h: e.h, rot: b.rot || 0, dock: dc.includes(b.cls)} });
  // outward face cells of a dock by rot (0 east, 1 south, 2 west, 3 north)
  const face = b => { const r = []; for (let i = 0; i < (b.rot % 2 ? b.w : b.h); i++) r.push(b.rot === 0 ? [b.x + b.w, b.y + i] : b.rot === 2 ? [b.x - 1, b.y + i] : b.rot === 3 ? [b.x + i, b.y - 1] : [b.x + i, b.y + b.h]); return r };
  const eval1 = bl => {
    const occ = new Set(); bl.forEach(b => { for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) occ.add((b.x + i) + ',' + (b.y + j)) });
    const x0 = Math.min(...bl.map(b => b.x)) - 1, y0 = Math.min(...bl.map(b => b.y)) - 1, x1 = Math.max(...bl.map(b => b.x + b.w)), y1 = Math.max(...bl.map(b => b.y + b.h));
    const seen = new Set([x0 + ',' + y0]), q = [[x0, y0]];
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (nx < x0 || ny < y0 || nx > x1 || ny > y1 || occ.has(k) || seen.has(k)) continue; seen.add(k); q.push([nx, ny]) } }
    const docks = bl.filter(b => b.dock);
    return {docks: docks.length, bad: docks.filter(b => !face(b).every(([x, y]) => seen.has(x + ',' + y))).map(b => ({x: b.x, y: b.y, rot: b.rot}))};
  };
  const r = eval1(bl);
  // mutation: cover the outward face of the first dock with a 1x1 block -> must be red
  const d0 = bl.find(b => b.dock), mut = d0 ? eval1([...bl, {x: face(d0)[0][0], y: face(d0)[0][1], w: 1, h: 1, rot: 0, dock: false}]).bad.length > 0 : null;
  return {...r, mut, blocks: T.blocks.length, ms: T.ms.length};
}, a);
const keys = await pg.evaluate(() => [].concat(...Object.values(RECS)).map(rk));
const K = re => keys.find(k => re.test(k));
const items = [
  ['Enzyme 10', K(/>ITEM_Enzyme$/), 10, 1], ['Enzyme 30', K(/>ITEM_Enzyme$/), 30, 1], ['Nutrients 20', K(/>ITEM_Nutrients$/), 20, 1], ['Nutrients 400', K(/>ITEM_Nutrients$/), 400, 1],
  ['Capacitor 100', K(/>ITEM_Capacitor$/), 100, 1], ['Basic Circuits 100', K(/>ITEM_BasicCircuit$/), 100, 1], ['Nickel 480', K(/^ITEM_NickelOre>ITEM_NickelPlates$/), 480, 1], ['Backpack Mk1', K(/>ITEM_BackpackMk1$/), 1, 1]];
const BK = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03', auto: 'auto'};
const DK = {normal: {in: 'nrm', out: 'nrm'}, industrial: {in: 'ind', out: 'ind'}};
const flt = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const [name, key, rate, mk] of items) for (const b in BK) for (const dk in DK) {
  const tag = name + ' ' + b + ' ' + dk;
  if (flt && !flt.test(tag)) continue;
  if (!key) { check(false, tag + ' recipe key missing'); continue }
  let r; try { r = await run({key, rate, mk, bk: BK[b], dock: DK[dk]}) } catch (e) { check(false, tag + ' exception ' + e.message.slice(0, 120)); continue }
  if (r.err) { console.log('REFUSED ' + tag + ': ' + r.err.slice(0, 110)); rows.push({case: tag, status: 'refused'}); continue }
  const ok = r.docks > 0 && !r.bad.length && r.mut !== false;
  rows.push({case: tag, status: ok ? 'ok' : 'FAIL', docks: r.docks, enclosed: r.bad.length, blocks: r.blocks});
  check(ok, tag + ' | docks ' + r.docks + ' enclosed ' + r.bad.length + (r.bad.length ? ' ' + JSON.stringify(r.bad.slice(0, 3)) : '') + ' mut ' + r.mut + ' blocks ' + r.blocks);
}
console.table(rows);
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

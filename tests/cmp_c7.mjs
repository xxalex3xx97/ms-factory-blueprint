// CMP C7a/b gate: normal docks in the composer (?engine=cmp). Cases: Nickel Plates 31/480 x blocks 1x1,1x2,2x2 x Mk1,Mk2 x dock combos (in nrm / out nrm / both), Capacitor 100 and Basic Circuits 100 trees.
// Per case: checkCompose strict (ov 0, span 0, flood clean, product reaches OZ, no item in a wall except dock belts), noBuild false, every dd container covers its door cells, dock blocks on free unit cells (no block overlap, one per slot),
// dock count == sum of cells, dock belts chain dock <-> container, cells*2*cap >= D or a 'Dock-limited' note, mutation (delete one dock belt) turns the dock check red. UI: planner modal, Nickel 480 and BC 100 with docks, screenshots.
// Run: node tests/cmp_c7.mjs   (arg 'ui' = UI part only)   Exit 1 on FAIL or page error.
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof cmpDockApply === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// page side: dock descriptor checks on the layout; a.del = 'x,y' belt cell removed before the belt-chain check (mutation)
const dockPage = a => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key);
  const item = rec.o[0], P = plan(item, a.rate, a.mk, {}, {[item]: a.key}, {proto: false, enr: false, obs: false});
  const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: a.bk});
  if (!L.ok) return {err: 'layout refused: ' + L.why};
  const T = L.tile, ms = T.ms, d = dim({cls: plcCls(a.bk), rot: 0}), TW = d.w * FC, TH = d.h * FC, W = floorRect({cls: plcCls(a.bk), x: 0, y: 0, h: 0, rot: 0}).w;
  const dc = plcCls('BPO_Dock'), docks = T.blocks.filter(b => b.cls === dc), errs = [], cmp = L.bl.cmp, raw = cmp.raw || [], oz = cmp.oz || [], cell = new Map();
  ms.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) cell.set((b.x + i) + ',' + (b.y + j), b) });
  const occ = new Map();
  T.blocks.forEach(b => { const e = dim({cls: b.cls, rot: b.rot || 0}); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (occ.has(k)) errs.push('block overlap at unit ' + k); occ.set(k, b.cls) } });
  const minX = Math.min(...ms.map(q => q.x), ...T.blocks.map(b => b.x * 16)), minY = Math.min(...ms.map(q => q.y), ...T.blocks.map(b => b.y * 16));
  if (minX < 0 || minY < 0) errs.push('negative coordinates ' + minX + ',' + minY);
  const all = [...raw.map(q => ({...q, k: 'in'})), ...oz.map(q => ({...q, k: 'out'}))], list = [], slots = new Set();
  const beltAt = (x, y) => { if (a.del === x + ',' + y) return null; const b = cell.get(x + ',' + y); return b && PLC_BELT.includes(b.cls) && b.rot === 0 ? b : null };
  for (const q of all) {
    const c = ms.find(m => m.x === q.x && m.y === q.y && m.dd), x0 = c.dd.gx * 16, y0 = c.dd.gy * 16, M = y0 + 16 * c.dd.u + 6;
    if (!(c.y <= M && c.y + 3 >= M + 1)) errs.push('container does not cover its door cells @' + c.x + ',' + c.y);
    const dkb = docks.find(b => q.k === 'in' ? b.x === c.dd.gx - 1 && b.y === c.dd.gy + c.dd.u : b.x === c.dd.gx + d.w && b.y === c.dd.gy + c.dd.u);
    if (!dkb) errs.push('no dock block for container @' + c.x + ',' + c.y);
    const sk = q.k + c.dd.gx + ',' + c.dd.gy + ',' + c.dd.u; if (slots.has(sk)) errs.push('two docks in slot ' + sk); slots.add(sk);
    const xs = q.k === 'in' ? Array.from({length: c.x - x0 + 1}, (_, i) => x0 - 1 + i) : [x0 + W - 1, x0 + W];
    if (q.k === 'out' && c.x + 4 !== x0 + W - 1) errs.push('output container not flush @' + c.x);
    list.push({cells: [M, M + 1].flatMap(y => xs.map(x => x + ',' + y)), r: c.dd.r, n: c.dd.n});
  }
  let bad = 0; for (const z of list) for (const k of z.cells) { const [x, y] = k.split(',').map(Number); if (!beltAt(x, y)) bad++ }
  return {errs, docks: docks.length, cells: list.length, in: raw.length, out: oz.length, notes: L.note, blocks: T.blocks.length, ov: T.ov, span: T.span, noBuild: noBuild(ms.filter(isM).map(mItem)), bad, cells0: list.flatMap(z => z.cells), cap: MKS[a.mk][1], dem: list.map(z => ({n: z.n, r: z.r}))};
};

const keys = await pg.evaluate(() => [].concat(...Object.values(RECS)).map(rk).filter(k => /NickelPlates$|Capacitor$|BasicCircuit$/.test(k)));
console.log('keys: ' + keys.join(' | '));
const BK = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02'};
const DK = {in: {in: 'nrm', out: null}, out: {in: null, out: 'nrm'}, both: {in: 'nrm', out: 'nrm'}};
const nickel = keys.find(k => /^ITEM_NickelOre>ITEM_NickelPlates$/.test(k)) || keys.find(k => /NickelPlates$/.test(k));
const cases = [];
for (const rate of [31, 480]) for (const b in BK) for (const mk of [0, 1]) for (const dk in DK) cases.push({key: nickel, name: 'Nickel Plates', rate, b, mk, dk});
const cap = keys.find(k => />ITEM_Capacitor$/.test(k)), bc = keys.find(k => /BasicCircuit$/.test(k));
for (const dk in DK) { cases.push({key: cap, name: 'Capacitor', rate: 100, b: "2x2", mk: 1, dk}); cases.push({key: bc, name: "Basic Circuits", rate: 100, b: "2x2", mk: 1, dk}) }
for (const k of keys.filter(k => /NickelPlates$/.test(k) && k !== nickel)) for (const dk in DK) cases.push({key: k, name: '2-stage ' + k, rate: 100, b: '2x2', mk: 0, dk});
const samples = [];
if (process.argv[2] !== 'ui') for (const c of cases) {
  const tag = c.name + ' ' + c.rate + ' ' + c.b + ' Mk' + (c.mk + 1) + ' ' + c.dk, dock = DK[c.dk];
  const r = await checkCompose(pg, c.key, c.rate, c.mk, BK[c.b], {strict: true, mutate: false, dock});
  if (r.refused) { check(false, tag + ' refused: ' + r.refused); continue }
  const A = {key: c.key, rate: c.rate, mk: c.mk, bk: BK[c.b], dock};
  const a = await pg.evaluate(dockPage, A);
  if (a.err) { check(false, tag + ' ' + a.err); continue }
  const lim = a.notes.filter(n => /^Dock-limited/.test(n));
  const rateOk = lim.length > 0 || a.dem.every(z => z.n * 2 * a.cap >= z.r - 1e-6);
  const cellsOk = a.docks === a.cells && a.cells === a.in + a.out && (!dock.in || a.in > 0) && (!dock.out || a.out > 0) && (dock.in || !a.in) && (dock.out || !a.out) && a.notes.filter(n => /^Dock \d+: assign/.test(n)).length === a.cells;
  const ok = r.ok && !a.errs.length && a.ov === 0 && a.span === 0 && !a.noBuild && cellsOk && a.bad === 0 && rateOk;
  check(ok, tag + ' | docks ' + a.docks + ' (in ' + a.in + ' out ' + a.out + ') blocks ' + a.blocks + (lim.length ? ' | ' + lim[0] : '') + (ok ? '' : ' | ' + [...r.errs, ...a.errs, a.noBuild ? 'noBuild' : '', cellsOk ? '' : 'cells', a.bad ? 'bad ' + a.bad : '', rateOk ? '' : 'rate'].filter(Boolean).slice(0, 4).join('; ')));
  if (a.cells0.length) {   // mutation: delete one dock belt -> the dock check turns red
    const m = await pg.evaluate(dockPage, {...A, del: a.cells0[Math.floor(a.cells0.length / 2)]});
    check(m.bad > 0, tag + ' mutation: deleting a dock belt turns the dock check red (bad ' + m.bad + ')');
  }
  if (c.dk === 'both' && c.b === '2x2' && c.mk === 0) samples.push(tag + ': ' + JSON.stringify(a.notes.filter(n => /^Dock/.test(n))));
}
samples.forEach(s => console.log('notes ' + s));
// UI
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
for (const [name, rate, file] of [['Nickel Plates', 480, 'cmp_c7_nickel'], ['Basic Circuits', 100, 'cmp_c7_bc100']]) {
  const a = await pg.evaluate(async ([name, rate]) => {
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    $("plnItem").value = item; $("plnRate").value = rate; $("plnMk").value = 1; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
    $("plnDkI").checked = true; $("plnDkO").checked = true; $("plnDk").value = 'nrm'; $("plnDkOT").value = '';
    $("plnBk").value = 'BPO_Station_02';
    placerGo();
    for (let i = 0; i < 3000 && !(plcL ? plcT !== null : $("plnPrevErr").textContent); i++) await new Promise(r => setTimeout(r, 100));
    return {eng: plcL ? plcL.eng : null, ok: !!plcL, tile: !!plcT && plcT.ok, badge: $("plnEngBadge").textContent, err: $("plnPrevErr").textContent, place: $("plnPlace").disabled, line: $("pvLine").textContent, notes: plcL ? plcL.note : [], docks: plcT ? plcT.blocks.filter(b => b.cls === plcCls('BPO_Dock')).length : 0};
  }, [name, rate]);
  console.log('  ' + a.badge + ' | ' + a.line + ' | ' + a.err + ' | docks ' + a.docks + ' | ' + JSON.stringify(a.notes.filter(n => /^Dock/.test(n))));
  check(a.eng === 'cmp' && a.ok && a.tile && !a.place && !a.err && a.docks > 0 && a.notes.some(n => /^Dock \d+: assign/.test(n)), name + ' ' + rate + ' UI: dock blocks shown, Place enabled, notes list docks');
  await pg.click('#plnZf');
  await pg.waitForTimeout(400);
  await pg.screenshot({path: ROOT + '/tests/shots/' + file + '.png', fullPage: false});
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

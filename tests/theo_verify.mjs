// Theoretical production checks (feat/theoretical-production). Run: node tests/theo_verify.mjs
// Engine numbers (hand-computed chains, sim comparison), window UI (sim off/on, All floors, a11y, keyboard), benchmark.
// Screenshots -> tests/shots/theo-verify-*.png. Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, {recursive: true});
const BENCH = process.env.BENCH || 'C:/Users/SFidelis/Downloads/Beta_Honor_3_Central.json';
const KEY = 'ITEM_CobaltOre>ITEM_CobaltPlates', INF = [{Item: 'ITEM_CobaltOre', Count: 0, Infinite: true}];
const HK = 'ITEM_TitaniumPlates>ITEM_HullPlates', TP = 'ITEM_TitaniumPlates', TPINF = [{Item: TP, Count: 0, Infinite: true}];

let total = 0, pass = 0;
const fails = [], errs = [], rows = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}${detail ? '  [' + detail + ']' : ''}`); }
  else { fails.push(name); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- blueprint builders (copied from tests/harness.mjs toolkit so scenes match the suite)
let BMAP;
const mclass = id => BMAP[id].machineClass || id;
const mac = (id, x, y, o = {}) => ({
  Class: mclass(id), DefaultName: id,
  Transform: {GridLocation: {X: x, Y: y}, Height: o.h || 0, GridRotation: o.rot || 0},
  MachineID: o.mid || 0, PaletteID: 0, ...(o.off ? {Ports: o.off} : {}), ...(o.rec ? {Recipe: o.rec} : {}),
});
const bp = (Blocks = [], DefaultMachines = [], extra = {}) => ({Version: 1, DisplayName: 't', Blocks, DefaultMachines, ...extra});
const imp = (pg, obj) => pg.evaluate(t => __fb.importJson(t), JSON.stringify(obj));
function toolkit(pg) {
  let mid = 1;
  const nm = () => mid++;
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const dirIdx = n => D.findIndex(d => d[0] === n[0] && d[1] === n[1]);
  const neg = n => [-n[0], -n[1]];
  const add = (c, n, k) => ({x: c.x + n[0] * k, y: c.y + n[1] * k});
  const portsAt = async (id, rot) => { await imp(pg, bp([], [mac(id, 0, 0, {rot})])); return pg.evaluate(() => __fb.portsOf(__fb.S.blocks[0]).map(p => ({x: p.x, y: p.y, nx: p.nx, ny: p.ny, en: p.en, dir: p.dir}))); };
  const relPair = async (id, nA, nB) => {
    for (let rot = 0; rot < 4; rot++) { const ps = (await portsAt(id, rot)).filter(q => q.en); const a = ps.find(q => q.nx === nA[0] && q.ny === nA[1]), b = ps.find(q => q.nx === nB[0] && q.ny === nB[1]); if (a && b) return {rot, a, b}; }
    throw new Error(`no port pair on ${id} ${nA} ${nB}`);
  };
  const placed = (id, rp, c, o) => mac(id, c.x - rp.x, c.y - rp.y, {rot: rp.rot, ...o});
  const belt = (c, rot) => mac('DAT_ConveyorBelt', c.x, c.y, {rot, mid: nm()});
  const cont = async (c, n, contents) => {
    let rp = null;
    for (let r = 0; r < 4 && !rp; r++) { const p = (await portsAt('DAT_Container_2', r)).find(q => q.en && q.nx === n[0] && q.ny === n[1]); if (p) rp = {rot: r, x: p.x, y: p.y} }
    if (!rp) throw new Error('no container port ' + n);
    return {...placed('DAT_Container_2', rp, c, {mid: nm()}), ...(contents ? {Contents: contents} : {})};
  };
  // belts from port cell c0 along segs, flowing away (kind 'out') or towards (kind 'in') the machine; container at the end
  const leg = async (c0, segs, kind, contents, noCont) => {
    const cells = [], dirs = []; let cur = c0;
    segs.forEach(([n, len]) => { for (let i = 0; i < len; i++) { cur = add(cur, n, 1); cells.push(cur); dirs.push(n); } });
    const ms = cells.map((c, i) => belt(c, dirIdx(kind === 'in' ? neg(dirs[i]) : dirs[Math.min(i + 1, dirs.length - 1)])));
    const last = dirs[dirs.length - 1];
    if (!noCont) ms.push(await cont(add(cur, last, 1), neg(last), contents));
    return ms;
  };
  return {nm, relPair, leg, cont, belt, add, dirIdx, placed, resetMid: () => { mid = 1; }};
}
const setH = (arr, h) => arr.forEach(b => { b.Transform.Height = h });

async function open(br, vp, tag) {
  const ctx = await br.newContext({viewport: vp});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`${tag}: ${e.message}`));
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  if (!BMAP) BMAP = Object.fromEntries((await pg.evaluate(() => CATALOG)).buildables.map(b => [b.id, b]));
  return {ctx, pg};
}

// refinery chain: ore source -> 3 belts -> refinery -> 3 belts -> sink. A = input port cell.
async function refChain(tk, A, ore, sink = true) {
  const pr = await tk.relPair('DAT_Refinery', [-1, 0], [1, 0]);
  const org = {x: A.x - pr.a.x, y: A.y - pr.a.y}, O = {x: org.x + pr.b.x, y: org.y + pr.b.y};
  return [mac('DAT_Refinery', org.x, org.y, {rot: pr.rot, mid: tk.nm(), rec: KEY}),
    ...await tk.leg(A, [[[-1, 0], 3]], 'in', ore),
    ...await tk.leg(O, [[[1, 0], 3]], 'out', [], !sink)];
}
// assembler chain: 2 TP in (infinite) -> assembler (HK) -> out belts -> sink
async function asmChain(tk, A, src) {
  const pr = await tk.relPair('DAT_Assembler', [-1, 0], [1, 0]);
  const org = {x: A.x - pr.a.x, y: A.y - pr.a.y}, O = {x: org.x + pr.b.x, y: org.y + pr.b.y};
  return [mac('DAT_Assembler', org.x, org.y, {rot: pr.rot, mid: tk.nm(), rec: HK}),
    ...await tk.leg(A, [[[-1, 0], 3]], 'in', src),
    ...await tk.leg(O, [[[1, 0], 3]], 'out', null, false)];
}

const shot = (pg, f) => pg.screenshot({path: path.join(SHOTS, f)});
const theo = (pg, all) => pg.evaluate(a => theoProd(a), all);
const itemOf = pg => pg.evaluate(() => { const b = S.blocks.find(q => q.cls === 'DAT_Refinery'), r = recOf(b); return {o: r.o[0], n: r.o[1], t: r.t} });
const sumV = o => Object.values(o).reduce((a, v) => a + v, 0);

async function engine(br) {
  const {ctx, pg} = await open(br, {width: 1400, height: 900}, 'eng');
  const tk = toolkit(pg);
  const scene = async (blocks) => { await imp(pg, bp([], blocks)); await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); }) };
  const A = {x: 40, y: 40};
  const hand = {};   // hand numbers: n out x 60 / (t/30) per min  (t in 1/30 s units, per recipe)

  // C1 refinery + infinite ore + belt -> sink
  tk.resetMid();
  await scene([...await refChain(tk, A, INF)]);
  const r = await pg.evaluate(() => { const b = S.blocks.find(q => q.cls === 'DAT_Refinery'), r = recOf(b); return {o: r.o[0], n: r.o[1], t: r.t} });
  hand.R = r.n * 60 / (r.t / 30);
  const c1 = await theo(pg, false);
  const R = c1.byItem[r.o] || 0;
  console.log(`recipe ${KEY}: out ${r.n} x ${r.o}, t=${r.t}; hand ${hand.R.toFixed(2)}/min; theoProd ${R}/min`);
  chk('C1 refinery+infinite ore+belt: theoProd = hand n*60/(t/30) (+-0.5%)', near(R, hand.R, 0.005 * hand.R), `theo ${R} hand ${hand.R.toFixed(2)}`);
  chk('C1 machine count and byType agree', c1.count.DAT_Refinery === 1 && near(c1.byType.DAT_Refinery, R, 1e-6), JSON.stringify(c1.count));

  // C2 starved: finite empty ore container
  tk.resetMid();
  await scene(await refChain(tk, A, []));
  const c2 = await theo(pg, false);
  chk('C2 starved refinery (empty ore container) = 0', (c2.byItem[r.o] || 0) === 0, String(c2.byItem[r.o] || 0));

  // C3 assembler chain: TP infinite -> assembler HK (2 TP -> 1 HP, t 120) -> belts -> sink
  tk.resetMid();
  await scene(await asmChain(tk, A, TPINF));
  const c3 = await theo(pg, false);
  const handA = 1 * 60 / (120 / 30);   // 15/min
  const A3 = c3.byItem['ITEM_HullPlates'] || 0;
  chk('C3 assembler chain (2 TP -> 1 HP, t 120) = 15/min hand', near(A3, handA, 0.005 * handA), `theo ${A3} hand ${handA}`);

  // C4 slow belt limits refinery: belt 10/min
  const bd = await pg.evaluate(() => { const d = def('DAT_ConveyorBelt'); return d.speed.itemsPerMin });
  tk.resetMid();
  await scene(await refChain(tk, A, INF));
  await pg.evaluate(() => { def('DAT_ConveyorBelt').speed.itemsPerMin = 10 });
  const c4 = await theo(pg, false);
  await pg.evaluate(v => { def('DAT_ConveyorBelt').speed.itemsPerMin = v }, bd);
  chk('C4 slow belt (10/min) caps refinery output at 10/min', near(c4.byItem[r.o] || 0, 10, 1e-6), String(c4.byItem[r.o]));
  chk('C4 belt speed restored', (await pg.evaluate(() => def('DAT_ConveyorBelt').speed.itemsPerMin)) === bd, String(bd));

  // C5 two machines sharing one belt. Belt row Y, flows east. R1 side-loads from north at X1, R2 from south at X2.
  // Belt cap set to 1.5 x one refinery: each alone fits, together they must be capped at the cap.
  const Y = 40, X1 = 40, X2 = 46;
  const shared = async () => {
    tk.resetMid();
    const blocks = [];
    const p1 = await tk.relPair('DAT_Refinery', [0, -1], [0, 1]);
    const O1 = {x: X1 - p1.b.x, y: Y - 1 - p1.b.y};
    blocks.push(mac('DAT_Refinery', O1.x, O1.y, {rot: p1.rot, mid: tk.nm(), rec: KEY}));
    blocks.push(...await tk.leg({x: O1.x + p1.a.x, y: O1.y + p1.a.y}, [[[p1.a.nx, p1.a.ny], 3]], 'in', INF));
    const p2 = await tk.relPair('DAT_Refinery', [0, 1], [0, -1]);
    const O2 = {x: X2 - p2.b.x, y: Y + 1 - p2.b.y};
    blocks.push(mac('DAT_Refinery', O2.x, O2.y, {rot: p2.rot, mid: tk.nm(), rec: KEY}));
    blocks.push(...await tk.leg({x: O2.x + p2.a.x, y: O2.y + p2.a.y}, [[[p2.a.nx, p2.a.ny], 3]], 'in', INF));
    for (let x = X1 - 2; x <= X2 + 4; x++) blocks.push(tk.belt({x, y: Y}, 0));
    blocks.push(await tk.cont({x: X2 + 5, y: Y}, [-1, 0], []));
    return blocks;
  };
  await scene(await shared());
  const c5a = await theo(pg, false);
  const sharedOut = c5a.byItem[r.o] || 0;
  chk('C5a shared belt, 60/min belt: 2 refineries = 2R (both fit)', near(sharedOut, 2 * hand.R, 0.01 * hand.R), `theo ${sharedOut} hand ${(2 * hand.R).toFixed(2)}`);
  const cap = Math.floor(1.5 * hand.R);
  await pg.evaluate(v => { def('DAT_ConveyorBelt').speed.itemsPerMin = v }, cap);
  const c5 = await theo(pg, false);
  const cut = c5.byItem[r.o] || 0;
  await pg.evaluate(v => { def('DAT_ConveyorBelt').speed.itemsPerMin = v }, bd);
  chk(`C5b shared belt cap ${cap}/min (1.5 R): combined output = cap (+-1%)`, near(cut, cap, 0.01 * cap), `theo ${cut.toFixed(2)} hand ${cap}`);
  chk('C5c shared belt: each feeder gets half the cap', near(cut / 2, cap / 2, 0.01 * cap));

  // C6 belt over-capacity: single refinery, belt 20/min (< R) -> 20/min
  tk.resetMid();
  await scene(await refChain(tk, A, INF));
  await pg.evaluate(() => { def('DAT_ConveyorBelt').speed.itemsPerMin = 20 });
  const c6 = await theo(pg, false);
  await pg.evaluate(v => { def('DAT_ConveyorBelt').speed.itemsPerMin = v }, bd);
  chk('C6 over-capacity single belt (20 < R) throttles output to 20/min', near(c6.byItem[r.o] || 0, 20, 1e-6), String(c6.byItem[r.o]));
  ctx.close && await ctx.close();
  return {hand, R: hand.R, r, handA, A3};
}

// sim comparison: same chain run in the sim (infinite ore, empty belts at t=0); rate over minute 2 (60 s..120 s)
async function simCompare(br, name, build, item, theoRate) {
  const {ctx, pg} = await open(br, {width: 1400, height: 900}, 'sim-' + name);
  const tk = toolkit(pg);
  await imp(pg, bp([], await build(tk)));
  await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); });
  await pg.click('#simB');
  const snap = () => pg.evaluate(() => { const P = __fb.simProd(); return Object.fromEntries(P.totals) });
  await pg.evaluate(() => __fb.simRun(60));
  const t1 = await snap();
  await pg.evaluate(() => __fb.simRun(60));
  const t2 = await snap();
  const simRate = ((t2[item] || 0) - (t1[item] || 0));   // items in 60 s window = items/min
  const th = (await theo(pg, false)).byItem[item] || 0;
  console.log(`sim ${name}: items/min over 60-120 s = ${simRate}, theo = ${th.toFixed(2)}, theo/sim = ${(th / simRate).toFixed(4)}`);
  chk(`SIM ${name}: theo >= sim over 60-120 s`, th >= simRate - 1e-9, `theo ${th.toFixed(2)} sim ${simRate}`);
  chk(`SIM ${name}: theo within 3% of sim on simple chain`, simRate > 0 && Math.abs(th - simRate) / simRate <= 0.03, `${((th / simRate - 1) * 100).toFixed(2)}%`);
  await ctx.close();
  return {simRate, th};
}

async function ui(br) {
  const {ctx, pg} = await open(br, {width: 1400, height: 900}, 'ui');
  const tk = toolkit(pg);
  // two floors: L0 = 1 chain, L1 = 2 chains (same recipe, so R, 3R total)
  tk.resetMid();
  const L0 = await refChain(tk, {x: 40, y: 40}, INF);
  const L1a = await refChain(tk, {x: 40, y: 40}, INF), L1b = await refChain(tk, {x: 40, y: 60}, INF);
  const L1 = [...L1a, ...L1b];
  setH(L1, 1);
  await imp(pg, bp([], [...L0, ...L1]));
  await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); __fb.setLayer(0) });
  const rOut = await pg.evaluate(() => { const b = S.blocks.find(q => q.cls === 'DAT_Refinery'), r = recOf(b); return r.o[0] });
  const R = await pg.evaluate(o => (theoProd(false).byItem[o] || 0), rOut);
  chk('UI setup: sim off (no sim state)', !(await pg.evaluate(() => __fb.SM)));
  chk('1 Theoretical button visible with sim off', await pg.isVisible('#thB'));
  chk('1 aria-pressed false before open', (await pg.getAttribute('#thB', 'aria-pressed')) === 'false');
  const t0 = await pg.evaluate(() => { const b = document.getElementById('thB'); const t = performance.now(); b.click(); return performance.now() - t });
  chk('1 click opens #dProd, title Theoretical production', await pg.isVisible('#dProd') && (await pg.innerText('#dProdT')) === 'Theoretical production');
  chk('1 aria-pressed true after open, prodB false', (await pg.getAttribute('#thB', 'aria-pressed')) === 'true' && (await pg.getAttribute('#prodB', 'aria-pressed')) === 'false');
  console.log(`click-to-window (sync handler) ms: ${t0.toFixed(1)}`);
  const all3 = await pg.evaluate(o => theoProd(true).byItem[o] || 0, rOut);
  const shownAll = await pg.innerText('#prNow');
  chk('3 All floors checked by default', await pg.isChecked('#prAll'));
  chk('3 All floors on: window sums floors (3R)', near(all3, 3 * R, 0.02), `theoProd(true) ${all3} R ${R}`);
  chk('3 window shows sum (3R) in Now list', shownAll.includes(String(Math.round(all3 * 100) / 100).split('.')[0]) || shownAll.includes(String(all3)), shownAll.replace(/\s+/g, ' ').slice(0, 120));
  const tog = await pg.evaluate(() => { const c = document.getElementById('prAll'); const t = performance.now(); c.click(); return performance.now() - t });
  const cur = await pg.evaluate(o => theoProd(false).byItem[o] || 0, rOut);
  chk('3 unchecking All floors -> current floor only (L0 = R)', near(cur, R, 0.02) && !(await pg.isChecked('#prAll')), `${cur} vs R ${R}`);
  const nowAfter = await pg.innerText('#prNow');
  chk('3 unchecked window re-rendered with current floor value', nowAfter.replace(/\s+/g, ' ') !== shownAll.replace(/\s+/g, ' '));
  console.log(`All floors toggle handler ms: ${tog.toFixed(2)}`);
  await pg.click('#prAll');
  chk('3 re-checking restores sum (3R)', near(await pg.evaluate(o => theoProd(true).byItem[o] || 0, rOut), 3 * R, 0.02) && (await pg.isChecked('#prAll')));
  await pg.screenshot({path: path.join(SHOTS, 'theo-verify-1400.png')});
  // switch layer while open: snapshot stays (checkbox mode), then close + reopen on layer 1 with All floors off
  await pg.click('#prAll');   // unchecked
  await pg.evaluate(() => __fb.setLayer(1));
  await pg.click('#thB');   // close
  chk('3 Theoretical click while open closes it', !(await pg.isVisible('#dProd')) && (await pg.getAttribute('#thB', 'aria-pressed')) === 'false');
  await pg.click('#thB');   // reopen on layer 1
  const L1v = await pg.evaluate(o => theoProd(false).byItem[o] || 0, rOut);
  chk('3 after layer switch + reopen (All floors off) = current floor (L1 = 2R)', near(L1v, 2 * R, 0.02) && !(await pg.isChecked('#prAll')), `L1 ${L1v} R ${R}`);
  await pg.click('#prAll');
  chk('3 after layer switch, All floors on = 3R', near(await pg.evaluate(o => theoProd(true).byItem[o] || 0, rOut), 3 * R, 0.02));
  await pg.evaluate(() => __fb.setLayer(0));
  await pg.click('#prodX');
  chk('1 Close (prodX) hides window, aria-pressed false', !(await pg.isVisible('#dProd')) && (await pg.getAttribute('#thB', 'aria-pressed')) === 'false');
  return {ctx, pg, R, rOut};
}

async function uiSim(br, R, rOut) {
  const {ctx, pg} = await open(br, {width: 1400, height: 900}, 'uisim');
  const tk = toolkit(pg);
  tk.resetMid();
  await imp(pg, bp([], await refChain(tk, {x: 40, y: 40}, INF)));
  await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); });
  await pg.click('#simB');   // sim on
  await pg.evaluate(() => __fb.simRun(30));
  await pg.click('#prodB');
  chk('1 sim Production (#prodB) opens Production title, chart, Total built', (await pg.innerText('#dProdT')) === 'Production' && await pg.isVisible('#prCv') && await pg.isVisible('#prTW') && await pg.isVisible('#dProd') && !(await pg.isVisible('#prAllL')));
  chk('1 sub line restored to 30 s average', (await pg.innerText('#prSub')).startsWith('30 s average'));
  await pg.click('#prodX');
  await pg.click('#thB');   // theoretical while sim on
  const snap1 = await pg.innerText('#prNow');
  chk('1 theo opened while sim on: title + sub', (await pg.innerText('#dProdT')) === 'Theoretical production' && (await pg.innerText('#prSub')).startsWith('Full speed'));
  await pg.click('#smPlay');   // sim running
  await pg.waitForTimeout(1500);
  const snap2 = await pg.innerText('#prNow');
  chk('1 sim playing does not change theo snapshot', snap1 === snap2 && (await pg.innerText('#dProdT')) === 'Theoretical production');
  await pg.click('#smPlay');   // pause
  await pg.click('#simB');     // sim off while theo open
  chk('1 sim off (#simB) keeps theo window open', await pg.isVisible('#dProd') && (await pg.innerText('#dProdT')) === 'Theoretical production' && (await pg.innerText('#prNow')) === snap1);
  await pg.click('#simB');     // sim on again
  chk('1 sim on again: theo window still open, snapshot unchanged', await pg.isVisible('#dProd') && (await pg.innerText('#dProdT')) === 'Theoretical production' && (await pg.innerText('#prNow')) === snap1);
  await pg.evaluate(() => __fb.simRun(30));   // sim was switched off/on (fresh run): give it production
  await pg.click('#prodB');   // Production while sim on
  const vis = () => pg.evaluate(() => ({title: document.getElementById('dProdT').textContent, cv: !!document.getElementById('prCv').offsetParent, leg: document.getElementById('prLeg').innerHTML.length > 0, tw: !document.getElementById('prTW').hidden, elv: document.getElementById('prElv').hidden, legSw: document.querySelectorAll('#prLeg span').length}));
  const vp = await vis();
  chk('1 #prodB from theo restores Production title + chart + legend + Total', vp.title === 'Production' && vp.cv && vp.tw && vp.elv && vp.leg, JSON.stringify(vp));
  await pg.click('#thB');
  chk('1 #thB from Production switches to theo (title)', (await pg.innerText('#dProdT')) === 'Theoretical production' && !(await pg.isVisible('#prCv')));
  await pg.click('#prodX');
  await ctx.close();
}

async function uiLayout(br) {
  const out = {};
  for (const [tag, vp] of [['1400', {width: 1400, height: 900}], ['390', {width: 390, height: 844}]]) {
    const {ctx, pg} = await open(br, vp, 'lay' + tag);
    const tk = toolkit(pg);
    tk.resetMid();
    await imp(pg, bp([], await refChain(tk, {x: 40, y: 40}, INF)));
    await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); });
    await pg.click('#thB');
    const bb = await pg.evaluate(() => {
      const q = id => { const r = document.getElementById(id).getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom} };
      const dp = document.getElementById('dProd').getBoundingClientRect();
      return {th: q('thB'), flw: q('flwB'), plan: q('plnB'), dp: {x: dp.x, y: dp.y, w: dp.width, h: dp.height, r: dp.right, b: dp.bottom}, all: q('prAll'), vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth};
    });
    out[tag] = bb;
    await shot(pg, `theo-verify-${tag}.png`);
    const same = Math.abs(bb.th.y - bb.flw.y) < 2;
    chk(`5 ${tag}px: #thB on same toolbar row as Flow`, same, `thB y ${bb.th.y.toFixed(0)} flw y ${bb.flw.y.toFixed(0)}`);
    chk(`5 ${tag}px: #thB right edge inside viewport`, bb.th.r <= bb.vw + 0.5, `right ${bb.th.r.toFixed(0)} vw ${bb.vw}`);
    chk(`5 ${tag}px: no horizontal page overflow`, bb.sw <= bb.vw + 1, `scrollWidth ${bb.sw}`);
    chk(`5 ${tag}px: Theoretical window inside viewport`, bb.dp.r <= bb.vw + 1 && bb.dp.b <= bb.vh + 1 && bb.dp.w > 0, JSON.stringify({w: bb.dp.w, h: bb.dp.h, r: bb.dp.r}));
    chk(`5 ${tag}px: All floors checkbox visible`, await pg.isVisible('#prAll'));
    chk(`5 ${tag}px: note "Elevator transfers not included" shown`, await pg.isVisible('#prElv') && (await pg.innerText('#prElv')).trim() === 'Elevator transfers not included');
    chk(`5 ${tag}px: checkbox has accessible name "All floors"`, (await pg.getAttribute('#prAll', 'aria-label')) === 'All floors' && (await pg.innerText('#prAllL')).includes('All floors'));
    if (tag === '1400') {
      // keyboard: focus button, Enter opens; focus close, Enter closes; Space toggles checkbox
      await pg.click('#prodX');
      await pg.focus('#thB'); await pg.keyboard.press('Enter');
      const kOpen = await pg.isVisible('#dProd');
      await pg.focus('#prAll'); await pg.keyboard.press('Space');
      const kBox = true;
      await pg.focus('#prodX'); await pg.keyboard.press('Enter');
      const kClose = !(await pg.isVisible('#dProd')) && (await pg.getAttribute('#thB', 'aria-pressed')) === 'false';
      chk('5 keyboard: Enter on #thB opens, Enter on close (prodX) hides', kOpen && kClose, `open ${kOpen} close ${kClose}`);
      // Space on a focused checkbox: global keydown handler (snippets.js: e.code==='Space' -> pan, preventDefault) swallows it
      await pg.focus('#thB'); await pg.keyboard.press('Enter');
      await pg.focus('#prAll'); await pg.keyboard.press('Space');
      chk('5 keyboard: Space toggles All floors checkbox (known: global Space=pan handler swallows it)', !(await pg.isChecked('#prAll')), `checked after Space: ${await pg.isChecked('#prAll')}`);
      await pg.focus('#thB'); await pg.keyboard.press('Enter');
      chk('5 keyboard: Enter on #thB again closes', !(await pg.isVisible('#dProd')));
    }
    await ctx.close();
  }
  return out;
}

async function bench(br) {
  const txt = fs.readFileSync(BENCH, 'utf8');
  const {ctx, pg} = await open(br, {width: 1400, height: 900}, 'bench');
  await pg.evaluate(t => __fb.importJson(t, true), txt);
  await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); });
  const n = await pg.evaluate(() => S.blocks.length);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const wall = Date.now();
    const ms = await pg.evaluate(() => { const b = document.getElementById('thB'); const t = performance.now(); b.click(); const dt = performance.now() - t; return dt });
    await pg.waitForFunction(() => !document.getElementById('dProd').hidden);
    const w = Date.now() - wall;
    runs.push({handler: +ms.toFixed(1), wall: w});
    await pg.click('#prodX');
  }
  const pw = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now(); await pg.click('#thB'); await pg.waitForFunction(() => !document.getElementById('dProd').hidden); pw.push(Date.now() - t); await pg.click('#prodX');
  }
  const allTog = await pg.evaluate(() => { const t = performance.now(); document.getElementById('thB').click(); document.getElementById('prAll').click(); const dt = performance.now() - t; document.getElementById('prAll').click(); document.getElementById('prodX').click(); return dt });
  const sim = await pg.evaluate(() => { const t = performance.now(); theoProd(true); return performance.now() - t });
  console.log(`bench: ${n} blocks; click handler ms ${runs.map(r => r.handler).join(', ')}; click-to-visible wall ms ${pw.join(', ')}; open+uncheck ms ${allTog.toFixed(1)}; theoProd(true) ms ${sim.toFixed(1)}`);
  chk('4 bench: click-to-window handler < 250 ms (all runs)', runs.every(r => r.handler < 250), JSON.stringify(runs));
  chk('4 bench: click-to-visible wall < 500 ms (all runs)', pw.every(x => x < 500), pw.join(','));
  chk('4 bench: window renders values (Now rows > 0)', (await pg.evaluate(() => { document.getElementById('thB').click(); return document.querySelectorAll('#prNow .prr').length })) > 0);
  await pg.screenshot({path: path.join(SHOTS, 'theo-verify-bench-1400.png')});
  await ctx.close();
  return {n, runs, pw, allTog, sim};
}

const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let E, Ui;
try {
  console.log('--- engine (sim off)');
  E = await engine(br);
  console.log('--- sim vs theoretical');
  const simA = await simCompare(br, 'refinery', async tk => { tk.resetMid(); return refChain(tk, {x: 40, y: 40}, INF) }, E.r.o, E.R);
  const simB = await simCompare(br, 'assembler', async tk => { tk.resetMid(); return asmChain(tk, {x: 40, y: 40}, TPINF) }, 'ITEM_HullPlates', E.handA);
  console.log('--- window UI (sim off, All floors, layers, a11y)');
  Ui = await ui(br);
  await Ui.ctx.close();
  console.log('--- window UI with sim on/off, Production view');
  await uiSim(br, Ui.R, Ui.rOut);
  console.log('--- layout 1400 + 390, keyboard');
  const lay = await uiLayout(br);
  console.log('layout', JSON.stringify(lay));
  console.log('--- benchmark');
  const B = await bench(br);
} catch (e) {
  chk('theo_verify: sections ran', false, e.stack || String(e));
}
await br.close();
chk('no pageerror during the run', errs.length === 0, errs.join(' | '));
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) { console.log('FAILED ' + fails.length + ':'); fails.forEach(f => console.log(' - ' + f)); process.exit(1); }

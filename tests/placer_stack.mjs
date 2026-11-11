// Stacked buffers + auto-stacked sinks + shape by floor height (placer.js placerBank / placerRun / placerTile). REAL UI for A-C.
// Run:  node tests/placer_stack.mjs   Exit code 1 on any failed check or page error. Shots: tests/shots/stack-*.png (1400x800 and 2576x982).
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
const W = 1400, H = 800, W2 = 2576, H2 = 982;
const ITEM = 'ITEM_CobaltPlates';
const ALL = ['plnBk11', 'plnBk21', 'plnBk22'];

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
function info(msg) { console.log(`INFO ${msg}`); }

async function setTicks(pg, ids) {
  for (const id of ALL) await pg.setChecked('#' + id, ids.includes(id));
}
async function openBuild(pg, ticks) {
  await pg.click('#plnBuild');
  await pg.waitForFunction(() => document.getElementById('plnPrev').open, null, {timeout: 5000}).catch(() => {});
  if (ticks) await setTicks(pg, ticks);
  await pg.waitForTimeout(150);
  return pg.evaluate(() => ({open: $('plnPrev').open, bl: $('pvBlk').textContent, note: $('plnPrevNote').textContent, err: $('plnPrevErr').textContent}));
}
// real mouse click on the first free stage tile (stage = any canvas except the preview)
async function stageClick(pg, tiles = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8]]) {
  const pt = await pg.evaluate(list => {
    for (const [x, y] of list) {
      const p = __fb.px(x, y), e = document.elementFromPoint(p[0], p[1]);
      if (e && e.tagName === 'CANVAS' && e.id !== 'plnPrevMap') return {x: p[0], y: p[1]};
    }
    return null;
  }, tiles);
  if (!pt) return false;
  await pg.mouse.move(pt.x, pt.y);
  await pg.mouse.click(pt.x, pt.y);
  return true;
}
async function reset(pg) {
  await pg.evaluate(() => { S.blocks = []; undoS = []; redoS = []; pasting = null; clip = []; STRICT = true; setView('L'); });
}
async function openPlanner(pg) {
  if (await pg.evaluate(() => document.getElementById('pln').hidden)) await pg.evaluate(() => document.getElementById('plnB').click());
  if (await pg.evaluate(() => $('pln').classList.contains('col'))) await pg.click('#plnC');
}
async function closeIfOpen(pg) {
  if (await pg.evaluate(() => $('plnPrev').open)) await pg.click('#plnCancel');
  await pg.evaluate(() => { pasting = null; });
}
async function setup(pg, item, rate, mk, buf, sp = '') {
  await closeIfOpen(pg);
  await reset(pg);
  await openPlanner(pg);
  await pg.selectOption('#plnItem', item);
  await pg.evaluate(([mk, sp]) => { $('plnMk').value = String(mk); $('plnMk').dispatchEvent(new Event('change')); $('plnSp').value = sp; }, [mk, sp]);
  await pg.fill('#plnRate', String(rate));
  await pg.evaluate(b => { $('plnBuf').value = b; $('plnMod').checked = false; }, buf);   // buffer + modular live in the preview modal: set before Build
}
// modal canvas (or the whole dialog) at both viewport sizes; restores 1400x800 afterwards
async function modalShots(pg, tag, sel = '#plnPrevMap') {
  fs.mkdirSync(SHOTS, {recursive: true});
  for (const [w, h] of [[W, H], [W2, H2]]) {
    await pg.setViewportSize({width: w, height: h});
    await pg.waitForTimeout(300);
    await pg.locator(sel).screenshot({path: path.join(SHOTS, `stack-${tag}-${w}x${h}.png`)}).catch(e => info('modal shot failed: ' + e.message));
  }
  await pg.setViewportSize({width: W, height: H});
  await pg.waitForTimeout(300);
}
// placed factory: classify containers (sources = infinite; in-buffer / out-buffer / sink = ct empty), overlap, UG pairs, flow via out-buffer, noBuild, floors
const stackCheck = () => {
  const isB = b => kindOf(b.cls) === 'b';
  const items = S.blocks.filter(b => !isB(b)), occ = new Map(); let ov = 0;
  items.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (occ.has(k)) ov++; occ.set(k, b) } });
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]], isBox = b => /^DAT_Container/.test(b.cls), boxes = items.filter(isBox);
  const minX = Math.min(...boxes.map(b => b.x)), maxX = Math.max(...boxes.map(b => b.x)), bw = def(PLC_BOX).w;
  const isSink = b => isBox(b) && !(b.ct || []).length && b.x === maxX;
  const isOut = b => isBox(b) && !(b.ct || []).length && b.x === maxX - bw - 1;
  const isIn = b => isBox(b) && !(b.ct || []).length && b.x === minX + bw + 1;
  const ugRows = {};
  items.filter(b => PLC_UG.includes(b.cls)).forEach(u => (ugRows[u.y] = ugRows[u.y] || []).push(u.x));
  let ugOk = true, pairs = 0;
  for (const y in ugRows) {
    const xs = ugRows[y].sort((a, b) => a - b);
    if (xs.length % 2) ugOk = false;
    for (let k = 0; k + 1 < xs.length; k += 2) { pairs++; const sp = xs[k + 1] - xs[k]; if (sp < 1 || sp > def(PLC_UG[0]).maxApart) ugOk = false }
  }
  const reach = (sx, sy) => {
    const q = [[sx, sy, 0]], seen = new Set();
    while (q.length) {
      const [x, y, jp] = q.shift(), key = x + ',' + y + ',' + jp;
      if (seen.has(key)) continue; seen.add(key);
      const b = occ.get(x + ',' + y); if (!b) continue;
      if (isSink(b)) return true;
      if (isBox(b) && !(b.ct || []).length) { q.push([b.x + dim(b).w, y, 0]); continue }   // out-buffer: passes items east on the same row
      if (b.rec || isBox(b)) continue;
      if (PLC_BELT.includes(b.cls)) { const d = DIRS[b.rot & 3]; q.push([x + d[0], y + d[1], 0]); continue }
      if (PLC_UG.includes(b.cls)) { if (jp) q.push([x + 1, y, 0]); else { const ex = ugRows[y].filter(v => v > x).sort((a, c) => a - c)[0]; if (ex !== undefined) q.push([ex, y, 1]) } continue }
      if (PLC_SPL.includes(b.cls)) q.push([x + 1, y, 0], [x - 1, y, 0], [x, y + 1, 0]);
    }
    return false;
  };
  const mach = items.filter(b => b.rec);
  const outOf = m => portsOf(m).filter(p => {
    if (!p.en) return false;
    const n = occ.get((p.x + p.nx) + ',' + (p.y + p.ny));
    if (!n || n.rec || PLC_SPL.includes(n.cls)) return false;
    if (PLC_BELT.includes(n.cls)) { const d = DIRS[n.rot & 3]; if (d[0] === -p.nx && d[1] === -p.ny) return false }
    return true;
  });
  const flowOk = mach.length > 0 && mach.every(m => { const outs = outOf(m); return outs.length === 1 && reach(outs[0].x + outs[0].nx, outs[0].y + outs[0].ny) });
  const frs = S.blocks.filter(isB).map(b => floorRect(b));
  const inside = items.every(m => { const e = dim(m); return frs.some(fr => fr && m.x >= fr.x && m.y >= fr.y && m.x + e.w <= fr.x + fr.w && m.y + e.h <= fr.y + fr.h) });
  return {ov, ugOk, pairs, flowOk, inside, nM: mach.length, sources: boxes.filter(b => (b.ct || []).some(c => c.inf)).length,
    ins: items.filter(isIn).length, outs: items.filter(isOut).length, sinks: items.filter(isSink).length, boxes: boxes.length,
    noBuildBad: noBuild(items.map(mItem)), blocks: S.blocks.filter(isB).map(b => BASE[b.cls].name), nItems: items.length};
};
const simStats = item => {
  simInit({}); simRun(300);
  const got = simProd().byItem[item] || 0, ms = [...SIM.M.values()];
  const need = m => 0.8 * 300 / (recOf(m.b).t / 30);
  return {got, n: ms.length, low: ms.filter(m => m.cycles < need(m)).length, blocked: ms.filter(m => m.st === 'blocked').length};
};

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: W, height: H}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined' && typeof placerLayout === 'function');
  await reset(pg);

  // ---- A) CobaltPlates 300/min Mk1, default Container, all blocks ticked: stacked sources/in-buffers/out-buffers/sinks
  await setup(pg, ITEM, 300, 0, 'DAT_Container');
  const A = await openBuild(pg, ALL);
  const A1 = await pg.evaluate(() => {
    const x = placerPlan(), T = x.P.nodes[x.it];
    return {open: $('plnPrev').open, err: $('plnPrevErr').textContent, note: $('plnPrevNote').textContent, N: T.machines, pmach: T.pmach,
      trunks: plcL.trunks, nS: plcL.nS, nK: plcL.nK, ps: plcL.ps, w: plcL.w, h: plcL.h, bank: !!plcL.bank, blocks: plcT && plcT.ok ? plcT.blocks.length : -1,
      nSc: plcT && plcT.ok ? plcT.L.nS : -1, nKc: plcT && plcT.ok ? plcT.L.nK : -1, G: plcT && plcT.ok ? plcT.G : -1};   // chosen plan (band count G may be > 1)
  });
  info(`A) N=${A1.N} trunks=${A1.trunks} nS=${A1.nS} nK=${A1.nK} ps=${A1.ps} blocks=${A1.blocks} cell=${A1.w}x${A1.h} note: ${A1.note}`);
  chk('A) modal opens with all blocks ticked, no preview error', A.open === true && A1.open === true && A1.err === '', JSON.stringify({A, A1}));
  chk('A) note matches /Mk3 packs \\d+ machines per trunk/', /Mk3 packs \d+ machines per trunk/.test(A1.note), A1.note);
  chk('A) layout is bank with nK = ceil(trunks/ps) and nS = nK', A1.bank && A1.nK === Math.ceil(A1.trunks / A1.ps) && A1.nS === A1.nK, JSON.stringify(A1));
  await modalShots(pg, 'A-container');
  await pg.click('#plnPlace');
  const placedA = await stageClick(pg);
  await pg.waitForTimeout(150);
  await pg.screenshot({path: path.join(SHOTS, 'stack-A-placed-1400x800.png')});
  const Ac = await pg.evaluate(stackCheck);
  const simA = await pg.evaluate(simStats, ITEM);
  info(`A) placed: machines=${Ac.nM} sources=${Ac.sources} in=${Ac.ins} out=${Ac.outs} sinks=${Ac.sinks} blocks=${Ac.blocks.length} (${[...new Set(Ac.blocks)].join(',')}) sim=${simA.got.toFixed(2)} cycles-low=${simA.low}`);
  chk('A) placed: machines = N from plan', placedA && Ac.nM === A1.N, JSON.stringify({placedA, nM: Ac.nM, N: A1.N}));
  chk('A) placed: nS sources, nS in-buffers, nK out-buffers, nK sinks (counts of the chosen plan, which may use several bands)', Ac.sources === A1.nSc && Ac.ins === A1.nSc && Ac.outs === A1.nKc && Ac.sinks === A1.nKc && Ac.boxes === 2 * A1.nSc + 2 * A1.nKc, JSON.stringify({Ac, nSc: A1.nSc, nKc: A1.nKc, G: A1.G}));
  chk('A) placed: no overlapping cells, noBuild false, all items inside their floors', Ac.ov === 0 && Ac.noBuildBad === false && Ac.inside === true, JSON.stringify({ov: Ac.ov, nb: Ac.noBuildBad, inside: Ac.inside}));
  chk('A) placed: every machine output reaches a sink through the out-buffer; undergrounds valid', Ac.flowOk === true && Ac.ugOk === true, JSON.stringify({flow: Ac.flowOk, ug: Ac.ugOk}));
  chk('A) sim 300 within 5% of 300, cycles >= 0.8, none blocked', Math.abs(simA.got - 300) <= 15 && simA.low === 0 && simA.blocked === 0 && simA.n === A1.N, JSON.stringify(simA));
  await pg.keyboard.press('Control+z');
  const uA = await pg.evaluate(() => S.blocks.length);
  chk('A) one Control+z empties the factory', uA === 0, String(uA));

  // ---- A with Large buffers: same shape rules, shots
  await setup(pg, ITEM, 300, 0, 'DAT_Container_2');
  const AL = await openBuild(pg, ALL);
  const AL1 = await pg.evaluate(() => ({open: $('plnPrev').open, err: $('plnPrevErr').textContent, nS: plcL.nS, nK: plcL.nK, trunks: plcL.trunks, ps: plcL.ps}));
  chk('A-Large) modal opens, no error, nK = ceil(trunks/ps)', AL.open && AL1.err === '' && AL1.nK === Math.ceil(AL1.trunks / AL1.ps), JSON.stringify({AL, AL1}));
  await modalShots(pg, 'A-large');
  await closeIfOpen(pg);

  // ---- B) errors show inside the modal
  await setup(pg, 'ITEM_Exosuit', 1, 0, 'DAT_Container');
  const B1 = await openBuild(pg, ALL);
  const B1s = await pg.evaluate(() => ({open: $('plnPrev').open, err: $('plnPrevErr').textContent, placeOff: $('plnPlace').disabled, n: S.blocks.length}));
  chk('B1) Exosuit: modal open, error "single-input single-recipe", Place disabled, nothing placed', B1s.open && /single-input single-recipe/.test(B1s.err) && B1s.placeOff && B1s.n === 0, JSON.stringify({B1, B1s}));
  await modalShots(pg, 'exo-error', '#plnPrev');
  await closeIfOpen(pg);

  await setup(pg, ITEM, 300, 2, 'DAT_Container', '0');   // Mk3 belt + Mk1 splitter: trunk of 9 machines is too much for one Mk1 splitter
  const B2 = await openBuild(pg, ALL);
  const B2s = await pg.evaluate(() => ({open: $('plnPrev').open, err: $('plnPrevErr').textContent, placeOff: $('plnPlace').disabled}));
  chk('B2) Mk3 belt + Mk1 splitter: error shown in the modal ("too slow"), Place disabled', B2s.open && /too slow/.test(B2s.err) && B2s.placeOff, JSON.stringify({B2, B2s}));
  await pg.evaluate(() => { $('pvSp').value = ''; $('pvSp').dispatchEvent(new Event('change')); });   // modal Splitter -> follow belt
  await pg.waitForTimeout(150);
  const B2f = await pg.evaluate(() => ({err: $('plnPrevErr').textContent, placeOff: $('plnPlace').disabled, drawn: placerBox($('plnPrevMap').width, $('plnPrevMap').height) !== null}));
  chk('B2) Splitter set to follow belt: error clears, Place enabled, canvas non-empty', B2f.err === '' && B2f.placeOff === false && B2f.drawn === true, JSON.stringify(B2f));
  await closeIfOpen(pg);

  await setup(pg, ITEM, 60, 0, 'DAT_Container');
  // real UI clamps an emptied rate to 1 on blur (planner.js plnRate onchange): blur first, then empty it without a change event
  await pg.fill('#plnRate', '');
  await pg.evaluate(() => { document.activeElement && document.activeElement.blur(); $('plnRate').value = ''; });
  const B3 = await openBuild(pg, ALL);
  const B3s = await pg.evaluate(() => ({open: $('plnPrev').open, err: $('plnPrevErr').textContent}));
  chk('B3) empty rate: modal open with "Pick an item and a rate first"', B3s.open && B3s.err === 'Pick an item and a rate first', JSON.stringify({B3, B3s}));
  await closeIfOpen(pg);

  // ---- C) 360/min Mk3: 2x2-only = fewest blocks; 1x1-only = placed in 14-high floors or refused with the shortest height
  await setup(pg, ITEM, 360, 2, 'DAT_Container');
  const C1 = await openBuild(pg, ['plnBk22']);
  const C1s = await pg.evaluate(() => {
    const x = placerPlan(), T = x.P.nodes[x.it], eI = x.P.edges.find(e => e.from === x.P.raw[0].item && e.to === x.it), eO = x.P.edges.find(e => e.to == null);
    const m = Math.floor(MKS[2][1] / Math.max(T.pmach, T.pmach * eI.flow / eO.flow) + 1e-9);
    return {open: $('plnPrev').open, err: $('plnPrevErr').textContent, bl: $('pvBlk').textContent, N: T.machines, m, want: Math.ceil(T.machines / m), trunks: plcL.trunks};
  });
  chk('C1) 360/min Mk3, 2x2 only: trunks = ceil(N/m), placed in 2x2 blocks only', C1.open && C1.err === '' && C1.trunks === C1.want && /BPO_Station_02/.test(C1.bl) && !/Station_01|2x1/.test(C1.bl), JSON.stringify({C1, C1s}));
  await modalShots(pg, 'mk3-360-2x2');
  await closeIfOpen(pg);

  await setup(pg, ITEM, 360, 2, 'DAT_Container');
  const C2 = await openBuild(pg, ['plnBk11']);
  const C2s = await pg.evaluate(() => ({open: $('plnPrev').open, err: $('plnPrevErr').textContent, placeOff: $('plnPlace').disabled, bl: $('pvBlk').textContent}));
  if (C2s.err) {
    chk('C2) 1x1 only: refused in the modal, no "shortest layout" text, reason names the wall crossing', C2s.open && !/shortest layout/.test(C2s.err) && /no free row to cross a wall/.test(C2s.err), JSON.stringify({C2, C2s}));
    info(`C2) refused: ${C2s.err}`);
  } else {
    await pg.click('#plnPlace');
    const placedC2 = await stageClick(pg);
    await pg.waitForTimeout(150);
    const cc = await pg.evaluate(stackCheck), sc = await pg.evaluate(simStats, ITEM);
    info(`C2) placed 1x1: blocks=${cc.blocks.length} (${[...new Set(cc.blocks)].join(',')}) machines=${cc.nM} sim=${sc.got.toFixed(2)}`);
    chk('C2) 1x1 only: placed, every block BPO_Station_01, every item inside its 14-high floor, noBuild false', placedC2 && cc.blocks.length > 0 && cc.blocks.every(n => n === 'BPO_Station_01') && cc.inside === true && cc.noBuildBad === false, JSON.stringify({placedC2, blocks: cc.blocks, inside: cc.inside, nb: cc.noBuildBad}));
    chk('C2) 1x1 only: no overlap, sim within 5% of 360, none blocked', cc.ov === 0 && Math.abs(sc.got - 360) <= 18 && sc.blocked === 0, JSON.stringify({ov: cc.ov, sim: sc}));
    await pg.keyboard.press('Control+z');
  }
  await closeIfOpen(pg);

  // C3) sweep through placerTile: rates x Mk x single ticks. Placed -> every item inside a floor, no overlap; else message starts "Does not fit"
  const sweep = await pg.evaluate(item => {
    const out = {n: 0, placed: 0, refused: 0, layoutRefused: 0, bad: []};
    for (const rate of [60, 140, 300, 360, 720]) for (const mk of [0, 2]) {
      const P = plan(item, rate, mk, {}, {}, {}), L = placerLayout(P, item, mk, mk, {box: 'DAT_Container'});
      if (!L.ok) { out.layoutRefused++; if (!L.why) out.bad.push(`R${rate} Mk${mk + 1}: layout refused with no why`); continue }
      for (const tk of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
        out.n++;
        const T = placerTile(L, tk), tag = `R${rate} Mk${mk + 1} ticks ${tk.join('')}`;
        if (!T.ok) { out.refused++; if (!/^Does not fit/.test(T.why)) out.bad.push(tag + ': ' + T.why); continue }
        out.placed++;
        const frs = T.blocks.map(q => floorRect({cls: q.cls, x: q.x, y: q.y, h: 0, rot: 0}));
        const inside = T.ms.every(m => { const e = dim(m); return frs.some(fr => fr && m.x >= fr.x && m.y >= fr.y && m.x + e.w <= fr.x + fr.w && m.y + e.h <= fr.y + fr.h) });
        const cells = new Map(); let ov = 0;
        T.ms.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) ov++; cells.set(k, b) } });
        if (!inside || ov) out.bad.push(tag + `: inside=${inside} overlap=${ov}`);
      }
    }
    return out;
  }, ITEM);
  info(`C3) sweep: ${sweep.n} tile runs, placed ${sweep.placed}, refused ${sweep.refused}, layout refused ${sweep.layoutRefused}`);
  chk(`C3) sweep ${sweep.n} tile runs: placed => items inside floors, no overlap; refused => "Does not fit"`, sweep.n > 0 && sweep.bad.length === 0, sweep.bad.join('\n     '));

  // ---- D) 1000/min Mk2 all ticks: placerLayout + placerTile in < 2000 ms, places or refuses with "tall" or "blocks"
  const D = await pg.evaluate(item => {
    const P = plan(item, 1000, 1, {}, {}, {}), t0 = performance.now();
    const L = placerLayout(P, item, 1, 1, {box: 'DAT_Container'}), T = L.ok ? placerTile(L, [true, true, true]) : {ok: false, why: L.why};
    return {ms: performance.now() - t0, ok: T.ok, why: T.why || '', blocks: T.ok ? T.blocks.length : 0};
  }, ITEM);
  info(`D) 1000/min Mk2: ${D.ms.toFixed(0)} ms, ok=${D.ok}, blocks=${D.blocks}, why=${D.why}`);
  chk('D) 1000/min Mk2 (default Container): < 2000 ms, places or refuses with "tall" or "blocks"', D.ms < 2000 && (D.ok || /tall|blocks/.test(D.why)), JSON.stringify(D));

  chk('(h) no pageerror / console.error during the run', errs.length === 0, errs.join('\n     '));
  await closeIfOpen(pg);
  await reset(pg);
  await ctx.close();
} catch (e) {
  fails.push({name: 'exception', detail: e.stack || String(e)});
  console.log('FAIL exception: ' + (e.stack || e));
} finally {
  await br.close();
}
for (const e of errs) console.log('ERR ' + e);
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  fails.forEach(f => console.log(` - ${f.name}${f.detail ? ' :: ' + f.detail.split('\n')[0].slice(0, 300) : ''}`));
}
process.exitCode = fails.length || errs.length ? 1 : 0;

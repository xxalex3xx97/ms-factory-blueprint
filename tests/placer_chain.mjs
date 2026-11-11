// N-stage chain (placer.js placerBank over plcChain): 2 and 3 stages, hub containers between stages, stacked hubs, modular, golden layouts. REAL UI for the placement checks; direct placerLayout only for golden (G) and unit (U).
// Run:  node tests/placer_chain.mjs   Exit code 1 on any failed check or page error. Shots: tests/shots/chain-<w>x<h>.png (modal canvas, default plan).
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
const W = 1400, H = 800;
const ALL = ['plnBk11', 'plnBk21', 'plnBk22'];
// golden hashes (h = djb2-style over JSON.stringify(placerLayout(...).items)), taken at HEAD fe9ae10 before the chain change
const GOLD = [1555030833, 2489486446, 104714058, 3460583817, 637843485, 1480417497];

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
  await pg.evaluate(b => { $('plnBuf').value = b; $('plnMod').checked = false; }, buf);
}
// chosen plan numbers (plcT = placerTile result shown in the modal)
const planOf = () => ({
  err: $('plnPrevErr').textContent, blocks: plcT && plcT.ok ? plcT.blocks.length : -1, cols: plcT && plcT.ok ? plcT.cols : -1,
  rows: plcT && plcT.ok ? plcT.rows : -1, G: plcT && plcT.ok ? plcT.G : -1, ug: plcT && plcT.ok ? plcT.ug : -1,
  stages: plcT && plcT.ok ? plcT.L.stages : -1, hubs: plcT && plcT.ok ? plcT.L.hubs : -1, tbs: plcT && plcT.ok ? plcT.L.tbs : [],
  note: $('plnPrevNote').textContent, io: $('pvIO').textContent, N: (x => x ? x.P.nodes[x.it].machines : -1)(placerPlan())
});
// modal canvas at the four sizes; restores 1400x800 afterwards
async function shots(pg, tag) {
  fs.mkdirSync(SHOTS, {recursive: true});
  for (const [w, h] of [[2576, 982], [1400, 800], [1024, 700], [390, 844]]) {
    await pg.setViewportSize({width: w, height: h});
    await pg.waitForTimeout(300);
    await pg.locator('#plnPrevMap').screenshot({path: path.join(SHOTS, `${tag}-${w}x${h}.png`)}).catch(e => info('modal shot failed: ' + e.message));
  }
  await pg.setViewportSize({width: W, height: H});
  await pg.waitForTimeout(300);
}
// placed factory: overlap, every item inside a chosen block floor, UG pairs (horizontal by row, vertical by column) valid, no UG next to a splitter or a side input
const audit = () => {
  const isB = b => kindOf(b.cls) === 'b', ms = S.blocks.filter(b => !isB(b)), cells = new Map(); let ov = 0;
  ms.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) ov++; cells.set(k, b) } });
  const frs = S.blocks.filter(isB).map(q => floorRect(q));
  const inside = ms.every(m => { const e = dim(m); return frs.some(fr => fr && m.x >= fr.x && m.y >= fr.y && m.x + e.w <= fr.x + fr.w && m.y + e.h <= fr.y + fr.h) });
  const ugs = ms.filter(b => PLC_UG.includes(b.cls)), grp = {}, bad = [];
  ugs.forEach(u => { const key = (u.rot & 1) === 0 ? 'h' + u.y : 'v' + u.x; (grp[key] = grp[key] || []).push(u) });
  const maxA = def(PLC_UG[0]).maxApart;
  let pairs = 0, vert = 0, maxSpan = 0;
  for (const key in grp) {
    const hz = key[0] === 'h', list = grp[key].sort((a, b) => hz ? a.x - b.x : a.y - b.y);
    if (list.length % 2) bad.push(key + ' odd count');
    for (let k = 0; k + 1 < list.length; k += 2) {
      const a = list[k], b = list[k + 1], sp = hz ? b.x - a.x : b.y - a.y;
      pairs++; if (!hz) vert++;
      maxSpan = Math.max(maxSpan, sp);
      if (sp < 1 || sp > maxA || a.rot !== b.rot) bad.push(key + ' pair span ' + sp);
    }
  }
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const u of ugs) {
    const isV = (u.rot & 1) === 1;
    for (const [dx, dy] of dirs) {
      const n = cells.get((u.x + dx) + ',' + (u.y + dy));
      if (n && PLC_SPL.includes(n.cls)) bad.push('UG at ' + u.x + ',' + u.y + ' next to splitter');
    }
    const side = isV ? [[-1, 0, 0], [1, 0, 2]] : [[0, -1, 1], [0, 1, 3]];
    for (const [dx, dy, want] of side) {
      const n = cells.get((u.x + dx) + ',' + (u.y + dy));
      if (n && PLC_BELT.includes(n.cls) && n.rot === want) bad.push('UG at ' + u.x + ',' + u.y + ' side input');
    }
  }
  return {ov, inside, pairs, vert, maxSpan, bad, nM: ms.filter(b => b.rec).length, nBlk: S.blocks.filter(isB).length, ugOk: bad.length === 0};
};
const simStats = item => {
  simInit({}); simRun(300);
  const got = simProd().byItem[item] || 0, ms = [...SIM.M.values()];
  const need = m => 0.8 * 300 / (recOf(m.b).t / 30);
  return {got, n: ms.length, low: ms.filter(m => m.cycles < need(m)).length, blocked: ms.filter(m => m.st === 'blocked').length};
};
// place the current modal plan with real clicks, audit, simulate, undo
async function placeAuditSim(pg, item) {
  await pg.click('#plnPlace');
  const placed = await stageClick(pg);
  await pg.waitForTimeout(150);
  const ag = await pg.evaluate(audit);
  const sim = await pg.evaluate(simStats, item);
  await pg.keyboard.press('Control+z');
  return {placed, ag, sim};
}
const ms5 = (x, t, pct) => Math.abs(x - t) <= t * pct;

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

  // ---- U) unit: plcChain
  const U = await pg.evaluate(() => {
    const PL = (it, rate) => plan(it, rate, 0, {sp: null, bal: null}, PLN_PICK, {proto: plnProto(), enr: false});
    const names = ch => ch ? ch.map(n => n.item) : null;
    return {
      bm: names(plcChain(PL('ITEM_BasicMotor', 120), 'ITEM_BasicMotor')),
      cobalt: (ch => ch ? ch.length : null)(plcChain(PL('ITEM_CobaltPlates', 300), 'ITEM_CobaltPlates')),
      xeno: names(plcChain(PL('ITEM_Xenoeukarya', 60), 'ITEM_Xenoeukarya')),
      exo: names(plcChain(PL('ITEM_Exosuit', 60), 'ITEM_Exosuit'))
    };
  });
  info('U) ' + JSON.stringify(U));
  chk('U) plcChain: Basic Motor -> [TitaniumPlates, BasicMotor]; Cobalt Plates length 1; Xenoeukarya and Exosuit null', JSON.stringify(U.bm) === JSON.stringify(['ITEM_TitaniumPlates', 'ITEM_BasicMotor']) && U.cobalt === 1 && U.xeno === null && U.exo === null, JSON.stringify(U));

  // ---- G) golden: single-stage layouts unchanged (hashes from HEAD)
  const G = await pg.evaluate(() => {
    const h = s => {let x = 5381; for (const c of s) x = (x * 33 ^ c.charCodeAt(0)) >>> 0; return x};
    const PL = (rate, mk) => plan('ITEM_CobaltPlates', rate, mk, {sp: null, bal: null}, PLN_PICK, {proto: plnProto(), enr: false});
    const cases = [
      [300, 0, {}, 0], [60, 0, {bank: true}, 0], [1200, 0, {G: 3}, 0], [360, 2, {}, 2],
      [300, 0, {box: 'DAT_Container_2'}, 0], [300, 0, {fit: plcFit(plcCls('BPO_Station_02'), 0), G: 2}, 0]];
    return cases.map(([rate, mk, o, spMk]) => {
      const L = placerLayout(PL(rate, mk), 'ITEM_CobaltPlates', mk, spMk, o);
      return {ok: L.ok, hash: L.items ? h(JSON.stringify(L.items)) : null};
    });
  });
  G.forEach((g, i) => chk(`G) golden ${i + 1} unchanged (ok, hash)`, g.ok === true && g.hash === GOLD[i], JSON.stringify({got: g, want: GOLD[i]})));

  // ---- A) Basic Motor 120/min Mk1, DAT_Container, all blocks: 2 stages, 1 hub
  await setup(pg, 'ITEM_BasicMotor', 120, 0, 'DAT_Container');
  const A = await openBuild(pg, ALL);
  const A1 = await pg.evaluate(planOf);
  const Al = await pg.evaluate(() => ({bank: plcL.bank, stages: plcL.stages, hubs: plcL.hubs}));
  info(`A) blocks=${A1.blocks} cols=${A1.cols} rows=${A1.rows} G=${A1.G} stages=${A1.stages} hubs=${A1.hubs} note: ${A1.note}`);
  chk('A) modal open, all blocks ticked, no modal error, plcL.bank, stages===2, hubs===1', A.open && A1.err === '' && Al.bank === true && Al.stages === 2 && Al.hubs === 1, JSON.stringify({A1, Al}));
  chk('A) note: Stage 1 Titanium Plates line', /Stage 1 Titanium Plates: 3 machines, 1 trunk \(3\), \d+ rows/.test(A1.note), A1.note);
  chk('A) note: Stage 2 Basic Motor line', /Stage 2 Basic Motor: 2 machines, 2 trunks \(1\+1\)/.test(A1.note), A1.note);
  chk('A) note: hub line 60/min (max 480)', /Hub container between stages: 60\/min \(max 480\)/.test(A1.note), A1.note);
  chk('A) pvIO: 1 hub container(s) between stages', /1 hub container\(s\) between stages/.test(A1.io), A1.io);
  await shots(pg, 'chain');
  const Ap = await placeAuditSim(pg, 'ITEM_BasicMotor');
  info(`A) placed: machines=${Ap.ag.nM} pairs=${Ap.ag.pairs} (vertical ${Ap.ag.vert}) sim=${Ap.sim.got.toFixed(2)} low=${Ap.sim.low} blocked=${Ap.sim.blocked}`);
  chk('A) placed: stage click placed it, 5 machines, no overlap, items inside floors, UG pairs valid', Ap.placed && Ap.ag.nM === 5 && Ap.ag.ov === 0 && Ap.ag.inside === true && Ap.ag.ugOk === true, JSON.stringify({placed: Ap.placed, nM: Ap.ag.nM, ov: Ap.ag.ov, inside: Ap.ag.inside, ug: Ap.ag.bad.slice(0, 3)}));
  chk('A) sim Basic Motor 120 within 5%, no machine low/blocked', ms5(Ap.sim.got, 120, 0.05) && Ap.sim.low === 0 && Ap.sim.blocked === 0, JSON.stringify(Ap.sim));
  await closeIfOpen(pg);

  // ---- B) Basic Motor 30/min: 1 machine per stage
  await setup(pg, 'ITEM_BasicMotor', 30, 0, 'DAT_Container');
  const Bo = await openBuild(pg, ALL);
  const Bl = await pg.evaluate(() => ({stages: plcL.stages, bank: plcL.bank}));
  const B1 = await pg.evaluate(planOf);
  chk('B) 30/min: modal ok, 2 stages, 1 machine per stage', Bo.open && B1.err === '' && Bl.stages === 2 && B1.N === 1, JSON.stringify({B1, Bl}));
  const Bp = await placeAuditSim(pg, 'ITEM_BasicMotor');
  info(`B) placed: machines=${Bp.ag.nM} sim=${Bp.sim.got.toFixed(2)}`);
  // whole machines: 1 plates machine = 20/min ore -> 40 motors/min
  chk('B) 30/min placed: 2 machines, no overlap, sim within [30*0.95, 40*1.05]', Bp.placed && Bp.ag.nM === 2 && Bp.ag.ov === 0 && Bp.ag.inside === true && Bp.sim.got >= 30 * 0.95 && Bp.sim.got <= 40 * 1.05, JSON.stringify({nM: Bp.ag.nM, sim: Bp.sim}));
  await closeIfOpen(pg);

  // ---- C) 3 stages: injected test recipe (restored in finally)
  let C1 = null, Cp = null;
  try {
    await pg.evaluate(() => { CATALOG.recipes.CRAFT_Assembler.push({o: ['ITEM_TestCoilPack', 1], i: [['ITEM_MagneticCoils', 1]], t: 60}); plnFillItems(); });
    await setup(pg, 'ITEM_TestCoilPack', 60, 0, 'DAT_Container');
    const Co = await openBuild(pg, ALL);
    C1 = await pg.evaluate(planOf);
    const Cl = await pg.evaluate(() => ({stages: plcL.stages, hubs: plcL.hubs}));
    info(`C) blocks=${C1.blocks} stages=${Cl.stages} hubs=${Cl.hubs} note: ${C1.note}`);
    chk('C) 3 stages: modal ok, stages===3, hubs===2', Co.open && C1.err === '' && Cl.stages === 3 && Cl.hubs === 2, JSON.stringify({C1, Cl}));
    chk('C) 3 stages: Stage 1/2/3 notes and 2 hub lines', /Stage 1 .*: \d+ machines, .* rows/.test(C1.note) && /Stage 2 .*: \d+ machines, .* rows/.test(C1.note) && /Stage 3 .*: \d+ machines, .* rows/.test(C1.note) && (C1.note.match(/Hub container between stages/g) || []).length === 2, C1.note);
    Cp = await placeAuditSim(pg, 'ITEM_TestCoilPack');
    info(`C) placed: machines=${Cp.ag.nM} sim=${Cp.sim.got.toFixed(2)}`);
    chk('C) 3 stages placed: no overlap, items inside, UG valid, sim 60 within 5%, none blocked', Cp.placed && Cp.ag.ov === 0 && Cp.ag.inside === true && Cp.ag.ugOk === true && ms5(Cp.sim.got, 60, 0.05) && Cp.sim.blocked === 0, JSON.stringify({ov: Cp.ag.ov, inside: Cp.ag.inside, ug: Cp.ag.bad.slice(0, 3), sim: Cp.sim}));
    await closeIfOpen(pg);
  } finally {
    await pg.evaluate(() => {
      const L = CATALOG.recipes.CRAFT_Assembler, k = L.findIndex(r => r.o && r.o[0] === 'ITEM_TestCoilPack');
      if (k >= 0) L.splice(k, 1);
      plnFillItems();
    });
  }

  // ---- D) Hub stacking: 360/min Mk1 -> more than one hub container per junction
  await setup(pg, 'ITEM_BasicMotor', 360, 0, 'DAT_Container');
  const Do = await openBuild(pg, ALL);
  const D1 = await pg.evaluate(planOf);
  info(`D) blocks=${D1.blocks} G=${D1.G} hubs=${D1.hubs} note: ${D1.note}`);
  chk('D) 360/min: modal ok, hubs>=2, note has "hub containers stacked"', Do.open && D1.err === '' && D1.hubs >= 2 && /hub containers stacked/.test(D1.note), JSON.stringify({D1}));
  const Dp = await placeAuditSim(pg, 'ITEM_BasicMotor');
  info(`D) placed: machines=${Dp.ag.nM} sim=${Dp.sim.got.toFixed(2)}`);
  chk('D) 360/min placed: no overlap, items inside, UG valid, sim 360 within 5%', Dp.placed && Dp.ag.ov === 0 && Dp.ag.inside === true && Dp.ag.ugOk === true && ms5(Dp.sim.got, 360, 0.05), JSON.stringify({ov: Dp.ag.ov, inside: Dp.ag.inside, ug: Dp.ag.bad.slice(0, 3), sim: Dp.sim}));
  await closeIfOpen(pg);

  // ---- E) Modular: IN west (open input), OUT east (open output), hubs inside
  for (const mod of [true, false]) {
    await setup(pg, 'ITEM_BasicMotor', 120, 0, 'DAT_Container');
    await pg.evaluate(m => { $('plnMod').checked = m; }, mod);
    const Eo = await openBuild(pg, ALL);
    const Ee = await pg.evaluate(() => {
      const L = plcL, boxes = L.items.filter(b => b.cls === 'DAT_Container');
      return {
        mod: L.mod, bank: L.bank, w: L.w, nIn: L.nIn, nOut: L.nOut, hubs: L.hubs,
        infBox: boxes.filter(b => (b.ct || []).some(c => c.inf)).length,
        boxes: boxes.length,
        belt0: L.items.filter(b => PLC_BELT.includes(b.cls) && b.x === 0).length,
        beltE: L.items.filter(b => PLC_BELT.includes(b.cls) && b.x === L.w - 1).length,
        io: $('pvIO').textContent, err: $('plnPrevErr').textContent, placeOff: $('plnPlace').disabled
      };
    });
    info(`E) mod=${mod} ${JSON.stringify(Ee)}`);
    if (mod) {
      chk('E) modular: Build mod===true, no container with inf ct, DAT_Container count 5 per band', Eo.open && Ee.mod === true && Ee.infBox === 0 && Ee.boxes === 5, JSON.stringify(Ee));
      chk('E) modular: belts at x=0 === nIn, belts at x===w-1 === nOut', Ee.belt0 === Ee.nIn && Ee.beltE === Ee.nOut && Ee.nIn >= 1, JSON.stringify(Ee));
      chk('E) modular: pvIO "IN west ... hub container(s) between stages", Place enabled', /IN west.*hub container\(s\) between stages/.test(Ee.io) && Ee.placeOff === false, Ee.io + ' | ' + Ee.err);
    } else {
      chk('E) closed, same plan: 7 containers per band', Eo.open && Ee.mod === false && Ee.boxes === 7, JSON.stringify(Ee));
    }
    await closeIfOpen(pg);
  }
  await pg.evaluate(() => { $('plnMod').checked = false; });

  // ---- F) Basic Motor 1200/min Mk1 default container, all blocks
  await setup(pg, 'ITEM_BasicMotor', 1200, 0, 'DAT_Container');
  const Fo = await openBuild(pg, ALL);
  const F1 = await pg.evaluate(planOf);
  info(`F) ${F1.err || `blocks=${F1.blocks} cols=${F1.cols} rows=${F1.rows} G=${F1.G} hubs=${F1.hubs}`} note: ${F1.note}`);
  chk('F) 1200/min: modal ok, <=60 blocks, notes present', Fo.open && F1.err === '' && F1.blocks >= 1 && F1.blocks <= 60 && /Makes/.test(F1.note), F1.err || JSON.stringify(F1));
  if (F1.err === '') {
    const Fp = await placeAuditSim(pg, 'ITEM_BasicMotor');
    info(`F) placed: machines=${Fp.ag.nM} blocks=${Fp.ag.nBlk} sim=${Fp.sim.got.toFixed(2)}`);
    chk('F) 1200/min placed: no overlap, items inside, UG valid, sim within 5%', Fp.placed && Fp.ag.ov === 0 && Fp.ag.inside === true && Fp.ag.ugOk === true && ms5(Fp.sim.got, 1200, 0.05), JSON.stringify({ov: Fp.ag.ov, inside: Fp.ag.inside, ug: Fp.ag.bad.slice(0, 3), sim: Fp.sim}));
  }
  await closeIfOpen(pg);

  // ---- X) Exosuit: refused cleanly and fast, no tuning
  await setup(pg, 'ITEM_Exosuit', 60, 0, 'DAT_Container');
  const t0 = Date.now();
  const X = await openBuild(pg, ALL);
  const ms = Date.now() - t0;
  const X1 = await pg.evaluate(() => ({err: $('plnPrevErr').textContent, placeOff: $('plnPlace').disabled}));
  chk('X) Exosuit: modal open, #plnPrevErr single-input single-recipe, Place disabled, < 2000 ms', X.open && /single-input single-recipe/.test(X1.err) && X1.placeOff === true && ms < 2000, JSON.stringify({X1, ms}));
  await closeIfOpen(pg);

  // ---- K) Enrichment on (only if the planner's enrichment path is ok): Titanium Plates 60/min = 2 stages
  await setup(pg, 'ITEM_TitaniumPlates', 60, 0, 'DAT_Container');
  await pg.setChecked('#plnEnr', true);
  const Ko = await openBuild(pg, ALL);
  const K1 = await pg.evaluate(planOf);
  const Kl = await pg.evaluate(() => ({stages: plcL ? plcL.stages : -1}));
  info(`K) stages=${Kl.stages} ${K1.err || `blocks=${K1.blocks}`}`);
  if (K1.err === '' && Kl.stages === 2) {
    const Kp = await placeAuditSim(pg, 'ITEM_TitaniumPlates');
    chk('K) enrichment 60/min: 2 stages, placed, no overlap, sim 60 within 5%', Ko.open && Kp.placed && Kp.ag.ov === 0 && Kp.ag.inside === true && ms5(Kp.sim.got, 60, 0.05), JSON.stringify({ov: Kp.ag.ov, sim: Kp.sim}));
  } else info('K) skipped: no 2-stage plan (' + (K1.err || 'stages=' + Kl.stages) + ')');
  await pg.evaluate(() => { $('plnEnr').checked = false; });
  await closeIfOpen(pg);

  chk('(H) no pageerror / console.error during the run', errs.length === 0, errs.join('\n     '));
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

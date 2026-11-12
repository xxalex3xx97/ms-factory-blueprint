// 2D block tiling (placer.js placerCut rows + placerTile band search): N rows x M cols of blocks, walls crossed by underground pairs in both directions. REAL UI only.
// Run:  node tests/placer_grid.mjs   Exit code 1 on any failed check or page error. Shots: tests/shots/grid-<w>x<h>.png (modal canvas, default plan).
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
  await pg.evaluate(b => { $('plnBuf').value = b; $('plnMod').checked = false; }, buf);
}
// chosen plan numbers (plcT = placerTile result shown in the modal)
const planOf = () => ({
  err: $('plnPrevErr').textContent, blocks: plcT && plcT.ok ? plcT.blocks.length : -1, cols: plcT && plcT.ok ? plcT.cols : -1,
  rows: plcT && plcT.ok ? plcT.rows : -1, G: plcT && plcT.ok ? plcT.G : -1, ug: plcT && plcT.ok ? plcT.ug : -1,
  note: $('plnPrevNote').textContent, io: $('pvIO').textContent, N: (x => x ? x.P.nodes[x.it].machines : -1)(placerPlan())
});
// modal canvas at the four sizes; restores 1400x800 afterwards
async function shots(pg) {
  fs.mkdirSync(SHOTS, {recursive: true});
  for (const [w, h] of [[2576, 982], [1400, 800], [1024, 700], [390, 844]]) {
    await pg.setViewportSize({width: w, height: h});
    await pg.waitForTimeout(300);
    await pg.locator('#plnPrevMap').screenshot({path: path.join(SHOTS, `grid-${w}x${h}.png`)}).catch(e => info('modal shot failed: ' + e.message));
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
  let pairs = 0, vert = 0, maxSpan = 0;
  for (const key in grp) {
    const hz = key[0] === 'h', list = grp[key].sort((a, b) => hz ? a.x - b.x : a.y - b.y);
    if (list.length % 2) bad.push(key + ' odd count');
    for (let k = 0; k + 1 < list.length; k += 2) {
      const a = list[k], b = list[k + 1], sp = hz ? b.x - a.x : b.y - a.y;
      pairs++; if (!hz) vert++;
      maxSpan = Math.max(maxSpan, sp);
      if (sp < 1 || sp + 1 > def(a.cls).maxApart || a.rot !== b.rot) bad.push(key + ' pair span ' + sp);
    }
  }
  const ms4 = ugs.length ? ugs : [];
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const u of ms4) {
    const isV = (u.rot & 1) === 1;
    for (const [dx, dy] of dirs) {
      const n = cells.get((u.x + dx) + ',' + (u.y + dy));
      if (n && PLC_SPL.includes(n.cls)) bad.push('UG at ' + u.x + ',' + u.y + ' next to splitter');
    }
    // side input: a belt beside the UG pointing into it
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

  // ---- A) Cobalt Plates 300/min Mk1, default Container, all block types ticked
  await setup(pg, ITEM, 300, 0, 'DAT_Container');
  const A = await openBuild(pg, ALL);
  const A1 = await pg.evaluate(planOf);
  info(`A) blocks=${A1.blocks} cols=${A1.cols} rows=${A1.rows} G=${A1.G} ug=${A1.ug} note: ${A1.note}`);
  chk('A) modal open, all blocks ticked, no modal error, note has " x " and "band"', A.open && A1.err === '' && / x /.test(A1.note) && /band/.test(A1.note), JSON.stringify({A, A1}));
  chk('A) chosen plan uses 1..60 blocks', A1.blocks >= 1 && A1.blocks <= 60, String(A1.blocks));
  chk('D) preview text: "Chose C x R blocks", band count, underground pair count', /Chose \d+ x \d+ blocks/.test(A1.note) && /\d+ band\(s\)/.test(A1.note) && /\d+ underground pairs cross the walls/.test(A1.note), A1.note);
  await shots(pg);
  // A) reopen with G = 1 (one band, the old layout) and compare
  await closeIfOpen(pg);
  await pg.evaluate(() => { PLC_G = 1; });
  await setup(pg, ITEM, 300, 0, 'DAT_Container');
  const A0o = await openBuild(pg, ALL);
  const A0 = await pg.evaluate(planOf);
  await closeIfOpen(pg);
  await pg.evaluate(() => { PLC_G = 0; });
  info(`A) G=1 reference: blocks=${A0.blocks} cols=${A0.cols} rows=${A0.rows}`);
  chk('A) chosen blocks <= G=1 blocks, and |cols-rows| <= G=1 |cols-rows|', A0o.open && A0.blocks > 0 && A1.blocks <= A0.blocks && Math.abs(A1.cols - A1.rows) <= Math.abs(A0.cols - A0.rows), JSON.stringify({A1, A0}));
  // A) place the default plan, check geometry and simulation
  await setup(pg, ITEM, 300, 0, 'DAT_Container');
  await openBuild(pg, ALL);
  await pg.click('#plnPlace');
  const toast = await pg.evaluate(() => document.body.innerText.includes('Click to place the'));
  const placedA = await stageClick(pg);
  await pg.waitForTimeout(150);
  const Ag = await pg.evaluate(audit);
  const simA = await pg.evaluate(simStats, ITEM);
  info(`A) placed: machines=${Ag.nM} pairs=${Ag.pairs} (vertical ${Ag.vert}) maxSpan=${Ag.maxSpan} sim=${simA.got.toFixed(2)} blocked=${simA.blocked}`);
  chk('A) placed: #plnPlace enabled earlier, toast "Click to place the N block(s)", stage click placed it', toast && placedA, JSON.stringify({toast, placedA}));
  chk('C) placed: machines = N from the plan, blocks = chosen count', Ag.nM === A1.N && Ag.nBlk === A1.blocks, JSON.stringify({nM: Ag.nM, N: A1.N, nBlk: Ag.nBlk, blocks: A1.blocks}));
  chk('C) placed: no overlapping cells, all items inside chosen floors', Ag.ov === 0 && Ag.inside === true, JSON.stringify({ov: Ag.ov, inside: Ag.inside}));
  chk('C) placed: underground pairs paired, same x for vertical pairs, rot 1/3 vertical, span <= Mk1 max, no UG next to splitter or side input', Ag.ugOk === true, Ag.bad.slice(0, 5).join('; '));
  chk('C) placed: sim 300 within 5%, every machine cycles, none blocked', Math.abs(simA.got - 300) <= 15 && simA.low === 0 && simA.blocked === 0 && simA.n === Ag.nM, JSON.stringify(simA));
  await pg.keyboard.press('Control+z');

  // ---- B) a rate that is wide at G = 1: default plan must be 2D (>= 2 rows and >= 2 cols) and no worse than G = 1
  await setup(pg, ITEM, 1200, 0, 'DAT_Container');
  await pg.evaluate(() => { PLC_G = 1; });
  const B0o = await openBuild(pg, ALL);
  const B0 = await pg.evaluate(planOf);
  await closeIfOpen(pg);
  await pg.evaluate(() => { PLC_G = 0; });
  await setup(pg, ITEM, 1200, 0, 'DAT_Container');
  const Bo = await openBuild(pg, ALL);
  const B1 = await pg.evaluate(planOf);
  info(`B) G=1: ${B0.err || `blocks=${B0.blocks} cols=${B0.cols} rows=${B0.rows}`} | default: ${B1.err || `blocks=${B1.blocks} cols=${B1.cols} rows=${B1.rows} G=${B1.G}`}`);
  await pg.click('#plnPlace');
  const placedB = await stageClick(pg);
  await pg.waitForTimeout(150);
  const Bg = await pg.evaluate(audit), simB = await pg.evaluate(simStats, ITEM);
  info(`B) placed: machines=${Bg.nM} blocks=${Bg.nBlk} pairs=${Bg.pairs} (vertical ${Bg.vert}) maxSpan=${Bg.maxSpan} sim=${simB.got.toFixed(2)} blocked=${simB.blocked}`);
  chk('C) 1200/min placed (rows x cols): machines = N, blocks = chosen, no overlap, items inside floors, UG pairs valid (vertical too), sim within 5%', placedB && Bg.nM === B1.N && Bg.nBlk === B1.blocks && Bg.ov === 0 && Bg.inside === true && Bg.ugOk === true && Math.abs(simB.got - 1200) <= 60 && simB.blocked === 0, JSON.stringify({placedB, nM: Bg.nM, nBlk: Bg.nBlk, ov: Bg.ov, inside: Bg.inside, ug: Bg.bad.slice(0, 3), sim: simB}));
  await pg.keyboard.press('Control+z');
  chk('B) 1200/min: default plan 2D (rows >= 2, cols >= 2), <= 60 blocks, no worse than G=1', Bo.open && B1.err === '' && B1.rows >= 2 && B1.cols >= 2 && B1.blocks <= 60 && (B0.err !== '' || B1.blocks <= B0.blocks), JSON.stringify({B0, B1}));
  await closeIfOpen(pg);

  // ---- E) only the 1x1 block type ticked: no "shortest layout" text; a grid or a clear reason, fast
  await setup(pg, ITEM, 300, 0, 'DAT_Container');
  const t0 = Date.now();
  const E = await openBuild(pg, ['plnBk11']);
  const ms = Date.now() - t0;
  const E1 = await pg.evaluate(planOf);
  info(`E) 1x1 only: ${E1.err || `grid blocks=${E1.blocks} cols=${E1.cols} rows=${E1.rows}`} (${ms} ms)`);
  chk('E) 1x1 only: no "shortest layout" text; a grid of 1x1 blocks (no block cap) or a wall reason', E.open && !/shortest layout/.test(E1.err + E1.note) && (E1.err === '' ? E1.blocks >= 1 : /no free row to cross a wall/.test(E1.err)), JSON.stringify({E1}));
  chk('E) 1x1 only: each modal call under 5 s', ms < 5000, ms + ' ms');
  await closeIfOpen(pg);

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

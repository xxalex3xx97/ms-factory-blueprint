// Build factory: spread over several blocks with underground belts (placer.js placerCut/placerTile). REAL UI only: clicks, typing, Ctrl+Z.
// Run:  node tests/placer_tile.mjs     Exit code 1 on any failed check or page error. Screenshot: tests/shots/pt-1400-modal.png
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOTS = path.join(HERE, 'shots');
const ITEM = 'ITEM_CobaltPlates';
const W = 1400, H = 800;
const ALL = ['plnBk11', 'plnBk21', 'plnBk22'];
const CLS_OF = {plnBk11: 'BPO_Station_01', plnBk21: 'BPO_Station_2x1', plnBk22: 'BPO_Station_02'};

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
async function setTicks(pg, ids) {
  for (const id of ALL) await pg.setChecked('#' + id, ids.includes(id));
}
// build settings (block types) live in the modal now: tick them after it opens (live preview)
async function openBuild(pg, ticks) {
  await pg.click('#plnBuild');
  await pg.waitForFunction(() => document.getElementById('plnPrev').open, null, {timeout: 5000}).catch(() => {});
  if (ticks) await setTicks(pg, ticks);
  return pg.evaluate(() => ({open: $('plnPrev').open, bl: $('pvBlk').textContent, ug: $('pvUg') ? $('pvUg').textContent : null,
    note: $('plnPrevNote').textContent, err: $('plnPrevErr').textContent}));
}
// real mouse click on the stage at the centre of the first free tile in the list (stage = any canvas except the preview)
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
async function openPlanner(pg) {   // Place collapses the planner window; reopen it with its header button
  if (await pg.evaluate(() => $("pln").classList.contains("col"))) await pg.click("#plnC");
}
async function closeIfOpen(pg) {
  if (await pg.evaluate(() => $('plnPrev').open)) await pg.click('#plnCancel');
  await pg.evaluate(() => { pasting = null; });
}

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
  if (await pg.evaluate(() => document.getElementById('pln').hidden)) await pg.evaluate(() => document.getElementById('plnB').click());
  await pg.selectOption('#plnItem', ITEM);
  await pg.evaluate(() => { $('plnMk').value = '0'; $('plnMk').dispatchEvent(new Event('change')); });   // Belt tier sits in the collapsed Options (hidden)

  // ---- rate: start at 1/min (one machine), double until the layout is wider than one 1x1 floor (14 cells)
  const rate = await pg.evaluate(() => {
    for (let r = 1; r <= 4096; r *= 2) {
      $('plnRate').value = r;
      const x = placerPlan();
      if (!x) return null;
      const L = placerLayout(x.P, x.it, x.mk, x.sp ?? x.mk, {box: $('plnBuf').value, mod: $('plnMod').checked});
      if (L.ok && L.w > 14) return r;
    }
    return null;
  });
  chk('setup: a rate exists whose layout is wider than 14 cells', rate !== null, String(rate));
  if (rate === null) throw new Error('no rate gives a layout wider than 14 cells');
  await pg.fill('#plnRate', String(rate));

  // ---- A) 1x1 only: spread over several Station_01 blocks, undergrounds in the preview
  const A = await openBuild(pg, ['plnBk11']);
  await pg.screenshot({path: path.join(SHOTS, 'pt-1400-modal.png')});
  const m = /^(\d+) x BPO_Station_01$/.exec(A.bl || '');
  chk('A) modal open after Build', A.open === true, JSON.stringify(A));
  chk('A) #pvBlk matches "<n> x BPO_Station_01", n >= 2', !!m && +m[1] >= 2, String(A.bl));
  chk('A) #pvUg nonzero', A.ug !== null && parseInt(A.ug, 10) > 0, String(A.ug));
  chk('A) #plnPrevNote contains "Spread over"', /Spread over/.test(A.note), A.note);
  const right = await pg.evaluate(() => {
    const cv = $('plnPrevMap'), g = cv.getContext('2d'), hw = Math.floor(cv.width / 2), w = cv.width - hw;
    const u = new Uint32Array(g.getImageData(hw, 0, w, cv.height).data.buffer);
    const f0 = u[0], cols = new Set(); let diff = 0;
    for (const v of u) { if (v !== f0) diff++; cols.add(v); }
    return {diffPct: diff / u.length * 100, colours: cols.size};
  });
  chk('A) canvas non-blank in right half (>1% px differ or >20 colours)', right.diffPct > 1 || right.colours > 20, JSON.stringify(right));
  const T = await pg.evaluate(() => ({n: plcT.blocks.length, cols: plcT.cols, rows: plcT.rows, ug: plcT.ug}));

  // ---- B) Place, click the stage: one block per tile, grid, one undo removes everything
  await pg.click('#plnPlace');
  const clicked = await stageClick(pg);
  chk('B) stage click found a free canvas point', clicked);
  const sB = await pg.evaluate(() => ({
    blocks: S.blocks.filter(b => kindOf(b.cls) === 'b').map(b => ({cls: BASE[b.cls].name, x: b.x, y: b.y})),
    items: S.blocks.filter(b => kindOf(b.cls) !== 'b').length, pasting: !!(pasting && pasting.pl)}));
  chk(`B) placed block count == pl.blocks.length (${T.n}), all BPO_Station_01`,
    sB.blocks.length === T.n && sB.blocks.every(b => b.cls === 'BPO_Station_01'), JSON.stringify({n: sB.blocks.length, cls: [...new Set(sB.blocks.map(b => b.cls))]}));
  const xs = new Set(sB.blocks.map(b => b.x)), ys = new Set(sB.blocks.map(b => b.y)), pos = new Set(sB.blocks.map(b => b.x + ',' + b.y));
  chk(`B) blocks form ${T.cols} x ${T.rows} tiles, no overlap`,
    xs.size === T.cols && ys.size === T.rows && pos.size === sB.blocks.length && sB.blocks.length === T.cols * T.rows, JSON.stringify({xs: [...xs], ys: [...ys], n: sB.blocks.length}));
  chk('B) ghost gone after click (pasting null)', sB.pasting === false, String(sB.pasting));

  // ---- C) placed state: STRICT ok, everything inside a floor, underground pairs valid
  const C = await pg.evaluate(() => {
    const items = S.blocks.filter(b => kindOf(b.cls) !== 'b');
    const floors = S.blocks.filter(b => kindOf(b.cls) === 'b').map(b => floorRect(b)).filter(Boolean);
    const inFloor = o => { const e = dim(o); return floors.some(r => o.x >= r.x && o.y >= r.y && o.x + e.w <= r.x + r.w && o.y + e.h <= r.y + r.h) };
    const isUG = o => { const d = def(o.cls); return !!d && d.category === 'Undergrounds' };
    const ug = items.filter(isUG), pairs = ugPairs(items), cells = new Map(); let overlap = 0;
    items.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) overlap++; cells.set(k, b) } });
    const covered = new Set(pairs.flatMap(p => [p.u, p.t]));
    return {
      noB: noBuild(items.map(mItem)), outside: items.filter(o => !inFloor(o)).map(o => o.cls + '@' + o.x + ',' + o.y),
      ugN: ug.length, pairs: pairs.length, unpaired: ug.filter(u => !covered.has(u)).length, ugOutside: ug.filter(u => !inFloor(u)).length,
      badPair: pairs.filter(p => p.t.x <= p.u.x || p.t.y !== p.u.y || p.t.cls !== p.u.cls || p.t.rot !== p.u.rot || p.n > p.max || p.n < 2).length,
      spans: pairs.map(p => p.n), maxs: pairs.map(p => p.max), overlap, machines: items.filter(o => o.rec).length, items: items.length};
  });
  chk('C) noBuild false with STRICT on (every item on a floor, no overlap)', C.noB === false && C.outside.length === 0, JSON.stringify({noB: C.noB, outside: C.outside.slice(0, 5)}));
  chk('C) every machine/container/belt fully inside one floorRect; no overlapping cells', C.overlap === 0 && C.machines > 0, `overlap ${C.overlap} machines ${C.machines}`);
  chk('C) every underground tile inside a floor', C.ugOutside === 0, String(C.ugOutside));
  chk('C) ugPairs pairs == ug/2, no unpaired UG, UG count nonzero', C.ugN > 0 && C.pairs * 2 === C.ugN && C.unpaired === 0, JSON.stringify({ugN: C.ugN, pairs: C.pairs, unpaired: C.unpaired}));
  chk('C) every pair: entrance.x < exit.x, same y/cls/rot, span <= maxApart', C.badPair === 0 && C.spans.every((n, i) => n <= C.maxs[i]), JSON.stringify({spans: C.spans, maxs: C.maxs, bad: C.badPair}));

  // ---- D) sim: spread output within 2% of the same layout placed flat; >= 95% of min(makes, lanes * belt cap)
  const D = await pg.evaluate(item => {
    const x = placerPlan(), L = placerLayout(x.P, x.it, x.mk, x.sp ?? x.mk, {box: $('plnBuf').value, mod: $('plnMod').checked});
    const keep = S.blocks.slice(), STRICT0 = STRICT;
    SIM = null; simInit({}); simRun(600); const spread = simProd().byItem[item] || 0;
    STRICT = false; S.blocks = L.items.map(b => ({...b, id: uid++, mid: 0, pid: 0, x: b.x + 10, y: b.y + 10, h: 0}));
    SIM = null; simInit({}); simRun(600); const flat = simProd().byItem[item] || 0;
    S.blocks = keep; STRICT = STRICT0; SIM = null; simInit({});
    return {spread, flat, want: Math.min(L.makes, L.lanes * MKS[0][1]), makes: L.makes, lanes: L.lanes, belt: MKS[0][1]};
  }, ITEM);
  chk('D) spread sim within 2% of flat layout', Math.abs(D.spread - D.flat) <= 0.02 * Math.max(D.flat, 1) && D.flat > 0, JSON.stringify(D));
  chk('D) spread sim >= 95% of min(makes, lanes * belt cap)', D.spread >= 0.95 * D.want, JSON.stringify(D));

  // ---- one undo removes all blocks and items
  await pg.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await pg.keyboard.press('Control+z');
  const un = await pg.evaluate(() => S.blocks.length);
  chk('B) one undo removes all blocks and items', un === 0, `left ${un}`);

  // ---- E) tick sets: placed classes belong to the ticked set; a set where one block fits gives exactly 1 block
  const sets = [['plnBk11'], ['plnBk21'], ['plnBk22'], ['plnBk11', 'plnBk21'], ['plnBk21', 'plnBk22']];
  for (const set of sets) {
    for (const rv of [rate, 1]) {
      await closeIfOpen(pg); await reset(pg); await openPlanner(pg);
      await pg.fill('#plnRate', String(rv));
      const o = await openBuild(pg, set);
      const tag = set.map(s => CLS_OF[s]).join('+') + ' @' + rv;
      if (!o.open || /\S/.test(o.err)) { chk(`E) ${tag}: Build opens preview without error`, false, o.err); await closeIfOpen(pg); continue; }
      await pg.click('#plnPlace');
      await stageClick(pg);
      const placed = await pg.evaluate(() => S.blocks.filter(b => kindOf(b.cls) === 'b').map(b => BASE[b.cls].name));
      const allowed = set.map(s => CLS_OF[s]);
      if (rv === rate) chk(`E) ${tag}: placed block classes all in ticked set (${placed.length} placed)`, placed.length >= 1 && placed.every(n => allowed.includes(n)), JSON.stringify(placed));
      else chk(`E) ${tag}: exactly 1 block`, placed.length === 1 && allowed.includes(placed[0]), JSON.stringify(placed));
    }
  }
  await closeIfOpen(pg); await reset(pg);

  // ---- F) underground reach too short (mock maxApart 3): refused, modal stays, Place adds nothing
  await pg.evaluate(() => { window.__mxa = def(PLC_UG[0]).maxApart; def(PLC_UG[0]).maxApart = 3; });
  await openPlanner(pg);
  await pg.fill('#plnRate', String(rate));
  const F0 = await pg.evaluate(() => S.blocks.length);
  const fo = await openBuild(pg, ['plnBk11']);
  await pg.click('#plnPlace');
  const fp = await pg.evaluate(() => ({open: $('plnPrev').open, err: $('plnPrevErr').textContent, n: S.blocks.length, pl: !!(pasting && pasting.pl)}));
  await pg.evaluate(() => { def(PLC_UG[0]).maxApart = window.__mxa; });
  chk('F) maxApart 3: modal open, #plnPrevErr non-empty after Place, nothing added, no ghost',
    fo.open === true && fp.open === true && /\S/.test(fp.err) && fp.n === F0 && !fp.pl, JSON.stringify({fo: fo.open, fp, F0}));
  await closeIfOpen(pg);

  // ---- G) Exosuit refused cleanly (one-click refusal, no preview, nothing placed)
  await reset(pg); await openPlanner(pg);
  await pg.selectOption('#plnItem', 'ITEM_Exosuit'); await pg.fill('#plnRate', '1');
  await pg.evaluate(() => ['plnBk11', 'plnBk21', 'plnBk22'].forEach(i => { document.getElementById(i).checked = true; }));   // modal closed here: plain state set
  await pg.evaluate(() => { $('toast').textContent = ''; });
  await pg.click('#plnBuild');
  await pg.waitForFunction(() => /\S/.test($('toast').textContent), null, {timeout: 20000}).catch(() => {});
  const G = await pg.evaluate(() => ({open: $('plnPrev').open, toast: $('toast').textContent, n: S.blocks.length}));
  chk('G) Exosuit: no preview, toast "single-input single-recipe", nothing placed', G.open === false && /single-input single-recipe/.test(G.toast) && G.n === 0, JSON.stringify(G));

  await pg.screenshot({path: path.join(SHOTS, 'pt-1400-final.png')}).catch(() => {});
  await ctx.close();
  chk('(h) no pageerror / console.error', errs.length === 0, errs.join('\n     '));
} finally {
  await br.close();
}
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  fails.forEach(f => console.log(` - ${f.name}${f.detail ? ' :: ' + f.detail : ''}`));
}
process.exitCode = fails.length ? 1 : 0;

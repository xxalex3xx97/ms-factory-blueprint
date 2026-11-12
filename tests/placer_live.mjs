// Build factory: live preview modal (REAL UI: clicks, typing, Tab). Rate default + clamp (D), block types / buffer / modular / Mk sync
// and refusal in the modal (a-e), Place from the modal with the live settings (f), numeric Fit at 390x844 (fit).
// Run:  node tests/placer_live.mjs   Exit code 1 on any failed check or page error. Screenshots: tests/shots/pl-*.png
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
const ALL = ['plnBk11', 'plnBk21', 'plnBk22'];

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
async function setTicks(pg, ids) {   // real clicks on the modal's block checkboxes
  for (const id of ALL) await pg.setChecked('#' + id, ids.includes(id));
}
async function openPlanner(pg) {
  await pg.evaluate(() => { if (document.getElementById('pln').hidden) document.getElementById('plnB').click(); });
  if (await pg.evaluate(() => $('pln').classList.contains('col'))) await pg.click('#plnC');
}
async function reset(pg) {
  await pg.evaluate(() => { S.blocks = []; undoS = []; redoS = []; pasting = null; clip = []; STRICT = true; setView('L'); });
}
// snapshot of the modal state the tests compare
const snap = pg => pg.evaluate(() => ({
  open: $('plnPrev').open, blk: $('pvBlk').textContent, io: $('pvIO').textContent, belt: $('pvBelt').textContent,
  box: $('pvBox').textContent, note: $('plnPrevNote').textContent, err: $('plnPrevErr').textContent,
  place: !$('plnPlace').disabled, plnMk: $('plnMk').value,
  hash: (() => { const c = $('plnPrevMap'); if (!c.width) return 0; const u = new Uint32Array(c.getContext('2d').getImageData(0, 0, c.width, c.height).data.buffer); let h = 0; for (let i = 0; i < u.length; i += 7) h = (h * 31 + u[i]) >>> 0; return h; })(),
  L: plcL ? {box: plcL.box, mod: plcL.mod, mk: plcL.mk, cls: [...new Set(plcL.items.map(b => b.cls))]} : null,
}));
// real mouse click on the stage at the centre of the first free tile (stage = any canvas except the preview)
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

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
async function page(W, H) {
  const ctx = await br.newContext({viewport: {width: W, height: H}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`[${W}] pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`[${W}] console.error: ${m.text()}`); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE);
  await pg.evaluate(() => { const m = document.getElementById('plnMk'), b = document.getElementById('plnBuf'); if (m) m.value = '0'; if (b) b.value = 'DAT_Container'; });   // these checks pin the old defaults (Mk1, Container); the planner now starts at Mk2, Large Container
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined' && typeof placerLayout === 'function');
  return {ctx, pg};
}

try {
  // ---- D) rate default and clamp (planner form, real typing)
  {
    const {ctx, pg} = await page(1400, 900);
    await reset(pg); await openPlanner(pg);
    await pg.selectOption('#plnItem', 'ITEM_Coolant');
    const d1 = await pg.evaluate(() => { const x = placerPlan(); return {rate: $('plnRate').value, m: x ? x.P.nodes[x.it].machines : null}; });
    chk('(D1) select Coolant: #plnRate "30" and plan machines === 1', d1.rate === '30' && d1.m === 1, JSON.stringify(d1));
    await pg.fill('#plnRate', '0'); await pg.keyboard.press('Tab');
    chk('(D2) fill "0" + Tab: #plnRate "1"', (await pg.inputValue('#plnRate')) === '1', await pg.inputValue('#plnRate'));
    await pg.fill('#plnRate', ''); await pg.keyboard.press('Tab');
    chk('(D3) fill "" + Tab: #plnRate "1"', (await pg.inputValue('#plnRate')) === '1', await pg.inputValue('#plnRate'));
    await pg.fill('#plnRate', '45'); await pg.keyboard.press('Tab');
    chk('(D4) type 45 + Tab: #plnRate sticks at "45"', (await pg.inputValue('#plnRate')) === '45', await pg.inputValue('#plnRate'));
    await ctx.close();
  }

  // ---- a-f) live modal at 1400x900
  {
    const {ctx, pg} = await page(1400, 900);
    await reset(pg); await openPlanner(pg);
    await pg.selectOption('#plnItem', ITEM);
    await pg.fill('#plnRate', '120');
    await pg.click('#plnBuild');
    await pg.waitForFunction(() => $('plnPrev').open, null, {timeout: 5000}).catch(() => {});
    await pg.waitForTimeout(200);
    const s0 = await snap(pg);
    chk('setup: modal open after real Build click, Place enabled', s0.open && s0.place && !s0.err, JSON.stringify(s0).slice(0, 300));
    await pg.screenshot({path: path.join(SHOTS, 'pl-1400-modal.png')});

    // (a) block types
    await setTicks(pg, ['plnBk11']);
    const a1 = await snap(pg);
    chk('(a) only 1x1 ticked: #pvBlk names BPO_Station_01 and changes', /BPO_Station_01/.test(a1.blk) && a1.blk !== s0.blk, `${s0.blk} -> ${a1.blk}`);
    chk('(a) only 1x1 ticked: preview canvas redraws (pixel hash changes)', a1.hash !== s0.hash);
    await setTicks(pg, ['plnBk22']);
    const a2 = await snap(pg);
    chk('(a) only 2x2 ticked: #pvBlk "BPO_Station_02" only', /BPO_Station_02/.test(a2.blk) && !/Station_01|2x1/.test(a2.blk), a2.blk);
    chk('(a) only 2x2 ticked: preview canvas redraws', a2.hash !== a1.hash && a2.place);

    // (b) buffer container type
    await pg.selectOption('#plnBuf', 'DAT_Container_2');
    const b1 = await snap(pg);
    chk('(b) #plnBuf Large Container: plcL.box and item classes switch', b1.L.box === 'DAT_Container_2' && b1.L.cls.includes('DAT_Container_2') && !b1.L.cls.includes('DAT_Container'), JSON.stringify(b1.L));
    chk('(b) buffer change redraws the preview', b1.hash !== a2.hash);
    await pg.selectOption('#plnBuf', 'DAT_Container');

    // (c) modular build
    const c0 = await snap(pg);
    await pg.click('label:has(#plnMod)');
    const c1 = await snap(pg);
    chk('(c) #plnMod ticked: #pvIO text changes to IN west / OUT east', c1.io !== c0.io && /IN west/.test(c1.io) && c1.L.mod === true, `${c0.io} -> ${c1.io}`);
    await pg.click('label:has(#plnMod)');
    chk('(c) #plnMod unticked: #pvIO back to the closed text', (await snap(pg)).io === c0.io);

    // (d) Mk sync both ways
    const d0 = await snap(pg);
    await pg.selectOption('#pvMk', '1');
    const d1 = await snap(pg);
    chk('(d) #pvMk Mk2 -> #plnMk.value "1" and plcL.mk === 1', d1.plnMk === '1' && d1.L.mk === 1, JSON.stringify({plnMk: d1.plnMk, mk: d1.L && d1.L.mk}));
    chk('(d) Mk2 updates counts/note (belts or note text changed)', d1.belt !== d0.belt || d1.note !== d0.note, `${d0.belt} / ${d1.belt}`);
    chk('(d) planner diagram follows (arrow labels say Mk2)', (await pg.evaluate(() => [...document.querySelectorAll('.plnLbl')].map(e => e.textContent).join(' | '))).includes('(Mk2)'));
    await pg.click('#plnCancel');   // the planner is behind the modal: change its Belt select after closing, then Build again
    await pg.selectOption('#plnMk', '2');
    await pg.click('#plnBuild');
    await pg.waitForFunction(() => $('plnPrev').open, null, {timeout: 5000}).catch(() => {});
    chk('(d) planner #plnMk Mk3 -> the modal #pvMk opens at Mk3 (synced)', (await pg.inputValue('#pvMk')) === '2' && (await snap(pg)).L.mk === 2);
    await pg.selectOption('#pvMk', '0');

    // (e) a combination that cannot lay out: Mk3 belt with a Mk1 splitter (lane 120/min > 60)
    await pg.selectOption('#pvMk', '2');
    await pg.selectOption('#pvSp', '0');
    const e1 = await snap(pg);
    chk('(e) Mk3 belt + Mk1 splitter: builds with the splitter raised automatically (no error, Place enabled)', !/\S/.test(e1.err) && !!e1.place, JSON.stringify({err: e1.err, place: e1.place}));
    chk('(e) built: preview drawn (not blank)', await pg.evaluate(() => placerBox($('plnPrevMap').width, $('plnPrevMap').height) !== null));
    chk('(e) refused: dialog stays open', e1.open === true);
    await pg.selectOption('#pvSp', '');
    const e2 = await snap(pg);
    chk('(e) restored (splitter follows belt): error cleared, #plnPlace enabled, drawn again', !e2.err && e2.place && e2.hash !== 0);
    await pg.selectOption('#pvMk', '0');

    // (f) Place from the modal uses the live settings (2x2 only -> BPO_Station_02 ghost and blocks)
    await pg.click('#plnPlace');
    const f1 = await pg.evaluate(() => ({open: $('plnPrev').open, pl: !!(pasting && pasting.pl), names: pasting && pasting.pl ? pasting.pl.blocks.map(b => BASE[b.cls].name) : []}));
    chk('(f) Place closes the modal and starts the ghost with BPO_Station_02 blocks only', !f1.open && f1.pl && f1.names.length >= 1 && f1.names.every(n => n === 'BPO_Station_02'), JSON.stringify(f1));
    const placedOk = await stageClick(pg);
    const f2 = await pg.evaluate(() => S.blocks.filter(b => kindOf(b.cls) === 'b').map(b => BASE[b.cls].name));
    chk('(f) click stage: placed blocks are BPO_Station_02 only', placedOk && f2.length === f1.names.length && f2.every(n => n === 'BPO_Station_02'), JSON.stringify(f2));
    await ctx.close();
  }

  // ---- fit: 390x844, every drawn item inside the canvas with a margin; pixel box keeps >= 8 px at each side
  {
    const {ctx, pg} = await page(390, 844);
    await reset(pg); await openPlanner(pg);
    await pg.selectOption('#plnItem', ITEM);
    await pg.fill('#plnRate', '120');
    await pg.evaluate(() => document.getElementById('plnBuild').click());
    await pg.waitForFunction(() => $('plnPrev').open, null, {timeout: 5000}).catch(() => {});
    await pg.waitForTimeout(400);
    const g = await pg.evaluate(() => {
      const cv = $('plnPrevMap'), r = cv.getBoundingClientRect(), T = plcTT(), k = CELLS.F * plcV.z;
      const rects = [];
      T.blocks.forEach(q => { const d = dim({cls: q.cls, rot: 0}); rects.push([q.x * FC, q.y * FC, d.w * FC, d.h * FC]) });   // tile origin = block x FC
      T.ms.forEach(m => { const d = dim(m); rects.push([m.x, m.y, d.w, d.h]) });
      const sc = rects.map(([x, y, w, h]) => ({l: plcV.ox + x * k, t: plcV.oy + y * k, r: plcV.ox + (x + w) * k, b: plcV.oy + (y + h) * k}));
      const q = {l: Math.min(...sc.map(o => o.l)), t: Math.min(...sc.map(o => o.t)), r: Math.max(...sc.map(o => o.r)), b: Math.max(...sc.map(o => o.b))};
      return {cw: cv.width, ch: cv.height, css: [r.width, r.height], n: sc.length, q, px: placerBox(cv.width, cv.height), dpr: devicePixelRatio};
    });
    chk('fit 390: canvas attribute size equals CSS size (no rescale)', Math.abs(g.css[0] - g.cw) < 1 && Math.abs(g.css[1] - g.ch) < 1, JSON.stringify(g));
    chk('fit 390: every item/block screen rect inside the canvas', g.n > 0 && g.q.l >= 0 && g.q.t >= 0 && g.q.r <= g.cw && g.q.b <= g.ch, JSON.stringify(g.q));
    const m = g.px ? {l: g.px.l, t: g.px.t, r: g.cw - g.px.r, b: g.ch - g.px.b} : null;
    chk('fit 390: drawn box keeps >= 8 px margin at left/right/top/bottom', !!m && m.l >= 8 && m.r >= 8 && m.t >= 8 && m.b >= 8, JSON.stringify(m));
    await pg.screenshot({path: path.join(SHOTS, 'pl-390-modal.png')});
    await ctx.close();
  }
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

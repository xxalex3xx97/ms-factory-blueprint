// Build factory: every tick combination of the 3 block checkboxes (in the preview modal) places only ticked block classes.
// Also: Exosuit refusal toast must be visible (not hidden behind the planner window).
// REAL UI only: clicks, checkbox setChecked, Place, stage click. Headless, one browser. Exit code 1 on any failed check or page error.
// Run:  node tests/placer_blocks.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
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

const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: W, height: H}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined' && typeof placerLayout === 'function');

  const openPlanner = async () => {
    if (await pg.evaluate(() => document.getElementById('pln').hidden)) await pg.evaluate(() => document.getElementById('plnB').click());
    if (await pg.evaluate(() => $('pln').classList.contains('col'))) await pg.click('#plnC');
  };
  const reset = () => pg.evaluate(() => { S.blocks = []; undoS = []; redoS = []; pasting = null; clip = []; STRICT = true; setView('L'); });
  const closeIfOpen = async () => {
    if (await pg.evaluate(() => $('plnPrev').open)) await pg.click('#plnCancel');
    await pg.evaluate(() => { pasting = null; });
  };

  // rate: smallest doubling where the 1x1-only layout is wider than one 14-cell floor (same rule as placer_tile)
  await reset(); await openPlanner();
  await pg.selectOption('#plnItem', ITEM);
  const rate = await pg.evaluate(() => {
    for (let r = 1; r <= 4096; r *= 2) {
      $('plnRate').value = r; const x = placerPlan(); if (!x) return null;
      const L = placerLayout(x.P, x.it, x.mk, x.sp ?? x.mk, {box: $('plnBuf').value, mod: $('plnMod').checked});
      if (L.ok && L.w > 14) return r;
    }
    return null;
  });
  chk('setup: a rate gives a layout wider than 14 cells', rate !== null, String(rate));
  if (rate === null) throw new Error('no rate');
  await pg.fill('#plnRate', String(rate));

  const sets = [['plnBk11'], ['plnBk21'], ['plnBk22'], ['plnBk11', 'plnBk21'], ['plnBk11', 'plnBk22'], ['plnBk21', 'plnBk22'], ALL];
  for (const set of sets) {
    const tag = set.map(s => CLS_OF[s]).join('+');
    await closeIfOpen(); await reset(); await openPlanner();
    await pg.click('#plnBuild');
    await pg.waitForFunction(() => $('plnPrev').open, null, {timeout: 8000}).catch(() => {});
    for (const id of ALL) await pg.setChecked('#' + id, set.includes(id));
    await pg.waitForTimeout(250);
    const ui = await pg.evaluate(ids => ids.map(i => $(i).checked), ALL);
    chk(`[${tag}] modal checkboxes reflect the set`, ui.every((v, i) => v === set.includes(ALL[i])), JSON.stringify(ui));
    const err = await pg.evaluate(() => $('plnPrevErr').textContent);
    chk(`[${tag}] no preview error`, !/\S/.test(err), err);
    await pg.click('#plnPlace');
    await pg.waitForTimeout(200);
    const pt = await pg.evaluate(() => {
      for (const [x, y] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8]]) {
        const p = __fb.px(x, y), e = document.elementFromPoint(p[0], p[1]);
        if (e && e.tagName === 'CANVAS' && e.id !== 'plnPrevMap') return {x: p[0], y: p[1]};
      }
      return null;
    });
    if (!pt) { chk(`[${tag}] stage point found`, false); await closeIfOpen(); continue; }
    await pg.mouse.move(pt.x, pt.y); await pg.mouse.click(pt.x, pt.y); await pg.waitForTimeout(300);
    const placed = await pg.evaluate(() => S.blocks.filter(b => kindOf(b.cls) === 'b').map(b => BASE[b.cls].name));
    const allowed = set.map(s => CLS_OF[s]);
    chk(`[${tag}] placed block classes only from the ticked set (${placed.length} placed)`,
      placed.length >= 1 && placed.every(n => allowed.includes(n)), JSON.stringify(placed));
  }
  await closeIfOpen(); await reset();

  // none ticked: factory only into an existing floor; with no block on the layout nothing may be placed
  await openPlanner();
  await pg.click('#plnBuild');
  await pg.waitForFunction(() => $('plnPrev').open, null, {timeout: 8000}).catch(() => {});
  for (const id of ALL) await pg.setChecked('#' + id, false);
  await pg.waitForTimeout(250);
  await pg.click('#plnPlace');
  await pg.waitForTimeout(200);
  const none = await pg.evaluate(() => ({blocks: S.blocks.length, err: $('plnPrevErr').textContent, ghost: !!(pasting && pasting.pl), open: $('plnPrev').open}));
  chk('[none] no block ticked + empty layout: nothing placed, no ghost', none.blocks === 0 && !none.ghost, JSON.stringify(none));
  await closeIfOpen(); await reset();

  // Exosuit refusal: the toast must be visible (not covered by the open planner window)
  await openPlanner();
  await pg.selectOption('#plnItem', 'ITEM_Exosuit'); await pg.fill('#plnRate', '1');
  await pg.evaluate(() => { $('toast').textContent = ''; });
  await pg.click('#plnBuild');
  await pg.waitForFunction(() => /\S/.test($('toast').textContent), null, {timeout: 20000}).catch(() => {});
  await pg.waitForTimeout(100);
  const toast = await pg.evaluate(() => {
    const t = $('toast'); t.style.pointerEvents = 'auto'; /* elementFromPoint skips pointer-events:none */ const r = t.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {text: t.textContent, shown: t.classList.contains('show'), covered: !(hit === t || t.contains(hit)), hit: hit ? (hit.id || hit.tagName) : 'null', _r: t.style.pointerEvents = ''};
  });
  chk('Exosuit: refusal toast has text and is shown', /\S/.test(toast.text) && toast.shown, JSON.stringify(toast));
  chk('Exosuit: refusal toast is not covered by another element', !toast.covered, `top element at toast centre: ${toast.hit}`);
  await reset();
} finally {
  await br.close();
}
chk('(h) no pageerror / console.error during the run', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log(`\n${pass === total ? 'PASS' : 'FAIL'} ${pass}/${total}`);
if (fails.length) { console.log('Failed:'); fails.forEach(f => console.log(' - ' + f.name)); }
process.exit(pass === total ? 0 : 1);

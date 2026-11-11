// Fix 1/4/5/6 checks (no cap, uneven bands, big-factory confirm): REAL UI for the modal, page.evaluate for layout. Run: node tests/placer_fixes.mjs. Exit 1 on any failed check or page error. Shots: tests/shots/fixes-<w>x<h>.png.
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
const VIEWS = [[2576, 982], [1400, 800], [1024, 700], [390, 844]];
const ALL = ['plnBk11', 'plnBk21', 'plnBk22'];

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}

// set the planner inputs (same fields the UI sets), no layout yet
async function setup(pg, label, rate, mk, buf, ticks = ALL) {
  return pg.evaluate(([label, rate, mk, buf, ticks]) => {
    const opt = [...$('plnItem').options].find(o => o.textContent.trim().includes(label));
    if (!opt) return false;
    S.blocks = []; setView('L'); pasting = null; clip = [];
    $('plnItem').value = opt.value;
    $('plnMk').value = String(mk); $('plnMk').dispatchEvent(new Event('change'));
    $('plnSp').value = ''; $('plnRate').value = String(rate); $('plnBuf').value = buf; $('plnMod').checked = false;
    ['plnBk11', 'plnBk21', 'plnBk22'].forEach(i => $(i).checked = ticks.includes(i));
    return true;
  }, [label, rate, mk, buf, ticks]);
}
// placerTile result for the current planner inputs (what the modal shows)
const tileInfo = pg => pg.evaluate(() => {
  const x = placerPlan(); if (!x) return {err: 'no plan'};
  const ok = placerBk(), L = placerLayout(x.P, x.it, x.mk, x.sp ?? x.mk, {box: $('plnBuf').value, mod: false});
  const T = placerTile(L, ok);
  if (!T.ok) return {ok: false, why: T.why, note: L.note.join('. ')};
  const big = ugPairs(T.ms.filter(isM)).filter(p => p && p.n > T.max).length;
  return {ok: true, blocks: T.blocks.length, ov: T.ov, big, G: T.G, note: T.L.note.join('. ') + (T.L.bank ? '' : '')};
});
async function openModal(pg) {
  if (await pg.evaluate(() => document.getElementById('pln').hidden)) await pg.evaluate(() => document.getElementById('plnB').click());
  if (await pg.evaluate(() => $('pln').classList.contains('col'))) await pg.click('#plnC');
  await pg.click('#plnBuild');
  await pg.waitForFunction(() => document.getElementById('plnPrev').open, null, {timeout: 5000}).catch(() => {});
  await pg.waitForTimeout(150);
}
const modalState = pg => pg.evaluate(() => ({open: $('plnPrev').open, big: $('plnPrevBig').textContent, btn: $('plnPlace').textContent, err: $('plnPrevErr').textContent, disabled: $('plnPlace').disabled}));

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1400, height: 800}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function');

  // (a) Basic Circuits 10/min Large Mk2, all ticks: no error, no overlap, no UG pair over span
  await setup(pg, 'Basic Circuits', 10, 1, 'DAT_Container_2');
  const a = await tileInfo(pg);
  chk('a) Basic Circuits 10 Large Mk2: tile ok', a.ok === true, JSON.stringify(a));
  chk('a) no overlap, no UG pair longer than span', a.ok && a.ov === 0 && a.big === 0, JSON.stringify(a));

  // (b) Basic Circuits 100/min, only 2x2 ticked
  await setup(pg, 'Basic Circuits', 100, 0, 'DAT_Container', ['plnBk22']);
  const b = await tileInfo(pg);
  chk('b) Basic Circuits 100 with 2x2 only: no error', b.ok === true, JSON.stringify(b));

  // (c) Lightweight Frames 3000 Container / Large, all ticks
  await setup(pg, 'Lightweight Frames', 3000, 0, 'DAT_Container');
  const c1 = await tileInfo(pg);
  chk('c) Frames 3000 Container: tile ok, no "evenly"', c1.ok === true && !/evenly/.test(c1.note || ''), JSON.stringify(c1));
  await setup(pg, 'Lightweight Frames', 3000, 0, 'DAT_Container_2');
  const c2 = await tileInfo(pg);
  chk('c) Frames 3000 Large Container: tile ok', c2.ok === true, JSON.stringify(c2));

  // (d) forced band counts 3 and 4 on Frames: layout ok
  for (const G of [3, 4]) {
    await setup(pg, 'Lightweight Frames', 3000, 0, 'DAT_Container');
    const d = await pg.evaluate(G => {
      PLC_G = G;
      try { const x = placerPlan(); const L = placerLayout(x.P, x.it, x.mk, x.sp ?? x.mk, {box: $('plnBuf').value, mod: false}); return {ok: L.ok, why: L.why || ''} }
      finally { PLC_G = 0 }
    }, G);
    chk(`d) Frames 3000 forced G=${G}: placerLayout ok`, d.ok === true, JSON.stringify(d));
  }

  // (e) Frames 3000 Large (30 blocks): confirm, then place; rate change clears it
  await setup(pg, 'Lightweight Frames', 3000, 0, 'DAT_Container_2');
  await openModal(pg);
  await pg.click('#plnPlace');
  const e1 = await modalState(pg);
  chk('e) first Place click keeps modal open, asks to build', e1.open && /blocks/.test(e1.big) && e1.btn === 'Build it', JSON.stringify(e1));
  for (const [w, h] of VIEWS) {
    await pg.setViewportSize({width: w, height: h});
    await pg.waitForTimeout(120);
    await pg.screenshot({path: path.join(SHOTS, `fixes-${w}x${h}.png`)});
  }
  await pg.setViewportSize({width: 1400, height: 800});
  await pg.click('#plnPlace');
  const e2 = await pg.evaluate(() => ({open: $('plnPrev').open, pasting: !!pasting, n: pasting && pasting.pl ? pasting.pl.blocks.length : 0}));
  chk('e) second click places (modal closes, paste armed)', !e2.open && e2.pasting && e2.n > 12, JSON.stringify(e2));
  await pg.evaluate(() => { pasting = null; });

  // (e2) rate 300: text clears, button reads Place again
  await openModal(pg);
  await pg.click('#plnPlace');
  await pg.evaluate(() => { $('plnRate').value = '300'; placerGo(); });
  await pg.waitForTimeout(150);
  const e3 = await modalState(pg);
  chk('e) rate change re-runs preview: text cleared, button Place', e3.open && e3.big === '' && e3.btn === 'Place', JSON.stringify(e3));
  await pg.click('#plnCancel').catch(() => {});

  // (f) Cobalt 300 Mk1 (2 blocks): one click places, no confirm
  await setup(pg, 'Cobalt', 300, 0, 'DAT_Container');
  await openModal(pg);
  await pg.click('#plnPlace');
  const f = await modalState(pg);
  chk('f) Cobalt 300 Mk1: one click places, no confirm text', !f.open && f.big === '', JSON.stringify(f));
  await pg.evaluate(() => { pasting = null; });
} finally {
  await br.close();
}
for (const e of errs) console.log('ERR ' + e);
console.log(`\n${pass}/${total} passed, ${fails.length} failed, ${errs.length} page errors`);
process.exit(fails.length || errs.length ? 1 : 0);

// Build factory UI tests: planner layout, preview modal (real floor render, zoom/pan), Place/Cancel/Esc, Exosuit refusal.
// Headless only. Screenshots: tests/shots/pu-<w>-{form,modal,zoomed}.png (+ pu-1400-form-flow.png).
// Run:  node tests/placer_ui.mjs     Exit code 1 on any failed check or page error.
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
const VPS = [[2576, 982], [1400, 800], [1024, 700], [390, 844]];

let total = 0, pass = 0;
const fails = [], errs = [], report = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
const inside = r => r && r.l >= 0 && r.t >= 0 && r.r <= r.vw && r.b <= r.vh;

async function run(br, W, H) {
  const tag = String(W);
  const ctx = await br.newContext({viewport: {width: W, height: H}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`[${tag}] pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`[${tag}] console.error: ${m.text()}`); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined' && typeof placerLayout === 'function');
  const shot = n => pg.screenshot({path: path.join(SHOTS, `pu-${tag}-${n}.png`)});
  const R = {W};

  // ---- setup: one existing Station_02 block (so state identity is meaningful), planner item, rate 120, Mk1, all block types ticked
  await pg.evaluate(([item]) => {
    S = {name: 't', blocks: [{id: uid++, cls: Object.keys(BASE).find(k => BASE[k].kind === 'b' && BASE[k].name === 'BPO_Station_02'), x: 5, y: 5, h: 0, rot: 0, pid: 0}], dm: [], closed: []};
    undoS = []; redoS = []; pasting = null; clip = []; STRICT = true; setView('L');
    $('plnItem').value = item; $('plnRate').value = '120'; $('plnMk').value = '0'; $('plnSp').value = '';
    ['plnBk11', 'plnBk21', 'plnBk22'].forEach(i => document.getElementById(i).checked = true);
    if (document.getElementById('pln').hidden) document.getElementById('plnB').click();
    plnDraw();
  }, [ITEM]);
  await pg.waitForTimeout(300);

  // ---- (1) form layout
  R.optAria = await pg.$eval('#plnOptT', e => e.getAttribute('aria-expanded'));
  const form = await pg.evaluate(() => {
    const vw = innerWidth, vh = innerHeight, pl = $('pln'), b = $('plnBuild').getBoundingClientRect();
    const ctl = [...document.querySelectorAll('#plnForm select, #plnForm input')].filter(e => e.getClientRects().length).map(e => ({id: e.id || e.name || e.tagName, w: e.getBoundingClientRect().width}));
    return {vw, vh, docSW: document.documentElement.scrollWidth, plnSW: pl.scrollWidth, plnCW: pl.clientWidth,
      ctlMax: Math.max(...ctl.map(c => c.w)), ctlBig: ctl.filter(c => c.w > 430).map(c => c.id + ':' + Math.round(c.w)),
      build: {l: b.left, t: b.top, r: b.right, b: b.bottom, vw, vh}, outW: Math.round($('plnOut').getBoundingClientRect().width)};
  });
  R.outClosed = form.outW;
  R.defaultWins = await pg.evaluate(() => ({fm1: $("stage").classList.contains("fm1"), vis: ["stW", "lvW", "smW", "fwW", "shW", "wnW"].filter(i => !$(i).hidden)}));
  // Flow window is visible by default (fwW not hidden) -> the default state IS Flow-open. Measure Flow-closed by hiding fwW, then restore.
  await pg.evaluate(() => { window.__fwH = $('fwW').hidden; $('fwW').hidden = true; fmSync(); });
  await pg.waitForTimeout(200);
  R.outFlowClosed = await pg.evaluate(() => ({w: Math.round($('plnOut').getBoundingClientRect().width), fm1: $('stage').classList.contains('fm1')}));
  await pg.evaluate(() => { $('fwW').hidden = window.__fwH; fmSync(); });
  await pg.waitForTimeout(200);
  R.outFlow = await pg.evaluate(() => ({w: Math.round($('plnOut').getBoundingClientRect().width), fm1: $('stage').classList.contains('fm1')}));
  if (W === 1400) await shot('form-flow');
  await shot('form');
  chk(`(1 ${W}) documentElement.scrollWidth <= innerWidth`, form.docSW <= form.vw, `${form.docSW} vs ${form.vw}`);
  chk(`(1 ${W}) #pln no horizontal overflow`, form.plnSW <= form.plnCW + 1, `${form.plnSW} vs ${form.plnCW}`);
  chk(`(1 ${W}) every #plnForm select/input width <= 430`, form.ctlBig.length === 0, `max ${Math.round(form.ctlMax)}; over: ${form.ctlBig.join(', ')}`);
  chk(`(1 ${W}) #plnBuild inside viewport`, inside({...form.build, vw: form.vw, vh: form.vh}), JSON.stringify(form.build));
  const cov = await pg.evaluate(() => { const b = $('plnBuild').getBoundingClientRect(), e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return {hit: e ? (e.id || e.tagName) : null, ok: !!e && (e === $('plnBuild') || $('plnBuild').contains(e))}; });
  chk(`(1 ${W}) #plnBuild not covered by another element (default state, Flow open)`, cov.ok, `top element at centre: ${cov.hit}`);
  const optWant = form.plnCW < 720 ? 'false' : 'true';   // main: plnOptFold(#pln.clientWidth < 720) on first open
  chk(`(1 ${W}) #plnOptT aria-expanded = plnOptFold(width < 720) at first open (${optWant})`, R.optAria === optWant, String(R.optAria));
  console.log(`      #plnOut width ${W}: Flow closed ${R.outFlowClosed.w}px (fm1=${R.outFlowClosed.fm1}), Flow open ${R.outFlow.w}px (fm1=${R.outFlow.fm1})`);

  // ---- state snapshot before Build (for step 4)
  const st0 = await pg.evaluate(() => { window.__b0 = S.blocks; return {json: JSON.stringify(S.blocks), view, V: JSON.stringify(V), layer}; });

  // ---- (2) Build opens the modal
  await pg.evaluate(() => document.getElementById('plnBuild').click());
  await pg.waitForFunction(() => document.getElementById('plnPrev').open, null, {timeout: 5000}).catch(() => {});
  const md = await pg.evaluate(() => {
    const vw = innerWidth, vh = innerHeight, rc = el => { const b = el.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom, vw, vh} };
    const cv = $('plnPrevMap'), g = cv.getContext('2d'), u = new Uint32Array(g.getImageData(0, 0, cv.width, cv.height).data.buffer);
    const f0 = u[0], cols = new Set(); let diff = 0;
    for (const v of u) { if (v !== f0) diff++; cols.add(v); }
    return {open: $('plnPrev').open, dlg: rc($('plnPrev')), pl: rc($('plnPlace')), ca: rc($('plnCancel')), dSW: $('plnPrev').scrollWidth, dCW: $('plnPrev').clientWidth,
      cv: [cv.width, cv.height], diffPct: diff / u.length * 100, colours: cols.size, err: $('plnPrevErr').textContent};
  });
  await shot('modal');
  chk(`(2 ${W}) Build opens #plnPrev`, md.open === true, JSON.stringify(md));
  chk(`(2 ${W}) dialog rect inside viewport`, inside(md.dlg), JSON.stringify(md.dlg));
  chk(`(2 ${W}) Place/Cancel rects inside viewport`, inside(md.pl) && inside(md.ca), JSON.stringify([md.pl, md.ca]));
  chk(`(2 ${W}) dialog no horizontal overflow`, md.dSW <= md.dCW + 1, `${md.dSW} vs ${md.dCW}`);
  chk(`(2 ${W}) #plnPrevMap non-blank (>2% px differ or >50 colours)`, md.diffPct > 2 || md.colours > 50, `diff ${md.diffPct.toFixed(2)}% colours ${md.colours}`);
  R.canvas = md.cv; R.dlg = md.dlg;

  // ---- (3) zoom + pan (real mouse wheel / pointer on canvas centre)
  const z0 = await pg.evaluate(() => plcV.z);
  const c = await pg.evaluate(() => { const r = $('plnPrevMap').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2, inV: r.left + r.width / 2 >= 0 && r.left + r.width / 2 <= innerWidth && r.top + r.height / 2 >= 0 && r.top + r.height / 2 <= innerHeight} });
  await pg.mouse.move(c.x, c.y); await pg.mouse.wheel(0, -120); await pg.waitForTimeout(150);
  const zW = await pg.evaluate(() => plcV.z);
  await pg.evaluate(() => document.getElementById('plnZo').click());
  const zO = await pg.evaluate(() => plcV.z);
  await pg.evaluate(() => document.getElementById('plnZf').click());
  const zF = await pg.evaluate(() => plcV.z);
  chk(`(3 ${W}) wheel up grows z, #plnZo shrinks, #plnZf back to fit`, zW > z0 && zO < zW && Math.abs(zF - z0) / z0 < 0.01, `z0 ${z0} wheel ${zW} zo ${zO} zf ${zF}`);
  await pg.evaluate(() => document.getElementById('plnZi').click());
  const ox0 = await pg.evaluate(() => plcV.ox);
  await pg.mouse.move(c.x, c.y); await pg.mouse.down(); await pg.mouse.move(c.x + 80, c.y, {steps: 10}); await pg.mouse.up();
  const ox1 = await pg.evaluate(() => plcV.ox), dOx = ox1 - ox0;
  chk(`(3 ${W}) drag 80px pans plcV.ox by ~80`, Math.abs(dOx - 80) < 6, `dOx ${dOx.toFixed(1)} (canvas centre inside viewport: ${c.inV})`);
  await shot('zoomed');

  // ---- (4) real state untouched by open + zoom + pan
  const st1 = await pg.evaluate(() => ({ident: S.blocks === window.__b0, json: JSON.stringify(S.blocks), view, V: JSON.stringify(V), layer}));
  chk(`(4 ${W}) S.blocks identity+content, view, V, layer unchanged after open/zoom/pan`,
    st1.ident && st1.json === st0.json && st1.view === st0.view && st1.V === st0.V && st1.layer === st0.layer, JSON.stringify({st0: {...st0, json: st0.json.length}, st1: {...st1, json: st1.json.length}}));

  // ---- (5) Place / Cancel / Esc / does-not-fit
  await pg.evaluate(() => document.getElementById('plnPlace').click());
  const pl1 = await pg.evaluate(() => ({open: $('plnPrev').open, pl: !!(pasting && pasting.pl)}));
  chk(`(5 ${W}) Place: dialog closed, ghost set`, pl1.open === false && pl1.pl === true, JSON.stringify(pl1));

  await pg.evaluate(() => { pasting = null; clip = []; document.getElementById('plnBuild').click(); document.getElementById('plnCancel').click(); });
  await pg.waitForTimeout(100); // dialog close event (sets plcL=null) fires async
  const cn = await pg.evaluate(() => ({open: $('plnPrev').open, plcL: plcL, pl: !!(pasting && pasting.pl)}));
  chk(`(5 ${W}) Cancel: dialog closed, plcL null, no ghost`, cn.open === false && cn.plcL === null && cn.pl === false, JSON.stringify(cn));

  await pg.evaluate(() => { document.getElementById('plnBuild').click(); });
  await pg.waitForFunction(() => document.getElementById('plnPrev').open, null, {timeout: 5000}).catch(() => {});
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(150);
  const es = await pg.evaluate(() => ({open: $('plnPrev').open, plcL: plcL, pl: !!(pasting && pasting.pl), paste: !!pasting, clip: clip.length, n: S.blocks.length}));
  chk(`(5 ${W}) Esc: dialog closed, plcL null, no ghost, nothing placed`, es.open === false && es.plcL === null && !es.pl && !es.paste && es.clip === 0, JSON.stringify(es));

  // does-not-fit: only 1x1 ticked at 120/min; undergrounds mocked to reach 3 cells (too short to cross a wall, so it cannot be spread)
  await pg.evaluate(() => {
    window.__mxa = def(PLC_UG[0]).maxApart; def(PLC_UG[0]).maxApart = 3;
    document.getElementById('plnBk11').checked = true; document.getElementById('plnBk21').checked = false; document.getElementById('plnBk22').checked = false;
    plnDraw(); document.getElementById('plnBuild').click();
  });
  await pg.waitForFunction(() => document.getElementById('plnPrev').open, null, {timeout: 5000}).catch(() => {});
  await pg.evaluate(() => document.getElementById('plnPlace').click());
  const nf = await pg.evaluate(() => ({open: $('plnPrev').open, err: $('plnPrevErr').textContent, pl: !!(pasting && pasting.pl)}));
  chk(`(5 ${W}) does not fit (1x1 only, undergrounds too short): dialog stays open, #plnPrevErr has text, no ghost`, nf.open === true && /\S/.test(nf.err) && !nf.pl, JSON.stringify(nf));
  R.notFitErr = nf.err;
  await pg.evaluate(() => { def(PLC_UG[0]).maxApart = window.__mxa; document.getElementById('plnCancel').click(); document.getElementById('plnBk11').checked = true; document.getElementById('plnBk21').checked = true; document.getElementById('plnBk22').checked = true; plnDraw(); pasting = null; });

  // ---- (6) Exosuit: modal opens with the error inside, Place disabled, nothing placed; Cancel closes
  const ex0 = await pg.evaluate(() => { $('plnItem').value = 'ITEM_Exosuit'; $('plnRate').value = '1'; $('plnMk').value = '0'; plnDraw(); return JSON.stringify(S.blocks); });
  await pg.evaluate(() => document.getElementById('plnBuild').click());
  const ex = await pg.evaluate(() => ({open: $('plnPrev').open, err: $('plnPrevErr').textContent, placeOff: $('plnPlace').disabled, json: JSON.stringify(S.blocks), pl: !!(pasting && pasting.pl)}));
  chk(`(6 ${W}) Exosuit: #plnPrev open, #plnPrevErr matches "single-input single-recipe", #plnPlace disabled, S.blocks unchanged, no ghost`,
    ex.open === true && /single-input single-recipe/.test(ex.err) && ex.placeOff === true && ex.json === ex0 && !ex.pl, JSON.stringify({open: ex.open, err: ex.err, placeOff: ex.placeOff, same: ex.json === ex0, pl: ex.pl}));
  await pg.evaluate(() => document.getElementById('plnCancel').click());

  await pg.waitForTimeout(100);
  report.push(R);
  await ctx.close();
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  for (const [W, H] of VPS) await run(br, W, H);
} finally {
  await br.close();
}
chk('(7) no pageerror / console.error across all viewports', errs.length === 0, errs.join('\n     '));
console.log('\nNUMBERS');
for (const R of report) console.log(JSON.stringify(R));
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  fails.forEach(f => console.log(` - ${f.name}${f.detail ? ' :: ' + f.detail : ''}`));
}
process.exitCode = fails.length || errs.length ? 1 : 0;

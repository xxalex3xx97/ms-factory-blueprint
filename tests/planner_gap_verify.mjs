// Planner gap / multi-belt / doable-plan verification (tester). Standalone, same style as snippets-planner.mjs.
// Run:  cd F:/ms-fb-planner && node tests/planner_gap_verify.mjs
// Pre-fix comparison: FB_ROOT=<dir with a4ccbd1 copy> node tests/planner_gap_verify.mjs  (prints METRIC lines)
// Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FB_ROOT || path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOTS = path.join(ROOT, 'tests', 'shots');

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
async function open(vw, vh) {
  const ctx = await br.newContext({viewport: {width: vw, height: vh}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`[${vw}] pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`[${vw}] console.error: ${m.text()}`); });
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  await pg.evaluate(() => document.getElementById('plnB').click());
  return {ctx, pg};
}

// DOM layout metrics for the current #plnOut (run inside the page)
const MEASURE = target => {
  const vpEl = document.querySelector('#plnOut .plnVp');
  const vp = vpEl ? vpEl.getBoundingClientRect() : null;
  const cols = [...document.querySelectorAll('#plnOut .plnCol')];
  const info = cols.map(c => {
    const r = c.getBoundingClientRect();
    return {l: r.left, r: r.right, w: r.width, items: [...c.querySelectorAll('.plnBox')].map(b => ({item: b.dataset.item, raw: b.classList.contains('raw'), rect: b.getBoundingClientRect()}))};
  });
  const boxes = info.flatMap(c => c.items);
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].rect, b = boxes[j].rect;
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps++;
  }
  const gaps = [];
  for (let i = 0; i < info.length - 1; i++) gaps.push(Math.round(info[i + 1].l - info[i].r));
  const rawCols = info.map((c, i) => c.items.every(x => x.raw) ? i : -1).filter(i => i >= 0);
  const last = info[info.length - 1];
  const tgt = boxes.filter(b => b.item === target && !b.raw);
  const tgtBox = tgt.length ? tgt[tgt.length - 1].rect : null;
  const svg = document.querySelector('#plnOut .plnSvg');
  return {
    cols: info.length,
    emptyCols: info.filter(c => c.items.length === 0).length,
    boxes: boxes.length,
    gaps,
    maxGap: gaps.length ? Math.max(...gaps) : 0,
    maxColW: Math.max(0, ...info.map(c => Math.round(c.w))),
    overlaps,
    rawOnlyInFirst: info.length > 0 && info[0].items.length > 0 && info[0].items.every(x => x.raw) && boxes.filter(x => x.raw).length === info[0].items.length,
    rawInOtherCols: info.slice(1).some(c => c.items.some(x => x.raw)),
    targetInLast: !!last && last.items.some(x => x.item === target),
    targetRightmost: !!tgtBox && boxes.every(b => b.rect.left <= tgtBox.left + 1 || b.item === target),
    targetInVpX: !!tgtBox && !!vp && tgtBox.left >= vp.left - 1 && tgtBox.right <= vp.right + 1,
    targetInVpY: !!tgtBox && !!vp && tgtBox.bottom > vp.top && tgtBox.top < vp.bottom,
    arrows: document.querySelectorAll('#plnOut .plnArr').length,
    flowRows: document.querySelectorAll('#plnOut .plnEdge').length,
    nan: !!svg && /NaN/.test(svg.outerHTML),
    bad: document.querySelectorAll('#plnOut .bad').length,
    warnRows: document.querySelectorAll('#plnOut .plnWarn').length,
    warnArrows: document.querySelectorAll('#plnOut .plnArr.warn').length,
    warnTexts: [...document.querySelectorAll('#plnOut .plnWarn')].map(x => x.textContent).slice(0, 3),
    noteTexts: [...document.querySelectorAll('#plnOut .plnNote')].map(x => x.textContent).slice(0, 2),
  };
};
// set controls by value + dispatch (options fold is auto-closed under 720px, so no clicks)
const setUI = async (pg, item, rate, mk, sp = '', bal = '') => {
  await pg.evaluate(([item, rate, mk, sp, bal]) => {
    const set = (id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev, {bubbles: true})); };
    set('plnItem', item, 'change'); set('plnRate', String(rate), 'input'); set('plnMk', String(mk), 'change');
    set('plnSp', sp, 'change'); set('plnBal', bal, 'change');
  }, [item, rate, mk, sp, bal]);
};

try {
  // ---------- (1) UI layout: Exosuit 1/min Mk1, 1400x900 and 390 wide
  const d = await open(1400, 900);
  await setUI(d.pg, 'ITEM_Exosuit', 1, 0);
  const m1 = await d.pg.evaluate(MEASURE, 'ITEM_Exosuit');
  console.log('METRIC exo1 Mk1 1400 ' + JSON.stringify(m1));
  chk('(L1) Exosuit 1/min Mk1 1400: no empty column', m1.emptyCols === 0 && m1.cols > 0, `cols=${m1.cols} empty=${m1.emptyCols}`);
  chk('(L1) Exosuit 1/min Mk1 1400: raws only in leftmost column', m1.rawOnlyInFirst && !m1.rawInOtherCols);
  chk('(L1) Exosuit 1/min Mk1 1400: target is alone in rightmost column', m1.targetInLast && m1.targetRightmost);
  chk('(L1) Exosuit 1/min Mk1 1400: no overlapping boxes', m1.overlaps === 0, `overlaps=${m1.overlaps}`);
  chk('(L1) Exosuit 1/min Mk1 1400: arrows = flow rows (none broken)', m1.arrows === m1.flowRows && m1.arrows > 0 && !m1.nan, `arrows=${m1.arrows} rows=${m1.flowRows} nan=${m1.nan}`);
  chk('(L1) Exosuit 1/min Mk1 1400: target box inside diagram viewport (horizontal)', m1.targetInVpX, `maxGap=${m1.maxGap}`);
  await d.pg.screenshot({path: path.join(SHOTS, 'planner-exo1-tester-1400.png')});
  await d.ctx.close();

  const s = await open(390, 844);
  await setUI(s.pg, 'ITEM_Exosuit', 1, 0);
  const m390 = await s.pg.evaluate(MEASURE, 'ITEM_Exosuit');
  console.log('METRIC exo1 Mk1 390 ' + JSON.stringify(m390));
  chk('(L2) Exosuit 1/min Mk1 390: no empty column, no overlaps, arrows intact', m390.emptyCols === 0 && m390.overlaps === 0 && m390.arrows === m390.flowRows && !m390.nan, JSON.stringify({e: m390.emptyCols, o: m390.overlaps, a: m390.arrows, r: m390.flowRows}));
  chk('(L2) Exosuit 1/min Mk1 390: raws leftmost, target rightmost', m390.rawOnlyInFirst && m390.targetInLast && m390.targetRightmost);
  await s.pg.screenshot({path: path.join(SHOTS, 'planner-exo1-tester-390.png')});
  await s.ctx.close();

  // ---------- (1b) UI layout sweep (1400 wide): Exosuit at Mk1-3 / high rate, plus deep catalog items
  const L = await open(1400, 900);
  const deep = await L.pg.evaluate(() => {
    const items = [...document.querySelectorAll('#plnItem option')].map(o => o.value).filter(Boolean);
    return items.map(i => {const P = __fb.plan(i, 1, 0, {}, {}, {proto: false, enr: false}); return {i, n: Object.keys(P.nodes).length, cyc: P.cycle};})
      .sort((a, b) => b.n - a.n).slice(0, 4);
  });
  console.log('METRIC deepest catalog items (rate 1 Mk1): ' + JSON.stringify(deep));
  const combos = [['ITEM_Exosuit', 1, 1], ['ITEM_Exosuit', 1, 2], ['ITEM_Exosuit', 1000, 0], ...deep.slice(0, 3).map(x => [x.i, 1, 0]), [deep[0].i, 1000, 2]];
  for (const [it, rate, mk] of combos) {
    await setUI(L.pg, it, rate, mk);
    const m = await L.pg.evaluate(MEASURE, it);
    const tag = `${it.replace('ITEM_', '')} ${rate}/min Mk${mk + 1}`;
    console.log(`METRIC ${tag} ` + JSON.stringify({cols: m.cols, boxes: m.boxes, maxGap: m.maxGap, maxColW: m.maxColW, gaps: m.gaps, overlaps: m.overlaps, arrows: m.arrows, rows: m.flowRows, bad: m.bad, warn: m.warnRows, targetVpX: m.targetInVpX}));
    chk(`(L3) ${tag}: no empty column, raws leftmost, target rightmost`, m.emptyCols === 0 && m.rawOnlyInFirst && !m.rawInOtherCols && m.targetInLast && m.targetRightmost, JSON.stringify({empty: m.emptyCols, cols: m.cols}));
    chk(`(L3) ${tag}: no overlaps, arrows = flow rows, no NaN, no red/warn`, m.overlaps === 0 && m.arrows === m.flowRows && !m.nan && m.bad === 0 && m.warnRows === 0, JSON.stringify({o: m.overlaps, a: m.arrows, r: m.flowRows, bad: m.bad, warn: m.warnRows}));
  }
  await L.pg.screenshot({path: path.join(SHOTS, 'planner-deep-tester-1400.png')});

  // ---------- (2) multi-belt neutral + note; warn only on real splitter/balancer mismatch
  await setUI(L.pg, 'ITEM_Exosuit', 1, 0);
  const n2 = await L.pg.evaluate(() => ({
    multi: [...document.querySelectorAll('#plnOut .plnEdge')].filter(r => /needs \d+ belts/.test(r.textContent)).map(r => r.textContent.replace(/\s+/g, ' ').trim()),
    warnNow: document.querySelectorAll('#plnOut .plnWarn').length,
    badNow: document.querySelectorAll('#plnOut .bad').length,
    arrWarn: document.querySelectorAll('#plnOut .plnArr.warn').length,
    headWarn: document.querySelectorAll('#plnOut .plnHead.warn').length,
  }));
  console.log('METRIC exo1 multi-belt rows sample: ' + JSON.stringify(n2.multi.slice(0, 3)));
  chk('(M1) Exosuit 1/min: multi-belt flows exist and none is red/warn class', n2.multi.length > 0 && n2.arrWarn === 0 && n2.headWarn === 0 && n2.badNow === 0 && n2.warnNow === 0, JSON.stringify({multi: n2.multi.length, arrWarn: n2.arrWarn, bad: n2.badNow, warn: n2.warnNow}));
  chk('(M2) Exosuit 1/min: every multi-belt note says "(+ balancer); no single belt carries X/min" when no Mk fits', n2.multi.filter(t => /no single belt carries/.test(t)).length > 0 && n2.multi.filter(t => /carries it on 1 belt/.test(t)).length === n2.multi.length - n2.multi.filter(t => /no single belt carries/.test(t)).length && n2.multi.filter(t => /no single belt carries/.test(t)).every(t => /\(\+ balancer\); no single belt carries [\d.]+\/min/.test(t)), JSON.stringify(n2.multi.slice(0, 2)));

  // splitter real mismatch: Plates 100/min on Mk3 belt, splitter Mk1 (60/min lane 100)
  await setUI(L.pg, 'ITEM_CobaltPlates', 100, 2, '0', '');
  const sp = await L.pg.evaluate(MEASURE, 'ITEM_CobaltPlates');
  console.log('METRIC splitter mismatch: ' + JSON.stringify({warn: sp.warnTexts, arrowsWarn: sp.warnArrows}));
  chk('(M3) splitter Mk1 at 100/min on Mk3 belt: warn with reason + fix hint', sp.warnRows >= 1 && /splitter Mk1 below 100\/min; set it to Mk3 or higher, or follow belt/.test(sp.warnTexts.join(' ')) && sp.warnArrows >= 1, JSON.stringify(sp.warnTexts));

  // balancer real mismatch: Exosuit 1/min on Mk2 belt, balancer Mk1
  await setUI(L.pg, 'ITEM_Exosuit', 1, 1, '', '0');
  const bl = await L.pg.evaluate(MEASURE, 'ITEM_Exosuit');
  console.log('METRIC balancer mismatch: ' + JSON.stringify({warn: bl.warnTexts, arrowsWarn: bl.warnArrows}));
  chk('(M4) balancer Mk1 on Mk2 Exosuit 1/min: warn with reason + fix hint', bl.warnRows >= 1 && bl.warnTexts.every(t => /balancer Mk1 below [\d.]+\/min; set it to Mk2 or higher, or follow belt/.test(t)), JSON.stringify(bl.warnTexts));
  await setUI(L.pg, 'ITEM_Exosuit', 1, 1, '', '2');
  const bl3 = await L.pg.evaluate(MEASURE, 'ITEM_Exosuit');
  chk('(M5) balancer Mk3 on Mk2 Exosuit 1/min: no warn', bl3.warnRows === 0 && bl3.warnArrows === 0, JSON.stringify(bl3.warnTexts));
  await setUI(L.pg, 'ITEM_Exosuit', 1, 0);
  const back = await L.pg.evaluate(MEASURE, 'ITEM_Exosuit');
  chk('(M6) reset to Mk1 follow-belt: no warn, no red', back.warnRows === 0 && back.bad === 0);
  await L.ctx.close();

  // ---------- (3) doable plan: every edge lane <= cap(mk), belts*cap >= flow, balancer/splitter sizing consistent (pure plan(), default overrides)
  const doable = await (await open(1400, 900)).pg.evaluate(() => {
    const items = [...document.querySelectorAll('#plnItem option')].map(o => o.value).filter(Boolean);
    const ranked = items.map(i => ({i, n: Object.keys(__fb.plan(i, 1, 0, {}, {}, {proto: false, enr: false}).nodes).length})).sort((a, b) => b.n - a.n).slice(0, 12).map(x => x.i);
    const sample = ['ITEM_Exosuit', ...ranked];
    const rates = [1, 60, 100, 1000, 5000];
    const viol = [], seen = {items: 0, combos: 0, edges: 0};
    for (const it of sample) for (const rate of rates) for (const mk of [0, 1, 2]) {
      seen.combos++;
      const P = __fb.plan(it, rate, mk, {}, {}, {proto: false, enr: false});
      const cap = __fb.MKS[mk][1];
      for (const e of P.edges) {
        seen.edges++;
        const bad = [];
        if (e.belts !== Math.ceil(e.flow / cap - 1e-9)) bad.push('belts');
        if (e.flow / e.belts > cap + 1e-6) bad.push('lane>' + cap);
        if (e.belts * cap < e.flow - 1e-6) bad.push('capacity');
        if (e.warn) bad.push('warn:' + e.warn);
        if (e.belts > 1) {
          const m = e.split.match(/^(\d+)->(\d+) balancer$/);
          if (!m || +m[1] !== e.belts || +m[2] !== Math.max(e.belts, e.m)) bad.push('balancer-size:' + e.split);
        } else if (e.m > 1) {
          if (!/^1->3 splitter x\d+$/.test(e.split)) bad.push('splitter:' + e.split);
        }
        if (bad.length) viol.push({it, rate, mk: mk + 1, from: e.from, flow: Math.round(e.flow * 100) / 100, belts: e.belts, split: e.split, bad});
      }
    }
    seen.items = sample.length;
    return {seen, viol: viol.slice(0, 5), nViol: viol.length};
  });
  console.log('METRIC doable sweep: ' + JSON.stringify(doable));
  chk(`(D1) doable plan: ${doable.seen.items} items x 5 rates x 3 Mk, ${doable.seen.edges} edges: lane <= cap(mk), belts*cap >= flow, balancer/splitter sizing consistent, no warn`, doable.nViol === 0, JSON.stringify(doable.viol));

  // ---------- page errors
  chk('no page errors / console.error', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  chk('script ran to completion', false, String(e && e.stack || e));
} finally {
  await br.close();
}
console.log(`\n${pass}/${total} PASS, ${fails.length} FAIL`);
if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log(' - ' + f.name)); }
process.exit(fails.length ? 1 : 0);

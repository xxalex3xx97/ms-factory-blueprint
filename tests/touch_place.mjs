// Touch placing mode (m.html): centre ghost, Place/Rotate/Stop bar, multi-anchor belts, no text select, Undo/Redo labels. Run: node tests/touch_place.mjs
import {createRequire} from 'module';
import path from 'path';
import fs from 'fs';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'shots'); fs.mkdirSync(SHOTS, {recursive: true});
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
try {
  const pg = await (await br.newContext({hasTouch: true, isMobile: true, viewport: {width: 430, height: 932}})).newPage();
  pg.on('pageerror', e => errs.push(e.stack.split(String.fromCharCode(10)).slice(0, 4).join(' ')));
  await pg.goto(pathToFileURL(path.join(ROOT, 'm.html')).href);
  await pg.waitForFunction(() => window.__fb && document.getElementById('mSel') && typeof pick === 'function');
  const cdp = await pg.context().newCDPSession(pg);
  let gid = 0; const T = (type, pts) => { if (type === 'touchStart') gid++; return cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map((p, i) => ({x: p[0], y: p[1], id: gid * 4 + i}))}); };
  const rect = await pg.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left, r.top]; });
  const P = (x, y) => [rect[0] + x, rect[1] + y];
  const drag = async (dx, dy) => { const a = P(215, 300); await T('touchStart', [a]); for (let i = 1; i <= 5; i++) await T('touchMove', [[a[0] + dx * i / 5, a[1] + dy * i / 5]]); await T("touchEnd", []); await pg.waitForTimeout(700); };
  const panTo = async (x, y) => { for (let k = 0; k < 5; k++) { const s = await st(), c = s.c; if (c.x === x && c.y === y) return; await drag(-(x - c.x) * s.sc, -(y - c.y) * s.sc); } };
  const st = () => pg.evaluate(() => ({n: S.blocks.length, ox: V.ox, oy: V.oy, h: {...hover}, c: toCell(W / 2, H / 2), bar: !document.getElementById('mPlace').hidden, tb: tb.tr.length, sc: sc()}));
  const ids = id => pg.evaluate(id => { const e = document.getElementById(id), b = e.getBoundingClientRect(); return {vis: !e.hidden && b.width > 0, b: b.toJSON()}; }, id);
  const tap = async a => { const b = await pg.evaluate(a => { const r = document.querySelector(`#mPlace [data-a=${a}]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, a); await T('touchStart', [b]); await T('touchEnd', []); await pg.waitForTimeout(300); };

  // 1) no text selection, Undo/Redo text labels
  const us = await pg.evaluate(() => ({lab: getComputedStyle(document.querySelector('#palList .item, #pal label, #pal')).userSelect, inp: getComputedStyle(document.querySelector('input[type=text],input[type=number]')).userSelect,
    ut: getComputedStyle(document.querySelector('#undo .tx')).display, ui: getComputedStyle(document.querySelector('#undo .ic')).display, rt: document.querySelector('#redo .tx').textContent, rh: document.getElementById('redo').getBoundingClientRect().height, rw: document.getElementById('redo').getBoundingClientRect().width}));
  chk('user-select none on palette', us.lab === 'none', JSON.stringify(us));
  chk('inputs stay selectable', us.inp === 'text', JSON.stringify(us));
  chk('Undo/Redo show text, no glyph', us.ut !== 'none' && us.ui === 'none' && us.rt === 'Redo' && us.rh >= 44 && us.rw >= 44, JSON.stringify(us));
  chk('header needs no scroll', await pg.evaluate(() => { const h = document.querySelector('header'); return h.scrollWidth <= h.clientWidth; }));

  // 2) Layout placing
  chk('bar hidden without tool', !(await st()).bar);
  await pg.evaluate(() => pick(window.__st = Object.keys(BASE).find(k => k.endsWith('BPO_Station_01_C')))); await pg.waitForTimeout(500);
  let s = await st();
  chk('bar visible, ghost == centre cell', s.bar && s.h.x === s.c.x && s.h.y === s.c.y, JSON.stringify(s));
  const bar = await ids('mPlace'), sel = await ids('mSel'), fit = await ids('mFit');
  const ov = (a, b) => !(a.b.right <= b.b.left || b.b.right <= a.b.left || a.b.bottom <= b.b.top || b.b.bottom <= a.b.top);
  chk('bar does not overlap Pan/Select or Fit', bar.vis && !ov(bar, sel) && !ov(bar, fit) && !ov(sel, fit), JSON.stringify({bar, sel, fit}));
  chk('bar buttons >=48px', await pg.evaluate(() => [...document.querySelectorAll('#mPlace button')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height >= 48)));
  await drag(-60, -40);
  const s2 = await st();
  chk('1-finger drag pans', s2.ox !== s.ox && s2.oy !== s.oy, JSON.stringify([s.ox, s2.ox]));
  chk('ghost follows centre after pan', s2.h.x === s2.c.x && s2.h.y === s2.c.y && (s2.c.x !== s.c.x || s2.c.y !== s.c.y), JSON.stringify(s2));
  chk('drag placed nothing', s2.n === s.n);
  await T('touchStart', [P(100, 200)]); await T('touchEnd', []); await T('touchStart', [P(215, 300)]); await T('touchEnd', []); await pg.waitForTimeout(150);
  chk('tap on canvas places nothing', (await st()).n === s.n);
  await tap('go');
  const s3 = await st();
  chk('Place adds exactly one block at ghost cell', s3.n === s.n + 1 && await pg.evaluate(c => { const b = S.blocks[S.blocks.length - 1]; return b.x === c.x && b.y === c.y && b.cls === window.__st; }, s2.c), JSON.stringify(s3));
  chk('tool stays active after Place', await pg.evaluate(() => active === window.__st) && s3.bar);
  await tap('rot'); chk('Rotate bumps placeRot', await pg.evaluate(() => placeRot === 1));
  await tap('stop');
  chk('Stop hides bar, clears tool', !(await st()).bar && await pg.evaluate(() => active === null));

  // 3) belts (Factory view)
  await pg.evaluate(() => { const c0 = toCell(W / 2, H / 2); S.blocks.push({id: 9001, cls: Object.keys(BASE).find(k => k.includes('BPO_Station_02A')), x: c0.x - 1, y: c0.y - 1, h: 0, rot: 0, pid: 0}); setView('F'); document.getElementById('fit').click(); const c = Object.keys(BASE).find(k => runTool(def(k))); window.__belt = c; pick(c); }); await pg.waitForTimeout(1000);
  await pg.waitForTimeout(200);
  chk('conveyor found, bar shows Anchor', await pg.evaluate(() => !!window.__belt && document.querySelector('#mPlace [data-a=go]').textContent === 'Anchor'));
  const b0 = await st(); const sc0 = b0.sc;
  await tap('go');
  const a0 = await st(); const A = a0.c;
  chk('first Anchor stores a cell, Confirm/Cancel appear', a0.tb === 1 && await pg.evaluate(() => !document.querySelector('#mPlace [data-a=ok]').hidden && !document.querySelector('#mPlace [data-a=cancel]').hidden));
  await panTo(A.x + 5, A.y);
  await tap('go');
  const a1 = await st();
  chk('2nd Anchor extends straight to the right', a1.tb === 6 && a1.c.x === A.x + 5 && a1.c.y === A.y, JSON.stringify([a1.tb, a1.c, A]));
  await panTo(A.x + 5, A.y + 4);
  const pv = await pg.evaluate(() => tbPrev().map(c => [c.x, c.y]));
  chk('preview is straight segments, no staircase', pv.length === 10 && pv.every(([x, y]) => y === A.y || x === A.x + 5), JSON.stringify(pv));
  const n0 = (await st()).n;
  await tap('ok');
  const af = await pg.evaluate(() => S.blocks.filter(b => isBelt(b)).map(b => [b.x, b.y]));
  chk('Confirm commits the L (10 cells)', af.length === 10 && (await st()).n === n0 + 10 && af.every(([x, y]) => y === A.y || x === A.x + 5), JSON.stringify(af));
  chk('anchors reset after Confirm', (await st()).tb === 0);
  await pg.evaluate(() => undo()); await pg.waitForTimeout(100);
  chk('one undo removes the whole L', (await st()).n === n0);
  await tap('go'); await panTo(A.x - 3, A.y); await tap('cancel');
  chk('Cancel places nothing and resets', (await st()).n === n0 && (await st()).tb === 0);
  await tap('go'); await pg.evaluate(() => { active = null; all(); }); await pg.waitForTimeout(100);
  chk('tool change resets anchors', (await st()).tb === 0 && !(await st()).bar);
  await pg.screenshot({path: path.join(SHOTS, 'touch_place.png')}).catch(() => {});
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

// Touch modes (m.html): del / copy / cfgcopy / paste have a bar with Done; paste uses the central ghost. Run: node tests/touch_modes.mjs
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
  const st = () => pg.evaluate(() => ({n: S.blocks.length, mode, pas: pasting && {...pasting}, active, dm: document.body.dataset.mode, bar: !document.getElementById('mPlace').hidden, h: {...hover}, c: toCell(W / 2, H / 2),
    vis: ['go', 'rot', 'flip', 'stop', 'done'].filter(a => { const e = document.querySelector(`#mPlace [data-a=${a}]`); return !e.hidden && e.offsetParent; }),
    badge: (() => { const e = document.getElementById('modeb'); return !e || getComputedStyle(e).display === 'none'; })()}));
  const tap = async a => { const b = await pg.evaluate(a => { const r = document.querySelector(`#mPlace [data-a=${a}]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, a); await T('touchStart', [b]); await T('touchEnd', []); await pg.waitForTimeout(300); };
  const cellPt = c => pg.evaluate(c => [V.ox + (c.x + .5) * sc(), V.oy + (c.y + .5) * sc()], c);
  const boxDrag = async (a, b) => { const A = P(...a); await T('touchStart', [A]); for (let i = 1; i <= 5; i++) await T('touchMove', [[A[0] + (b[0] - a[0]) * i / 5, A[1] + (b[1] - a[1]) * i / 5]]); await T('touchEnd', []); await pg.waitForTimeout(300); };
  const put = async (dx, dy) => pg.evaluate(([dx, dy]) => { const c = toCell(W / 2, H / 2); S.blocks.push({id: uid++, cls: Object.keys(BASE).find(k => k.endsWith('BPO_Station_01_C')), x: c.x + dx, y: c.y + dy, h: 0, rot: 0, pid: 0}); all(); return c; }, [dx, dy]);
  await pg.waitForTimeout(500);
  const n00 = (await st()).n;
  const c0 = await put(-2, -2), n0 = n00 + 1;

  // delete mode
  await pg.evaluate(() => setMode('del')); await pg.waitForTimeout(200);
  let s = await st();
  chk('del: bar shows with Done only, hint', s.bar && s.vis.join() === 'done' && await pg.evaluate(() => document.querySelector('#mPlace .mh').textContent.startsWith('Delete')), JSON.stringify(s));
  chk('del: badge hidden on mobile', s.badge);
  let [bx, by] = await cellPt({x: c0.x - 2, y: c0.y - 2});
  await T('touchStart', [P(bx, by)]); await T('touchEnd', []); await pg.waitForTimeout(300);
  s = await st();
  chk('del: tap on block deletes it, mode stays', s.n === n0 - 1 && s.mode === 'del' && s.bar, JSON.stringify([s.n, n0, s.mode, s.bar]));
  await tap('done'); s = await st();
  chk('del: Done exits (mode null, bar hidden, data-mode empty)', s.mode === null && !s.bar && s.dm === '', JSON.stringify(s));
  // del mode box select (not pan)
  await put(-2, -2); await put(-1, -2);
  await pg.evaluate(() => setMode('del')); await pg.waitForTimeout(200);
  const ox = await pg.evaluate(() => V.ox);
  [bx, by] = await cellPt({x: c0.x - 4, y: c0.y - 4}); const [ex, ey] = await cellPt({x: c0.x + 1, y: c0.y - 1});
  await boxDrag([bx, by], [ex, ey]);
  s = await st();
  chk('del: 1-finger drag = box (no pan), deletes both', await pg.evaluate(o => V.ox === o, ox) && s.n === n0 - 1, JSON.stringify([s.n, n0]));
  await tap('done');

  // copy mode
  await put(-2, -2); const n1 = (await st()).n;
  await pg.evaluate(() => setMode('copy')); await pg.waitForTimeout(200);
  s = await st();
  chk('copy: bar shows Done only', s.bar && s.vis.join() === 'done', JSON.stringify(s));
  await boxDrag([bx, by], [ex, ey]);
  s = await st();
  chk('copy: box -> pasting; bar Place/Rotate/Flip/Done; ghost at centre', s.pas && !s.mode && s.vis.join() === 'go,rot,flip,done' && s.h.x === s.c.x && s.h.y === s.c.y && s.dm === 'paste', JSON.stringify(s));
  await T('touchStart', [P(100, 200)]); await T('touchEnd', []); await pg.waitForTimeout(200);   // harness: Chrome swallows the first click after a drag gesture; an empty-canvas tap (does nothing in paste) clears it
  const nb = (await st()).n; chk('paste: tap on canvas places nothing', nb === n1);
  await tap('go'); s = await st();
  chk('paste: Place stamps one copy at the centre cell, paste stays', s.n === n1 + 1 && s.pas && await pg.evaluate(c => { const b = S.blocks[S.blocks.length - 1]; return b.x === c.x && b.y === c.y; }, s.c), JSON.stringify(s));
  const o2 = await pg.evaluate(() => V.ox);
  await boxDrag([200, 300], [120, 260]);
  s = await st();
  chk('paste: 1-finger drag pans, places nothing', await pg.evaluate(o => V.ox !== o, o2) && s.n === n1 + 1 && s.pas && s.h.x === s.c.x, JSON.stringify(s));
  await T('touchStart', [P(100, 200)]); await T('touchEnd', []); await pg.waitForTimeout(200);
  await tap('rot'); chk('paste: Rotate changes pasting.rot', (await st()).pas.rot === 1);
  await tap('flip'); chk('paste: Flip toggles pasting.fl', (await st()).pas.fl === true);
  await tap('done'); s = await st();
  chk('paste: Done clears pasting, bar hidden', !s.pas && !s.bar && s.dm === '', JSON.stringify(s));

  // copy config
  await pg.evaluate(() => setMode('cfgcopy')); await pg.waitForTimeout(200);
  s = await st();
  chk('cfgcopy: bar with Done', s.bar && s.vis.join() === 'done' && s.mode === 'cfgcopy', JSON.stringify(s));
  await tap('done'); s = await st();
  chk('cfgcopy: Done exits', s.mode === null && !s.bar && s.dm === '', JSON.stringify(s));
  await pg.evaluate(() => { cfgClip = {cls: 'x'}; cfgPasteMode(); }); await pg.waitForTimeout(200);
  s = await st();
  chk('cfgpaste: bar with Done, then exits', s.bar && s.mode === 'cfgpaste' && s.vis.join() === 'done' && (await (async () => { await tap('done'); return (await st()).mode === null; })()));

  // entry points in the Tools sheet
  await pg.click('#mtb [data-s=mTools]'); await pg.waitForTimeout(400);
  const ents = await pg.evaluate(() => [...document.querySelectorAll('#mTools [data-m]')].map(b => b.dataset.m));
  chk('Tools sheet has mode buttons', ents.join() === 'del,copy,paste,cfgcopy,cfgpaste', ents.join());
  await pg.click('#mTools [data-m=del]'); await pg.waitForTimeout(300);
  s = await st();
  chk('Tools sheet Delete mode enters del, bar visible', s.mode === 'del' && s.bar, JSON.stringify(s));
  await pg.screenshot({path: path.join(SHOTS, 'touch_modes.png')}).catch(() => {});
  await tap('done');
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

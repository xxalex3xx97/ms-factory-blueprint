// Planner usable on phone/tablet. Run: node tests/mobile_pln.mjs  (screenshots in %TEMP%)
import {createRequire} from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const hasM = fs.existsSync(path.join(ROOT, 'm.html'));
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
try {
  for (const [w, h] of [[430, 932], [820, 1180]]) {
    const tag = w + 'x' + h;
    const ctx = await br.newContext({hasTouch: true, isMobile: true, viewport: {width: w, height: h}});
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(e.message));
    if (!hasM) await pg.addInitScript(() => { const f = () => document.documentElement ? document.documentElement.classList.add('mob') : setTimeout(f); f(); });
    await pg.goto(pathToFileURL(path.join(ROOT, hasM ? 'm.html' : 'index.html')).href);
    await pg.waitForFunction(() => window.__fb);
    if (!hasM) await pg.evaluate(() => document.documentElement.classList.add('mob')); if (!hasM) await pg.addStyleTag({path: path.join(ROOT, 'css', 'mobile_pln.css')});
    await pg.evaluate(() => { const b = document.getElementById('plnB'); b.click(); });
    await pg.waitForSelector('#pln:not([hidden])');
    await pg.evaluate(() => { const s = document.getElementById('plnItem'); const o = [...s.options].find(o => o.value); s.value = o.value; s.dispatchEvent(new Event('change')); });
    await pg.screenshot({path: path.join(os.tmpdir(), `mobile_pln_${tag}_planner.png`)});
    const ov = () => pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    chk(tag + ' planner no h-overflow', (await ov()) <= 0, await ov());
    const small = await pg.evaluate(() => [...document.querySelectorAll('#pln select,#pln input[type=number],#pln button')].filter(e => e.offsetParent && (e.offsetHeight < 44 /* diagram selects are CSS-scaled by fit zoom */ || (e.tagName !== 'BUTTON' && parseFloat(getComputedStyle(e).fontSize) < 16))).map(e => (e.id || e.className) + ':' + e.getBoundingClientRect().height + ':' + getComputedStyle(e).fontSize));
    chk(tag + ' planner controls >=44px/16px', !small.length, small.join(','));
    await pg.evaluate(() => document.getElementById('plnBuild').click());
    await pg.waitForSelector('#plnPrev[open]');
    await pg.waitForTimeout(800);
    await pg.screenshot({path: path.join(os.tmpdir(), `mobile_pln_${tag}_preview.png`)});
    chk(tag + ' preview no h-overflow', (await ov()) <= 0, await ov());
    const bt = await pg.evaluate(() => ['plnPlace', 'plnCancel'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return {id, t: r.top, b: r.bottom, h: r.height, w: r.width}; }));
    for (const b of bt) chk(`${tag} ${b.id} visible, >=44px`, b.t >= 0 && b.b <= h && b.h >= 44 && b.w >= 44, JSON.stringify(b));
    const dl = await pg.evaluate(() => { const r = document.getElementById('plnPrev').getBoundingClientRect(); return [r.width, r.height]; });
    chk(tag + ' preview full-screen', dl[0] >= w - 1 && dl[1] >= h - 1, dl.join('x'));
    const small2 = await pg.evaluate(() => [...document.querySelectorAll('#plnPrev select,#plnPrev input[type=number]')].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 43.5 || parseFloat(getComputedStyle(e).fontSize) < 16)).map(e => e.id));
    chk(tag + ' preview inputs >=44px/16px', !small2.length, small2.join(','));
    // pinch on map
    const cdp = await ctx.newCDPSession(pg);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map((p, i) => ({x: p[0], y: p[1], id: i}))});
    const r = await pg.evaluate(() => { const b = document.getElementById('plnPrevMap').getBoundingClientRect(); return {x: b.left + b.width / 2, y: b.top + b.height / 2}; });
    const z0 = await pg.evaluate(() => plcV.z);
    await T('touchStart', [[r.x - 40, r.y], [r.x + 40, r.y]]);
    await T('touchMove', [[r.x - 80, r.y], [r.x + 80, r.y]]);
    await T('touchEnd', []);
    const z1 = await pg.evaluate(() => plcV.z);
    chk(tag + ' pinch changes plcV.z', Math.abs(z1 / z0 - 1) > .1, z0 + '->' + z1);
    await pg.close(); await ctx.close();
  }
} finally { await br.close(); }
chk('no page errors', !errs.length, errs.join('|'));
process.exit(bad ? 1 : 0);

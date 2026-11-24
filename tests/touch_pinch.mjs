// Touch: 2-finger pinch zooms + pans the main canvas, 1 finger still works. Run: node tests/touch_pinch.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
try {
  const pg = await (await br.newContext({hasTouch: true, viewport: {width: 1000, height: 700}})).newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await pg.waitForFunction(() => window.__fb);
  const cdp = await pg.context().newCDPSession(pg);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map((p, i) => ({x: p[0], y: p[1], id: i}))});
  const V = () => pg.evaluate(() => ({z: __fb.V.z, ox: __fb.V.ox, oy: __fb.V.oy}));
  const r = await pg.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return {x: b.left + b.width / 2, y: b.top + b.height / 2}; });
  const v0 = await V();
  await T('touchStart', [[r.x - 50, r.y], [r.x + 50, r.y]]);
  await T('touchMove', [[r.x - 100, r.y], [r.x + 100, r.y]]);
  await T('touchMove', [[r.x - 100, r.y + 30], [r.x + 100, r.y + 30]]);
  await T('touchEnd', []);
  const v1 = await V();
  chk('pinch out zooms ~2x', Math.abs(v1.z / v0.z - 2) < .05, JSON.stringify({v0, v1}));
  chk('two-finger drag pans', v1.oy !== v0.oy);
  await T('touchStart', [[r.x, r.y]]); await T('touchMove', [[r.x + 20, r.y + 20]]); await T('touchEnd', []);
  chk('one finger leaves zoom alone', (await V()).z === v1.z);
} finally { await br.close(); }
chk('no page errors', !errs.length, errs.join('|'));
process.exit(bad ? 1 : 0);

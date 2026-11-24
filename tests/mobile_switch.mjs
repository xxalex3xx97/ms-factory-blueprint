// Mobile/desktop switch + redirect. Run: node tests/mobile_switch.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const U = f => pathToFileURL(path.join(ROOT, f)).href;
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const file = p => p.url().split('/').pop().split('?')[0];
try {
  // touch device, no pref -> index redirects to m.html
  const t = await (await br.newContext({hasTouch: true, isMobile: true, viewport: {width: 430, height: 932}})).newPage();
  const errs = []; t.on('pageerror', e => errs.push(e.message));
  await t.goto(U('index.html')); await t.waitForURL(/m\.html/);
  chk('touch first visit -> m.html', file(t) === 'm.html');
  await t.waitForSelector('#mMenu', {state: 'attached'}); await t.waitForFunction(() => [...document.querySelectorAll('#mMenu button')].some(b => b.textContent === 'Desktop view'));
  await t.evaluate(() => [...document.querySelectorAll('#mMenu button')].find(b => b.textContent === 'Desktop view').click());
  await t.waitForURL(/index\.html/);
  await t.waitForTimeout(300);
  chk('Desktop view stays on index.html (pref d)', file(t) === 'index.html');
  await t.goto(U('m.html')); await t.waitForURL(/index\.html/);
  chk('m.html with pref d -> index.html', file(t) === 'index.html');
  chk('no page errors (touch)', !errs.length, errs.join('|'));
  // desktop mouse browser: no redirect, Mobile view button switches and sticks
  const d = await (await br.newContext({viewport: {width: 1400, height: 900}})).newPage();
  await d.goto(U('index.html')); await d.waitForSelector('#vwSw');
  chk('desktop stays on index.html', file(d) === 'index.html');
  await d.click('#vwSw'); await d.waitForURL(/m\.html/);
  chk('Mobile view button -> m.html', file(d) === 'm.html');
  await d.goto(U('index.html')); await d.waitForURL(/m\.html/);
  chk('pref m sticks (index -> m.html)', file(d) === 'm.html');
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

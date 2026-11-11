// Wheel zoom in the preview (mid plan: Superalloy 120/min Container, 13 blocks): 40 real wheel steps, no main-thread task over 100 ms.
// Run:  node tests/placer_zoom.mjs     Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1400, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
await pg.evaluate(() => {
  const item = [...plnBy(false).keys()].find(i => plnNm(i) === 'Superalloy');
  $("plnItem").value = item; $("plnRate").value = 120; $("plnMk").value = 0; $("plnBuf").value = 'DAT_Container'; $("plnMod").checked = false;
  placerGo();
  window.__lt = [];
  new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({entryTypes: ['longtask']});
});
await pg.waitForFunction(() => plcT !== null && plcL, null, {timeout: 120000, polling: 200});
await pg.waitForTimeout(300);
const b = await pg.locator('#plnPrevMap').boundingBox();
await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await pg.evaluate(() => { window.__lt = [] });
for (let i = 0; i < 40; i++) await pg.mouse.wheel(0, -100);
await pg.waitForTimeout(500);
const lt = await pg.evaluate(() => window.__lt.slice());
const worst = lt.length ? Math.max(...lt) : 0;
check(worst < 100, 'wheel zoom in the preview: longest main-thread task < 100 ms (' + worst + ' ms, ' + lt.length + ' tasks)');
check(await pg.evaluate(() => plcV.z > 1), 'the wheel really zoomed the preview');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails || errs.length ? 'FAILED ' + (fails + errs.length) : 'PASS all');
process.exit(fails || errs.length ? 1 : 0);

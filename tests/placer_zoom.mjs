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
// main canvas: the same mid plan placed into the layout view, then a real mouse sweep (hover work per cell change)
await pg.evaluate(() => {
  if (plcT && plcT.ok) {
    const dl = $("plnPrev"); if (dl.open) dl.close();
    S.blocks = [...plcT.blocks.map((q, i) => ({id: i + 1, cls: q.cls, x: q.x, y: q.y, h: 0, rot: 0, pid: 0})), ...plcT.ms.map((it, i) => ({...it, id: plcT.blocks.length + i + 1, h: 0}))];
    view = "F"; draw();
  }
});
await pg.waitForTimeout(600);
const cb = await pg.locator('#cv').boundingBox();
await pg.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await pg.evaluate(() => { window.__lt = [] });
for (let i = 0; i < 60; i++) await pg.mouse.move(cb.x + 40 + i * 15, cb.y + 60 + (i % 9) * 22, {steps: 2});
await pg.waitForTimeout(400);
const lt2 = await pg.evaluate(() => window.__lt.slice());
const worst2 = lt2.length ? Math.max(...lt2) : 0;
check(worst2 < 100, 'main canvas mouse sweep: longest main-thread task < 100 ms (' + worst2 + ' ms, ' + lt2.length + ' tasks)');
// big placed factory (Superalloy 3500 Mk3 Large): mouse sweep over the main canvas, longest task per move
await pg.evaluate(() => {
  const item = [...plnBy(false).keys()].find(i => plnNm(i) === 'Superalloy');
  $("plnItem").value = item; $("plnRate").value = 3500; $("plnMk").value = 2; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
  placerGo();
});
await pg.waitForFunction(() => plcT !== null && plcL, null, {timeout: 300000, polling: 300});
await pg.evaluate(() => {
  if (plcT && plcT.ok) {
    const dl = $("plnPrev"); if (dl.open) dl.close();
    S.blocks = [...plcT.blocks.map((q, i) => ({id: i + 1, cls: q.cls, x: q.x, y: q.y, h: 0, rot: 0, pid: 0})), ...plcT.ms.map((it, i) => ({...it, id: plcT.blocks.length + i + 1, h: 0}))];
    view = "F"; draw();
  }
});
await pg.waitForTimeout(1500);
await pg.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await pg.evaluate(() => { window.__lt = [] });
for (let i = 0; i < 60; i++) await pg.mouse.move(cb.x + 40 + i * 15, cb.y + 60 + (i % 9) * 22, {steps: 2});
await pg.waitForTimeout(400);
const lt3 = await pg.evaluate(() => window.__lt.slice());
const worst3 = lt3.length ? Math.max(...lt3) : 0;
check(worst3 < 100, 'big placed factory mouse sweep: longest main-thread task < 100 ms (' + worst3 + ' ms, ' + lt3.length + ' tasks)');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails || errs.length ? 'FAILED ' + (fails + errs.length) : 'PASS all');
process.exit(fails || errs.length ? 1 : 0);

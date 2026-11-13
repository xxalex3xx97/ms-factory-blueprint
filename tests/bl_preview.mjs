// BL6 planner preview: Silicon Wafers 360/min Mk2 with ?engine=bl draws a BL result; screenshot tests/shots/bl-preview.png at 1280x800, full frame (no crop).
// Run: node tests/bl_preview.mjs   Exit 1 on failed check or page error.
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof placerShot === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
await pg.evaluate(() => {
  const item = [...plnBy(false).keys()].find(i => plnNm(i) === 'Silicon Wafers');
  $("plnItem").value = item; $("plnRate").value = 360; $("plnMk").value = 1; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
  placerGo();
});
await pg.waitForFunction(() => plcT !== null && plcL, null, {timeout: 300000, polling: 300});
const r = await pg.evaluate(() => {
  plcCache = null; placerShot();
  return {ok: plcT.ok, note: plcL && plcL.note ? String(plcL.note[0]) : '', bl: !!(plcL && plcL.bl), w: plcL ? plcL.w : 0, h: plcL ? plcL.h : 0};
});
check(r.ok && r.bl && /Block engine/.test(r.note), 'planner preview is a BL result (' + r.note.slice(0, 60) + ')');
await pg.waitForTimeout(400);
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
await pg.screenshot({path: ROOT + '/tests/shots/bl-preview.png', fullPage: false});
check(fs.existsSync(ROOT + '/tests/shots/bl-preview.png'), 'screenshot written tests/shots/bl-preview.png (1280x800 viewport, full frame)');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

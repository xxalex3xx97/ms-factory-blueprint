// Preview drawing on a huge plan: Superalloy 3500/min Mk3 Large. The block search completes and a full preview draw takes < 200 ms (no long task).
// Run:  node tests/placer_preview.mjs     Exit code 1 on any failed check or page error.
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
  $("plnItem").value = item; $("plnRate").value = 3500; $("plnMk").value = 2; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
  placerGo();
});
const t0 = Date.now();
await pg.waitForFunction(() => plcT !== null && plcL, null, {timeout: 300000, polling: 300});
const secs = (Date.now() - t0) / 1000;
const r = await pg.evaluate(() => {
  const t = performance.now(); plcCache = null; placerShot(); const full = performance.now() - t;
  return {full: Math.round(full), ok: plcT.ok, blocks: plcT.ok ? plcT.blocks.length : 0, progHidden: document.getElementById('plcProg').style.display === 'none'};
});
check(r.ok && r.blocks > 0, 'search completes with a block layout (' + r.blocks + ' blocks, ' + secs.toFixed(1) + ' s)');
check(r.progHidden, 'progress bar hidden when the search is done');
check(r.full < 200, 'full preview draw < 200 ms (' + r.full + ' ms)');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails ? 'FAILED ' + fails : 'PASS all');
process.exit(fails || errs.length ? 1 : 0);

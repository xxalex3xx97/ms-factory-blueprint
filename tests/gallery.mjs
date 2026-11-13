// Template gallery: build 5 sample recipes, check image/engine chip/stats/export. Screenshot tests/shots/gallery.png (1280x800).
// Run: node tests/gallery.mjs   Exit 1 on FAIL or page error.
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof galInit === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
await pg.evaluate(() => { $("plnB").click(); $("galOpen").click(); });
const names = ['Nickel Plates', 'Silicon Wafers', 'Basic Circuits', 'Enzyme', 'Advanced Circuits'];
for (const n of names) {
  const r = await pg.evaluate(nm => {
    const k = GAL.cards.find(c => c.name === nm); if (!k) return null;
    galStep(k); galShow();
    const e = k.el;
    return {img: !!e.querySelector('canvas'), eng: (e.querySelector('.eng') || {}).textContent || '', chip: e.querySelector('.stat').textContent, st: (e.querySelector('.st') || {}).textContent || ''};
  }, n);
  const gold = ['Nickel Plates', 'Silicon Wafers'].includes(n);
  check(r && (gold ? r.img && /Zones/.test(r.eng) && /Golden/.test(r.chip) && /machines/.test(r.st) : !r.img && /^Not supported yet: ./.test(r.chip)), n + ': ' + JSON.stringify(r && [r.eng, r.chip, r.st]));
}
const ex = await pg.evaluate(() => JSON.parse(galExport(GAL.cards.find(c => c.name === 'Nickel Plates').key)));
check(ex.v === 1 && ex.snippets[0].b.length > 0 && ex.snippets[0].b[0].cls, 'export Nickel Plates: ' + ex.snippets[0].n + ' items=' + ex.snippets[0].b.length);
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
await pg.screenshot({path: ROOT + '/tests/shots/gallery.png', fullPage: false});
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

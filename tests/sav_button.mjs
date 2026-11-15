// Headless check of the Export dialog "Download .sav" button (#expSav): open the page, open Export,
// click the button, catch the download, check it is a GVAS file and the page logged no errors.
// Run:  node tests/sav_button.mjs
// Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1400, height: 900}, acceptDownloads: true});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => { d.dismiss().catch(() => {}); });
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');

  chk('#expSav button exists', (await pg.locator('#expSav').count()) === 1);
  await pg.click('#exp');
  await pg.waitForFunction(() => document.getElementById('dExp').open);
  const [dl] = await Promise.all([
    pg.waitForEvent('download', {timeout: 15000}),
    pg.click('#expSav'),
  ]);
  const file = await dl.path();
  const buf = fs.readFileSync(file);
  chk('download is a .sav file', dl.suggestedFilename().endsWith('.sav'), dl.suggestedFilename());
  chk('download starts with GVAS', buf.length > 4 && buf.toString('latin1', 0, 4) === 'GVAS', `size ${buf.length}`);
  chk('no page errors or console errors', errs.length === 0, errs.slice(0, 5).join('\n     '));
} catch (e) {
  chk('sav button run completed', false, String(e && e.stack || e));
} finally {
  await br.close();
}

console.log(`${fails.length ? 'FAIL' : 'PASS'} ${pass}/${total}`);
process.exitCode = fails.length ? 1 : 0;

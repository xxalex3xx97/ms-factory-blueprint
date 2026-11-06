// Headless check: import a real Main Sequence save (*_S.sav) through the page's Import dialog.
// Oracle: extract/import_station.py (python -I) "Main Base" JSON must deep-equal the page's parseSav output.
// Run:  cd F:/MSDemoMods-public/tools/factory-blueprint && node tests/import_sav.mjs [path/to/_S.sav]
// Screenshot -> none. Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execFileSync} from 'child_process';
import {isDeepStrictEqual} from 'util';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SAV = process.argv[2] || 'C:/Users/SFidelis/AppData/Local/MainSequence/Saved/SaveGames/New Game 1-Autosave_S.sav';
if (!fs.existsSync(SAV)) { console.error(`save not found: ${SAV}`); process.exit(1); }

// oracle: python reference extractor
const ORACLE = path.join(os.tmpdir(), 'import_sav_mainbase_oracle.json');
execFileSync(process.env.PY || 'python', ['-I', path.join(ROOT, 'extract', 'import_station.py'), SAV, '--station', 'Main Base', '-o', ORACLE], {stdio: ['ignore', 'ignore', 'pipe']});
const oracle = JSON.parse(fs.readFileSync(ORACLE, 'utf8'));
const EXP_BLOCKS = oracle.Blocks.length, EXP_MACH = oracle.DefaultMachines.length, EXP_NAME = 'Main Base';

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1400, height: 900}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => { d.dismiss().catch(() => {}); });
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');

  // open the Import dialog and choose the save file (same path as a user)
  await pg.click('#imp');
  await pg.setInputFiles('#impFile', SAV);
  await pg.waitForSelector('#impSt:not([hidden])', {timeout: 60000});
  const opts = await pg.$$eval('#impSt option', os => os.map(o => o.textContent));
  chk('picker lists 3 player stations', opts.length === 3, `options: ${JSON.stringify(opts)}`);
  for (const n of ['Cobalt station', 'Silica Station', 'Main Base']) {
    chk(`picker has "${n}"`, opts.some(o => o.startsWith(n + ' (')), `options: ${JSON.stringify(opts)}`);
  }

  // parse in page (same function the picker used) and compare with the python oracle
  const got = await pg.evaluate(async () => {
    const f = document.getElementById('impFile').files[0];
    return __fb.parseSav(await f.arrayBuffer());
  });
  const mb = got.find(s => s.name === EXP_NAME);
  chk(`"${EXP_NAME}" found by parseSav`, !!mb);
  chk(`parseSav "${EXP_NAME}" JSON deep-equals python oracle`, !!mb && isDeepStrictEqual(mb.json, oracle),
    mb ? `blocks ${mb.json.Blocks.length} vs ${EXP_BLOCKS}, machines ${mb.json.DefaultMachines.length} vs ${EXP_MACH}` : 'missing');
  chk(`Blocks = ${EXP_BLOCKS}`, !!mb && mb.json.Blocks.length === EXP_BLOCKS);
  chk(`DefaultMachines = ${EXP_MACH}`, !!mb && mb.json.DefaultMachines.length === EXP_MACH);

  // pick the station and import through the normal Import button
  const v = await pg.locator('#impSt option', {hasText: `${EXP_NAME} (`}).getAttribute('value');
  await pg.selectOption('#impSt', v);
  await pg.click('#impGo');
  await pg.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Imported'), null, {timeout: 60000});
  const toast = (await pg.locator('#toast').textContent()) || '';
  const name = await pg.inputValue('#name');
  const dlgOpen = await pg.evaluate(() => document.getElementById('dImp').open);
  chk(`name field = "${EXP_NAME}"`, name === EXP_NAME, `name field "${name}"`);
  chk(`toast starts "Imported ${EXP_BLOCKS} blocks"`, toast.startsWith(`Imported ${EXP_BLOCKS} blocks`), `toast "${toast}"`);
  chk('Import dialog closed after import', !dlgOpen);
  chk('no console errors / page errors', errs.length === 0, errs.join('\n     '));
  console.log(`toast: ${toast}`);
  await ctx.close();
} finally {
  await br.close();
}
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  fails.forEach(f => console.log(` - ${f.name}${f.detail ? ' :: ' + f.detail : ''}`));
}
process.exitCode = fails.length ? 1 : 0;

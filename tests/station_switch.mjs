// Header station switcher for multi-station saves. Run: node tests/station_switch.mjs [path/to/_S.sav]
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAV = process.argv[2] || 'C:/Users/SFidelis/AppData/Local/MainSequence/Saved/SaveGames/New Game 1-Autosave_S.sav';
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext({viewport: {width: 1600, height: 900}})).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  let accept = true, msgs = []; pg.on('dialog', d => { msgs.push(d.message()); accept ? d.accept() : d.dismiss(); });
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  chk('selector hidden before any save', await pg.isHidden('#stG'));
  await pg.evaluate(() => document.getElementById('impSav').click()); await pg.setInputFiles('#savFile', SAV); await pg.waitForSelector('#dSav[open]', {timeout: 60000});
  await pg.selectOption('#savSt', '0'); await pg.evaluate(() => document.getElementById('savGo').click());
  chk('selector shown after picking a station', await pg.isVisible('#stSel'));
  const names = await pg.$$eval('#stSel option', o => o.map(x => x.textContent));
  chk('lists all stations', names.length >= 2, JSON.stringify(names));
  const cur = () => pg.evaluate(() => S.name);
  chk('name field = selected station', (await cur()) === names[0], await cur());
  accept = false; msgs = [];
  await pg.selectOption('#stSel', '1');
  chk('warning shown with unsaved-changes text', msgs.length === 1 && /unsaved/i.test(msgs[0]), msgs.join('|'));
  chk('cancel keeps the station and the selection', (await cur()) === names[0] && (await pg.inputValue('#stSel')) === '0');
  accept = true;
  await pg.selectOption('#stSel', '1');
  chk('confirm switches the station', (await cur()) === names[1], await cur());
  chk('selector still shows the new station', (await pg.inputValue('#stSel')) === '1');
  await pg.evaluate(() => __fb.importJson(JSON.stringify({Version: 1, DisplayName: 'x', Blocks: [], DefaultMachines: []})));
  chk('other import hides the selector', await pg.isHidden('#stG'));
  chk('no page errors', errs.length === 0, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

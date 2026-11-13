// Default engine check: a page with no ?engine param runs Block. Run: node tests/bl_default.mjs   Exit 1 on FAIL or page error.
// BL_ENGINE on; pfCompose picks Block for Silicon Wafers 120 (note 'Block engine'); Enzyme 10 (3 inputs) falls back to NL (note 'No Limits', no block flag).
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const r = await pg.evaluate(() => {
  const pick = name => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, name === 'Enzyme' ? 10 : 120, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    return pfCompose(P, it, 1, 0, {});
  };
  const sw = pick('Silicon Wafers'), en = pick('Enzyme');
  return {bl: BL_ENGINE, nl: NL_ENGINE, swOk: sw.ok, swBl: !!sw.bl, swNote: String(sw.note && sw.note[0]), enOk: en.ok, enBl: !!en.bl, enNote: String(en.note && en.note[0])};
});
check(r.bl === true, 'default page: BL_ENGINE true');
check(r.swOk && r.swBl && /^Block engine/.test(r.swNote), 'Silicon Wafers 120 picks Block (' + r.swNote.slice(0, 40) + ')');
check(r.enOk && !r.enBl && /No Limits/.test(r.enNote), 'Enzyme 10 falls back to NL (' + r.enNote.slice(0, 40) + ')');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

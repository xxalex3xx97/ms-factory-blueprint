// BL0 scaffold gates. Run: node tests/bl_top.mjs   Exit 1 on FAIL or page error.
// ?engine=bl sets BL_ENGINE; blTop stub refuses {ok:false,why:'BL stub'}; pfCompose still returns the NL result (note 'No Limits'); no page error.
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
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof blTop === 'function' && typeof pfCompose === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const r = await pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits');
  const P = plan(it, 100, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const bl = blTop(P, it, 1, 0, {}), pf = pfCompose(P, it, 1, 0, {});
  return {bl: BL_ENGINE, nl: NL_ENGINE, blRes: {ok: bl.ok, why: bl.why}, pfOk: pf.ok, pfNote: String(pf.note)};
});
check(r.bl === true, '?engine=bl sets BL_ENGINE');
check(r.nl === true, '?engine=bl keeps NL_ENGINE on');
check(r.blRes.ok === false && r.blRes.why === 'BL stub', 'blTop stub refuses (' + r.blRes.why + ')');
check(r.pfOk === true && /No Limits/.test(r.pfNote), 'pfCompose returns NL result (' + r.pfNote.slice(0, 40) + ')');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

// Engine: No Limits is the only engine in the UI (no Engine select, NL_ENGINE on, prefab flags on). ?engine=old|new in the URL pins an older engine for the legacy suites (plcEngine is test-only).
// Run:  timeout 120 node tests/engine_switch.mjs     Exit code 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const ctx = await br.newContext();
const errs = [];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const open = async q => {
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) });
  await pg.goto(PAGE + q);
  await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function');
  return pg;
};
const note = pg => pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Motor');
  const P = plan(it, 60, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = placerLayout(P, it, 1, 0, {box: 'DAT_Container_2', mod: false});
  return {ok: L.ok, note: L.note && L.note[0]};
});
let pg = await open('');
check(await pg.evaluate(() => !document.getElementById('pvEngine')), 'no Engine select in the page');
check(await pg.evaluate(() => NL_ENGINE === true && PLC_PREFAB === true && PF_FACT === true), 'default: NL_ENGINE, PLC_PREFAB, PF_FACT on');
let n = await note(pg);
check(n.ok && /^(Block engine|No Limits)/.test(n.note || ''), 'default layout is Block (falls back to No Limits) (' + String(n.note).slice(0, 40) + ')');
await pg.evaluate(() => localStorage.setItem('fbEngine', 'old'));
pg = await open('');
check(await pg.evaluate(() => NL_ENGINE === true), 'a stored fbEngine=old is ignored');
pg = await open('?engine=old');
check(await pg.evaluate(() => NL_ENGINE === false && PLC_PREFAB === false && PF_FACT === false), '?engine=old pins the old placer');
n = await note(pg);
check(n.ok && !/^No Limits|^Prefab/.test(n.note || ''), 'old pin: layout is the old placer (' + String(n.note).slice(0, 40) + ')');
pg = await open('?engine=new');
n = await note(pg);
check(n.ok && /^Prefab factory/.test(n.note || ''), '?engine=new pins the prefab factory (' + String(n.note).slice(0, 40) + ')');
check(errs.length === 0, 'no page errors / console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

// Engine switch: default Old (PLC_PREFAB/PF_FACT false), choosing New turns the prefab builder on and the layout follows, choosing Old turns it off; the choice is remembered.
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
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
await pg.goto(PAGE);
await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && document.getElementById('pvEngine'));
const state = () => pg.evaluate(() => ({sel: $('pvEngine').value, pf: PLC_PREFAB, fact: PF_FACT}));
const note = () => pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Motor');
  const P = plan(it, 60, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = placerLayout(P, it, 1, 0, {box: 'DAT_Container_2', mod: false});
  return {ok: L.ok, prefab: !!L.prefab, note: L.note && L.note[0]};
});
let s = await state();
check(s.sel === 'old' && !s.pf && !s.fact, 'default engine is Old (select old, PLC_PREFAB false, PF_FACT false)');
let n = await note();
check(n.ok && !n.prefab, 'Old engine: layout is the old placer (' + String(n.note).slice(0, 50) + ')');
await pg.evaluate(() => { $('pvEngine').value = 'new'; $('pvEngine').dispatchEvent(new Event('change')) });
s = await state();
check(s.sel === 'new' && s.pf && s.fact, 'choosing New turns PLC_PREFAB and PF_FACT on');
n = await note();
check(n.ok && n.prefab && /^Prefab factory/.test(n.note || ''), 'New engine: layout is the prefab factory (' + String(n.note).slice(0, 50) + ')');
// remembered across a reload in the same browser context
const pg2 = await ctx.newPage();
pg2.on('pageerror', e => errs.push(e.message));
await pg2.goto(PAGE);
await pg2.waitForFunction(() => window.__fb && document.getElementById('pvEngine'));
const s2 = await pg2.evaluate(() => ({sel: $('pvEngine').value, pf: PLC_PREFAB}));
check(s2.sel === 'new' && s2.pf, 'New engine choice is remembered after reload');
await pg2.evaluate(() => { $('pvEngine').value = 'old'; $('pvEngine').dispatchEvent(new Event('change')) });
const s3 = await pg2.evaluate(() => ({sel: $('pvEngine').value, pf: PLC_PREFAB, fact: PF_FACT}));
check(s3.sel === 'old' && !s3.pf && !s3.fact, 'choosing Old turns both flags off again');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

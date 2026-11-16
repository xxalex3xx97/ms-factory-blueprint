// Planner uses golden templates only (zones): no engine select, no fallback. Screenshots tests/shots/planner-clean.png and planner-unsupported.png (1280x800, full frame).
// Run: node tests/engine_select.mjs   Exit 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof placerShot === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
async function run(name, rate) {
  return pg.evaluate(async ([name, rate]) => {
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    $("plnItem").value = item; $("plnRate").value = rate; $("plnMk").value = 1; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
    $("plnDkI").checked = false; $("plnDkO").checked = false;
    placerGo();
    for (let i = 0; i < 3000 && !(plcL ? plcT !== null : $("plnPrevErr").textContent); i++) await new Promise(r => setTimeout(r, 100));
    return {eng: plcL ? plcL.eng : null, ok: !!plcL, badge: $("plnEngBadge").textContent, err: $("plnPrevErr").textContent, place: $("plnPlace").disabled, line: $("pvLine").textContent, mach: $("pvMach").textContent};
  }, [name, rate]);
}
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
check(await pg.evaluate(() => !$("plnEng")), 'no engine select element');
const a = await run('Nickel Plates', 480);
check(a.eng === 'zones' && a.ok && !a.place && /Template: Zones/.test(a.badge) && /machines/.test(a.line), 'Nickel 480 builds with zones: ' + a.badge + ' | ' + a.line);
await pg.screenshot({path: ROOT + '/tests/shots/planner-clean.png', fullPage: false});
const c = await run('Basic Circuits', 100);
check(c.ok && c.eng === 'vcol' && !c.place && /Template: Columns/.test(c.badge), 'Basic Circuits 100 builds with columns: ' + c.badge + ' | ' + c.line);
const b = await run('Enzyme', 100);
check(!b.ok && b.place && /^Not supported yet: ./.test(b.err), 'Enzyme -> Not supported yet, Place disabled: ' + b.err);
await pg.screenshot({path: ROOT + '/tests/shots/planner-unsupported.png', fullPage: false});
const h = await pg.evaluate(() => { const L = (typeof plcL !== 'undefined' && plcL) ? 1 : 0; return {mach: $("pvMach").textContent} });
check(b.mach === '-' || b.mach === '', 'unsupported preview shows nothing built');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

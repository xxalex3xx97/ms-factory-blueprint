// CMP S3 UI gate: ?engine=cmp, planner modal, Nickel Plates 31 and 480: preview shows the layout, badge 'Template: Composer', Place enabled, no page errors. Screenshot tests/shots/cmp_c3_nickel.png (1280x800, full frame).
// Run: node tests/cmp_c3.mjs   Exit 1 on FAIL or page error.
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
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof cmpCompose === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
async function run(name, rate) {
  return pg.evaluate(async ([name, rate]) => {
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    $("plnItem").value = item; $("plnRate").value = rate; $("plnMk").value = 1; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
    $("plnDkI").checked = false; $("plnDkO").checked = false;
    placerGo();
    for (let i = 0; i < 3000 && !(plcL ? plcT !== null : $("plnPrevErr").textContent); i++) await new Promise(r => setTimeout(r, 100));
    return {eng: plcL ? plcL.eng : null, ok: !!plcL, tile: !!plcT && plcT.ok, badge: $("plnEngBadge").textContent, err: $("plnPrevErr").textContent, place: $("plnPlace").disabled, line: $("pvLine").textContent, mach: $("pvMach").textContent};
  }, [name, rate]);
}
for (const rate of [31, 480]) {
  const a = await run('Nickel Plates', rate);
  console.log('  ' + a.badge + ' | ' + a.line + ' | ' + a.err);
  check(a.eng === 'cmp' && a.ok && a.tile && !a.place && /Template: Composer/.test(a.badge) && /machines/.test(a.line) && !a.err, 'Nickel Plates ' + rate + ' builds with the composer');
  await pg.screenshot({path: ROOT + '/tests/shots/cmp_c3_nickel' + (rate === 480 ? '' : '_31') + '.png', fullPage: false});
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

// CMP S7b UI gate: ?engine=cmp, planner modal, Capacitor 100 and Basic Circuits 100 on Blocks 2x2: preview shows the full layout (Fit), badge 'Template: Composer', Place enabled, no page errors.
// Screenshots tests/shots/cmp_s7b_capacitor.png and cmp_s7b_bc100.png (1280x800, whole factory visible).
// Run: node tests/cmp_s7b.mjs   Exit 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof cmpAssembleTree === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
for (const [name, rate, file] of [['Capacitor', 100, 'cmp_s7b_capacitor'], ['Basic Circuits', 100, 'cmp_s7b_bc100'], ['Enzyme', 10, 'cmp_s9_enzyme'], ['Advanced Circuits', 5, 'cmp_s9_aa']]) {
  const a = await pg.evaluate(async ([name, rate]) => {
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    $("plnItem").value = item; $("plnRate").value = rate; $("plnMk").value = 1; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
    $("plnDkI").checked = false; $("plnDkO").checked = false;
    $("plnBk").value = 'BPO_Station_02';
    placerGo();
    for (let i = 0; i < 3000 && (plcBusyF || !(plcL ? plcT !== null : $("plnPrevErr").textContent)); i++) await new Promise(r => setTimeout(r, 100));
    return {eng: plcL ? plcL.eng : null, ok: !!plcL, tile: !!plcT && plcT.ok, badge: $("plnEngBadge").textContent, err: $("plnPrevErr").textContent, place: $("plnPlace").disabled, line: $("pvLine").textContent, bk: placerBk().map((v, i) => v ? PL_ALL[i] : null).filter(Boolean).join(',')};
  }, [name, rate]);
  console.log('  ' + a.bk + ' | ' + a.badge + ' | ' + a.line + ' | ' + a.err);
  check(a.eng === 'cmp' && a.ok && a.tile && !a.place && /Template: Composer/.test(a.badge) && /machines/.test(a.line) && !a.err, name + ' ' + rate + ' builds with the composer');
  await pg.click('#plnZf');
  await pg.waitForTimeout(400);
  await pg.screenshot({path: ROOT + '/tests/shots/' + file + '.png', fullPage: false});
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

// CMP brief G smoke: multi-lane recipes through the composer UI (?engine=cmp), Blocks 2x2, planner Mk (plnMk): preview builds ('Template: Composer', Place enabled) or a specific refusal; no page errors.
// Run: node tests/cmp_lanes.mjs   Exit 1 on FAIL or page error. Prints the badge/line/err of each case (informational refusals are listed, not failures, when listed in REFUSE).
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
// [item name, rate, planner Mk index, expect build]
for (const [name, rate, mk, build] of (process.argv[2] ? [[process.argv[2], +process.argv[3], +process.argv[4], true]] : [['Hull Repair Kit', 5, 1, true], ['Electrical Repair Kit', 5, 2, true], ['UpgradeShipSpeed_1', 2, 1, true], ['Electrical Repair Kit', 5, 1, false]])) {
  const a = await pg.evaluate(async ([name, rate, mk]) => {
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    if (!item) return {err: 'item not found ' + name};
    $("plnItem").value = item; $("plnRate").value = rate; $("plnMk").value = mk; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
    $("plnDkI").checked = false; $("plnDkO").checked = false;
    $("plnBk").value = 'BPO_Station_02';
    placerGo();
    for (let i = 0; i < 3000 && !(plcL ? plcT !== null : $("plnPrevErr").textContent); i++) await new Promise(r => setTimeout(r, 100));
    return {eng: plcL ? plcL.eng : null, ok: !!plcL, tile: !!plcT && plcT.ok, badge: $("plnEngBadge").textContent, err: $("plnPrevErr").textContent, place: $("plnPlace").disabled, line: $("pvLine").textContent};
  }, [name, rate, mk]);
  console.log('  ' + name + ' ' + rate + ' Mk' + (mk + 1) + ' | ' + a.badge + ' | ' + a.line + ' | ' + a.err);
  if (a.err && a.err.startsWith('item not found')) { check(false, a.err); continue }
  if (build) check(a.eng === 'cmp' && a.ok && a.tile && !a.place && /Template: Composer/.test(a.badge) && /machines/.test(a.line) && !a.err, name + ' ' + rate + ' Mk' + (mk + 1) + ' builds with the composer');
  else check(a.place !== false && /Not supported yet/.test(a.err || '') && !/NL used|Tower/.test(a.err), name + ' ' + rate + ' Mk' + (mk + 1) + ' specific refusal: ' + a.err);
  if (build) { await pg.click('#plnZf'); await pg.waitForTimeout(400); await pg.screenshot({path: ROOT + '/tests/shots/cmp_lanes_' + name.replace(/\W+/g, '') + '_' + rate + '.png', fullPage: false}) }
}
// strict composer check (checkCompose: tile, flood from sources, machine counts == planner N, product reaches the OZ container), no docks
if (!process.argv[2]) {
  const {checkCompose} = await import('./cmp_plan.mjs');
  await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
  await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof links1 === 'function');
  for (const [name, rate, mk] of [['Hull Repair Kit', 5, 1], ['Electrical Repair Kit', 5, 2], ['UpgradeShipSpeed_1', 2, 1]]) {
    const key = await pg.evaluate(n => { const i = [...plnBy(false).keys()].find(x => plnNm(x) === n); return rk([].concat(...Object.values(RECS)).find(r => r.o[0] === i)) }, name);
    const r = await checkCompose(pg, key, rate, mk, 'BPO_Station_02', {strict: true, mutate: false});
    check(r.ok, 'checkCompose ' + name + ' ' + rate + ' Mk' + (mk + 1) + ' ' + JSON.stringify(r.row).slice(0, 200) + ' ' + r.errs.slice(0, 3).join('; '));
  }
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

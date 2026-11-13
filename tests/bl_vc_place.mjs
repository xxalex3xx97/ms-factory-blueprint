// VC4 gate: 2-input column template through the planner (placerLayout -> pfCompose -> placerTile), box DAT_Container_2.
// Cases: Basic Circuits 100/20/1000, Capacitor 100, + one discovered 2-input Assembler recipe. Prints belts/machine and area.
// Run: node tests/bl_vc_place.mjs   Exit 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof vcPlan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
async function run(name, rate) {
  return pg.evaluate(async ([name, rate]) => {
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    if (!item) return {missing: true};
    $("plnItem").value = item; $("plnRate").value = rate; $("plnMk").value = 1; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
    $("plnDkI").checked = false; $("plnDkO").checked = false;
    placerGo();
    for (let i = 0; i < 3000 && !(plcL ? plcT !== null : $("plnPrevErr").textContent); i++) await new Promise(r => setTimeout(r, 100));
    const T = plcT || {};
    const cnt = {belts: 0, mach: 0};
    if (plcL && plcL.items) plcL.items.forEach(b => { if (b.rec) cnt.mach++; else if (PLC_BELT.includes(b.cls)) cnt.belts++; });
    return {eng: plcL ? plcL.eng : null, ok: !!plcL, badge: $("plnEngBadge").textContent, err: $("plnPrevErr").textContent,
      tileOk: !!T.ok, ov: T.ov, span: T.span, blocks: T.blocks ? T.blocks.length : 0, cols: T.cols, rows: T.rows,
      w: plcL ? plcL.w : 0, h: plcL ? plcL.h : 0, K: plcL && plcL.bl ? plcL.bl.K : null, n: plcL && plcL.bl ? plcL.bl.n : null,
      actual: plcL && plcL.note ? plcL.note.find(x => /Actual/.test(x)) || '' : '', mach: cnt.mach, belts: cnt.belts, name: plnNm(item), rec: plcL && plcL.items ? null : null};
  }, [name, rate]);
}
const rows = [];
const cases = [['Basic Circuits', 100], ['Basic Circuits', 20], ['Basic Circuits', 1000], ['Capacitor', 100]];
for (const [nm, rate] of cases) {
  const r = await run(nm, rate);
  rows.push([nm, rate, r.eng, r.K, r.n, r.mach, r.belts, r.w + 'x' + r.h, r.tileOk, r.ov, r.span, r.blocks, r.err]);
  check(!r.missing && r.ok && r.eng === 'vcol' && r.tileOk && r.ov === 0 && r.span === 0, nm + ' ' + rate + ': vcol placerTile ok, ov 0, span 0 ' + JSON.stringify(r));
  if (nm === 'Basic Circuits' && rate === 100) {
    check(r.K === 1 && r.n === 5 && r.mach === 10, 'Basic Circuits 100: K=1 n=5 10 machines');
    check(/Template: Columns/.test(r.badge), 'badge Template: Columns: ' + r.badge);
    console.log('Basic Circuits 100 ' + r.actual + ' belts/machine ' + (r.belts / Math.max(1, r.mach)).toFixed(1) + ' area ' + r.w + 'x' + r.h);
  }
}
// one more discovered 2-input Assembler recipe the template accepts
const extra = await pg.evaluate(() => {
  const out = [];
  plnBy(false).forEach((l, item) => l.forEach(({c, r}) => {
    if (!/Assembler/.test(c) || r.i.length !== 2 || item === undefined) return;
    if (r.i.some(([x]) => x === item)) return;
    if (!vcPlan(r, 'DAT_Assembler', 1, 100).ok) return;
    out.push(plnNm(item));
  }));
  return [...new Set(out)].filter(n => !['Basic Circuits', 'Capacitor'].includes(n)).slice(0, 8);
});
console.log('candidates: ' + extra.join(' | '));
let extraName = null;
for (const nm of extra) {
  const r = await run(nm, 100);
  if (r.eng === 'vcol') { extraName = nm; rows.push([nm, 100, r.eng, r.K, r.n, r.mach, r.belts, r.w + 'x' + r.h, r.tileOk, r.ov, r.span, r.blocks, r.err]); check(r.tileOk && r.ov === 0 && r.span === 0, 'extra ' + nm + ' 100: placerTile ok, ov 0, span 0 ' + JSON.stringify(r)); break }
}
check(!!extraName, 'one more 2-input Assembler recipe accepted: ' + (extraName || 'none found'));
console.log('\nname | rate | eng | K | n | mach | belts | WxH | tile | ov | span | blocks | err');
for (const r of rows) console.log(r.join(' | '));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

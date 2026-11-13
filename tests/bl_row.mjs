// BL2 machine + row gates (page). Run: node tests/bl_row.mjs   Exit 1 on FAIL or page error.
// blMachine('DAT_Refinery') = rot 0, w 3, h 3, xin 1, xout 1, off ["E1","W3"]; blRow(snippet 0 row y=122) matches golden (cls,x,y,rot) for belts/splitters/machines; golden machine off subset of ours; m=4 -> 4 machines, manifold ends at 4th splitter.
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const golden = JSON.parse(fs.readFileSync(ROOT + '/tests/golden/bl_template.json', 'utf8')).snippets[0].b;
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof blMachine === 'function' && typeof blRow === 'function' && typeof pfSplOff === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const r = await pg.evaluate(g => {
  const mc = blMachine('DAT_Refinery');
  const base = {mk: 1, spMk: 1, cls: 'DAT_Refinery', rec: 'ITEM_Silica>ITEM_SiliconWafers', mc, X0: -30, yIn: 121, colX: -31, xEx: -11};
  const R = blRow({...base, m: 6});
  const R4 = blRow({...base, m: 4});
  const key = b => b.cls + '|' + b.x + '|' + b.y + '|' + b.rot;
  const inBand = b => b.x >= -31 && b.x <= -12 && ((b.y === 121 || b.y === 125) || (b.y === 122 && b.x <= -15 && b.x >= -30));
  const gBand = g.filter(b => inBand(b) && /ConveyorBelt|Splitter|Refinery/.test(b.cls));
  const mine = R.items.filter(b => b.x <= -12);
  const gk = gBand.map(key).sort(), mk = mine.map(key).sort();
  const onlyG = gk.filter(k => !mk.includes(k)), onlyM = mk.filter(k => !gk.includes(k));
  const gMach = g.filter(b => b.cls === 'DAT_Refinery' && b.y === 122), offOk = gMach.every(b => (b.off || []).every(k => mc.off.includes(k)));
  const spl4 = R4.items.filter(b => b.cls === 'DAT_Splitter_2'), mach4 = R4.items.filter(b => b.cls === 'DAT_Refinery');
  return {mc, onlyG, onlyM, nG: gk.length, nM: mk.length, offOk, nMach: mach4.length, lastSpl: Math.max(...spl4.map(b => b.x)), ok: R.ok && R4.ok};
}, golden);
check(r.mc.ok && r.mc.rot === 0 && r.mc.w === 3 && r.mc.h === 3 && r.mc.xin === 1 && r.mc.xout === 1 && JSON.stringify(r.mc.off) === '["E1","W3"]',
  'blMachine(DAT_Refinery) = ' + JSON.stringify(r.mc));
check(r.onlyG.length === 0 && r.onlyM.length === 0, 'row y=121/122/125 matches golden (' + r.nM + ' mine, ' + r.nG + ' golden)' + (r.onlyG.length ? ' onlyGolden ' + JSON.stringify(r.onlyG.slice(0, 5)) : '') + (r.onlyM.length ? ' onlyMine ' + JSON.stringify(r.onlyM.slice(0, 5)) : ''));
check(r.offOk, 'golden machine off subset of blMachine off');
check(r.nMach === 4 && r.lastSpl === -20, 'm=4 -> 4 machines, last splitter x=' + r.lastSpl + ' (want -20)');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

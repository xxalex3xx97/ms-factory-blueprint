// CMP BM gate: 'pool lanes > 4' was refused at full block capacity although the planner N needs few machines (Basic Motor 60/min Mk2, Backpack Mk1 parts: Hull Plate, Lightweight Frames, Magnetic Coils).
// Strict checkCompose (exact planner N, flood, stage-wise links1) + mutate:'any', Mk2, 2x2, no docks / normal docks / industrial docks in+out. Run: node tests/cmp_poollanes.mjs  Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const perrs = [];
pg.on('pageerror', e => perrs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof placerLayout === 'function' && typeof links1 === 'function');
let fails = 0;
const BK = 'BPO_Station_02', DK = [['no docks', null], ['normal docks', {in: 'nrm', out: 'nrm'}], ['industrial docks', {in: 'ind', out: 'ind'}]];
for (const [name, rate] of [['Basic Motor', 60], ['Basic Motor', 6], ['Hull Plate', 600], ['Lightweight Frames', 300], ['Magnetic Coils', 60]]) {
  const key = await pg.evaluate(n => { const i = [...plnBy(false).keys()].find(x => plnNm(x) === n); return rk([].concat(...Object.values(RECS)).find(r => r.o[0] === i)) }, name);
  for (const [dn, dock] of DK) {
    const r = await checkCompose(pg, key, rate, 1, BK, {strict: true, mutate: 'any', dock});
    console.log((r.ok ? 'PASS ' : 'FAIL ') + name + ' ' + rate + ' Mk2 2x2 ' + dn + (r.ok ? ' ' + (r.row.stages || '') : ': ' + r.errs.slice(0, 3).join('; ')));
    if (!r.ok) fails++;
  }
}
// POOL: lane cap is physical (stacked containers), not 4: Basic Motor 480 Mk2 on 2x2 = ONE strip, exact planner N (8 Basic Motor + 12 Titanium Plates), 5 blocks
{
  const key = await pg.evaluate(() => { const i = [...plnBy(false).keys()].find(x => plnNm(x) === 'Basic Motor'); return rk([].concat(...Object.values(RECS)).find(r => r.o[0] === i)) });
  for (const [dn, dock] of DK) {
    const r = await checkCompose(pg, key, 480, 1, BK, {strict: true, mutate: 'any', dock, exactN: true});
    const ok = r.ok && r.row.K === 1 && r.row.machines === 20;
    console.log((ok ? 'PASS ' : 'FAIL ') + 'Basic Motor 480 Mk2 2x2 one strip ' + dn + ' K=' + r.row.K + ' blocks=' + r.row.blocks + ' belts/mach=' + r.row.beltsPerMach + (r.ok ? '' : ': ' + r.errs.slice(0, 3).join('; ')));
    if (!ok) fails++;
  }
}
// SHAPE: assembler_1in RAIL layout (2x2 S=3: up to 3 collector rails per set) holds 15 Basic Motor assemblers in ONE block: Basic Motor 900 Mk2 = one strip (was K=2), exact planner N (23 + 15)
{
  const key = await pg.evaluate(() => { const i = [...plnBy(false).keys()].find(x => plnNm(x) === 'Basic Motor'); return rk([].concat(...Object.values(RECS)).find(r => r.o[0] === i)) });
  for (const [dn, dock] of DK) {
    const r = await checkCompose(pg, key, 900, 1, BK, {strict: true, mutate: 'any', dock, exactN: true});
    const ok = r.ok && r.row.K === 1 && r.row.machines === 38;
    console.log((ok ? 'PASS ' : 'FAIL ') + 'Basic Motor 900 Mk2 2x2 one strip (rails) ' + dn + ' K=' + r.row.K + ' blocks=' + r.row.blocks + ' belts/mach=' + r.row.beltsPerMach + (r.ok ? '' : ': ' + r.errs.slice(0, 3).join('; ')));
    if (!ok) fails++;
  }
}
if (perrs.length) { console.log('FAIL page errors: ' + perrs[0]); fails++ }
await br.close();
process.exit(fails ? 1 : 0);

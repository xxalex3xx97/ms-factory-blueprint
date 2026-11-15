// CMP S12 gate: tree nodes with N > one block build as stacked blocks. checkCompose strict + mutate 'any' on 2x2 (and 2x2c); plus unchanged small rates.
// Run: node tests/cmp_s12.mjs [key|cap|bc|enz|aa rate [2x2|2x2c|1x1]]. Exit 1 on FAIL or page error. A refused case prints the exact reason and fails.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = {cap: 'ITEM_NickelPlates+ITEM_TitaniumPlates>ITEM_Capacitor', bc: 'ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit', enz: 'ITEM_Biomass+ITEM_Xenobacteria+ITEM_Nutrients>ITEM_Enzyme', aa: 'ITEM_DetectorArray+ITEM_BasicCircuit+ITEM_Superalloy+ITEM_Coolant>ITEM_AdvancedCircuits'};
const BK = {'2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03', '1x1': 'BPO_Station_01', auto: 'auto'};
const cases = process.argv[2] ? [[process.argv[2], +process.argv[3], process.argv[4] || '2x2']] : [['cap', 100, '2x2'], ['bc', 100, '2x2'], ['enz', 10, '2x2'], ['aa', 5, '2x2'], ['cap', 200, '2x2'], ['bc', 200, '2x2'], ['enz', 40, '2x2'], ['cap', 200, '2x2c'], ['cap', 500, '2x2'], ['bc', 500, '2x2'], ['cap', 1000, '2x2'], ['cap', 100, 'auto'], ['enz', 10, 'auto'], ['ITEM_EnrichedNickelOre>ITEM_NickelPlates', 31, 'auto']];   // auto = composer picks the block type   // exactN cases (not enz/aa: shared products are built per consumer)
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const page = await (await br.newContext()).newPage(); const pe = [];
page.on('pageerror', e => pe.push(e.message));
await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await page.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof cmpAssembleTree === 'function');
let fails = 0;
for (const [n, rate, b] of cases) {
  const r = await checkCompose(page, KEY[n] || n, rate, 1, BK[b], {strict: true, exactN: /^(cap|bc)$/.test(n), mutate: 'any', dock: process.env.DOCK ? {in: true, out: true} : null});
  console.log((r.ok ? 'PASS ' : 'FAIL ') + n + ' ' + rate + ' ' + b + (r.ok ? ' ' + JSON.stringify(r.row.stages) : ': ' + (r.refused || r.errs.slice(0, 4).join('; '))));
  if (!r.ok) fails++;
}
if (pe.length) { console.log('page errors: ' + pe[0]); fails++ }
await br.close();
console.log(fails ? 'FAIL ' + fails : 'PASS cmp_s12');
process.exit(fails ? 1 : 0);

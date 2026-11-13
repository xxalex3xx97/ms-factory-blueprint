// GROUPS prototype gate (window.CMP_GROUPS): every node = group of blocks, strict checkCompose (flood, per-member machine count, stage-wise product) + mutate 'any' + table.
// exactN is off for groups: sum of members per node must equal planner N (single copy) or stay within the unrolled-copy rule with a 'Planner N=a, built b' note.
// Run: node tests/cmp_groups.mjs [s1|s2|s3|all|name:rate,...]   Exit 1 on FAIL / page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = {nickel: '^ITEM_NickelOre>ITEM_NickelPlates$', basicmotor: '>ITEM_BasicMotor$', capacitor: '>ITEM_Capacitor$', bc: '>ITEM_BasicCircuit$', ac: '>ITEM_AdvancedCircuits$'};
const SETS = {
  s1: 'nickel:31,nickel:100,nickel:480,basicmotor:20,basicmotor:100,basicmotor:900',
  s2: 'capacitor:100,capacitor:500,bc:100',
  s3: 'ac:5,ac:15,ac:30',
  auto: 'ac:30,capacitor:100,nickel:480',   // GAUTO: no groups flag; ac:30 (K=3 strips) must pick groups by itself, the others stay on the current engine
};
const arg = process.argv[2] || 's1', cases = (SETS[arg] || (arg === 'all' ? Object.values(SETS).join(',') : arg)).split(',');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [], rows = [];
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp'+(arg==='auto'?'':'&groups=1'));
  await page.waitForFunction(() => window.__fb && typeof cmpGroupsRun === 'function' && typeof placerLayout === 'function');
  if (arg === 'auto') await page.evaluate(() => { window.CMP_GROUPS_AUTO = true });   // auto-switch is opt-in until the static lane split is fixed (tests/cmp_groups_sim.mjs)
  for (const c of cases) {
    const [n, rate] = c.split(':');
    const key = await page.evaluate(re => [].concat(...Object.values(RECS)).map(rk).find(k => new RegExp(re).test(k)), KEY[n]);
    const t0 = Date.now();
    const r = await checkCompose(page, key, +rate, 1, 'BPO_Station_02', {strict: true, mutate: 'any'});
    if (arg === 'auto') {   // which engine built it
      const g = await page.evaluate(([k, rate]) => { window.CMP_ENGINE = true; const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === k), item = rec.o[0];
        const P = plan(item, rate, 1, {}, {[item]: k}, {proto: false, enr: false, obs: false});
        const L = placerLayout(P, item, 1, 1, {box: 'DAT_Container_2', mod: false, dock: null, bk: 'BPO_Station_02'}); return !!(L.bl && L.bl.cmp && L.bl.cmp.groups) }, [key, +rate]);
      const want = n === 'ac'; if (g !== want) { fails++; console.log('FAIL ' + c + ': groups=' + g + ' expected ' + want) } else console.log('PASS engine ' + c + ' groups=' + g);
    }
    rows.push({case: c, ok: r.ok, blocks: r.row.blocks, machines: r.row.machines, belts: r.row.belts, ms: Date.now() - t0});
    console.log((r.ok ? 'PASS ' : 'FAIL ') + c + (r.ok ? '' : ': ' + r.errs.slice(0, +process.env.NE || 4).join(' | ')));
    if (!r.ok) fails++;
  }
  console.table(rows);
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS cmp_groups');
process.exit(fails ? 1 : 0);

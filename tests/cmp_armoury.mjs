// CMP H gate: Armoury items (hand-crafted, no belt ports) = one composer sub-factory per component, stacked, strict checkCompose (exact planner N, flood, every component reaches a container, mutate 'any').
// Built: Backpack Mk1/2/3, Exoskeleton Mk1/2 (Blocks 'auto'); Exoskeleton Mk3 only with ARM_HEAVY=1 (2100 machines, ~3 min). Exosuit is checked at 1/min (user: it needs only 1/min), builds with Blocks 'auto' (~3000 machines).
// Also prints a per-recipe table (built/refused). Run: node tests/cmp_armoury.mjs   Exit 1 on FAIL or page error.
import {pathToFileURL} from 'url';
import path from 'path';
import {fileURLToPath} from 'url';
import {createRequire} from 'module';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [], rows = [];
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
  await page.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof cmpArmoury === 'function');
  const recs = await page.evaluate(() => {
    const r = [];
    for (const rec of [].concat(...Object.values(RECS))) {
      const item = rec.o[0], key = rk(rec); let P; try { P = plan(item, 1, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false}) } catch (e) { continue }
      const n = P.nodes[item]; if (n && n.crafter && /Armoury/i.test(n.crafter)) r.push({key, name: plnNm(item), pm: n.pmach});
    }
    return r;
  });
  console.log('Armoury recipes the planner offers: ' + recs.length + ' ' + recs.map(r => r.name).join(', '));
  const heavy = !!process.env.ARM_HEAVY, only = process.env.ARM_ONLY;
  const refuse = {}, skipHeavy = ['Exoskeleton Mk. 3'];
  for (const rc of recs) {
    if (only && !new RegExp(only).test(rc.name)) continue;
    if (!heavy && skipHeavy.includes(rc.name)) { console.log('SKIP (ARM_HEAVY=1 to run) ' + rc.name); continue }
    const r = await checkCompose(page, rc.key, rc.name === 'Exosuit' ? 1 : rc.pm, 1, 'auto', {strict: true, mutate: 'any'});
    rows.push({item: rc.name, status: r.refused ? 'refused' : r.ok ? 'built' : 'FAIL', ...(r.refused ? {why: r.refused.slice(0, 110)} : {blocks: r.row.blocks, machines: r.row.machines, belts: r.row.belts})});
    if (r.refused) { const ok = refuse[rc.name] && refuse[rc.name].test(r.refused); console.log((ok ? 'REFUSED (expected) ' : 'FAIL refused ') + rc.name + ': ' + r.refused); if (!ok) fails++; continue }
    if (refuse[rc.name]) { console.log('FAIL ' + rc.name + ' now builds, update the gate'); fails++ }
    console.log((r.ok ? 'PASS ' : 'FAIL ') + rc.name + (r.ok ? '' : ': ' + r.errs.join('; ')));
    if (!r.ok) fails++;
  }
  console.table(rows);
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS cmp_armoury');
process.exit(fails ? 1 : 0);

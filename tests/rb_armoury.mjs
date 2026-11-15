// RB Armoury S1: measurement + gate of Armoury items on the recursive builder (?engine=rb). Armoury is hand-fed (0 ports): each leaf component is its own sub-factory (cmpArmoury), stacked.
// Per case: built/refused, blocks, machines vs planner N (checkCompose strict: exact N, flood, ov 0), total ms; per leaf: item, rate, blocks, ms, rb used. Gate: Exosuit total < 60 s.
// Run: node tests/rb_armoury.mjs   (ARM_ONLY=regex to select cases)   Exit 1 on FAIL or page error.
import {pathToFileURL, fileURLToPath} from 'url';
import path from 'path';
import {createRequire} from 'module';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES = ['Backpack Mk. 1', 'Backpack Mk. 3', 'Exoskeleton Mk. 1', 'Exosuit'], RATE = 1, EXO_MAX_MS = 60000;
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [], rows = [];
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof cmpArmoury === 'function');
  console.log('RB_ENGINE=' + await page.evaluate(() => !!globalThis.RB_ENGINE));
  const recs = await page.evaluate(() => {
    const r = [];
    for (const rec of [].concat(...Object.values(RECS))) {
      const item = rec.o[0], key = rk(rec); let P; try { P = plan(item, 1, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false}) } catch (e) { continue }
      const n = P.nodes[item]; if (n && n.crafter && /Armoury/i.test(n.crafter)) r.push({key, name: plnNm(item)});
    }
    return r;
  });
  console.log('Armoury recipes: ' + recs.map(r => r.name).join(', '));
  const only = process.env.ARM_ONLY;
  for (const name of CASES) {
    if (only && !new RegExp(only).test(name)) continue;
    const rc = recs.find(r => r.name === name);
    if (!rc) { console.log('FAIL no recipe named ' + name); fails++; continue }
    const t = Date.now();
    const r = await checkCompose(page, rc.key, RATE, 1, 'BPO_Station_02', {strict: true, mutate: 'any'});
    const ms = Date.now() - t;   // includes the flood/flow/mutation checks
    const parts = r.refused ? [] : await page.evaluate(() => { const c = window.__cmpL && window.__cmpL.bl && window.__cmpL.bl.cmp; return c && c.parts ? c.parts.map(p => ({item: p.item, rate: +p.rate.toFixed(2), blocks: p.blocks, ms: p.ms, rb: p.rb})) : [] });
    const build = parts.reduce((s, p) => s + p.ms, 0);
    console.log((r.refused ? 'REFUSED ' : r.ok ? 'PASS ' : 'FAIL ') + name + (r.refused ? ': ' + r.refused : r.ok ? '' : ': ' + r.errs.join('; ')) + '  (build ' + build + ' ms, with checks ' + ms + ' ms)');
    if (!r.refused) console.log('  planner N/built: ' + (r.row.stages || ''));
    console.table(parts);
    rows.push({case: name, status: r.refused ? 'refused' : r.ok ? 'built' : 'FAIL', blocks: r.row.blocks, machines: r.row.machines, leaves: parts.length, rbAll: parts.length > 0 && parts.every(p => p.rb), buildMs: build, totalMs: ms});
    if (!r.ok) fails++;
    if (name === 'Exosuit' && build > EXO_MAX_MS) { console.log('FAIL Exosuit build ' + build + ' ms > ' + EXO_MAX_MS); fails++ }
  }
  console.table(rows);
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS rb_armoury');
process.exit(fails ? 1 : 0);

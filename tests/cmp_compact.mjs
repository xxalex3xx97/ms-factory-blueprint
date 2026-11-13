// COMPACT gate: low-rate trees/chains share blocks (no empty hub blocks), never more blocks / belts than the one-block-per-column layout (window.CMP_NOFUSE = that old layout).
// Every case: strict checkCompose (exact planner N, flood clean, mutation turns the flood red) in BOTH layouts; packed blocks <= old blocks, packed belts+UG <= old; low-rate cases also meet an absolute block cap.
// Run: node tests/cmp_compact.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof plan === 'function' && typeof cmpShr === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const BK = {'2x2': 'BPO_Station_02', '1x2': 'BPO_Station_2x1', '2x2c': 'BPO_Station_03'};
// [label, recipe key regex, rate, mk, block, absolute block cap (low rates) or null]
const CASES = [
  ['Capacitor 20', 'ITEM_Capacitor$', 20, 1, '2x2', 6], ['Capacitor 100', 'ITEM_Capacitor$', 100, 1, '2x2', null],
  ['Basic Circuits 20', '>ITEM_BasicCircuit$', 20, 1, '2x2', 8], ['Basic Circuits 100', '>ITEM_BasicCircuit$', 100, 1, '2x2', null],
  ['Enzyme 30', 'ITEM_Enzyme$', 30, 1, '2x2', 6], ['Enzyme 120', 'ITEM_Enzyme$', 120, 1, '2x2', null],
  ['Nickel Plates 31', '^ITEM_EnrichedNickelOre>ITEM_NickelPlates$', 31, 1, '2x2', 3], ['Nickel Plates 480', '^ITEM_EnrichedNickelOre>ITEM_NickelPlates$', 480, 1, '2x2', null],
  ['Basic Motor 20', '>ITEM_BasicMotor$', 20, 1, '2x2', 3], ['Basic Motor 900', '>ITEM_BasicMotor$', 900, 1, '2x2', null],
  ['Capacitor 20 1x2', 'ITEM_Capacitor$', 20, 1, '1x2', null], ['Nutrients 20', 'ITEM_Nutrients$', 20, 1, '2x2', 2],
  ['Advanced Circuits 5', '>ITEM_AdvancedCircuits$', 5, 1, '2x2', 40, true],   // DAG: Basic Circuits built per consumer, 'Planner N=3, built 4' is a documented note (also in the old layout): not exactN
];
for (const [label, re, rate, mk, bk, cap, noExact] of CASES) {
  const key = await pg.evaluate(r => [].concat(...Object.values(RECS)).map(rk).find(k => new RegExp(r).test(k)), re);
  if (!key) { check(false, label + ': recipe key not found'); continue }
  const run = async nf => { await pg.evaluate(v => { window.CMP_NOFUSE = v }, nf); return checkCompose(pg, key, rate, mk, BK[bk], {strict: true, mutate: 'any', exactN: !noExact}) };
  const old = await run(true), neu = await run(false);
  await pg.evaluate(() => { window.CMP_NOFUSE = false });
  if (old.refused || neu.refused) { check(!!old.refused === !!neu.refused, label + ': refused alike (' + (old.refused || neu.refused) + ')'); continue }
  check(old.ok, label + ' old layout strict' + (old.ok ? '' : ': ' + (old.errs || []).slice(0, 2).join(' ; ')));
  check(neu.ok, label + ' packed layout strict' + (neu.ok ? '' : ': ' + (neu.errs || []).slice(0, 2).join(' ; ')));
  if (!old.ok || !neu.ok) continue;
  const a = old.row, b = neu.row;
  console.log('  ' + label + ': blocks ' + a.blocks + ' -> ' + b.blocks + ', belts+ug ' + (a.belts + a.ug) + ' -> ' + (b.belts + b.ug) + ', machines ' + a.machines + ' -> ' + b.machines);
  check(b.blocks <= a.blocks, label + ': packed blocks <= old');
  check(b.belts + b.ug <= a.belts + a.ug, label + ': packed belts+ug <= old');
  check(b.machines === a.machines, label + ': machines unchanged');
  if (cap) check(b.blocks <= cap, label + ': blocks ' + b.blocks + ' <= ' + cap);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

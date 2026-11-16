// dock_one_ore: industrial docks (Dock_2) carry ONE item each. Recipes with >=2 raw items, blocks 1x1 / 2x1 / 2x2 (2x2c Nutrients also run).
// Run: node tests/dock_one_ore.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDOCK = {in: 'ind', out: 'ind'};
const B3 = ['BPO_Station_01', 'BPO_Station_2x1', 'BPO_Station_02'];
// [name, key regex, rate, blocks]
const CASES = [['Enzyme 10', '>ITEM_Enzyme$', 10, B3], ['Basic Circuits 100', '>ITEM_BasicCircuit$', 100, B3], ['Advanced Circuits 5', '>ITEM_AdvancedCircuits$', 5, B3], ['Nutrients 400', '>ITEM_Nutrients$', 400, [...B3, 'BPO_Station_03']]];
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
// page side, on the layout checkCompose just built (window.__cmpL / __cmpP)
const dockOne = ({bk, mk}) => {
  const L = window.__cmpL, cmp = L.bl.cmp, m = new Map();
  [...(cmp.raw || []), ...(cmp.oz || [])].forEach(q => {
    const d = q.dd; if (!d || !d.ind) return;
    const k = d.side + ':' + d.gx + ':' + d.gy + ':' + (d.side === 'E' ? q.x : 0);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(d.name);
  });
  const P = window.__cmpP, pl = cmpPlan(P, L.src.item, mk, {share: true}), raws = new Set(pl.nodes.filter(o => o.raw).map(o => o.key));
  return {docks: [...m].map(([k, s]) => [k, [...s]]), ind2: L.tile.blocks.filter(b => b.cls === plcCls('BPO_Dock_2')).length, raws: raws.size};
};
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const vacuous = {BPO_Station_01: false, BPO_Station_2x1: false, BPO_Station_02: false};
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof rbRun === 'function' && typeof placerLayout === 'function' && typeof cmpDockApply === 'function');
  for (const [name, kre, rate, blocks] of CASES) for (const bk of blocks) {
    const label = name + ' ' + bk.replace('BPO_Station_', '');
    if (only && !only.test(label)) continue;
    const key = await page.evaluate(re => [].concat(...Object.values(RECS)).map(rk).find(k => new RegExp(re).test(k)), kre);
    const r = await checkCompose(page, key, rate, 1, bk, {strict: true, mutate: 'any', exactN: true, dock: IDOCK});
    if (!r.ok) { console.log('SKIP ' + label + ': build fail ' + (r.errs || []).slice(0, 2).join(' | ')); continue }
    const a = await page.evaluate(dockOne, {bk, mk: 1});
    console.log('   ' + label + ': raws ' + a.raws + ', ind2 ' + a.ind2 + ', docks ' + a.docks.length);
    const multi = a.docks.filter(([, s]) => s.length > 1);
    check(multi.length === 0, label + ' ' + bk + ': no Dock_2 with >1 item' + (multi.length ? ' -> ' + multi.map(([k, s]) => k + ' [' + s.join(', ') + ']').join(' | ') : ''));
    if (a.raws >= 2 && a.ind2 >= 1) vacuous[bk] = true;
  }
  for (const bk of Object.keys(vacuous)) check(vacuous[bk], 'vacuous: no built layout with raws>=2 and ind2>=1 for ' + bk);
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS dock_one_ore');
process.exit(fails ? 1 : 0);

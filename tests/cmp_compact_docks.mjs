// COMPACT-with-docks gate: chains (K=1) and low-rate trees with docks pack into fewer blocks/belts than the one-block-per-column layout (window.CMP_NOFUSE=true = old).
// Per case: strict checkCompose (exact N, flood clean, mutation) in both layouts; machines equal, factory blocks and belts+ug new<=old, dock counts equal, no new Dock-limited/not possible notes, no new CMP_DKFAIL.
// win=1: this case must strictly win (blocks or belts+ug); trees: at least one tree must win overall. Run: node tests/cmp_compact_docks.mjs   Exit 1 on FAIL.
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
await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof plan === 'function' && typeof cmpShr === 'function');
let fails = 0, wins = 0, treeWins = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const BK = {'2x2': 'BPO_Station_02', '1x2': 'BPO_Station_2x1'};
const DK = {nrm: {in: 'nrm', out: 'nrm'}, ind: {in: 'ind', out: 'ind'}};
// [label, recipe regex, rate, block, dock, win (must strictly win), tree]
const CASES = [
  ['BasicMotor 60 chain', '>ITEM_BasicMotor$', 60, '2x2', 'nrm', 1], ['TitaniumPlates 60 chain', 'ITEM_TitaniumPlates$', 60, '2x2', 'nrm', 1],
  ['Capacitor 100 nrm', 'ITEM_Capacitor$', 100, '2x2', 'nrm', 0, 1], ['Capacitor 100 ind', 'ITEM_Capacitor$', 100, '2x2', 'ind', 0, 1], ['Capacitor 100 1x2 nrm', 'ITEM_Capacitor$', 100, '1x2', 'nrm', 0, 1],
  ['Capacitor 500 nrm', 'ITEM_Capacitor$', 500, '2x2', 'nrm', 0, 1], ['Capacitor 500 ind', 'ITEM_Capacitor$', 500, '2x2', 'ind', 0, 1],
  ['Enzyme 30 nrm', 'ITEM_Enzyme$', 30, '2x2', 'nrm', 0, 1], ['BasicCircuit 100 nrm', '>ITEM_BasicCircuit$', 100, '2x2', 'nrm', 0, 1],
];
const info = a => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key), item = rec.o[0];
  const P = plan(item, a.rate, a.mk, {}, {[item]: a.key}, {proto: false, enr: false, obs: false});
  globalThis.CMP_DKFAIL = [];
  const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: a.bk});
  if (!L.ok) return {err: L.why, notes: [], dkfail: 0};
  const T = L.tile, dockCls = [plcCls('BPO_Dock'), plcCls('BPO_Dock_2'), plcCls('BPO_StationAdapter_01')];
  return {factory: T.blocks.filter(b => !dockCls.includes(b.cls)).length, nrm: T.blocks.filter(b => b.cls === plcCls('BPO_Dock')).length, ind: T.blocks.filter(b => b.cls === plcCls('BPO_Dock_2')).length, notes: L.note.filter(n => /Dock-limited|not possible/.test(n)), dkfail: (globalThis.CMP_DKFAIL || []).length};
};
for (const [label, re, rate, bk, dn, win, tree] of CASES) {
  const key = await pg.evaluate(r => [].concat(...Object.values(RECS)).map(rk).find(k => new RegExp(r).test(k)), re);
  if (!key) { check(false, label + ': recipe key not found'); continue }
  const run = async nf => {
    await pg.evaluate(v => { window.CMP_NOFUSE = v }, nf);
    const a = await pg.evaluate(info, {key, rate, mk: 1, bk: BK[bk], dock: DK[dn]});
    const r = await checkCompose(pg, key, rate, 1, BK[bk], {strict: true, mutate: 'any', exactN: true, dock: DK[dn]});
    return {a, r};
  };
  const o = await run(true), n = await run(false);
  await pg.evaluate(() => { window.CMP_NOFUSE = false });
  if (o.r.refused || n.r.refused) { check(!!o.r.refused === !!n.r.refused, label + ': refused alike (' + (o.r.refused || n.r.refused) + ')'); continue }
  check(o.r.ok, label + ' old layout strict' + (o.r.ok ? '' : ': ' + (o.r.errs || []).slice(0, 2).join(' ; ')));
  check(n.r.ok, label + ' packed layout strict' + (n.r.ok ? '' : ': ' + (n.r.errs || []).slice(0, 2).join(' ; ')));
  if (!o.r.ok || !n.r.ok) continue;
  const a = o.r.row, b = n.r.row, ab = a.belts + a.ug, bb = b.belts + b.ug;
  console.log('  ' + label + ': blocks ' + o.a.factory + ' -> ' + n.a.factory + ', belts+ug ' + ab + ' -> ' + bb + ', docks ' + o.a.nrm + '/' + o.a.ind + ' -> ' + n.a.nrm + '/' + n.a.ind);
  check(b.machines === a.machines, label + ': machines equal');
  check(n.a.factory <= o.a.factory, label + ': factory blocks new<=old');
  check(bb <= ab, label + ': belts+ug new<=old');
  check(n.a.nrm === o.a.nrm && n.a.ind === o.a.ind, label + ': dock counts equal');
  check(n.a.notes.every(x => o.a.notes.includes(x)), label + ': no new dock notes');
  check(n.a.dkfail <= o.a.dkfail, label + ': no new CMP_DKFAIL (' + o.a.dkfail + ' -> ' + n.a.dkfail + ')');
  const w = n.a.factory < o.a.factory || bb < ab;
  if (w) { wins++; if (tree) treeWins++ }
  if (win) check(w, label + ': strict win');
}
check(wins > 0, 'at least one strict win overall (' + wins + ')');
check(treeWins > 0, 'at least one tree strict win (' + treeWins + ')');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

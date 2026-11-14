// CMP MEASURE: blocks / belts / docks per case, fuse on (NOFUSE=f) and off (NOFUSE=t), normal and industrial docks. Prints one table row per run, no asserts.
// Run: node tests/cmp_measure.mjs   env CASE=<regex on label>
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
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof plan === 'function' && typeof cmpShr === 'function');
const CASES = [['Enzyme30', 'ITEM_Enzyme$', 30], ['Capacitor100', 'ITEM_Capacitor$', 100], ['Capacitor500', 'ITEM_Capacitor$', 500], ['Nickel480', '^ITEM_EnrichedNickelOre>ITEM_NickelPlates$', 480], ['BC100', '>ITEM_BasicCircuit$', 100]];
const BK = {'2x2': 'BPO_Station_02', '1x2': 'BPO_Station_2x1'};
const DK = {nrm: {in: 'nrm', out: 'nrm'}, ind: {in: 'ind', out: 'ind'}};
const findKey = re => pg.evaluate(re => { const r = [].concat(...Object.values(RECS)).find(r => new RegExp(re).test(rk(r))); return r && rk(r) }, re);
const info = a => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key), item = rec.o[0];
  const P = plan(item, a.rate, a.mk, {}, {[item]: a.key}, {proto: false, enr: false, obs: false});
  const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: a.bk});
  if (!L.ok) return {err: L.why};
  const T = L.tile, dockCls = [plcCls('BPO_Dock'), plcCls('BPO_Dock_2'), plcCls('BPO_StationAdapter_01')];
  return {err: '', factory: T.blocks.filter(b => !dockCls.includes(b.cls)).length, nrm: T.blocks.filter(b => b.cls === plcCls('BPO_Dock')).length, ind: T.blocks.filter(b => b.cls === plcCls('BPO_Dock_2')).length, notes: L.note.filter(n => /Dock-limited|not possible/.test(n))};
};
const flt = process.env.CASE && new RegExp(process.env.CASE);
console.log('label | block | dock | NOFUSE | ok | factoryBlocks | docks(n/i) | belts+ug | machines | notes');
for (const [label, re, rate] of CASES) {
  if (flt && !flt.test(label)) continue;
  const k = await findKey(re);
  if (!k) { console.log(label + ' | NO RECIPE MATCH ' + re); continue }
  for (const b in BK) for (const dn in DK) for (const nf of [true, false]) {
    const tag = label + ' | ' + b + ' | ' + dn + ' | NOFUSE=' + (nf ? 't' : 'f');
    await pg.evaluate(v => { window.CMP_NOFUSE = v }, nf);
    const a = await pg.evaluate(info, {key: k, rate, mk: 1, bk: BK[b], dock: DK[dn]});
    let r = await checkCompose(pg, k, rate, 1, BK[b], {strict: true, mutate: 'any', exactN: true, dock: DK[dn]});
    let mode = '';
    if (!r.refused && !r.ok && /built/.test([...r.errs, ...(a.notes || [])].join('|'))) { r = await checkCompose(pg, k, rate, 1, BK[b], {strict: true, mutate: 'any', exactN: false, dock: DK[dn]}); mode = ' (exactN:false)' }
    if (r.refused) { console.log(tag + ' | SKIP refused: ' + String(r.refused).slice(0, 90)); continue }
    const notes = a.err ? 'layout: ' + a.err : ([...a.notes].join('; ') || '-');
    const errTxt = r.errs.length ? ' errs: ' + r.errs.slice(0, 2).join(' | ') : '';
    console.log([tag, r.ok ? 'ok' : 'FAIL', a.factory ?? '-', (a.nrm ?? '-') + '/' + (a.ind ?? '-'), (r.row.belts ?? '-') + '+' + (r.row.ug ?? '-'), r.row.machines ?? '-', notes + mode + errTxt].join(' | '));
  }
}
await pg.evaluate(() => { window.CMP_NOFUSE = false });
await br.close();
if (errs.length) console.log('PAGE ERRORS: ' + errs.join(' | '));

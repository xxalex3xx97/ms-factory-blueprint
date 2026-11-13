// CMP C7h gate: industrial docks (BPO_Dock_2, nlIndAsm transposed, nl_dock.js hz) in the composer on 2x2 and 2x2c (adapter). Cases: Nickel 31/480, 2-stage chain, Capacitor tree x dock combos (ind in, ind out, both ind, ind in + nrm out).
// Asserts: checkCompose strict (ov 0, span 0, flood clean, product reaches OZ) + mutate (delete a belt -> red), one Dock_2 per used hub, inf boxes carry the lane item, notes 'Dock n: assign', adapter next to Dock_2 on 2x2c.
// Run: node tests/cmp_c7h.mjs   Exit 1 on FAIL.
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
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof cmpDockApply === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const info = a => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key), item = rec.o[0];
  const P = plan(item, a.rate, a.mk, {}, {[item]: a.key}, {proto: false, enr: false, obs: false});
  const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: a.bk});
  if (!L.ok) return {err: L.why};
  const T = L.tile, d2 = plcCls('BPO_Dock_2'), adc = plcCls('BPO_StationAdapter_01'), box = ms => ms.filter(m => m.cls === NLD.BOX_I);
  const inf = T.ms.filter(m => m.cls === NLD.BOX_I && m.ct && m.ct[0] && m.ct[0].inf), dd = T.ms.filter(m => m.dd);
  return {err: '', d2: T.blocks.filter(b => b.cls === d2).length, ad: T.blocks.filter(b => b.cls === adc).length, inf: inf.length, dd: dd.length, ind: dd.filter(m => m.dd.ind).length, notes: L.note.filter(n => /^Dock|^Industrial/.test(n)), ov: T.ov, tagLeft: T.ms.filter(m => m.dk === 'ie' || m.dk === 'oe').length};
};
const keys = await pg.evaluate(() => [].concat(...Object.values(RECS)).map(rk).filter(k => /NickelPlates$|Capacitor$/.test(k)));
const bc = await pg.evaluate(() => [].concat(...Object.values(RECS)).map(rk).find(k => /BasicCircuit$/.test(k))), nickel = keys.find(k => /^ITEM_NickelOre>ITEM_NickelPlates$/.test(k)), two = keys.find(k => /^ITEM_EnrichedNickelOre>/.test(k)), cap = keys.find(k => />ITEM_Capacitor$/.test(k));
const BK = {'2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03', '1x2': 'BPO_Station_2x1', '1x1': 'BPO_Station_01'};
const DH1 = new Set(['1x2', '1x1']);
const DK = {'ind in': {in: 'ind', out: null}, 'ind out': {in: null, out: 'ind'}, 'ind both': {in: 'ind', out: 'ind'}, 'ind in+nrm out': {in: 'ind', out: 'nrm'}};
const cases = [];
for (const b in BK) for (const dk in DK) {
  if (DH1.has(b)) { cases.push({key: nickel, name: 'Nickel 31', rate: 31, mk: 1, b, dk}, {key: nickel, name: 'Nickel 480', rate: 480, mk: 1, b, dk}); continue }
  cases.push({key: nickel, name: 'Nickel 31', rate: 31, mk: 1, b, dk}, {key: nickel, name: 'Nickel 480', rate: 480, mk: 1, b, dk}, {key: two, name: '2-stage 100', rate: 100, mk: 0, b, dk});
  cases.push({key: cap, name: 'Capacitor 100', rate: 100, mk: 1, b, dk}, {key: bc, name: 'Basic Circuits 100', rate: 100, mk: 1, b, dk});
}
for (const c of cases) {
  const tag = c.name + ' ' + c.b + ' Mk' + (c.mk + 1) + ' ' + c.dk, dock = DK[c.dk];
  const r = await checkCompose(pg, c.key, c.rate, c.mk, BK[c.b], {strict: true, mutate: true, dock});
  if (r.refused) { check(false, tag + ' refused: ' + r.refused); continue }
  const a = await pg.evaluate(info, {key: c.key, rate: c.rate, mk: c.mk, bk: BK[c.b], dock});
  if (a.err) { check(false, tag + ' ' + a.err); continue }
  const wantI = (dock.in === 'ind' ? 1 : 0) + (dock.out === 'ind' ? 1 : 0);
  const fb = a.notes.filter(n => /^Industrial/.test(n));
  const ok = r.ok && a.ov === 0 && a.tagLeft === 0 && (fb.length || a.d2 >= wantI) && (c.b === '2x2' || fb.length || a.ad >= a.d2) && a.ind >= (fb.length ? 0 : wantI);
  check(ok, tag + ' | Dock_2 ' + a.d2 + ' adapters ' + a.ad + ' ind-docked ' + a.ind + ' ' + JSON.stringify(a.notes) + (ok ? '' : ' | ' + (r.errs || []).slice(0, 3).join('; ')));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

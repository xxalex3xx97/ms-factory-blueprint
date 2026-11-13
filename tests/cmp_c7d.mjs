// CMP C7d gate: FEED hub docks (all-raw first stage / tree feed node at column 0) + 'Dock-limited' notes for undockable positions. Enzyme 10 (tree), Capacitor/Basic Circuits (tree), Nickel on 2x2, 2x2c, 1x2 with dock in nrm.
// Per case: checkCompose strict + mutate (delete a belt -> red), ov 0, every docked raw container has a Dock_1 block next to its block (adapter-shifted on 2x2c), at least one docked container.
// Run: node tests/cmp_c7d.mjs   Exit 1 on FAIL.
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
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof cmpFeedDock === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const info = a => {
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key), item = rec.o[0];
  const P = plan(item, a.rate, a.mk, {}, {[item]: a.key}, {proto: false, enr: false, obs: false});
  const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: a.bk});
  if (!L.ok) return {err: L.why};
  const T = L.tile, dc = plcCls('BPO_Dock'), ad = a.bk === 'BPO_Station_03' ? 1 : 0, inf = T.ms.filter(m => m.cls === NLD.BOX_I && m.ct && m.ct[0] && m.ct[0].inf), dd = inf.filter(m => m.dd);
  const d = dim({cls: plcCls(a.bk), rot: 0}), bad = dd.filter(m => { const D = m.dd; return !T.blocks.some(b => b.cls === dc && (D.side === 'W' ? b.x === D.gx - 1 - ad && b.y === D.gy + D.u : D.side === 'N' ? b.x === D.gx + D.u && b.y === D.gy - 1 - ad : b.x === D.gx + D.u && b.y > D.gy)) });
  return {err: '', docks: T.blocks.filter(b => b.cls === dc).length, inf: inf.length, dd: dd.length, bad: bad.length, ov: T.ov, notes: L.note.filter(n => /^Dock/.test(n))};
};
const BK = {'2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03', '1x2': 'BPO_Station_2x1', '1x1': 'BPO_Station_01'};
const cases = [];
for (const b of ['2x2', '2x2c']) for (const [name, rate, mk, rx] of [['Enzyme', 10, 1], ['Nutrients', 20, 1], ['Capacitor', 100, 1, '>ITEM_Capacitor$'], ['Basic Circuits', 100, 1, 'BasicCircuit$'], ['Nickel Plates', 480, 1, '^ITEM_NickelOre>ITEM_NickelPlates$']]) cases.push({name, rate, mk, b, rx});
cases.push({name: 'Enzyme', rate: 10, mk: 1, b: '1x2'}, {name: 'Nutrients', rate: 20, mk: 1, b: '1x2'});
for (const c of cases) {
  const tag = c.name + ' ' + c.rate + ' ' + c.b, dock = {in: 'nrm', out: null};
  const key = await pg.evaluate(([n, rx]) => { const r = [].concat(...Object.values(RECS)).find(r => rx ? new RegExp(rx).test(rk(r)) : plnNm(r.o[0]) === n); return r ? rk(r) : null }, [c.name, c.rx]);
  const r = await checkCompose(pg, key, c.rate, c.mk, BK[c.b], {strict: true, mutate: true, dock});
  if (r.refused) { check(false, tag + ' refused: ' + r.refused); continue }
  const a = await pg.evaluate(info, {key, rate: c.rate, mk: c.mk, bk: BK[c.b], dock});
  if (a.err) { check(false, tag + ' ' + a.err); continue }
  const ok = r.ok && a.ov === 0 && a.bad === 0 && a.dd > 0;
  check(ok, tag + ' | docked containers ' + a.dd + '/' + a.inf + ' Dock_1 blocks ' + a.docks + ' ' + JSON.stringify(a.notes.filter(n => /limited|not built/.test(n))) + (ok ? '' : ' | ' + (r.errs || []).slice(0, 3).join('; ')));
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

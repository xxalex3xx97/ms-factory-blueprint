// CMP dock fallbacks gate (docks are never refused). Each fallback is forced by patching the page function that would fail:
// (1) industrial dock cannot be placed (cmpDockApply -> 'dock slot misaligned') -> rebuilt with normal docks + 'Industrial dock not built' note, no Dock_2.
// (2) FEED hub router fails once -> a single side / west column still docks; fails always -> infinite containers + exact reason note, never ok:false.
// (3) cmpDockApply miss reason reaches the note; unaligned container -> miss with reason.
// Run: node tests/cmp_dockfb.mjs   Exit 1 on FAIL.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof cmpDockApply === 'function' && typeof cmpFeedDock === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const run = (a) => {
  const rec = [].concat(...Object.values(RECS)).find(r => a.rx ? new RegExp(a.rx).test(rk(r)) : plnNm(r.o[0]) === a.name), item = rec.o[0], key = rk(rec);
  const P = plan(item, a.rate, 1, {}, {[item]: key}, {proto: false, enr: false, obs: false});
  const oa = window.cmpDockApply, orr = window.cmpRoute; let eCalls = 0;
  if (a.patch === 'ind') window.cmpDockApply = (c, T, f) => T.ms.some(m => m.dk === 'ie' || m.dk === 'oe') ? {ok: false, why: 'dock slot misaligned'} : oa(c, T, f);
  if (a.patch === 'miss') window.cmpDockApply = (c, T, f) => { const r = oa(c, T, f); if (r.ok) r.miss = ['in Foo|the dock cells overlap another block']; return r };
  if (a.patch === 'feed1' || a.patch === 'feedAll') window.cmpRoute = o => { if (o.blocked && o.eastStart && (a.patch === 'feedAll' || ++eCalls === 1)) return {ok: false, why: 'forced'}; return orr(o) };
  let L; try { L = placerLayout(P, item, 1, 1, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: a.bk}) } finally { window.cmpDockApply = oa; window.cmpRoute = orr }
  if (!L.ok) return {ok: false, why: L.why};
  const T = L.tile, dd = T.ms.filter(m => m.dd), inf = T.ms.filter(m => m.cls === NLD.BOX_I && m.ct && m.ct[0] && m.ct[0].inf);
  return {ok: true, note: L.note, d2: T.blocks.filter(b => b.cls === plcCls('BPO_Dock_2')).length, d1: T.blocks.filter(b => b.cls === plcCls('BPO_Dock')).length, dd: dd.length, inf: inf.length, eCalls, ov: T.ov};
};
const BK2 = 'BPO_Station_02';
let r = await pg.evaluate(run, {name: 'Nickel Plates', rx: '^ITEM_NickelOre>ITEM_NickelPlates$', rate: 31, bk: BK2, dock: {in: 'ind', out: 'ind'}, patch: 'ind'});
check(r.ok && r.d2 === 0 && r.d1 > 0 && r.note.some(n => /^Industrial dock not built \(dock slot misaligned\): normal docks used/.test(n)) && r.ov === 0, 'ind misaligned -> normal docks + note ' + JSON.stringify(r.ok ? {d2: r.d2, d1: r.d1, n: r.note.filter(n => /Industrial/.test(n))} : r.why));
r = await pg.evaluate(run, {name: 'Capacitor', rx: '>ITEM_Capacitor$', rate: 100, bk: BK2, dock: {in: 'ind', out: 'ind'}, patch: 'ind'});
check(r.ok && r.d2 === 0 && r.d1 > 0 && r.note.some(n => /^Industrial dock not built/.test(n)), 'ind misaligned on a tree -> normal docks + note ' + JSON.stringify(r.ok ? {d2: r.d2, d1: r.d1} : r.why));
const f0 = await pg.evaluate(run, {name: 'Enzyme', rate: 10, bk: BK2, dock: {in: 'nrm', out: null}});
const f1 = await pg.evaluate(run, {name: 'Enzyme', rate: 10, bk: BK2, dock: {in: 'nrm', out: null}, patch: 'feed1'});
check(f1.ok && f1.eCalls >= 2 && f1.dd >= 1 && !f1.note.some(n => /stay infinite/.test(n)), 'feed router fails once -> another side/column docks, no infinite note ' + JSON.stringify(f1.ok ? {dd: f1.dd, inf: f1.inf, e: f1.eCalls, base: f0.dd} : f1.why));
const fa = await pg.evaluate(run, {name: 'Enzyme', rate: 10, bk: BK2, dock: {in: 'nrm', out: null}, patch: 'feedAll'});
check(fa.ok && fa.ov === 0 && fa.note.some(n => /raw containers stay infinite sources/.test(n) && /forced|lane routing failed/.test(n)), 'feed router always fails -> infinite containers + reason, build not refused ' + JSON.stringify(fa.ok ? fa.note.filter(n => /Dock/.test(n)).slice(0, 2) : fa.why));
const fm = await pg.evaluate(run, {name: 'Nickel Plates', rx: '^ITEM_NickelOre>ITEM_NickelPlates$', rate: 31, bk: BK2, dock: {in: 'nrm', out: null}, patch: 'miss'});
check(fm.ok && fm.note.some(n => n === 'Dock-limited: Foo cannot be docked at this position (the dock cells overlap another block; container stays infinite)'), 'miss reason reaches the note');
const mu = await pg.evaluate(() => { const bc = plcCls('BPO_Station_02'), bx = NLD.BOX_I, T = {blocks: [{cls: bc, x: 0, y: 0, rot: 0}], ms: [{cls: bx, x: 0, y: 10, rot: 0, h: 0, pid: 0, ct: [{item: 'ITEM_X', n: 0, inf: true}], dk: 'in', dkx: {r: 1, n: 1, name: 'X'}}], ov: 0}; const r = cmpDockApply({cls: bc, mk: 0}, T, {}); return {ok: r.ok, miss: r.miss} });
check(mu.ok && mu.miss.length === 1 && /\|the container is not on a dock slot$/.test(mu.miss[0]), 'misaligned container -> miss with reason ' + JSON.stringify(mu));
const bkr = await pg.evaluate(() => { window.CMP_BK = 'BPO_Station_01'; const P = plan('ITEM_NickelOre', 10, 1, {}, {}, {proto: false, enr: false, obs: false}), L = cmpCompose(P, 'ITEM_NickelOre', 1, 1, {bk: 'auto', box: 'DAT_Container_2'}); return {ok: L.ok, bk: window.CMP_BK} });
check(!bkr.ok && bkr.bk === undefined, 'failed Auto build resets CMP_BK ' + JSON.stringify(bkr));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

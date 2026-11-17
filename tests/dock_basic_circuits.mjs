// Basic Circuits, raw from industrial docks (output dock off), headless sync build (plcNoWorker).
// Required cells must be built by the recursive composer with one Dock_2 per raw item, none holding 2 items, no 'Dock-limited' note.
// INFO cells (2x2 B, docks OFF) are only reported.
// Run: node tests/dock_basic_circuits.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const CELLS = [
  {n: 'BC 100 Mk1 2x1', rate: 100, mk: 0, bk: 'BPO_Station_2x1', dock: true, req: true},
  {n: 'BC 150 Mk2 2x1', rate: 150, mk: 1, bk: 'BPO_Station_2x1', dock: true, req: true},
  {n: 'BC 100 Mk1 1x1', rate: 100, mk: 0, bk: 'BPO_Station_01', dock: true, req: true},
  {n: 'BC 100 Mk1 2x2B (info)', rate: 100, mk: 0, bk: 'BPO_Station_02', dock: true, req: false},
  {n: 'BC 100 Mk1 2x1 docks OFF (info)', rate: 100, mk: 0, bk: 'BPO_Station_2x1', dock: false, req: false}
];
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  page.on('console', m => { if (/RBDIAG/.test(m.text())) console.log(m.text()) });
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof plan === 'function' && typeof placerLayout === 'function');
  for (const c of CELLS) {
    await page.evaluate(c => {
      window.plcNoWorker = true; try { plcL = null } catch (_) { }$('plnPrevErr').textContent = '';
      const set = (id, v) => { const e = $(id); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')) };
      set('plnItem', [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits'));
      set('plnRate', c.rate); set('plnMk', c.mk); set('plnBk', c.bk); set('plnBuf', 'DAT_Container_2');
      set('plnDkI', c.dock); set('plnDk', 'ind'); set('plnDkO', false);
      placerGo();
    }, c);
    try { await page.waitForFunction(() => !plcBusyF && ((typeof plcL !== 'undefined' && plcL) || document.getElementById('plnPrevErr').textContent), null, {timeout: 300000}) }
    catch (e) { console.log(c.n + ' TIMEOUT badge=' + await page.evaluate(() => $('plnEngBadge').textContent) + ' err=' + await page.evaluate(() => $('plnPrevErr').textContent)); if (c.req) { fails++; console.log('FAIL timeout ' + c.n) } continue }
    const a = await page.evaluate(c => {
      const L = plcL, badge = $('plnEngBadge').textContent, err = $('plnPrevErr').textContent;
      if (!L || !L.ok) return {ok: false, badge, err, why: L && (L.why || L.err || L.msg), keys: L && Object.keys(L).join()};
      const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits');
      const P = plan(it, c.rate, c.mk, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
      const raws = cmpPlan(P, it, c.mk, {share: true}).nodes.filter(o => o.raw).length;
      const cmp = (L.bl && L.bl.cmp) || {}, m = new Map();
      [...(cmp.raw || []), ...(cmp.oz || [])].forEach(q => {
        const d = q.dd; if (!d || !d.ind) return;
        const k = d.side + ':' + d.gx + ':' + d.gy + ':' + (d.side === 'E' ? q.x : 0);
        if (!m.has(k)) m.set(k, new Set());
        m.get(k).add(d.name);
      });
      const ind2 = L.tile.blocks.filter(b => b.cls === plcCls('BPO_Dock_2')).length;
      return {ok: true, badge, raws, ind2, lim: (L.note || []).filter(n => /Dock-limited/.test(n)).length, multi: [...m].filter(([, s]) => s.size > 1).map(([k, s]) => k + ' [' + [...s].join(', ') + ']')};
    }, c);
    console.log(c.n + ': ' + JSON.stringify(a));
    if (!c.req) continue;
    check(a.ok, c.n + ' plcL.ok ' + (a.err || ''));
    if (!a.ok) continue;
    check(/Composer \(recursive\)/.test(a.badge) && !/NO DOCKS/.test(a.badge), c.n + ' badge: ' + a.badge.slice(0, 120));
    check(a.ind2 >= a.raws, c.n + ' Dock_2 ' + a.ind2 + ' >= raws ' + a.raws);
    check(a.multi.length === 0, c.n + ' no Dock_2 with >1 item ' + a.multi.join(' | '));
    check(a.lim === 0, c.n + ' no Dock-limited note');
  }
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS dock_basic_circuits');
process.exit(fails ? 1 : 0);

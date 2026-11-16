// Basic Circuits 150/min, Belt Mk2, 2x1, raw from industrial docks, output dock off.
// KNOWN LIMIT: rb cannot build this (router merge capacity: 'Basic Circuits: merge routing failed' / 'no spot for Magnetic Coils'),
// so the strips fallback runs. Strips cannot place industrial docks here, so docks may be dropped.
// Contract: the plan must be ok; either docks are built, or the preview badge says 'NO DOCKS' (never silent).
// Invariant in all cases: no Dock_2 block serves more than one item.
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
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof plan === 'function' && typeof placerLayout === 'function');
  await page.evaluate(() => {
    const set = (id, v) => { const e = $(id); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')) };
    set('plnItem', [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits'));
    set('plnRate', 150); set('plnMk', 1); set('plnBk', 'BPO_Station_2x1'); set('plnBuf', 'DAT_Container_2');
    set('plnDkI', true); set('plnDk', 'ind'); set('plnDkO', false);
    placerGo();
  });
  await page.waitForFunction(() => (typeof plcL !== 'undefined' && plcL) || document.getElementById('plnPrevErr').textContent, null, {timeout: 120000});
  const a = await page.evaluate(() => {
    const L = plcL, badge = $('plnEngBadge').textContent, err = $('plnPrevErr').textContent;
    if (!L || !L.ok) return {ok: false, badge, err};
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits');
    const P = plan(it, 150, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const raws = cmpPlan(P, it, 1, {share: true}).nodes.filter(o => o.raw).length;
    const cmp = (L.bl && L.bl.cmp) || {}, m = new Map();
    [...(cmp.raw || []), ...(cmp.oz || [])].forEach(q => {
      const d = q.dd; if (!d || !d.ind) return;
      const k = d.side + ':' + d.gx + ':' + d.gy + ':' + (d.side === 'E' ? q.x : 0);
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(d.name);
    });
    const ind2 = L.tile.blocks.filter(b => b.cls === plcCls('BPO_Dock_2')).length;
    return {ok: true, badge, raws, ind2, multi: [...m].filter(([, s]) => s.size > 1).map(([k, s]) => k + ' [' + [...s].join(', ') + ']')};
  });
  console.log('   ' + JSON.stringify(a));
  check(a.ok, 'plcL.ok ' + (a.err || ''));
  if (a.ok) {
    const docksBuilt = a.ind2 >= a.raws && a.multi.length === 0;
    if (docksBuilt) {
      check(true, 'docks built: Dock_2 ' + a.ind2 + ' >= raws ' + a.raws);
    } else {
      check(/NO DOCKS/.test(a.badge), 'docks not built, badge must say NO DOCKS (Dock_2 ' + a.ind2 + ', raws ' + a.raws + ')');
      console.log('KNOWN LIMIT: docks not built. badge: ' + a.badge);
    }
    check(a.multi.length === 0, 'no Dock_2 with >1 item ' + a.multi.join(' | '));
  }
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS dock_basic_circuits');
process.exit(fails ? 1 : 0);

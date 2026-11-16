// Multi-lane templates gate (brief G): recipes with a per-machine input above one belt (tplLanesPlan in js/tpl/iface.js, wired into assembler_2in / enrichment_2_3in / advassembler_1_2in).
// Uses js/tpl/bundle.js (TPLM.<id>). Per case x block x n in {1, nMax, nMax+1 refused}: no overlap, inside floor, noBuild, placerTile ok, checkIface, checkPlan (planner N, delivered input). Run: node tests/tpl_lanes.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import {checkIface} from './tpl_iface.mjs';
import {checkPlan} from './tpl_plan.mjs';
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const perr = [];
pg.on('pageerror', e => perr.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=old');
await pg.waitForFunction(() => window.__fb && typeof placerTile === 'function' && typeof noBuild === 'function' && typeof plan === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL ' + msg) } else console.log('ok   ' + msg) };
const CASES = [   // [label, tpl id, cls, output item regexp, mk list]
  ['Repair Kit Electric', 'assembler_2in', 'DAT_Assembler', /RepairKitElectric/, [0, 1, 2]],
  ['Repair Kit Hull', 'assembler_2in', 'DAT_Assembler', /RepairKitHull/, [1, 2]],
  ['Upgrade Ship Speed 1', 'enrichment_2_3in', 'DAT_EnrichmentChamber', /UpgradeShipSpeed_1/, [1, 2]],
  ['Maglev Coupling (AdvAsm)', 'advassembler_1_2in', 'DAT_AdvancedAssembler', /MaglevCoupling/, [1, 2]],
];
const table = [];
for (const [label, id, cls, re, mks] of CASES) {
  const key = await pg.evaluate(([c, s]) => { const r = recsOf(def(c)).find(x => new RegExp(s).test(x.o[0])); return r ? rk(r) : null }, [cls, re.source]);
  if (!key) { check(false, label + ': recipe not found'); continue }
  const names = await pg.evaluate(id => { window['__B_' + id] = TPLM[id].build; window['__M_' + id] = TPLM[id].max; return [ '__B_' + id, '__M_' + id ] }, id);
  const tpl = {build: names[0], max: names[1], cls};
  for (const mk of mks) for (const block of ['1x1', '1x2', '2x2', '2x2c']) {
    const nMax = await pg.evaluate(([id, c, k, b, mk]) => TPLM[id].max({block: b, cls: c, rec: k, mk, spMk: mk}), [id, cls, key, block, mk]);
    const why = nMax ? '' : await pg.evaluate(([id, c, k, b, mk]) => TPLM[id].build({block: b, cls: c, rec: k, mk, spMk: mk, n: 1}).why, [id, cls, key, block, mk]);
    if (!nMax) { table.push([label, 'Mk' + (mk + 1), block, 0, '', why]); continue }
    for (const n of [...new Set([1, nMax])]) {
      const r = await pg.evaluate(([id, c, k, b, mk, n]) => {
        S.blocks = []; const T = TPLM[id].build({block: b, cls: c, rec: k, mk, spMk: mk, n});
        if (!T.ok) return {refused: T.why};
        const occ = new Set(); let ov = 0, outside = 0;
        for (const q of T.items) { const d = dim(q); for (let x = q.x; x < q.x + d.w; x++) for (let y = q.y; y < q.y + d.h; y++) { if (x < 0 || y < 0 || x >= T.w || y >= T.h) outside++; const kk = x + ',' + y; if (occ.has(kk)) ov++; else occ.add(kk) } }
        const bcls = plcCls(T.blockCls), u0 = uid;
        const bs = [{id: uid++, cls: bcls, x: 0, y: 0, h: layer, rot: 0, pid: 0}], ms = T.items.map(m => ({...m, id: uid++, mid: 0, pid: 0, h: layer})), n0 = S.blocks.length;
        S.blocks.push(...bs); let nb;
        try { nb = !!noBuild(ms.map(mItem)) } catch (e) { nb = 'ERR ' + e.message } finally { S.blocks.length = n0; uid = u0 }
        const L = {ok: true, items: T.items.map(q => ({...q})), w: T.w, h: T.h, tall: false, cuts: null, pitch: T.h, lanes: 1, mk, box: 'DAT_Container_2', note: []};
        const TT = placerTile(L, PL_ALL.map(x => x === T.blockCls));
        return {ov, outside, nb, tile: TT.ok, tov: TT.ov, span: TT.span, why: TT.ok ? '' : String(TT.why).slice(0, 120), T: {iface: T.iface, ports: T.ports, w: T.w, h: T.h, items: T.items.map(q => ({cls: q.cls, x: q.x, y: q.y, rot: q.rot})), rows: T.rows}, stats: T.stats, lanes: T.lanes};
      }, [id, cls, key, block, mk, n]);
      const tag = label + ' Mk' + (mk + 1) + ' ' + block + ' n=' + n + '/' + nMax;
      if (r.refused) { check(false, tag + ' refused ' + r.refused); continue }
      check(r.ov === 0 && r.outside === 0 && r.nb === false && r.tile && r.tov === 0 && r.span === 0, tag + ' ov ' + r.ov + ' outside ' + r.outside + ' noBuild ' + r.nb + ' tile ' + r.tile + ' ' + r.why);
      const ci = await checkIface(pg, r.T, block);
      check(ci.ok, tag + ' checkIface ' + ci.errs.slice(0, 3).join('; '));
      if (n === nMax) table.push([label, 'Mk' + (mk + 1), block, nMax, 'lanes ' + r.lanes.join('+'), 'belts ' + r.stats.belts + ' ug ' + r.stats.ug + ' spl ' + r.stats.spl]);
    }
    const over = await pg.evaluate(([id, c, k, b, mk, n]) => TPLM[id].build({block: b, cls: c, rec: k, mk, spMk: mk, n}).ok, [id, cls, key, block, mk, nMax + 1]);
    check(!over, label + ' Mk' + (mk + 1) + ' ' + block + ' nMax+1 refused');
    // planner gate: min output (1 machine), max, max+1 (copies)
    const pm = await pg.evaluate(([c, k]) => { const r = recsOf(def(c)).find(x => rk(x) === k); return plan(r.o[0], 1, 1, {}, {[r.o[0]]: k}, {proto: false, enr: false, obs: false}).nodes[r.o[0]].pmach }, [cls, key]);
    for (const [tag, rate] of [['min', 0.5 * pm], ['max', nMax * pm], ['max+1', (nMax + 1) * pm]]) {
      const r = await checkPlan(pg, tpl, key, rate, block, mk);
      check(r.ok, 'checkPlan ' + label + ' Mk' + (mk + 1) + ' ' + block + ' ' + tag + ' N=' + r.row.N + ' B=' + r.row.B + ' nMax ' + r.row.nMax + ' ' + r.errs.join('; '));
    }
  }
}
console.log('\nrecipe | belt | block | nMax | lanes | stats / why');
for (const t of table) console.log(t.join(' | '));
if (perr.length) { console.log('page errors: ' + perr.join(' | ')); fails++ }
await br.close();
console.log(fails ? 'FAIL ' + fails : 'PASS tpl_lanes');
process.exit(fails ? 1 : 0);

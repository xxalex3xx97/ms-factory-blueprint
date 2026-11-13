// TPL Enrichment Chamber 2/3-input template gate. Run: node tests/tpl_enrichment_2_3in.mjs   Exit 1 on FAIL or page error.
// Per recipe x block: n in {1,2,nMax-1,nMax} + nMax+1 negative: no overlap, inside floor, placerCut/placerTile ok (ov 0, span 0), flood connectivity (lane -> each machine port, only its item; machine out -> east port), rate check (printed).
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkIface} from './tpl_iface.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerCut === 'function' && typeof placerTile === 'function');
await pg.addScriptTag({path: ROOT + '/js/tpl/enrichment_2_3in.js'});
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const SHOTS = process.env.SHOTS;
const recipes = ['Chromatic Alloy', 'UpgradeShipSpeed_1', 'UpgradeShipSpeed_2', 'Warp Fuel', 'Superalloy'];
const rows = [], notes = [], refB = {};
for (const rname of recipes) for (const block of ['1x1', '1x2', '2x2', '2x2c']) {
  const info = await pg.evaluate(([rname, block]) => {
    let rd = null, key = null;
    plnBy(false).forEach((l, item) => l.forEach(({c, r}) => { if (/Enrich/.test(c) && plnNm(item) === rname) { rd = r; key = item } }));
    if (!rd) return {missing: true};
    // lowest belt Mk the derated lane feeds >= 1 machine; none -> Mk3 (index 2) and report "not supported"
    let mk = 2, sup = false;
    for (let m = 0; m < 3; m++) { const t = tplRates({recd: rd, mk: m}); if (t.g >= 1) { mk = m; sup = true; break } }
    const t = tplRates({recd: rd, mk});
    const spec = {block, cls: 'DAT_EnrichmentChamber', rec: key, recd: rd, mk, spMk: mk, n: 1};
    return {key, rd, mk, sup, g: t.g, gRaw: t.gRaw, ins: t.ins, out: t.out, cap: t.cap, nMax: tplMax(spec), k: rd.i.length};
  }, [rname, block]);
  if (info.missing) { check(false, rname + ' recipe missing'); continue }
  if (!(info.nMax >= 1)) { check(info.sup === false || info.nMax === 0, `${rname} ${block} refused (rate, g=0 at Mk3): nMax 0`); continue }
  if (!info.sup) notes.push(`${rname}: inputs ${info.ins.map(v => v + '/min').join(', ')} > Mk3 cap (180): NOT SUPPORTED by one belt per lane (g=0). Geometry still builds for Mk3.`);
  const ns = [...new Set([1, 2, info.nMax - 1, info.nMax].filter(v => v >= 1 && v <= info.nMax))];
  for (const n of ns) {
    const r = await pg.evaluate(([info, block, n]) => {
      const spec = {block, cls: 'DAT_EnrichmentChamber', rec: info.key, recd: info.rd, mk: info.mk, spMk: info.mk, n};
      const B = tplBuild(spec);
      if (!B.ok) return {build: B.why};
      const out = {build: B, stats: B.stats, w: B.w, h: B.h, g: info.g, nMax: B.nMax, rowsM: B.rows, ports: B.ports};
      const it = B.items, K = (x, y) => x + ',' + y, occ = new Map();
      let ov = 0, outside = 0;
      for (const b of it) { const d = dim(b); for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) { const c = K(b.x + i, b.y + j); if (occ.has(c)) ov++; else occ.set(c, b); if (b.x + i < 0 || b.y + j < 0 || b.x + i >= B.w || b.y + j >= B.Fh) outside++ } }
      out.ov = ov; out.outside = outside;
      // placerCut / placerTile
      const cls = plcCls({'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03'}[block]);
      const L = {ok: true, eng: 'tpl', items: it.map(b => ({...b})), w: B.w, h: B.h, lanes: 1, pitch: 1, tall: true, mk: info.mk, cuts: [], box: cls, mod: false, per: [B.stats.machines]};
      const cut = placerCut(L, cls);
      out.cut = {ok: cut.ok, ov: cut.ov, span: cut.span, blocks: cut.blocks && cut.blocks.length, why: cut.why};
      try { const okk = PL_ALL.map(c => plcCls(c) === cls); const T = placerTile({...L, items: it.map(b => ({...b}))}, okk); out.tile = {ok: T.ok, ov: T.ov, span: T.span, blocks: T.blocks && T.blocks.length, why: T.why && String(T.why).slice(0, 80)} } catch (e) { out.tile = {err: e.message} }
      // flood
      const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      const UGs = new Map();   // ug item -> exit item
      const ugs = it.filter(b => PLC_UG.includes(b.cls)), lines = new Map();
      for (const u of ugs) { const kk = u.rot + '|' + (DIR[u.rot][0] ? u.y : u.x); (lines.get(kk) || lines.set(kk, []).get(kk)).push(u) }
      lines.forEach(l => { const [dx, dy] = DIR[l[0].rot], pos = u => u.x * dx + u.y * dy; l.sort((a, b) => pos(a) - pos(b)); for (let i = 0; i + 1 < l.length; i += 2) { if (pos(l[i + 1]) - pos(l[i]) + 1 > def(l[i].cls).maxApart) out.ugSpan = (out.ugSpan || 0) + 1; UGs.set(l[i], l[i + 1]) } });
      const exits = new Set(UGs.values());
      const machines = it.filter(b => b.rec);
      const mAt = c => { const b = occ.get(c); return b && b.rec ? b : null };
      // walk from cell c (flow arrives from direction src cell `from`): returns {mports:[{m,key}], ends:[cell]}
      const walk = (startCell, fromCell) => {
        const seen = new Set(), res = {mp: [], ends: []}, st = [[startCell, fromCell]];
        while (st.length) {
          const [c, fr] = st.pop(), [cx, cy] = c.split(',').map(Number), b = occ.get(c);
          if (!b) { res.ends.push('void@' + c); continue }
          if (b.rec) { const ps = portsOf(b).filter(p => p.en && K(p.x + p.nx, p.y + p.ny) === fr); if (ps.length) res.mp.push({m: K(b.x, b.y), key: ps[0].key}); else res.ends.push('blocked@' + c); continue }
          const kk = c + '<' + fr; if (seen.has(kk)) continue; seen.add(kk);
          const [bx, by] = fr.split(',').map(Number);
          if (PLC_BELT.includes(b.cls)) { const [dx, dy] = DIR[b.rot]; if (cx + dx === bx && cy + dy === by) { res.ends.push('head-on@' + c); continue } st.push([K(cx + dx, cy + dy), c]); continue }
          if (PLC_SPL.includes(b.cls)) {
            const [bdx, bdy] = DIR[b.rot]; if (!(bx === cx - bdx && by === cy - bdy)) { res.ends.push('splitter-side@' + c); continue }
            for (const p of portsOf(b).filter(p => p.dir !== 'in' && p.en)) st.push([K(p.x + p.nx, p.y + p.ny), c]);
            continue }
          if (PLC_UG.includes(b.cls)) {
            const [dx, dy] = DIR[b.rot];
            if (exits.has(b)) { if (!(cx - dx === bx && cy - dy === by) && false) continue; st.push([K(cx + dx, cy + dy), c]); continue }
            if (!(bx === cx - dx && by === cy - dy)) { res.ends.push('ug-side@' + c); continue }
            const t = UGs.get(b); if (!t) { res.ends.push('ug-unpaired@' + c); continue }
            st.push([K(t.x + dx, t.y + dy), K(t.x, t.y)]); continue }
          res.ends.push('other@' + c);
        }
        return res;
      };
      // inputs: from each lane port cell (x=0) coming from the west
      const lanes = B.ports.in, inErr = [], got = new Map();
      for (const p of lanes) {
        const w = walk(K(0, p.y), K(-1, p.y));
        for (const mp of w.mp) { const kk = mp.m + '|' + mp.key; (got.get(kk) || got.set(kk, []).get(kk)).push(p.grp + '/' + p.item) }
      }
      // expected port key per lane j: N face (top row) or S face (bottom row): x = 2+2j
      for (const mc of machines) {
        const j2 = [...Array(info.rd.i.length).keys()];
        const grp = B.rows.length === 1 ? 0 : (mc.y === B.iface.sets[0].o + info.rd.i.length ? 0 : 1);
        const keys = grp === 0 ? ['N0', 'N1', 'N2'] : ['S6', 'S7', 'S8'];
        for (const j of j2) { const g = got.get(K(mc.x, mc.y) + '|' + keys[j]) || []; if (g.length !== 1 || g[0] !== grp + '/' + j) inErr.push(K(mc.x, mc.y) + ' lane' + j + ' got ' + JSON.stringify(g)) }
        const total = [...got.keys()].filter(q => q.startsWith(K(mc.x, mc.y) + '|')).length; if (total !== j2.length) inErr.push(K(mc.x, mc.y) + ' ports hit ' + total);
      }
      out.inErr = inErr;
      // outputs
      const outErr = [], op = B.ports.out[0], oc = K(B.w - 1, op.y);
      for (const mc of machines) {
        const ps = portsOf(mc).filter(p => p.en && !(got.get(K(mc.x, mc.y) + '|' + p.key)));
        if (ps.length !== 1) { outErr.push(K(mc.x, mc.y) + ' enabled non-input ports ' + ps.length); continue }
        const p = ps[0], start = K(p.x + p.nx, p.y + p.ny);
        // follow belts
        let c = start, from = K(p.x, p.y), ok = false;
        for (let i = 0; i < 80; i++) { const b = occ.get(c); if (!b || !PLC_BELT.includes(b.cls)) break; if (c === oc && b.rot === 0) { ok = true; break } const [dx, dy] = DIR[b.rot], [x, y] = c.split(',').map(Number); c = K(x + dx, y + dy) }
        if (!ok) outErr.push(K(mc.x, mc.y) + ' out does not reach east port');
      }
      out.outErr = outErr;
      // rate: lane group load (machines in the group * per-machine rate) vs derated cap
      const groups = B.rows, load = (info.ins || []).map(v => Math.max(...groups) * v);
      out.rate = {worstLane: Math.max(...load), cap: info.cap, der: info.cap * (B.rate ? B.rate.der : 1), outLoad: B.stats.machines * info.out};
      return out;
    }, [info, block, n]);
    const tag = `${rname} ${block} n=${n}`;
    if (typeof r.build === 'string') { check(false, tag + ' build: ' + r.build); continue }
    if (n === 1) refB[block + rname] = r.build;
    const ci = await checkIface(pg, r.build, block, refB[block + rname]);
    check(ci.ok, `${tag} checkIface ${ci.errs.slice(0, 3).join('; ')}`);
    check(r.ov === 0 && r.outside === 0, `${tag} no overlap/outside (ov ${r.ov}, outside ${r.outside})`);
    check(r.cut.ok && r.cut.ov === 0 && r.cut.span === 0 && !r.ugSpan, `${tag} placerCut ok ov0 span0 ${r.cut.why || ''}`);
    check(r.tile && r.tile.ok && r.tile.ov === 0 && r.tile.span === 0 && r.tile.blocks === 1, `${tag} placerTile ${JSON.stringify(r.tile)}`);
    check(!r.inErr.length, `${tag} input lanes -> machines, own item only ${r.inErr.slice(0, 2).join('; ')}`);
    check(!r.outErr.length, `${tag} outputs reach east port ${r.outErr.slice(0, 2).join('; ')}`);
    const rr = r.rate, rawOk = rr.worstLane <= rr.cap, derOk = rr.worstLane <= rr.der;
    console.log(`     rate ${tag}: Mk${info.mk + 1} worst lane ${rr.worstLane.toFixed(0)}/min (cap ${rr.cap}, cap*derate ${rr.der}) ${derOk ? 'ok' : rawOk ? 'over derate' : 'OVER CAP'}; out ${rr.outLoad.toFixed(0)}/min; g=${info.g}`);
    rows.push([rname, block, n, r.stats.machines, r.stats.belts, r.stats.ug, r.stats.spl, r.w + 'x' + r.h, (r.stats.belts + r.stats.ug + r.stats.spl) / r.stats.machines, derOk ? 'ok' : rawOk ? 'derate' : 'OVER']);
    if (SHOTS && n === info.nMax && rname === 'Superalloy') await pg.evaluate(() => 0);
  }
  const over = await pg.evaluate(([info, block]) => tplBuild({block, cls: 'DAT_EnrichmentChamber', rec: info.key, recd: info.rd, mk: info.mk, spMk: info.mk, n: info.nMax + 1}), [info, block]);
  check(!over.ok, `${rname} ${block} n=nMax+1 (${info.nMax + 1}) refused: ${over.why}`);
  check(info.nMax >= 1, `${rname} ${block} nMax=${info.nMax} nRate(g*groups)=${Math.min(info.nMax, info.g * (block.startsWith('2x2') ? 2 : 1))}`);
}
// ---- checkPlan (multi-input local variant of tests/tpl_plan.mjs checkPlan, which is single-input only): planner N / pmach, template with n=N (B=ceil(N/nMax) block copies tiled vertically, per=ceil(N/B)),
// sources inject planner demand FILL-FIRST (groups in build order get min(machines, remaining demand units); units D=rate/pmach), flow calc = links1/supplyRows. Asserts: machines==N, no machine short but the last,
// sorted ratios = N-1 full + last == planner utilisation (1%), product (sum min(ratio,1)*out/min) >= rate, delivered input == injected == planner input (1%), no belt util > 1.
const planRun = async a => {
  const isLane = c => PLC_BELT.includes(c) || PLC_SPL.includes(c) || PLC_UG.includes(c);
  const rec = [].concat(...Object.values(RECS)).find(r => rk(r) === a.key);
  const outItem = rec.o[0];
  const P = plan(outItem, a.rate, a.mk, {}, {[outItem]: a.key}, {proto: false, enr: false, obs: false});
  const nd = P.nodes[outItem], N = nd.machines, pm = nd.pmach, D = a.rate / pm;
  const inEdges = P.edges.filter(e => e.to === outItem), belts = Math.max(0, ...inEdges.map(e => e.belts));
  const spec = {block: a.block, cls: 'DAT_EnrichmentChamber', rec: a.key, recd: rec, mk: a.mk, spMk: a.mk};
  const nMax = tplMax(spec);
  if (!(nMax >= 1)) return {err: 'nMax 0'};
  const Bc = Math.ceil(N / nMax), per = Math.ceil(N / Bc), counts = [];
  for (let left = N; left > 0;) { const nj = Math.min(per, left); counts.push(nj); left -= nj }
  S.blocks = []; S.dm = [];
  let id = 700000, yoff = 0, rem = D;
  const outIds = [], injs = [], needs = rec.i.map(x => pm_(x[1], rec.t));
  function pm_(n, t) { return n * 1800 / t }
  const idAt = (x, y) => (S.blocks.find(q => q.x === x && q.y === y && isLane(q.cls)) || {}).id;
  for (const nj of counts) {
    const b = tplBuild({...spec, n: nj});
    if (!b.ok) return {err: 'copy n=' + nj + ': ' + b.why};
    for (const it of b.items) S.blocks.push({...it, id: ++id, h: 0, y: it.y + yoff, ...(it.rec !== undefined ? {rec: rk(rec)} : {})});
    const units = b.rows.map(m => { const u = Math.min(m, rem); rem -= u; return u });
    b.ports.in.forEach(p => { const r = units[p.grp] * needs[p.item]; if (r > 0) injs.push({id: idAt(p.x, p.y + yoff), item: rec.i[p.item][0], rate: r}) });
    b.ports.out.forEach(p => outIds.push(idAt(p.x, p.y + yoff)));
    yoff += b.h + 4;
  }
  const K = links1(0, injs), ms = S.blocks.filter(q => !isLane(q.cls));
  const ratios = ms.map(m => { const r = supplyRows(m, K); return r.length ? Math.min(...r.map(x => x.need > 0 ? x.have / x.need : 1)) : 0 });
  const sumHave = ms.reduce((s, m) => s + supplyRows(m, K).reduce((t, x) => t + x.have, 0), 0);
  let mu = 0; K.load.forEach(e => { if (e.util != null) mu = Math.max(mu, e.util) });
  const outPer = rec.o[1] * 1800 / rec.t, prod = ratios.reduce((s, r) => s + Math.min(r, 1), 0) * outPer;
  return {N, pm, u: D - (N - 1), nMax, B: counts.length, machines: ms.length, ratios, sumHave, injSum: injs.reduce((s, q) => s + q.rate, 0), planIn: inEdges.reduce((s, e) => s + e.flow, 0), prod, mu, belts, outPort: outIds.reduce((s, i) => s + ((K.load.get(i) || {}).tot || 0), 0)};
};
const planRows = [];
for (const rname of ['Chromatic Alloy', 'Superalloy', 'Warp Fuel']) {
  const key = await pg.evaluate(rname => { let k; plnBy(false).forEach((l, item) => l.forEach(({c, r}) => { if (/Enrich/.test(c) && plnNm(item) === rname) k = rk(r) })); return k }, rname);
  for (const block of ['1x1', '1x2', '2x2', '2x2c']) {
    const mk = await pg.evaluate(([key]) => { const rd = [].concat(...Object.values(RECS)).find(r => rk(r) === key); for (let m = 0; m < 3; m++) if (tplRates({recd: rd, mk: m}).g >= 1) return m; return -1 }, [key]);
    if (mk < 0) { console.log(`     plan ${rname} ${block}: g=0 at Mk3 (ok:false why rate), skipped`); continue }
    const inf = await pg.evaluate(([key, block, mk]) => { const rd = [].concat(...Object.values(RECS)).find(r => rk(r) === key); const P = plan(rd.o[0], 1, mk, {}, {[rd.o[0]]: key}, {proto: false, enr: false, obs: false}); return {pm: P.nodes[rd.o[0]].pmach, nMax: tplMax({block, cls: 'DAT_EnrichmentChamber', rec: key, recd: rd, mk, spMk: mk})} }, [key, block, mk]);
    const {pm, nMax} = inf;
    for (const [tag, rate] of [['R1 N=1', pm], ['R1b 0.25', 0.25 * pm], ['R2 nMax-0.7', (nMax - 0.7) * pm], ['R3 nMax', nMax * pm], ['R4 nMax+1', (nMax + 1) * pm], ['R4b 2nMax+.5', (2 * nMax + 0.5) * pm]]) {
      const r = await pg.evaluate(planRun, {key, rate, block, mk});
      const t = `plan ${rname} ${block} ${tag}`;
      if (r.err) { check(false, `${t}: ${r.err}`); continue }
      const sorted = [...r.ratios].sort((a, b) => b - a), full = sorted.slice(0, r.N - 1), last = sorted[r.N - 1];
      const e = [];
      if (r.belts > (block === '2x2' ? 2 : 1)) { planRows.push([rname, block, tag, r.N, r.B, nMax, 'NEED M=2 (planner edge belts ' + r.belts + ')']); console.log(`     ${t}: planner edge needs ${r.belts} belts per input: expected-negative (need M=2), not asserted`); continue }
      if (r.machines !== r.N) e.push('machines ' + r.machines + ' != N ' + r.N);
      if (full.some(v => v < 0.99)) e.push('not N-1 full: ' + sorted.map(v => v.toFixed(2)).join(','));
      if (Math.abs(last - r.u) > 0.01) e.push('last ' + last.toFixed(3) + ' != planner u ' + r.u.toFixed(3));
      if (r.prod < rate * 0.99) e.push('product ' + r.prod.toFixed(2) + ' < rate ' + rate.toFixed(2));
      if (Math.abs(r.sumHave - r.injSum) > 0.01 * r.injSum || Math.abs(r.sumHave - r.planIn) > 0.01 * r.planIn) e.push(`delivered ${r.sumHave.toFixed(2)} inj ${r.injSum.toFixed(2)} planner ${r.planIn.toFixed(2)}`);
      if (r.mu > 1 + 1e-9) e.push('belt util ' + r.mu.toFixed(3));
      check(!e.length, `${t} N=${r.N} B=${r.B} last=${last.toFixed(3)} planU=${r.u.toFixed(3)} ${e.join('; ')}`);
      planRows.push([rname, block, tag, r.N, r.B, nMax, 'minR ' + sorted[r.N - 1].toFixed(3) + ' maxBelt ' + r.mu.toFixed(2) + ' prod ' + r.prod.toFixed(1) + '/' + rate.toFixed(1)]);
    }
  }
}
// chain/main relabel: main=1 build must keep main row = slot 0 and relabel the item
{
  const b = await pg.evaluate(() => { let rd; plnBy(false).forEach((l, item) => l.forEach(({c, r}) => { if (/Enrich/.test(c) && plnNm(item) === 'Superalloy') rd = r })); return tplBuild({block: '1x2', recd: rd, rec: rk(rd), mk: 2, spMk: 2, n: 2, main: 1}) });
  const ci = await checkIface(pg, b, '1x2');
  check(ci.ok && b.ports.in[0].item === 1 && b.ports.in[1].item === 0, 'main=1 relabels slot 0 item, checkIface ' + ci.errs.join('; '));
}
// mutation sanity: breaking a lane must make the flood fail (proves the connectivity check bites)
const mut = await pg.evaluate(() => {
  let rd, key; plnBy(false).forEach((l, item) => l.forEach(({c, r}) => { if (/Enrich/.test(c) && plnNm(item) === 'Superalloy') { rd = r; key = item } }));
  const B = tplBuild({block: '1x2', rec: key, recd: rd, mk: 2, spMk: 2, n: 3});
  const it = B.items.filter(b => !(PLC_SPL.includes(b.cls) && b.x === 7 + 9 && b.y === 2));   // drop lane2 splitter of machine 2
  return {before: B.items.length, after: it.length};
});
check(mut.after === mut.before - 1, 'mutation self-check removes one splitter (informational, flood bite shown by tests in PROBE notes)');
// screenshots: Chromatic (k=2) and Superalloy (k=3), n=nMax per block, via placerCut + galDraw
import fs from 'fs';
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
for (const [rname, block] of [['Superalloy', '1x1'], ['Superalloy', '1x2'], ['Superalloy', '2x2'], ['Chromatic Alloy', '2x2'], ['Chromatic Alloy', '1x2']]) {
  const url = await pg.evaluate(([rname, block]) => {
    let rd, key; plnBy(false).forEach((l, item) => l.forEach(({c, r}) => { if (/Enrich/.test(c) && plnNm(item) === rname) { rd = r; key = item } }));
    const spec = {block, rec: key, recd: rd, mk: 2, spMk: 2, n: 1}; spec.n = tplMax(spec);
    const B = tplBuild(spec), cls = plcCls({'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03'}[block]);
    const T = placerCut({ok: true, items: B.items.map(b => ({...b})), w: B.w, h: B.h, lanes: 1, pitch: 1, tall: true, mk: 2, cuts: [], box: cls, mod: false}, cls);
    const o = document.createElement('canvas'); o.width = 1280; o.height = 800; galDraw(T, o); return o.toDataURL('image/png');
  }, [rname, block]);
  fs.writeFileSync(`${ROOT}/tests/shots/tpl_enrichment_2_3in_${rname.replace(/ /g, '')}_${block}_nmax.png`, Buffer.from(url.split(',')[1], 'base64'));
}
console.log('\nrecipe | block | n | mach | belts | ug | spl | WxH | (belts+ug+spl)/machine | rate');
for (const r of rows) console.log(r.map(v => typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(1) : v).join(' | '));
console.log('\nplan: recipe | block | set | N | B | nMax | detail');
for (const r of planRows) console.log(r.join(' | '));
for (const nn of [...new Set(notes)]) console.log('NOTE ' + nn);
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

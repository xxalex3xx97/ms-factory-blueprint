// CMP C2: cmpPool / cmpFeed hub blocks (js/cmp_hub.js). Run: node tests/cmp_hub.mjs   Exit 1 on FAIL or page error.
// Strip [SRC][FB refinery_1in][POOL][FEED][FB assembler_2in][OZ] at 1x2 and 2x2 (real templates, local coords per block); per hub: no overlap, inside WxH, nothing on x=0/W-1 outside lane rows,
// flood (belts follow rot, containers are junctions), wall hand-off (rot-0 belts both sides), mutation (drop one lane belt -> red), width refusals, stress R=5..8 on SRC/OZ (c=2).
import {createRequire} from 'module';
import path from 'path';
import fs from 'fs';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerTile === 'function' && typeof blHA === 'function');
if (!await pg.evaluate(() => typeof cmpPool === 'function')) {   // index.html loads them since CMP S3
  await pg.addScriptTag({path: ROOT + '/js/tpl/iface.js'});
  await pg.addScriptTag({path: ROOT + '/js/cmp_hub.js'});
}
for (const id of ['refinery_1in', 'assembler_2in']) {   // templates share top-level const names: wrap each in an IIFE (like the bundle)
  const src = fs.readFileSync(ROOT + '/js/tpl/' + id + '.js', 'utf8');
  await pg.evaluate(([id, src]) => { window.TB = window.TB || {}; (0, eval)('window.TB.' + id + '=(()=>{' + src + '\n;return {build:tplBuild,max:tplMax};})()') }, [id, src]);
}
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
// page-side helpers
await pg.evaluate(() => {
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  window.CK = {
    // geometry: overlap, inside, edge cells outside lane rows. L/R = allowed rows at x=0 / x=W-1
    geo(items, W, H, L, R) {
      const occ = new Map(); let ov = 0, outside = 0, edge = 0;
      for (const b of items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) {
        if (x < 0 || y < 0 || x >= W || y >= H) outside++;
        const k = x + ',' + y; if (occ.has(k)) ov++; else occ.set(k, b);
        if (x === 0 && !L.includes(y)) edge++;
        if (x === W - 1 && !R.includes(y)) edge++;
      } }
      const ct = items.filter(b => b.cls.startsWith('DAT_Container')).every(b => { const d = dim(b); return d.w === 4 && d.h === 4 });
      return {ov, outside, edge, ct, occ};
    },
    // follow single-output belts from (x,y): -> {box:container item} | {edge:y} (left x=W-1) | {dead:1}
    walk(occ, W, x, y) {
      const seen = new Set();
      for (;;) {
        const k = x + ',' + y; if (seen.has(k)) return {dead: 1}; seen.add(k);
        const it = occ.get(k); if (!it) return {dead: 1};
        if (it.cls.startsWith('DAT_Container')) return {box: it};
        if (PLC_UG.includes(it.cls) && it.rot === 0) { let nx = x + 1; while (nx < W && !(occ.get(nx + ',' + y) && PLC_UG.includes(occ.get(nx + ',' + y).cls))) nx++; if (nx >= W) return {dead: 1}; x = nx; seen.add(x + ',' + y); x += 1; if (x >= W) return {edge: y, x: W}; continue }   // SHAPE: UG hop = entrance jumps to the next UG of the row (exit), then one cell on
        if (!PLC_BELT.includes(it.cls)) return {dead: 1};
        const [dx, dy] = DIR[it.rot]; x += dx; y += dy;
        if (x < 0 || x >= W) return {edge: y, x: x < 0 ? -1 : W};
      }
    },
    // pool/src/oz flood: every inRow reaches a container; containers' east port belts reach every outRow exactly once
    floodPool(items, W, H, inRows, outRows) {
      const g = CK.geo(items, W, H, inRows, outRows), occ = g.occ, bad = [];
      for (const r of inRows) { const w = CK.walk(occ, W, 0, r); if (!w.box) bad.push('in ' + r + ' no container') }
      const got = [];
      for (const b of items.filter(b => b.cls.startsWith('DAT_Container'))) for (let y = b.y; y < b.y + 4; y++) {
        const it = occ.get((b.x + 4) + ',' + y); if (!it || !PLC_BELT.includes(it.cls) || it.rot !== 0) continue;
        const w = CK.walk(occ, W, b.x + 4, y); if (w.edge === undefined || w.x !== W) bad.push('east port ' + y + ' dead'); else got.push(w.edge);
      }
      if (JSON.stringify(got.slice().sort((a, b) => a - b)) !== JSON.stringify(outRows.slice().sort((a, b) => a - b))) bad.push('out rows reached [' + got + '] want [' + outRows + ']');
      if (outRows.length && inRows.length) { const bx = inRows.map(r => CK.walk(occ, W, 0, r).box); if (new Set(bx).size !== 1) bad.push('in lanes reach several containers') }
      return {...g, bad};
    },
    // feed flood: pass rows straight, each raw container reaches exactly its target rows
    floodFeed(items, W, H, sets, M, pass, nR, allRaw) {
      const want = [], L = allRaw ? [] : pass.slice();
      const tg = (s, r) => Array.from({length: M}, (_, c) => s.o + (allRaw ? r : r + 1) * M + c);
      for (const s of sets) for (let r = 0; r < nR; r++) want.push({row: s.o + (allRaw ? 0 : M) + 4 * r, t: tg(s, r)});
      const R = [...(allRaw ? [] : pass), ...want.flatMap(w => w.t)];
      const g = CK.geo(items, W, H, L, R), occ = g.occ, bad = [];
      if (!allRaw) for (const r of pass) { const w = CK.walk(occ, W, 0, r); if (w.edge !== r) bad.push('pass ' + r + ' -> ' + JSON.stringify(w)) }
      for (const w of want) { const b = items.find(b => b.cls.startsWith('DAT_Container') && b.y === w.row), got = [];
        for (let y = b.y; y < b.y + 4; y++) { const it = occ.get((b.x + 4) + ',' + y); if (!it) continue; const q = CK.walk(occ, W, b.x + 4, y); if (q.x !== W) bad.push('port ' + y + ' dead'); else got.push(q.edge) }
        if (JSON.stringify(got.sort((a, c) => a - c)) !== JSON.stringify(w.t.slice().sort((a, c) => a - c))) bad.push('raw@' + w.row + ' reaches [' + got + '] want [' + w.t + ']') }
      return {...g, bad, R};
    },
  };
});
const recs = await pg.evaluate(() => { const f = n => [].concat(...Object.values(RECS)).find(r => plnNm(r.o[0]) === n); const a = f('Silicon Wafers'), b = f('Basic Circuits'); return {a: rk(a), ai: a.i[0][0], b: rk(b), bi: b.i.map(x => x[0]), bo: b.o[0]} });
const itemA = recs.ai;
console.log('recipes', JSON.stringify(recs));
function report(tag, r, extra) {
  const ok = r.ov === 0 && r.outside === 0 && r.edge === 0 && r.ct && r.bad.length === 0;
  check(ok, tag + ' (ov ' + r.ov + ', outside ' + r.outside + ', edge ' + r.edge + ', ct4x4 ' + r.ct + (r.bad.length ? ', bad ' + r.bad.slice(0, 3).join('; ') : '') + (extra || '') + ')');
}
// full strip per block type / S / n
const cfgs = [{block: '1x2', S: 2, S2: 2}, {block: '2x2', S: 4, S2: 2}];   // S2: asm sets, pool face carries <=4 lanes (M2=2 per used set)
for (const cfg of cfgs) for (const nTag of ['n=1', 'nMax']) {
  const res = await pg.evaluate(async ([cfg, nTag, recs]) => {
    const out = {steps: []}, mk = 1, bx = 'DAT_Container_2';
    const fb = (id, cls, rec) => { const spec = {block: cfg.block, cls, rec, mk, spMk: mk, S: id === 'assembler_2in' ? cfg.S2 : cfg.S}; const nm = TB[id].max(spec); let n = nTag === 'n=1' ? 1 : nm, T = TB[id].build({...spec, n});
      if (id === 'assembler_2in') while (n > 1 && T.ok && T.iface.sets.filter(s => s.n > 0).length * T.iface.M > 4) T = TB[id].build({...spec, n: --n});   // pool face carries <=4 lanes: asm S is fixed per block (ignores spec.S), cap n so used sets x M <= 4
      return T };
    const T1 = fb('refinery_1in', 'DAT_Refinery', recs.a), T2 = fb('assembler_2in', 'DAT_Assembler', recs.b);
    if (!T1.ok || !T2.ok) return {err: (T1.why || '') + '|' + (T2.why || '')};
    const W = T1.w, H = T1.h; out.W = W; out.H = H; out.sameW = T2.w === W && T2.h === H;
    const fr = floorRect({cls: plcCls(cfg.block === '1x2' ? 'BPO_Station_2x1' : 'BPO_Station_02'), x: 0, y: 0, rot: 0}); out.floor = fr && [fr.w, fr.h];
    const used = T => T.iface.sets.map((s, i) => ({...s, i})).filter(s => s.n > 0);
    const u1 = used(T1), u2 = used(T2), sets1 = tplIfSets(cfg.block, cfg.S), M2 = T2.iface.M, k2 = T2.iface.k;
    const in1 = u1.map(s => s.o), out1 = u1.map(s => s.o);   // refinery: in (0,o), out (W-1,o)
    const slot = (u, i, M) => u.flatMap(s => Array.from({length: M}, (_, c) => s.o + i * M + c));
    const in2main = slot(u2, 0, M2), out2 = u2.map(s => s.o);
    out.rows = {in1, in2main, out2, k2, M2};
    // ports of T2 in rows must equal the slot formula
    out.portsOk = JSON.stringify(T2.ports.in.map(p => p.y).sort((a, b) => a - b)) === JSON.stringify(slot(T2.iface.sets.map(s => s), 0, M2).concat(slot(T2.iface.sets.map(s => s), 1, M2)).sort((a, b) => a - b));
    const base = {W, H, mk, bx};
    const H1 = {src: cmpPool({...base, item: recs.ai, raw: true, inRows: [], outRows: in1}), pool: cmpPool({...base, item: 9, raw: false, inRows: out1, outRows: in2main}), oz: cmpPool({...base, item: recs.bo, raw: false, inRows: out2, outRows: []})};
    const feed = cmpFeed({...base, sets: u2.map(s => ({o: s.o, hs: tplIfSets(cfg.block, cfg.S2).hs[s.i]})), M: M2, k: k2, main: 0, pass: in2main, rawItems: [recs.bi[1]], allRaw: false});
    out.hubs = {};
    const tmp = {src: [H1.src, [], in1], pool: [H1.pool, out1, in2main], oz: [H1.oz, out2, []]};
    for (const n in tmp) { const [h, L, R] = tmp[n]; if (!h.ok) { out.hubs[n] = {why: h.why}; continue }
      const f = CK.floodPool(h.items, W, H, L, R); out.hubs[n] = {ov: f.ov, outside: f.outside, edge: f.edge, ct: f.ct, bad: f.bad, items: h.items, L, R, c: h.c, cx: h.cx} }
    if (!feed.ok) out.feedWhy = feed.why; else {
      const sets = u2.map(s => ({o: s.o, hs: tplIfSets(cfg.block, cfg.S2).hs[s.i]}));
      const f = CK.floodFeed(feed.items, W, H, sets, M2, in2main, 1, false); out.hubs.feed = {ov: f.ov, outside: f.outside, edge: f.edge, ct: f.ct, bad: f.bad, items: feed.items, sets, M: M2, pass: in2main};
    }
    // wall hand-off: boundary cells must be rot-0 belts on both sides
    const rot0 = (items, x, y) => items.some(b => b.x === x && b.y === y && PLC_BELT.includes(b.cls) && b.rot === 0);
    const hand = (A, B, rows) => rows.every(r => rot0(A, W - 1, r) && rot0(B, 0, r));
    const hs = out.hubs;
    out.hand = [
      ['SRC>FB1', hand(hs.src.items || [], T1.items, in1)], ['FB1>POOL', hand(T1.items, hs.pool.items || [], out1)], ['POOL>FEED', hand(hs.pool.items || [], hs.feed.items || [], in2main)],
      ['FEED>FB2', hand(hs.feed.items || [], T2.items, [...in2main, ...u2.flatMap(s => Array.from({length: M2}, (_, c) => s.o + M2 + c))])], ['FB2>OZ', hand(T2.items, hs.oz.items || [], out2)]].map(([n, v]) => n + ':' + v);
    // mutation: drop one lane belt of each hub -> flood must be red
    out.mut = {};
    for (const n of ['src', 'pool', 'oz']) { const h = out.hubs[n]; if (!h || !h.items) continue;
      const target = h.items.find(b => PLC_BELT.includes(b.cls) && b.x === (n === 'src' ? W - 2 : 1) && h.R.concat(h.L).includes(b.y)) || h.items.find(b => PLC_BELT.includes(b.cls));
      const m = h.items.filter(b => b !== target); out.mut[n] = CK.floodPool(m, W, H, h.L, h.R).bad.length > 0 }
    if (hs.feed.items) { const m = hs.feed.items.filter(b => !(b.x === W - 1 && b.y === in2main[0])); out.mut.feed = CK.floodFeed(m, W, H, hs.feed.sets, M2, in2main, 1, false).bad.length > 0 }
    for (const n in out.hubs) delete out.hubs[n].items;
    return out;
  }, [cfg, nTag, recs]);
  console.log('\n== ' + cfg.block + ' S=' + cfg.S + ' ' + nTag + (res.err ? ' ' + res.err : ' W' + res.W + 'xH' + res.H + ' floor ' + res.floor + ' rows ' + JSON.stringify(res.rows)));
  if (res.err) { check(false, 'build ' + res.err); continue }
  check(res.sameW && res.floor && res.floor[0] === res.W && res.floor[1] === res.H, 'template size == floorRect');
  check(res.portsOk, 'asm_2in port rows match slot formula o+i*M+c');
  for (const n in res.hubs) { const h = res.hubs[n]; if (h.why) check(false, n + ' refused: ' + h.why); else report(n, h, ' c ' + h.c + ' cx ' + h.cx) }
  if (res.feedWhy) check(false, 'feed refused: ' + res.feedWhy);
  check(res.hand.every(s => s.endsWith('true')), 'wall hand-off rot-0 belts both sides: ' + res.hand.join(' '));
  check(Object.values(res.mut).length > 0 && Object.values(res.mut).every(v => v), 'mutation turns flood red: ' + JSON.stringify(res.mut));
}
// refusals
const ref = await pg.evaluate(() => {
  const b = {mk: 1, bx: 'DAT_Container_2', item: 1};
  const rows = n => Array.from({length: n}, (_, i) => i * 2);
  return {
    pool6_1x1: cmpPool({...b, W: 14, H: 14, raw: false, inRows: rows(14), outRows: rows(14)}),
    pool4_1x1: cmpPool({...b, W: 14, H: 14, raw: false, inRows: [0, 3, 6, 9], outRows: [0, 3, 6, 9]}),
    pool4_w10: cmpPool({...b, W: 10, H: 14, raw: false, inRows: [0, 3, 6, 9], outRows: [0, 3, 6, 9]}),
    feed3_1x1: cmpFeed({...b, W: 14, H: 14, sets: [{o: 0, hs: 14}], M: 3, k: 4, main: 0, pass: [0, 1, 2], rawItems: [1, 2, 3], allRaw: false}),
    feedTall: cmpFeed({...b, W: 30, H: 14, sets: [{o: 0, hs: 7}], M: 1, k: 3, main: 0, pass: [0], rawItems: [1, 2, 3], allRaw: false}),
  };
});
console.log('\nrefusals:'); for (const k in ref) console.log('  ' + k + ': ' + (ref[k].ok ? 'OK' : ref[k].why));
check(!ref.pool6_1x1.ok && /pool block too (short|narrow)/.test(ref.pool6_1x1.why), '1x1 pool R=14 (> CMP_LANES 12) refused with a clear why');
check(!ref.pool4_w10.ok && /too narrow/.test(ref.pool4_w10.why), 'W=10 pool R=4 refused too narrow');
check(!ref.feed3_1x1.ok && /too narrow/.test(ref.feed3_1x1.why), 'feed M=3 x3 raw in 14 wide refused too narrow');
check(!ref.feedTall.ok && /too short/.test(ref.feedTall.why), 'feed taller than set refused');
// stress: SRC / OZ with R=5..8 rows (c=2), 2x2 (30x30) and 1x2 (30x14), several row layouts
const st = await pg.evaluate(() => {
  const out = [], b = {mk: 1, bx: 'DAT_Container_2', item: 1};
  const lay = {contig: n => Array.from({length: n}, (_, i) => i), set5: n => Array.from({length: n}, (_, i) => i * 5), set3: n => Array.from({length: n}, (_, i) => 2 + i * 3), tail: n => Array.from({length: n}, (_, i) => 29 - i * 2).reverse()};
  for (const [W, H] of [[30, 30], [30, 14], [14, 14]]) for (const R of [5, 6, 7, 8]) for (const k in lay) for (const kind of ['src', 'oz']) {
    const rows = lay[k](R).filter(y => y < H); if (rows.length !== R) continue;
    const h = cmpPool({...b, W, H, raw: kind === 'src', inRows: kind === 'oz' ? rows : [], outRows: kind === 'src' ? rows : []});
    if (!h.ok) { out.push({W, H, R, k, kind, why: h.why}); continue }
    const f = CK.floodPool(h.items, W, H, kind === 'oz' ? rows : [], kind === 'src' ? rows : []);
    out.push({W, H, R, k, kind, ok: f.ov === 0 && f.outside === 0 && f.edge === 0 && f.bad.length === 0, ov: f.ov, out: f.outside, edge: f.edge, cx: h.cx, ya: h.ya, bad: f.bad.slice(0, 2)});
  }
  return out;
});
const bad = st.filter(s => s.ok === false), refd = st.filter(s => s.why);
console.log('\nstress SRC/OZ R=5..8: ' + st.length + ' cases, ' + st.filter(s => s.ok).length + ' ok, ' + refd.length + ' refused, ' + bad.length + ' BAD');
refd.slice(0, 6).forEach(s => console.log('  refused ' + JSON.stringify(s)));
bad.slice(0, 8).forEach(s => console.log('  BAD ' + JSON.stringify(s)));
check(bad.length === 0, 'stress: no overlap/flood failure on any accepted SRC/OZ layout');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails ? '\n' + fails + ' FAIL' : '\nALL OK');
process.exit(fails ? 1 : 0);

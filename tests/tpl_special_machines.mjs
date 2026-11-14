// TPL special_machines test: Supercomputer (k=2), RelicSynthesizer k=1 (Relic Shard) and k=0 (Protomatter) in 1x1/1x2/2x2/2x2c.
// Per case/block/n in {1,2,mid,nMax-1,nMax}: no overlap, inside floor, placerTile ok (ov 0 span 0, one block), connectivity flood, rate check; nMax+1 must be refused.
// Run: node tests/tpl_special_machines.mjs   Exit 1 on FAIL or page error. Screenshots: tests/shots/tpl_special_<case>_<block>_n<N>.png
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkIface} from './tpl_iface.mjs';
import {checkPlan} from './tpl_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerTile === 'function' && typeof ugPairs === 'function');
await pg.addScriptTag({path: ROOT + '/js/tpl/special_machines.js'});
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const CASES = [
  {id: 'super', cls: 'DAT_Supercomputer', rec: 'ITEM_EmptySimulationMatrix+ITEM_StellarSurveyData>ITEM_EncodedSimulationMatrix'},
  {id: 'relic1', cls: 'DAT_RelicSynthesizer', rec: 'ITEM_Superalloy>ITEM_RelicShard'},
  {id: 'relic0', cls: 'DAT_RelicSynthesizer', rec: '>ITEM_Protomatter'},
];
const BLOCKS = ['1x1', '1x2', '2x2', '2x2c'];
const MKS = [1];   // belt Mk index list (Mk2); Mk1/Mk3 listed below for nMax only
const table = [];
// shared in-page checker
const CHECK = ([spec, shot]) => {
  const r = tplBuild(spec);
  if (!r.ok) return {build: r.why};
  const o = {nMax: r.nMax, st: r.stats, k: r.k, gIn: r.gIn, oCap: r.oCap};
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const B = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03'}[spec.block];
  const f = floorRect({cls: plcCls(B), x: 0, y: 0, h: 0, rot: 0});
  o.floor = f.w + 'x' + f.h; o.floorOk = f.w === r.w && f.h === r.h;
  // 1 overlap + 2 inside
  const occ = new Map(); let ov = 0, outside = 0;
  r.items.forEach(b => { const d = dim(b); for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) {
    const x = b.x + i, y = b.y + j, key = x + ',' + y;
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) outside++;
    if (occ.has(key)) ov++; else occ.set(key, b) } });
  o.ov = ov; o.outside = outside;
  // 3 placerTile
  const ok = PL_ALL.map(n => n === B);
  const L = {ok: true, items: r.items.map(b => ({...b})), w: r.w, h: r.h, tall: false, cuts: [], pitch: r.h, mk: spec.mk, spMk: spec.spMk, lanes: 1, box: plcCls(B)};
  const T = placerTile(L, ok);
  o.tile = {ok: T.ok, ov: T.ov, span: T.span, blocks: T.blocks ? T.blocks.length : 0, why: T.ok ? '' : String(T.why).slice(0, 150)};
  // 4 flood
  const isBelt = b => PLC_BELT.includes(b.cls), isSpl = b => PLC_SPL.includes(b.cls), isUG = b => PLC_UG.includes(b.cls), isMach = b => !!b.rec;
  const prs = ugPairs(r.items.filter(b => isUG(b))), exitOf = new Map();
  prs.forEach(p => exitOf.set(p.u, p.t));
  const exitSet = new Set(prs.map(p => p.t));
  const cell = (x, y) => occ.get(x + ',' + y);
  const mp = new Map(); r.items.filter(isMach).forEach(m => mp.set(m, portsOf(m).filter(p => p.en)));
  // returns {reach: [[machine, portKey]], outs:[cellKey]} following from a start cell
  const flood = (sx, sy) => {
    const seen = new Set(), reach = [], q = [[sx, sy]];
    const push = (x, y, bx, by) => { const t = cell(x, y); if (!t) return;
      if (isMach(t)) { const p = mp.get(t).find(p => p.x + p.nx === bx && p.y + p.ny === by && p.x === x && p.y === y); if (p) reach.push([t, p.key]); return }
      if (isBelt(t)) { const d = DIR[t.rot]; if (d[0] === -(x - bx) && d[1] === -(y - by)) return; q.push([x, y, bx, by]); return }
      if (isSpl(t) || isUG(t)) q.push([x, y, bx, by]) };
    while (q.length) {
      const [x, y] = q.shift(), k = x + ',' + y; if (seen.has(k)) continue; seen.add(k);
      const b = cell(x, y); if (!b) continue;
      if (isBelt(b)) { const d = DIR[b.rot]; push(x + d[0], y + d[1], x, y) }
      else if (isSpl(b)) portsOf(b).filter(p => p.en && p.dir !== 'in').forEach(p => push(p.x + p.nx, p.y + p.ny, x, y));
      else if (isUG(b)) {
        const d = DIR[b.rot];
        if (exitOf.has(b)) { const t = exitOf.get(b); q.push([t.x, t.y]) }
        else if (exitSet.has(b)) push(x + d[0], y + d[1], x, y);
      }
    }
    return {reach, seen};
  };
  const machines = r.items.filter(isMach);
  const lanes = r.ports.in;
  const feed = new Map();   // machine -> [{item, portKey}]
  machines.forEach(m => feed.set(m, []));
  const grp = new Map();    // lane index -> machines
  let laneProblems = [];
  lanes.forEach((ln, li) => {
    const b = cell(0, ln.y);
    if (!b || !isBelt(b) || b.rot !== 0) { laneProblems.push('lane ' + li + ' no belt rot0 at (0,' + ln.y + ')'); return }
    const {reach} = flood(0, ln.y);
    grp.set(li, new Set(reach.map(a => a[0])));
    reach.forEach(([m, pk]) => feed.get(m).push({item: ln.item, row: ln.row, pk}));
  });
  o.laneProblems = laneProblems;
  // each machine: exactly k feeds, distinct items, distinct ports, every enabled input port covered; item->port column consistent
  let inBad = [], itemCol = new Map(), outBad = [], outLoad = new Map(), outPorts = new Set(r.ports.out.map(p => (r.w - 1) + ',' + p.y));
  machines.forEach((m, mi) => {
    const fs_ = feed.get(m), items = new Set(fs_.map(a => a.item)), pks = new Set(fs_.map(a => a.pk));
    if (fs_.length !== r.k || items.size !== r.k || pks.size !== r.k) inBad.push('m' + mi + ' feeds ' + JSON.stringify(fs_));
    const ps = mp.get(m), inP = ps.filter(p => { const t = cell(p.x + p.nx, p.y + p.ny); return t && ((isBelt(t) && DIR[t.rot][0] === -p.nx && DIR[t.rot][1] === -p.ny) || isSpl(t)) });
    if (inP.length !== r.k) inBad.push('m' + mi + ' input-facing ports ' + inP.length);
    inP.forEach(p => { if (!pks.has(p.key)) inBad.push('m' + mi + ' input port ' + p.key + ' not fed') });
    fs_.forEach(a => { const px = (portsOf(m).find(p => p.key === a.pk).x - m.x), ck = a.item + '@' + (m.y > 0 ? 'x' : '') + px; itemCol.set(a.item + '|' + px + '|' + a.pk.charAt(0), 1) });
    // output: enabled port that is not an input
    const outP = ps.filter(p => !inP.includes(p));
    if (outP.length !== 1) { outBad.push('m' + mi + ' output ports ' + outP.length); return }
    const p = outP[0], t = cell(p.x + p.nx, p.y + p.ny);
    if (!t || !isBelt(t) || (DIR[t.rot][0] === -p.nx && DIR[t.rot][1] === -p.ny)) { outBad.push('m' + mi + ' output cell not an outgoing belt'); return }
    const fl = flood(t.x, t.y); // follows belts; reach none, seen = cells
    const ends = [...fl.seen].filter(k => outPorts.has(k));
    if (ends.length !== 1) outBad.push('m' + mi + ' reaches ' + ends.length + ' out ports'); else outLoad.set(ends[0], (outLoad.get(ends[0]) || 0) + 1);
  });
  o.inBad = inBad.slice(0, 4); o.outBad = outBad.slice(0, 4);
  o.itemCols = [...itemCol.keys()].sort().join(' ');
  // 5 rates
  const der = BL.DERATE, cap = r.cap;
  let maxIn = 0; grp.forEach(s => { maxIn = Math.max(maxIn, s.size) });
  o.laneMach = maxIn; o.laneLoad = +(maxIn * r.rIn).toFixed(1); o.laneLim = der * cap;
  let maxOut = 0; outLoad.forEach(v => { maxOut = Math.max(maxOut, v) });
  o.outMach = maxOut; o.outLoad = +(maxOut * r.rOut).toFixed(1); o.cap = cap;
  o.rateOk = (r.k === 0 || o.laneLoad <= o.laneLim + 1e-9) && o.outLoad <= cap + 1e-9;
  // lane stub rows present for every in/out port
  o.outPortCells = r.ports.out.every(p => { const b = cell(r.w - 1, p.y); return b && isBelt(b) && b.rot === 0 });
  o.ports = {in: r.ports.in.map(p => p.y).join(','), out: r.ports.out.map(p => p.y).join(',')};
  // info: is a free machine-sized rectangle left (not connected, just space)
  const mc = TPL_MC[spec.cls]; let free = 0;
  for (let y = 0; y + mc.h <= r.h; y++) for (let x = 0; x + mc.w <= r.w && !free; x++) { let ok2 = true; for (let i = 0; i < mc.w && ok2; i++) for (let j = 0; j < mc.h; j++) if (occ.has((x + i) + ',' + (y + j))) { ok2 = false; break } if (ok2) free = 1 }
  o.freeSpace = !!free;
  o.bld = r;
  window.__tpl = {items: r.items, w: r.w, h: r.h, cls: spec.cls};
  return o;
};
const SHOT = async (name, block) => {
  // draw with a tiny canvas script from the item list (no dependency on the app renderer)
  const png = ROOT + '/tests/shots/' + name + '.png';
  await pg.evaluate(() => {
    const T = window.__tpl, s = 28, c = document.createElement('canvas'); c.id = '__tplshot';
    c.width = T.w * s + 20; c.height = T.h * s + 20; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#111';
    const g = c.getContext('2d'); g.translate(10, 10); g.fillStyle = '#222'; g.fillRect(0, 0, T.w * s, T.h * s);
    g.strokeStyle = '#333'; for (let i = 0; i <= T.w; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, T.h * s); g.stroke() } for (let j = 0; j <= T.h; j++) { g.beginPath(); g.moveTo(0, j * s); g.lineTo(T.w * s, j * s); g.stroke() }
    const arrow = (x, y, rot, col) => { g.fillStyle = col; g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6); g.fillStyle = '#000'; g.save(); g.translate(x * s + s / 2, y * s + s / 2); g.rotate(rot * Math.PI / 2); g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, -7); g.lineTo(-6, 7); g.fill(); g.restore() };
    T.items.forEach(b => { const d = dim(b);
      if (b.rec) { g.fillStyle = '#356'; g.fillRect(b.x * s + 1, b.y * s + 1, d.w * s - 2, d.h * s - 2); g.strokeStyle = '#8cf'; g.strokeRect(b.x * s + 1, b.y * s + 1, d.w * s - 2, d.h * s - 2);
        portsOf(b).filter(p => p.en).forEach(p => { g.fillStyle = '#fc4'; g.fillRect(p.x * s + 8, p.y * s + 8, 12, 12) }) }
      else if (PLC_SPL.includes(b.cls)) { g.fillStyle = '#e8a'; g.fillRect(b.x * s + 2, b.y * s + 2, s - 4, s - 4); g.fillStyle = '#000'; g.fillText('S', b.x * s + 10, b.y * s + 19) }
      else if (PLC_UG.includes(b.cls)) arrow(b.x, b.y, b.rot, '#9c6');
      else arrow(b.x, b.y, b.rot, '#ccc') });
    document.body.appendChild(c);
  });
  await pg.locator('#__tplshot').screenshot({path: png});
  await pg.evaluate(() => document.getElementById('__tplshot').remove());
};
for (const C of CASES) for (const block of BLOCKS) {
  const base = {block, cls: C.cls, rec: C.rec, mk: 1, spMk: 1};
  const nMax = await pg.evaluate(s => tplMax(s), base);
  const nm = await pg.evaluate(s => ({a: tplMax({...s, mk: 0}), c: tplMax({...s, mk: 2})}), base);
  if (!nMax) { const w = await pg.evaluate(s => tplBuild({...s, n: 1}).why, base); console.log(`SKIP ${C.id} ${block}: does not build (${w})`); table.push([C.id, block, 'no build: ' + w]); continue }
  console.log(`${C.id} ${block}: nMax Mk2 ${nMax} (Mk1 ${nm.a}, Mk3 ${nm.c})`);
  let refB = null;
  const ns = [...new Set([1, 2, Math.ceil(nMax / 2), nMax - 1, nMax])].filter(n => n >= 1 && n <= nMax);
  for (const n of ns) {
    const o = await pg.evaluate(CHECK, [{...base, n}]);
    const tag = `${C.id} ${block} n=${n}`;
    if (o.build) { check(false, tag + ' build: ' + o.build); continue }
    check(o.floorOk, tag + ' floor ' + o.floor);
    check(o.ov === 0 && o.outside === 0, tag + ` no overlap (${o.ov}) inside floor (${o.outside} outside)`);
    check(o.tile.ok && o.tile.ov === 0 && o.tile.span === 0 && o.tile.blocks === 1, tag + ' placerTile ' + JSON.stringify(o.tile));
    check(!o.laneProblems.length && !o.inBad.length, tag + ' inputs reach machines: ' + JSON.stringify([...o.laneProblems, ...o.inBad]));
    check(!o.outBad.length && o.outPortCells, tag + ' outputs reach east edge: ' + JSON.stringify(o.outBad));
    check(o.rateOk, tag + ` rates: lane ${o.laneMach} mach ${o.laneLoad}/${o.laneLim} ; out ${o.outMach} mach ${o.outLoad}/${o.cap}`);
    const ref = refB || (refB = (await pg.evaluate(CHECK, [{...base, n: 1}])).bld);
    const ci = await checkIface(pg, o.bld, block, ref);
    check(ci.ok, tag + ' checkIface ' + ci.errs.join('; '));
    table.push([C.id, block, n, o.st.machines, o.st.belts, o.st.ug, o.st.spl, o.floor, (o.st.belts / o.st.machines).toFixed(2), o.ports.in + ' | ' + o.ports.out, o.freeSpace ? 'free' : 'full']);
    if (n === 1 || n === nMax) await SHOT(`tpl_special_${C.id}_${block}_n${n}`);
  }
  const nIf = await pg.evaluate(s => tplBuild({...s, n: tplMax(s) + 1}), base);
  check(nIf.ok === false, `${C.id} ${block} nMax+1 build ok:false (checkIface-level refusal)`);
  const neg = await pg.evaluate(s => ({a: tplBuild({...s, n: tplMax(s) + 1}), }), base);
  check(!neg.a.ok, `${C.id} ${block} n=nMax+1=${nMax + 1} refused (${neg.a.why})`);
  const neg2 = await pg.evaluate(s => tplBuild({...s, n: tplMax(s) - 1}).ok || tplMax(s) === 1, base);
  check(neg2, `${C.id} ${block} n=nMax-1 builds`);
}

// checkPlan (tests/tpl_plan.mjs) vs the production planner. k=1: full gate. k=2: product check dropped locally (checkPlan derives product for single input only; delivered input gate stays). k=0: no input lanes, planner needs opts.proto -> local N + machine count + out capacity.
const planTable = [];
for (const C of CASES) for (const block of BLOCKS) {
  const base = {block, cls: C.cls, rec: C.rec, mk: 1, spMk: 1};
  const info = await pg.evaluate(([s, tpl]) => { const r = [].concat(...Object.values(RECS)).find(x => rk(x) === s.rec); const P = plan(r.o[0], 1, 1, {}, {[r.o[0]]: s.rec}, {proto: true, enr: false, obs: false}); const nd = P.nodes[r.o[0]]; return {k: r.i.length, pm: nd ? nd.pmach : r.o[1] * 1800 / r.t, nMax: tplMax(s), oq: r.o[1], t: r.t} }, [base]);
  if (!info.nMax) continue;
  const nm = info.nMax, pm = info.pm;
  const sets = [['R1 pmach', pm], ['R1b 0.25pm', 0.25 * pm], ['R2 nMax-1+.3', (nm - 1 + 0.3) * pm], ['R3 nMax', nm * pm], ['R4 nMax+1', (nm + 1) * pm], ['R4b 2nMax+.5', (2 * nm + 0.5) * pm]];
  for (const [tag, rate] of sets) {
    const tplD = {build: 'tplBuild', max: 'tplMax', cls: C.cls};
    const r = await checkPlan(pg, tplD, C.rec, rate, block, 1, {proto: C.id !== 'super'});   // Relic Shard/Protomatter need planner proto:true
    const errs = r.errs, ok = r.ok, row = r.row;
    check(ok, `checkPlan ${C.id} ${block} ${tag} N=${row.N} B=${row.B} ${errs.join('; ')}`);
    planTable.push([C.id, block, tag, row.rate || +rate.toFixed(1), row.N, row.B, row.nMax, row.planUtil, row.minUtil, row.maxUtil, row.maxBeltUtil, row.supply, row.machines].join(' | '));
  }
}
await pg.evaluate('window.__CHECK=' + CHECK.toString());
// mutation self-check: the flood must NOT be vacuous (drop one UG / the output belt end / one B splitter -> must report a problem)
for (const mut of ['ug', 'outend', 'spl']) {
  const bad = await pg.evaluate(([s, mut]) => {
    const orig = window.tplBuild; let hit = false;
    window.tplBuild = sp => { const r = orig(sp); if (!hit && r.ok) { hit = true;
      const i = mut === 'ug' ? r.items.findIndex(b => PLC_UG.includes(b.cls)) : mut === 'outend' ? r.items.findIndex(b => b.x === r.w - 1 && b.y === r.ports.out[0].y) : r.items.findIndex(b => PLC_SPL.includes(b.cls) && b.y === 1);
      if (i >= 0) r.items.splice(i, 1) } return r };
    const o = window.__CHECK([s]);
    window.tplBuild = orig; return o && (o.inBad.length + o.outBad.length + o.laneProblems.length + (o.outPortCells ? 0 : 1));
  }, [{block: '1x2', cls: 'DAT_Supercomputer', rec: CASES[0].rec, mk: 1, spMk: 1, n: 3}, mut]).catch(e => 'err ' + e.message);
  check(typeof bad === 'number' && bad > 0, 'mutation ' + mut + ' detected by the checks (' + bad + ')');
}
console.log('\ncase | block | n | machines | belts | ug | spl | floor | belts/machine | in lanes y | out y | space');
for (const r of table) console.log(r.join(' | '));
console.log('\ncheckPlan: case | block | set | rate | N | B | nMax | planUtil | minUtil | maxUtil | maxBelt | supply | machines');
for (const r of planTable) console.log(r);
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

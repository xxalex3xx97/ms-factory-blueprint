// TPL refinery_1in gates (page). Run: node tests/tpl_refinery_1in.mjs   Exit 1 on FAIL or page error.
// Per block (1x1, 1x2, 2x2, 2x2c) x config (recipe/Mk/perRow) x n in {1,2,nMax-1,nMax}: no overlap, inside floor, placerTile ok (1 block of the right type, ov 0, span 0),
// every row's lane floods to exactly its own machines (no leak), every machine output reaches its own east port, rate check, stub rows; nMax+1 must refuse. Prints the table block x n.
// No sim (needs containers; the template is factory-only).
import {createRequire} from 'module';
import path from 'path';
import fs from 'fs';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=4096']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof blRow === 'function' && typeof placerTile === 'function' && typeof blMachine === 'function');
await pg.addScriptTag({path: ROOT + '/js/tpl/refinery_1in.js'});
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
const BLOCKS = ['1x1', '1x2', '2x2', '2x2c'];
const CFG = [
  {name: 'Silica>Wafers Mk2 derate', rec: 'ITEM_Silica>ITEM_SiliconWafers', mk: 1, spMk: 1},
  {name: 'light 10/10 Mk3 geometry (10 per row)', rec: 'ITEM_Silica>ITEM_SiliconWafers', rin: 10, rout: 10, mk: 2, spMk: 2, perRow: 99},
  {name: 'Silica>Wafers Mk2 derate=1', rec: 'ITEM_Silica>ITEM_SiliconWafers', mk: 1, spMk: 1, derate: 1},
  {name: 'Enr.Nickel>Plates Mk1', rec: 'ITEM_EnrichedNickelOre>ITEM_NickelPlates', mk: 0, spMk: 0},
  {name: 'Silica>RGlass Mk1 (40/min)', rec: 'ITEM_Silica>ITEM_ReinforcedGlass', mk: 0, spMk: 0},
  {name: 'WaterIce>H2 Mk2', rec: 'ITEM_WaterIce>ITEM_HydrogenFuel', mk: 1, spMk: 1},
];
const table = [];
// the whole check runs in the page: spec -> result
const runOne = spec => pg.evaluate(spec => {
  const T = tplBuild(spec);
  if (!T.ok) return {built: false, why: T.why};
  const R = {built: true, why: '', fails: [], w: T.w, h: T.h, stats: T.stats, nMax: T.nMax, mrow: T.mrow, g: T.g, Mgeo: T.Mgeo, rows: T.rows.length, rate: T.rate};
  const F = m => R.fails.push(m);
  const its = T.items;
  // (1) overlap, (2) inside floor
  const occ = new Map();
  for (const b of its) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) {
    if (x < 0 || y < 0 || x >= T.w || y >= T.h) { F('outside floor ' + x + ',' + y); continue }
    const k = x + ',' + y; if (occ.has(k)) F('overlap ' + k); else occ.set(k, b) } }
  // (3) placerTile on a minimal layout
  const BC = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03'}[spec.block];
  const ok = [0, 1, 2, 3].map(i => i === ['1x1', '1x2', '2x2', '2x2c'].indexOf(spec.block));
  const L = {ok: true, items: its.map(b => ({...b})), cuts: [], lanes: 1, per: [T.stats.machines], pitch: T.h + 1, w: T.w, h: T.h, tall: true, mod: false, box: 'DAT_Container_2', mk: spec.mk, ports: [], stat: {}, dk: null};
  const P = placerTile(L, ok);
  R.tile = {ok: P.ok, ov: P.ov, span: P.span, blocks: P.blocks && P.blocks.length, cls: P.blocks && P.blocks[0] && P.blocks[0].cls === plcCls(BC), why: P.ok ? '' : String(P.why).slice(0, 160)};
  if (!P.ok || P.ov || P.span || P.blocks.length !== 1 || P.blocks[0].cls !== plcCls(BC)) F('placerTile ' + JSON.stringify(R.tile));
  else if (P.ms.length !== its.length) F('placerTile item count ' + P.ms.length + '/' + its.length);
  // (4) connectivity
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]], isB = b => PLC_BELT.includes(b.cls), isS = b => PLC_SPL.includes(b.cls), isM = b => b.cls === spec.cls0;
  const get = (x, y) => occ.get(x + ',' + y);
  // can an item at the cell (x,y) take a flow arriving with direction d: returns {t:'belt'|'spl'|'mach',it}
  const enter = (x, y, d) => {
    const t = get(x, y); if (!t) return null;
    if (isB(t)) { const [dx, dy] = DIR[t.rot]; return dx === -d[0] && dy === -d[1] ? null : {t: 'belt', it: t} }
    if (isS(t)) { const p = portsOf(t).find(q => q.dir === 'in' && q.en); return p && p.nx === -d[0] && p.ny === -d[1] ? {t: 'spl', it: t} : null }
    if (isM(t)) { const p = portsOf(t).find(q => q.en && q.x === x && q.y === y && q.nx === -d[0] && q.ny === -d[1]); return p ? {t: 'mach', it: t, f: p.f} : null }
    return null;
  };
  const flow = (sx, sy) => {   // BFS from the belt/splitter at (sx,sy); returns {mi: machines fed at N, mo: machines touched at other faces, cells}
    const seen = new Set(), mi = new Set(), mo = new Set(), q = [[sx, sy]]; let bad = 0;
    while (q.length) {
      const [x, y] = q.pop(), k = x + ',' + y; if (seen.has(k)) continue; seen.add(k);
      const t = get(x, y); if (!t) continue;
      const outs = isB(t) ? [[x + DIR[t.rot][0], y + DIR[t.rot][1], DIR[t.rot]]] : isS(t) ? portsOf(t).filter(p => p.dir === 'out' && p.en).map(p => [x + p.nx, y + p.ny, [p.nx, p.ny]]) : [];
      for (const [nx, ny, d] of outs) {
        const e = enter(nx, ny, d); if (!e) { if (get(nx, ny) || nx < 0 || ny < 0 || nx >= T.w || ny >= T.h) { if (get(nx, ny)) bad++ } continue }
        if (e.t === 'mach') { if (e.f === 'N') mi.add(e.it); else mo.add(e.it); continue }
        q.push([nx, ny]);
      }
    }
    return {mi, mo, seen, bad};
  };
  const mc = blMachine(spec.cls0);
  for (let j = 0; j < T.rows.length; j++) {
    const row = T.rows[j], pi = T.ports.in[j], po = T.ports.out[j];
    const a = get(pi.x, pi.y), z = get(po.x, po.y);
    if (!a || !isB(a) || a.rot !== 0) F('row ' + j + ' in port is not a rot-0 belt');
    if (!z || !isB(z) || z.rot !== 0) F('row ' + j + ' out port is not a rot-0 belt');
    const mine = its.filter(b => isM(b) && b.y === row.yIn + 1);
    if (mine.length !== row.m) F('row ' + j + ' machine count ' + mine.length + '/' + row.m);
    const fl = flow(pi.x, pi.y);
    if (fl.mi.size !== mine.length || ![...fl.mi].every(m => mine.includes(m))) F('row ' + j + ' lane feeds ' + fl.mi.size + ' machines, row has ' + mine.length + ' (leak or gap)');
    if (fl.mo.size) F('row ' + j + ' lane touches a non-input machine face');
    if (fl.seen.has(po.x + ',' + po.y)) F('row ' + j + ' input lane reaches the output lane');
    if (fl.bad) F('row ' + j + ' input flow dead-ends into ' + fl.bad + ' foreign item(s)');
    for (const m of mine) {   // output: S face (cell below the machine) -> east port, touching no machine input
      const p = portsOf(m).find(q => q.en && q.f === 'S'), ox = p.x + p.nx, oy = p.y + p.ny, o = get(ox, oy);
      if (!o || !isB(o)) { F('row ' + j + ' machine out cell is not a belt'); continue }
      const fo = flow(ox, oy);
      if (!fo.seen.has(po.x + ',' + po.y)) F('row ' + j + ' machine at ' + m.x + ' output does not reach the east port');
      if (fo.mi.size || fo.mo.size) F('row ' + j + ' machine output flows into a machine');
      if ([...fo.seen].some(k => { const [x, y] = k.split(',').map(Number); return y !== oy })) F('row ' + j + ' collector leaves its row');
    }
    if (!row.m) { const stub = its.filter(b => isB(b) && (b.y === row.yIn || b.y === row.yOut)); if (stub.length !== 2) F('row ' + j + ' stub cells ' + stub.length) }
  }
  // wall rule: belts on the vertical edge columns are rot 0 (straight crossings only)
  if (its.some(b => (isB(b) || isS(b)) && (b.x === 0 || b.x === T.w - 1) && !isM(b) && b.rot !== 0)) F('non-rot-0 belt on a west/east edge column');
  // (5) rate: lane load per row, in/out, vs derate*cap
  const cap = T.rate.cap, D = spec.derate ?? BL.DERATE, ov = spec.perRow != null;
  let lin = 0, lout = 0;
  for (const row of T.rows) { lin = Math.max(lin, row.m * T.rate.rin); lout = Math.max(lout, row.m * T.rate.rout);
    const lim = ov ? cap : D * cap;
    if (row.m > 1 && (row.m * T.rate.rin > lim + 1e-9 || row.m * T.rate.rout > lim + 1e-9)) F('row load ' + row.m * T.rate.rin + '/' + row.m * T.rate.rout + ' > ' + lim); }
  R.load = {in: lin, out: lout, cap, pin: Math.round(lin / cap * 100), pout: Math.round(lout / cap * 100)};
  if (lin > cap || lout > cap) F('lane over belt cap');
  R.area = T.w * T.h; R.bpm = +(T.stats.belts / T.stats.machines).toFixed(2); R.ports = {in: T.ports.in.map(p => p.y), out: T.ports.out.map(p => p.y)};
  return R;
}, {...spec, cls0: spec.cls || 'DAT_Refinery'});

const shot = async (spec, tag) => {   // canvas drawing of the built block (cells 22 px) -> tests/shots
  const r = await pg.evaluate(spec => {
    const T = tplBuild(spec), S = 22, c = document.createElement('canvas'); c.id = 'tplshot';
    c.width = T.w * S + 2; c.height = T.h * S + 2; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#10151c';
    const g = c.getContext('2d'); g.translate(1, 1);
    g.strokeStyle = '#243040'; for (let x = 0; x <= T.w; x++) { g.beginPath(); g.moveTo(x * S, 0); g.lineTo(x * S, T.h * S); g.stroke() } for (let y = 0; y <= T.h; y++) { g.beginPath(); g.moveTo(0, y * S); g.lineTo(T.w * S, y * S); g.stroke() }
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const b of T.items) {
      const d = dim(b), x = b.x * S, y = b.y * S;
      if (PLC_BELT.includes(b.cls)) { g.fillStyle = '#3b6ea5'; g.fillRect(x + 2, y + 2, S - 4, S - 4); g.strokeStyle = '#fff'; g.beginPath(); const cx = x + S / 2, cy = y + S / 2, [dx, dy] = D[b.rot]; g.moveTo(cx - dx * 6, cy - dy * 6); g.lineTo(cx + dx * 6, cy + dy * 6); g.lineTo(cx + dx * 2 - dy * 4, cy + dy * 2 + dx * 4); g.moveTo(cx + dx * 6, cy + dy * 6); g.lineTo(cx + dx * 2 + dy * 4, cy + dy * 2 - dx * 4); g.stroke() }
      else if (PLC_SPL.includes(b.cls)) { g.fillStyle = '#d9a441'; g.fillRect(x + 2, y + 2, S - 4, S - 4) }
      else { g.fillStyle = '#4a7c59'; g.fillRect(x + 1, y + 1, d.w * S - 2, d.h * S - 2); g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText('R', x + d.w * S / 2 - 3, y + d.h * S / 2 + 4) }
    }
    g.fillStyle = '#e66'; for (const p of T.ports.in) g.fillRect(-1, p.y * S, 3, S); g.fillStyle = '#6e6'; for (const p of T.ports.out) g.fillRect(T.w * S - 2, p.y * S, 3, S);
    document.body.appendChild(c); return {w: c.width, h: c.height};
  }, spec);
  await pg.locator('#tplshot').screenshot({path: ROOT + '/tests/shots/tpl_refinery_1in_' + tag + '.png'});
  await pg.evaluate(() => document.getElementById('tplshot').remove());
};

for (const blk of BLOCKS) for (const cfg of CFG) {
  const base = {block: blk, cls: 'DAT_Refinery', ...cfg}; delete base.name;
  const nMax = await pg.evaluate(s => tplMax(s), base);
  const tag0 = `${blk} [${cfg.name}]`;
  if (!nMax) { check(false, tag0 + ' tplMax = 0'); continue }
  const ns = [...new Set([1, 2, nMax - 1, nMax].filter(v => v >= 1 && v <= nMax))];
  for (const n of ns) {
    const spec = {...base, n}, tag = `${tag0} n=${n}`;
    const r = await runOne(spec);
    if (!r.built) { check(false, tag + ' not built: ' + r.why); continue }
    check(r.fails.length === 0, tag + (r.fails.length ? ' ' + r.fails.slice(0, 4).join('; ') : ''));
    check(r.stats.machines === n, tag + ' machines ' + r.stats.machines + '==n');
    check(r.nMax === nMax, tag + ' nMax stable ' + r.nMax);
    table.push({blk, cfg: cfg.name, n, nMax, mach: r.stats.machines, belts: r.stats.belts, ug: r.stats.ug, spl: r.stats.spl, area: r.area, bpm: r.bpm, rows: r.rows, mrow: r.mrow, lin: r.load.pin + '%', lout: r.load.pout + '%'});
    if (cfg === CFG[0] || cfg === CFG[1]) if (n === 1 || n === nMax || n === ns[1]) await shot(spec, `${blk}_${cfg === CFG[0] ? 'derate' : 'geom'}_n${n}`);
  }
  // modularity: ports (y) identical for every n; stubbed rows keep their lanes
  const ports = await pg.evaluate(async base => { const nm = tplMax(base), o = {}; for (const n of [1, nm]) { const t = tplBuild({...base, n}); o[n] = JSON.stringify(t.ports.in.map(p => p.y)) + JSON.stringify(t.ports.out.map(p => p.y)) } return o }, base);
  check(Object.values(ports).every(v => v === Object.values(ports)[0]), tag0 + ' port rows identical for n=1 and nMax');
  // negative: nMax+1 refused
  const neg = await pg.evaluate(s => { const t = tplBuild(s); return {ok: t.ok, why: t.why} }, {...base, n: nMax + 1});
  check(!neg.ok, tag0 + ` n=${nMax + 1} refused (${neg.why})`);
}
console.log('\nblock | config | n | nMax | machines | belts | ug | spl | area | belts/machine | rows x mrow | in% out% of belt cap');
for (const t of table) console.log([t.blk, t.cfg, t.n, t.nMax, t.mach, t.belts, t.ug, t.spl, t.area, t.bpm, t.rows + 'x' + t.mrow, t.lin + ' ' + t.lout].join(' | '));
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

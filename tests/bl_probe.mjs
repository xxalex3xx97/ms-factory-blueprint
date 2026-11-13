// BL Z0 probe (page, no code change). Run: node tests/bl_probe.mjs   Prints facts for the block-zones plan; exit 1 only on page error or STOP condition (Container_2 without 4 N and 4 S ports).
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof blMachine === 'function' && typeof placerCut === 'function' && typeof plnBy === 'function' && typeof pfFactTree === 'function');
const r = await pg.evaluate(() => {
  const out = {};
  // 1. floor rects of PL_ALL
  out.floors = PL_ALL.map(nm => {const cls = plcCls(nm), f = floorRect({cls, x: 0, y: 0, h: 0, rot: 0}), d = dim({cls, rot: 0}); return {nm, cls, floor: [f.x, f.y, f.w, f.h], dim: [d.w, d.h]}});
  // 2. Large Container ports
  const C2 = 'DAT_Container_2';
  const cp = portsOf({cls: C2, x: 0, y: 0, rot: 0, off: []});
  out.container2 = {dim: dim({cls: C2, rot: 0}), ports: cp.map(p => [p.f, p.x, p.y, p.nx, p.ny, p.dir, p.key]), nN: cp.filter(p => p.f === 'N').length, nS: cp.filter(p => p.f === 'S').length};
  // 3. Refinery and Assembler dim + ports
  const mdl = nm => {const cls = plcCls(nm) || Object.keys(BASE).find(k => BASE[k].name === nm); return cls ? {cls, dim: dim({cls, rot: 0}), ports: portsOf({cls, x: 0, y: 0, rot: 0, off: []}).map(p => [p.f, p.x, p.y, p.nx, p.ny, p.dir, p.key])} : null};
  out.refinery = mdl('Refinery');
  out.assembler = mdl('Assembler');
  // 4. recipe scan: single-machine (all inputs raw), first with 3 ins and first with 4 ins
  const pb = plnBy(false);
  const rawOf = it => !pb.has(it);
  // every recipe with n inputs whose crafter is a placeable machine with >= n N-ports (direct feed); allRaw = all inputs raw (single stage)
  const scan = n => {
    const hits = [], seen = new Set();
    for (const c of Object.keys(RECS)) for (const rec of RECS[c]) {
      if (rec.i.length !== n || rec.i.some(([x]) => x === rec.o[0])) continue;
      const bd = plnCb(c), cls = bd && bd.key;
      if (!cls) continue;
      const nN = portsOf({cls, x: 0, y: 0, rot: 0, off: []}).filter(p => p.f === 'N' && p.dir !== 'out').length;
      if (nN < n) continue;
      const allRaw = rec.i.every(([x]) => rawOf(x));
      hits.push({allRaw, crafter: c, cls, rec: rk(rec), nN, blK1: blMachine(cls, 1).ok});
    }
    hits.sort((p, q) => (q.allRaw - p.allRaw) || (p.nN - q.nN));
    return {count: hits.length, first: hits.slice(0, 3)};
  };
  out.three = scan(3);
  out.four = scan(4);
  // 5. UG at a row cut: 2-row dummy, one vertical belt column crossing y=30 (rot 1 = south)
  const cls = plcCls('BPO_Station_02');
  const items = [];
  for (let y = 0; y < 60; y++) items.push({cls: PLC_BELT[1], x: 5, y, rot: 1, h: 0, pid: 0});
  const L = {items, w: 10, h: 60, pitch: 1, lanes: 1, tall: true, mk: 1};
  const P = placerCut(L, cls);
  out.cut = {ok: P.ok, why: P.why || null, rc: P.rc, ug: P.ug, ov: P.ov, span: P.span, blocks: P.blocks ? P.blocks.length : null, ugAt: P.ms ? P.ms.filter(m => PLC_UG.includes(m.cls)).map(m => [m.x, m.y, m.cls]) : null};
  // H0: 2x2 block floor, Large Container W/E faces, hand-made horizontal L (3 belt rows, y=0/14/29, cut at x=30)
  const c2 = plcCls('BPO_Station_02');
  const f2 = floorRect({cls: c2, x: 0, y: 0, h: 0, rot: 0});
  out.h0Floor = {cls: c2, floor: [f2.x, f2.y, f2.w, f2.h], dim: dim({cls: c2, rot: 0})};
  out.h0Faces = {nW: cp.filter(p => p.f === 'W').length, nE: cp.filter(p => p.f === 'E').length};
  const hi = [{cls: C2, x: 0, y: 8, rot: 0, h: 0, pid: 0, ct: [{item: 'ITEM_Silica', n: 0, inf: true}]}];
  for (const y of [0, 14, 29]) for (let x = 20; x <= 45; x++) hi.push({cls: PLC_BELT[1], x, y, rot: 0, h: 0, pid: 0});
  const HL = {ok: true, items: hi, w: 46, h: 30, pitch: 31, cuts: [30], tall: true, mk: 1, lanes: 1};
  const HP = placerCut(HL, c2);
  const HT = placerTile(HL, placerBk());
  out.h0L = {cut: {ok: HP.ok, why: HP.why || null, ug: HP.ug, ov: HP.ov, span: HP.span, rc: HP.rc, ugAt: HP.ms ? HP.ms.filter(m => PLC_UG.includes(m.cls)).map(m => [m.x, m.y, m.cls]) : null},
    tile: {ok: HT.ok, why: HT.ok ? null : String(HT.why).slice(0, 200), ov: HT.ov, span: HT.span, blocks: HT.blocks ? HT.blocks.length : null}};
  // H4 STOP probe: one Large Container with a W-face belt feeding it and E-face belts leaving it (geometry via portsOf, tile via placerTile)
  const h4W = portsOf({cls: C2, x: 20, y: 8, rot: 0, off: []}).filter(p => p.f === 'W'), h4E = portsOf({cls: C2, x: 20, y: 8, rot: 0, off: []}).filter(p => p.f === 'E');
  const h4 = [{cls: C2, x: 20, y: 8, rot: 0, h: 0, pid: 0, ct: []}];
  for (let x = 10; x <= 19; x++) h4.push({cls: PLC_BELT[1], x, y: h4W[0].y, rot: 0, h: 0, pid: 0});
  for (const p of h4E.slice(0, 2)) for (let x = 24; x <= 45; x++) h4.push({cls: PLC_BELT[1], x, y: p.y, rot: 0, h: 0, pid: 0});
  const h4L = {ok: true, items: h4, w: 46, h: 30, pitch: 31, cuts: [30], tall: true, mk: 1, lanes: 1};
  const h4T = placerTile(h4L, placerBk());
  out.h4 = {nW: h4W.length, nE: h4E.length, tile: {ok: h4T.ok, why: h4T.ok ? null : String(h4T.why).slice(0, 200), ov: h4T.ov, span: h4T.span, blocks: h4T.blocks ? h4T.blocks.length : null}};
  // H6.0: dock probe. Dims and ports of BPO_Dock / BPO_Dock_2 at rot 0 and 2; placerTile + noBuild at negative bx; nlIndAsm transposed lanes and extents
  const h6 = {};
  for (const [nm, cls] of [['BPO_Dock', plcCls('BPO_Dock')], ['BPO_Dock_2', plcCls('BPO_Dock_2')]]) for (const rot of [0, 2]) {
    const d = dim({cls, rot});
    h6[nm + ' rot' + rot] = {w: d.w, h: d.h, ports: portsOf({cls, x: 0, y: 0, rot, off: []}).map(p => [p.f, p.x, p.y, p.nx, p.ny, p.dir]), floor: floorRect({cls, x: 0, y: 0, h: 0, rot}) || null};
  }
  const dk = plcCls('BPO_Dock');
  const negL = {ok: true, items: [{cls: dk, x: -2, y: 0, rot: 0, h: 0, pid: 0}, {cls: 'DAT_Container_2', x: 2, y: 0, rot: 0, h: 0, pid: 0, ct: [{item: 'ITEM_Silica', n: 0, inf: true}]}], w: 6, h: 4, pitch: 5, cuts: [], tall: true, mk: 1, lanes: 1};
  const nt = placerTile(negL, placerBk());
  h6.negTile = {ok: nt.ok, why: nt.ok ? null : String(nt.why).slice(0, 160), ov: nt.ov, span: nt.span};
  const dd = dim({cls: dk, rot: 0});
  h6.negNoBuild = noBuild([{x: -2, y: 0, w: dd.w, h: dd.h, l: 0}]);
  const asm = nlIndAsm();
  const ext = a => ({minX: Math.min(...a.map(q => q.x)), maxX: Math.max(...a.map(q => q.x)), minY: Math.min(...a.map(q => q.y)), maxY: Math.max(...a.map(q => q.y))});
  const T = asm.belts.map(k => ({x: k.y, y: k.x, rot: [1, 0, 3, 2][k.rot]})), TB = asm.boxes.map(b => ({x: b.y, y: b.x}));
  const cells = new Set(), dup = [];
  for (const q of [...T, ...TB]) { const kk = q.x + ',' + q.y; if (cells.has(kk)) dup.push(kk); cells.add(kk) }
  h6.asm = {nBoxes: asm.boxes.length, nBelts: asm.belts.length, boxes: ext(asm.boxes), belts: ext(asm.belts), transBoxes: ext(TB), transBelts: ext(T), dupCells: dup.length, laneYs: [...new Set(asm.belts.filter(k => k.y === 8).map(k => k.x))].sort((a, b) => a - b), transLaneYs: [...new Set(T.filter(k => k.x === 8).map(k => k.y))].sort((a, b) => a - b)};
  out.h6 = h6;
  return out;
});
console.log(JSON.stringify(r, null, 1));
await br.close();
let fail = 0;
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fail++ }
if (r.container2.nN < 4 || r.container2.nS < 4) { console.log('STOP Container_2 has fewer than 4 N or 4 S ports'); fail++ }
if (r.h0Faces.nW < 4 || r.h0Faces.nE < 4) { console.log('STOP H0 Container_2 W/E faces lack 4 ports'); fail++ }
if (!r.h0L.cut.ok || r.h0L.cut.ug < 1) { console.log('STOP H0 pair at x=29|30 is not a UG pair'); fail++ }
if (!r.h0L.tile.ok) { console.log('STOP H0 placerTile refused: ' + r.h0L.tile.why); fail++ }
if (!r.h4.tile.ok) { console.log('STOP H4 container W-in + E-out placerTile refused: ' + r.h4.tile.why); fail++ }
if (r.h6.negTile && !r.h6.negTile.ok) { console.log('STOP H6 placerTile refuses dock at negative bx: ' + r.h6.negTile.why); fail++ }
process.exit(fail ? 1 : 0);

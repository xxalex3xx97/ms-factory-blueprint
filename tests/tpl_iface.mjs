// Edge Interface v1 gate. Exports checkIface(page,build,blockType[,ref]) (geometry) and checkChain(bA,bB).
// Self-test (node tests/tpl_iface.mjs): synthetic 1x2 and 2x2 S2 builds must pass; 4 broken variants must fail. Exit 1 on FAIL.
// page = playwright page (dims via page dim()) or null (dims from build.dims, default 1x1). ref = optional n=1 build for "ports never move with n".
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IF = new Function(fs.readFileSync(ROOT + '/js/bl_plan.js', 'utf8') + '\n' + fs.readFileSync(ROOT + '/js/tpl/iface.js', 'utf8') + ';return {TPL_IF_SETS,TPL_IF_H,tplIfSets,tplIfRows,tplOutTail,tplDerate,TPL_IF_SIDE}')();
const {TPL_IF_SETS, TPL_IF_H, tplIfSets, tplIfRows} = IF;
const isBelt = c => /ConveyorBelt/.test(c);
const BELT = 'DAT_ConveyorBelt';

export async function checkIface(page, build, blockType, ref) {
  const errs = [], E = m => errs.push(m);
  if (!build || !build.iface || build.iface.v !== 1) return {ok: false, errs: ['iface.v!==1']};
  const f = build.iface, W = build.w, t = tplIfSets(blockType, f.S);
  if (!t.ok) return {ok: false, errs: [t.why]};
  // 1) S allowed, origins from table
  if (JSON.stringify(f.sets.map(s => s.o)) !== JSON.stringify(TPL_IF_SETS[blockType][f.S])) E('origins != TPL_IF_SETS[' + blockType + '][' + f.S + ']');
  // footprints and cell map
  const dc = new Map(), cell = new Map();
  for (const it of build.items) {
    if (!dc.has(it.cls)) {
      let d = (build.dims && build.dims[it.cls]) || [1, 1];
      if (page) d = await page.evaluate(c => { const q = dim({cls: c, rot: 0}); return [q.w, q.h]; }, it.cls);
      dc.set(it.cls, d);
    }
    const [w, h] = dc.get(it.cls);
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
      const k = (it.x + dx) + ',' + (it.y + dy);
      if (!cell.has(k)) cell.set(k, []);
      cell.get(k).push(it);
    }
  }
  const beltAt = (x, y) => (cell.get(x + ',' + y) || []).find(q => isBelt(q.cls) && q.x === x && q.y === y);
  const inRowSet = new Set([...t.o.flatMap((o, s) => tplIfRows(blockType, f.S, s, f.k, f.M).in), ...(f.side || [])]);
  const outRowSet = new Set(t.o);
  // 2) out ports: one per set, belt rot 0 on the set origin row
  if (build.ports.out.length !== f.S) E('ports.out count ' + build.ports.out.length + ' != S ' + f.S);
  build.ports.out.forEach((p, s) => {
    if (p.set !== s || p.x !== W - 1 || p.y !== t.o[s]) E('out ' + s + ' at ' + p.x + ',' + p.y + ' want ' + (W - 1) + ',' + t.o[s]);
    const b = beltAt(W - 1, t.o[s]);
    if (!b || b.rot !== 0) E('out ' + s + ' no belt rot0 at x=' + (W - 1) + ' y=' + t.o[s]);
  });
  // 3) in ports: x=0, standard or side row, belt rot 0; set main row present with item = main
  build.ports.in.forEach((p, i) => {
    if (p.x !== 0) E('in ' + i + ' x!=0');
    if (!inRowSet.has(p.y)) E('in port off standard row y=' + p.y);
    const b = beltAt(0, p.y);
    if (!b || b.rot !== 0) E('in y=' + p.y + ' no belt rot0 at x=0');
    if (p.set != null && !(tplIfRows(blockType, f.S, p.set, f.k, f.M).in.includes(p.y) || (f.side || []).includes(p.y))) E('in y=' + p.y + ' not a row of set ' + p.set);
  });
  t.o.forEach((o, s) => {
    if (f.k === 0) return;   // no input lanes (Protomatter): no main row
    const p = build.ports.in.find(q => q.set === s && q.copy === 0 && q.y === o);
    if (!p) E('set ' + s + ' main row ' + o + ' missing');
    else if (p.item !== f.main) E('set ' + s + ' main row item ' + p.item + ' != main ' + f.main);
  });
  // 4) edge-free: anything covering x=0 or x=W-1 must be a declared port belt (rot 0)
  const inY = new Set(build.ports.in.map(p => p.y)), outY = new Set(build.ports.out.map(p => p.y));
  for (const [k, list] of cell) {
    const [x, y] = k.split(',').map(Number);
    if (x !== 0 && x !== W - 1) continue;
    for (const q of list) {
      const ok = isBelt(q.cls) && q.rot === 0 && q.x === x && q.y === y && (x === 0 ? inY.has(y) : outY.has(y));
      if (!ok) E('edge column x=' + x + ' y=' + y + ': ' + q.cls + ' rot ' + q.rot + ' is not a declared port');
    }
  }
  // 5) quantity never moves a port
  if (ref) {
    const sig = b => JSON.stringify([b.ports.in.map(p => [p.x, p.y, p.set, p.copy]).sort(), b.ports.out.map(p => [p.x, p.y]).sort()]);
    if (sig(ref) !== sig(build)) E('ports move with n (n=' + f.n + ' vs reference)');
  }
  // 6) 2x2c: all ports inside rows 4..25
  if (blockType === '2x2c') {
    for (const p of [...build.ports.in, ...build.ports.out]) if (p.y < 4 || p.y > 25) E('2x2c port y=' + p.y + ' outside 4..25');
  }
  return {ok: errs.length === 0, errs};
}

// A -> B direct chain: same S, same height class, not 2x2c<->2x2, A.out[s].y === B.in main copy 0 of set s (row o_s).
export function checkChain(bA, bB) {
  const errs = [], E = m => errs.push(m);
  const a = bA && bA.iface, b = bB && bB.iface;
  if (!a || !b) return {ok: false, errs: ['iface missing']};
  if (a.S !== b.S) E('S ' + a.S + ' != ' + b.S);
  if (TPL_IF_H[a.block] !== TPL_IF_H[b.block]) E('height class ' + a.block + ' vs ' + b.block);
  if ((a.block === '2x2c') !== (b.block === '2x2c') && a.block.startsWith('2x2') && b.block.startsWith('2x2')) E('2x2c <-> 2x2 blocked');
  const o = tplIfSets(b.block, b.S).o;
  for (let s = 0; s < a.S; s++) {
    const aOut = bA.ports.out[s], bIn = bB.ports.in.find(p => p.set === s && p.copy === 0 && p.y === o[s]);
    if (!bIn) E('set ' + s + ': B has no main copy 0 in port at row ' + o[s]);
    else if (!aOut || aOut.y !== bIn.y) E('set ' + s + ': A.out y ' + (aOut && aOut.y) + ' != B.in y ' + bIn.y);
  }
  return {ok: errs.length === 0, errs};
}

// synthetic build: one machine per set row group (5x5 DAT_Assembler), slot 0 lane at o_s, out belt at x=W-1
function synth(block, S, n, opt = {}) {
  const W = 30, H = TPL_IF_H[block], t = tplIfSets(block, S), items = [], ports = {in: [], out: []};
  t.o.forEach((o, s) => {
    ports.in.push({x: 0, y: o, item: opt.main ?? 0, dir: 'E', set: s, copy: 0});
    items.push({cls: BELT, x: 0, y: o, rot: 0, h: 0, pid: 0});
    ports.out.push({x: W - 1, y: o, dir: 'E', set: s});
    items.push({cls: BELT, x: W - 1, y: o, rot: 0, h: 0, pid: 0});
    for (let i = 0; i < n; i++) items.push({cls: 'DAT_Assembler', x: 5 + 6 * i, y: o + 1, rot: 0, rec: 'X'});
  });
  if (opt.shift) {   // broken: set 0 lane moved one row down (ports move with n)
    ports.in[0].y += 1;
    items.find(q => q.x === 0 && q.y === t.o[0]).y += 1;
  }
  return {ok: true, w: W, h: H, items, ports, dims: {DAT_Assembler: [5, 5]}, iface: {v: 1, block, S, M: 1, k: 1, main: opt.main ?? 0, n, sets: t.o.map(o => ({o, n})), side: []}};
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  let fails = 0;
  const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m) } else console.log('ok   ' + m) };
  for (const [block, S] of [['1x2', 2], ['2x2', 2]]) {
    const ref = synth(block, S, 1);
    for (const n of [1, 2, 3]) {
      const r = await checkIface(null, synth(block, S, n), block, ref);
      ok(r.ok, 'conforming ' + block + ' S' + S + ' n=' + n + ' ' + r.errs.join('; '));
    }
  }
  const base = () => synth('1x2', 2, 1);
  let b = base(); b.ports.in.push({x: 0, y: 3, item: 0, dir: 'E', set: 0, copy: 0}); b.items.push({cls: BELT, x: 0, y: 3, rot: 0, h: 0, pid: 0});
  ok(!(await checkIface(null, b, '1x2', base())).ok, 'broken 1: port off the standard row fails');
  b = base(); b.items.push({cls: 'DAT_Assembler', x: 0, y: 2, rot: 0, rec: 'X'});
  ok(!(await checkIface(null, b, '1x2', base())).ok, 'broken 2: machine touching x=0 fails');
  b = synth('1x2', 2, 2, {shift: true});
  ok(!(await checkIface(null, b, '1x2', base())).ok, 'broken 3: ports move with n fails');
  const A = base(), B = synth('1x2', 2, 1);
  ok(checkChain(A, B).ok, 'conforming chain 1x2 S2 -> 1x2 S2 ' + checkChain(A, B).errs.join('; '));
  const A2 = base(); A2.ports.out[1].y = 8;
  ok(!checkChain(A2, B).ok, 'broken 4: out row mismatch in checkChain fails');
  console.log('\nslot rows (in = o_s + i*M + c, out = o_s):');
  for (const block of Object.keys(TPL_IF_SETS)) for (const S of Object.keys(TPL_IF_SETS[block])) {
    const t = tplIfSets(block, +S);
    console.log('  ' + block.padEnd(5) + ' S' + S + ' origins ' + JSON.stringify(t.o) + ' rows-per-set ' + JSON.stringify(t.hs));
  }
  console.log(fails ? 'FAIL ' + fails : 'PASS tpl_iface self-test');
  process.exit(fails ? 1 : 0);
}

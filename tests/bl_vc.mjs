// VC3 gate: blVC n=1..8 (structure, counts, height, connectivity flood) + n=5 golden zero diff + vcPlan units. Run: node tests/bl_vc.mjs   Exit 1 on FAIL.
// Flood: splitter off tokens ignored by default (VC_OFF_MODE=abs reads them as compass dirs; refuted by golden). Both modes printed on request.
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLC_BELT = ["DAT_ConveyorBelt", "DAT_ConveyorBelt2", "DAT_ConveyorBelt3"], PLC_SPL = ["DAT_Splitter", "DAT_Splitter_2", "DAT_Splitter_3"], PLC_UG = ["DAT_UndergroundBelt", "DAT_UndergroundBelt_2", "DAT_UndergroundBelt_3"];
const {blVC, vcPlan} = new Function('PLC_BELT', 'PLC_SPL', 'PLC_UG', fs.readFileSync(ROOT + '/js/bl_vc.js', 'utf8') + ';return {blVC, vcPlan}')(PLC_BELT, PLC_SPL, PLC_UG);
const REC = 'ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit';
const S = n => ({mk: 1, cls: 'DAT_Assembler', rec: REC, X: 24, Y: 132, T: 121, n, w: 5});
const key = o => [o.cls, o.x, o.y, o.rot, (o.off || []).slice().sort().join(','), o.rec || '', o.ct === undefined ? '-' : JSON.stringify(o.ct)].join('|');
const golden = JSON.parse(fs.readFileSync(ROOT + '/tests/fixtures/vc_golden.json', 'utf8')).b;
const gold = golden.map(key).sort();
const diff = (a, b) => {
  const m = new Map();
  for (const k of a) m.set(k, (m.get(k) || 0) + 1);
  for (const k of b) m.set(k, (m.get(k) || 0) - 1);
  return [...m].filter(([, c]) => c).map(([k, c]) => (c > 0 ? 'MISSING(golden) ' : 'EXTRA(gen) ') + k + (Math.abs(c) > 1 ? ' x' + Math.abs(c) : ''));
};
const C2 = 'DAT_Container_2', C1 = 'DAT_Container', ASM = 'DAT_Assembler', BELT = PLC_BELT[1], UG = PLC_UG[1], SPL = PLC_SPL[1];
const dims = {[C2]: [4, 4], [C1]: [2, 2], [ASM]: [5, 5]};
const dimOf = o => dims[o.cls] || [1, 1];
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];   // rot 0=E 1=S 2=W 3=N
const LET = {E: 0, S: 1, W: 2, N: 3};
const MODE = process.env.VC_OFF_MODE || 'ignore';   // 'abs' (off = absolute compass dir) refuted: right AMID 'S2' cuts the spine, golden must flow
const MAXAPART = 4;   // UG pair max distance (cells between entrance and exit + 1)
const count = a => a.reduce((m, o) => (m[o.cls] = (m[o.cls] || 0) + 1, m), {});

// Cell map + duplicate check
function cells(gen) {
  const occ = new Map(), dups = [];
  for (const o of gen) {
    const [w, h] = dimOf(o);
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
      const k = (o.x + dx) + ',' + (o.y + dy), who = o.cls + '@' + o.x + ',' + o.y;
      if (occ.has(k)) dups.push('DUP cell ' + k + ' ' + occ.get(k) + ' vs ' + who); else occ.set(k, who);
    }
  }
  return {occ, dups};
}
// Item flow flood from a start belt cell entered moving south (d=1). Containers pass to neighbours, machines are sinks.
function flood(gen, starts, mode) {
  const at = new Map();
  for (const o of gen) { const [w, h] = dimOf(o); for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) at.set((o.x + dx) + ',' + (o.y + dy), o); }
  const seen = new Set(), vis = new Set();
  const push = (x, y, d) => {
    const o = at.get(x + ',' + y); if (!o) return;
    const sk = x + ',' + y + ',' + d; if (seen.has(sk)) return; seen.add(sk);
    const ck = x + ',' + y;
    if (o.cls === C2 || o.cls === C1) {
      const [w, h] = dimOf(o);
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
        const cx = o.x + dx, cy = o.y + dy;
        for (let e = 0; e < 4; e++) {
          const nx = cx + DX[e], ny = cy + DY[e];
          if (nx >= o.x && nx < o.x + w && ny >= o.y && ny < o.y + h) continue;
          const q = at.get(nx + ',' + ny);
          if (q && (q.cls === C2 || q.cls === C1)) continue;   // containers do not feed containers
          push(nx, ny, e);
        }
      }
    } else if (o.cls === BELT) {
      if ((o.rot + 2) % 4 === d) return;
      vis.add(ck); push(x + DX[o.rot], y + DY[o.rot], o.rot);
    } else if (o.cls === UG) {
      if (o.rot !== d) return;
      vis.add(ck);
      for (let k = 1; k <= MAXAPART; k++) {
        const ex = x + k * DX[d], ey = y + k * DY[d], q = at.get(ex + ',' + ey);
        if (q && q.cls === UG && q.rot === d) { vis.add(ex + ',' + ey); push(ex + DX[d], ey + DY[d], d); return; }
      }
    } else if (o.cls === SPL) {
      if ((o.rot + 2) % 4 === d) return;
      vis.add(ck);
      const off = (o.off || []).map(t => LET[t[0]]);
      for (const e of [o.rot, (o.rot + 1) % 4, (o.rot + 3) % 4]) {
        if (mode === 'abs' && off.includes(e)) continue;
        push(x + DX[e], y + DY[e], e);
      }
    }
    // machines and anything else: sink
  };
  for (const [x, y] of starts) push(x, y, 1);
  return vis;
}

const results = [];
let fails = [];
// n=5 golden gate (unchanged)
{
  const gen = blVC(S(5));
  const d = diff(gold, gen.map(key).sort());
  const dups = cells(gen).dups;
  console.log('golden', golden.length, 'generated', gen.length, JSON.stringify(count(gen)));
  fails.push(...d, ...dups);
}
// n=1..8 structure, counts, height, flood
for (let n = 1; n <= 8; n++) {
  const f = [];
  const gen = blVC(S(n)), c = count(gen), T = 121, Y = 132, s1 = Math.ceil(n / 2);
  const {dups} = cells(gen);
  f.push(...dups);
  const expSpl = n === 1 ? 4 : 4 * (n - 1), expUG = 8 + 2 * (4 * Math.max(0, n - 2) + (n >= 2 ? 4 * s1 : 0));
  if (c[ASM] !== 2 * n) f.push(`asm ${c[ASM]} != ${2 * n}`);
  if (c[C2] !== 6 || c[C1] !== 4) f.push(`containers C2 ${c[C2]} C1 ${c[C1]}`);
  if ((c[SPL] || 0) !== expSpl) f.push(`splitters ${c[SPL]} != ${expSpl}`);
  if ((c[UG] || 0) !== expUG) f.push(`UG ${c[UG]} != ${expUG}`);
  const minY = Math.min(...gen.map(o => o.y)), maxY = Math.max(...gen.map(o => o.y + dimOf(o)[1] - 1));
  const height = maxY - minY + 1;
  if (height !== 5 * n + 19) f.push(`height ${height} != ${5 * n + 19}`);
  // machine ports: right col machines at x=X, left col at x=29-X-4=1. W7 = row r+1, W6 = row r+3 on the lane side.
  const mach = gen.filter(o => o.cls === ASM);
  const portCells = {R: [], L: []};
  for (const m of mach) {
    const side = m.x === 24 ? 'R' : 'L', px = side === 'R' ? m.x - 1 : m.x + 5, rot = side === 'R' ? 0 : 2, r = m.y;
    const at = (x, y) => gen.find(o => o.x === x && o.y === y && (o.cls === BELT || o.cls === SPL || o.cls === UG));
    const w7 = at(px, r + 1), w6 = at(px, r + 3);
    if (!w7 || !(w7.cls === SPL || (w7.cls === BELT && w7.rot === rot))) f.push(`W7 bad at ${px},${r + 1}`);
    if (!w6 || w6.cls !== BELT || w6.rot !== rot) f.push(`W6 bad at ${px},${r + 3}`);
    portCells[side].push({w7: px + ',' + (r + 1), w6: px + ',' + (r + 3)});
  }
  // flood: each source's S-port belt cells (y=T+4 under the container) must reach only its own column W cells: A -> W7, B -> W6
  const srcs = {RA: [[22, T + 4], [23, T + 4]], RB: [[20, T + 4], [21, T + 4]], LA: [[6, T + 4], [7, T + 4]], LB: [[8, T + 4], [9, T + 4]]};
  for (const [name, st] of Object.entries(srcs)) {
    const side = name[0], isA = name[1] === 'A';
    const vis = flood(gen, st, MODE);
    const want = portCells[side].map(p => isA ? p.w7 : p.w6), other = portCells[side].map(p => isA ? p.w6 : p.w7);
    const otherCol = portCells[side === 'R' ? 'L' : 'R'].flatMap(p => [p.w7, p.w6]);
    const got = want.filter(k => vis.has(k)).length;
    const bad = [...other, ...otherCol].filter(k => vis.has(k));
    if (got !== n) f.push(`${name} reaches ${got}/${n} ${isA ? 'W7' : 'W6'}`);
    if (bad.length) f.push(`${name} reaches wrong cells ${bad.join(' ')}`);
    results.push(`${name}:${got}/${n}`);
  }
  console.log(`n=${n} ${JSON.stringify(c)} total ${gen.length} height ${height} (5n+19=${5 * n + 19}) flood ${MODE} ${f.length ? 'FAIL' : 'ok'}`);
  fails.push(...f.map(x => `n=${n}: ${x}`));
}
// vcPlan units
const BC = {o: ['ITEM_BasicCircuit', 1], i: [['ITEM_SiliconWafers', 2], ['ITEM_MagneticCoils', 2]], t: 180};
const CAP = {o: ['ITEM_Capacitor', 1], i: [['ITEM_NickelPlates', 2], ['ITEM_TitaniumPlates', 1]], t: 120};
const RK = {o: ['ITEM_RepairKit', 1], i: [['ITEM_A', 2], ['ITEM_B', 2]], t: 90};    // synthetic: input rates 40/40 per min (spec)
const MC = {o: ['ITEM_MagneticCoils', 2], i: [['ITEM_Z', 1]], t: 30};              // synthetic: out 120/min, in 60/min (spec)
const pb = vcPlan(BC, 'DAT_Assembler', 1, 10), pc = vcPlan(CAP, 'DAT_Assembler', 1, 10), pr = vcPlan(RK, 'DAT_Assembler', 1, 4), pm = vcPlan(MC, 'DAT_Assembler', 1, 4);
console.log('vcPlan BasicCircuits', JSON.stringify(pb), 'Capacitor', JSON.stringify(pc), 'RepairKit', JSON.stringify(pr), 'MagCoils', JSON.stringify(pm));
if (!(pb.ok && pb.g === 3 && pb.nmax === 6 && pb.K === 1 && pb.n === 5)) fails.push('vcPlan BasicCircuits ' + JSON.stringify(pb));
if (!(pc.ok && pc.g === 2)) fails.push('vcPlan Capacitor ' + JSON.stringify(pc));
for (const N of [2, 4, 8, 10, 16]) {
  const p = vcPlan(RK, 'DAT_Assembler', 1, N);
  if (!(p.ok && p.g === 1 && p.n <= 2 && p.actual >= N * 20)) fails.push('vcPlan RepairKit N=' + N + ' ' + JSON.stringify(p));
}
if (!(pm.ok && pm.nmax === 1)) fails.push('vcPlan MagCoils ' + JSON.stringify(pm));
if (vcPlan(BC, 'DAT_Assembler', 1, 10).actual < 10 * 10) fails.push('vcPlan under-delivers');
console.log('flood reach', results.join(' '));
if (fails.length) { console.log(fails.join('\n')); console.log(`FAIL ${fails.length} mismatches`); process.exit(1); }
console.log('PASS n=1..8 structure/counts/height/flood, n=5 golden zero diff, vcPlan units');

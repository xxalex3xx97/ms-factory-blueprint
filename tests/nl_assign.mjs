// NL2 nlAssign gates (pure function, no browser). Run: node tests/nl_assign.mjs   Exit 1 on FAIL.
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nlAssign = new Function(fs.readFileSync(ROOT + '/js/nl_plan.js', 'utf8') + ';return nlAssign')();
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } };
// gates for one case; returns list of violations
function gates(lanes, heads, cap, tag, sumEq) {
  const bad = [], {of, spill} = nlAssign(lanes, heads, cap), E = 1e-9;
  for (const h of heads) if (!of.has(h.id)) bad.push(tag + ' head ' + h.id + ' unassigned');
  if (spill.length !== lanes.length) bad.push(tag + ' spill length');
  spill.forEach((v, j) => {
    if (v < -E) bad.push(tag + ' spill ' + j + ' negative ' + v);
    if (j + 1 < lanes.length && v + lanes[j + 1].s > cap + E) bad.push(tag + ' spill ' + j + ' + next s > cap');
  });
  // replay: lane load at each tap (in head order) must cover the head demand
  let carry = 0;
  lanes.forEach((l, j) => {
    let load = l.s + carry;
    if (load > cap + E) bad.push(tag + ' lane ' + j + ' load ' + load + ' > cap');
    for (const h of heads) if (of.get(h.id) === l.id) { if (load < h.d - E) bad.push(tag + ' lane ' + j + ' load ' + load.toFixed(3) + ' < head ' + h.id + ' d ' + h.d.toFixed(3)); load -= h.d }
    carry = load;
  });
  if (sumEq && Math.abs(carry) > 1e-6) bad.push(tag + ' end carry ' + carry);
  return bad;
}
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
for (let t = 0; t < 2000; t++) {
  const cap = [120, 240, 480][t % 3], half = cap / 2;
  const nl = 1 + Math.floor(rnd() * 8);
  const lanes = Array.from({length: nl}, (_, i) => ({id: 'L' + i, s: Math.max(0.5, rnd() * half)}));
  let rem = lanes.reduce((a, l) => a + l.s, 0);
  const heads = [];
  while (rem > 1e-9) { const d = rem <= half ? rem : Math.max(0.5, Math.min(rem, rnd() * half)); heads.push({id: 'H' + heads.length, d}); rem -= d; if (rem < 0.5 && rem > 1e-9) { heads[heads.length - 1].d += rem; rem = 0 } }
  for (const m of gates(lanes, heads, cap, 'rand' + t, true)) check(false, m);
}
// 3 lanes of 200/3, 2 heads of 100 (sum equal, cap 200) and the literal 3 x 67 / 2 x 100 (supply 1 over)
const cap = 200;
for (const m of gates([1, 2, 3].map(i => ({id: 'L' + i, s: 200 / 3})), [{id: 'A', d: 100}, {id: 'B', d: 100}], cap, 'three-lanes-eq', true)) check(false, m);
for (const m of gates([1, 2, 3].map(i => ({id: 'L' + i, s: 67})), [{id: 'A', d: 100}, {id: 'B', d: 100}], cap, 'three-lanes-67', false)) check(false, m);
const r = nlAssign([1, 2, 3].map(i => ({id: 'L' + i, s: 200 / 3})), [{id: 'A', d: 100}, {id: 'B', d: 100}], cap);
check(r.of.get('A') === 'L2' && r.of.get('B') === 'L3', 'three-lanes: A on L2, B on L3');
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails ? 1 : 0);

// VC2 gate: blVC full template n=5 vs golden (all 288 items, no duplicate cells). Run: node tests/bl_vc.mjs   Exit 1 on FAIL.
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLC_BELT = ["DAT_ConveyorBelt", "DAT_ConveyorBelt2", "DAT_ConveyorBelt3"], PLC_SPL = ["DAT_Splitter", "DAT_Splitter_2", "DAT_Splitter_3"], PLC_UG = ["DAT_UndergroundBelt", "DAT_UndergroundBelt_2", "DAT_UndergroundBelt_3"];
const {blVC} = new Function('PLC_BELT', 'PLC_SPL', 'PLC_UG', fs.readFileSync(ROOT + '/js/bl_vc.js', 'utf8') + ';return {blVC}')(PLC_BELT, PLC_SPL, PLC_UG);
const key = o => [o.cls, o.x, o.y, o.rot, (o.off || []).slice().sort().join(','), o.rec || '', o.ct === undefined ? '-' : JSON.stringify(o.ct)].join('|');
const golden = JSON.parse(fs.readFileSync(ROOT + '/tests/fixtures/vc_golden.json', 'utf8')).b;
const gold = golden.map(key).sort();
const gen = blVC({mk: 1, cls: 'DAT_Assembler', rec: 'ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit', X: 24, Y: 132, T: 121, n: 5, w: 5});
const genKeys = gen.map(key).sort();
const diff = (a, b) => {
  const m = new Map();
  for (const k of a) m.set(k, (m.get(k) || 0) + 1);
  for (const k of b) m.set(k, (m.get(k) || 0) - 1);
  return [...m].filter(([, c]) => c).map(([k, c]) => (c > 0 ? 'MISSING(golden) ' : 'EXTRA(gen) ') + k + (Math.abs(c) > 1 ? ' x' + Math.abs(c) : ''));
};
const dims = {DAT_Container_2: [4, 4], DAT_Container: [2, 2], DAT_Assembler: [5, 5]};
const occ = new Map(), dups = [];
for (const o of gen) {
  const [w, h] = dims[o.cls] || [1, 1];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
    const k = (o.x + dx) + ',' + (o.y + dy), who = o.cls + '@' + o.x + ',' + o.y;
    if (occ.has(k)) dups.push('DUP cell ' + k + ' ' + occ.get(k) + ' vs ' + who); else occ.set(k, who);
  }
}
const count = a => a.reduce((m, o) => (m[o.cls] = (m[o.cls] || 0) + 1, m), {});
console.log('golden', golden.length, 'generated', gen.length, JSON.stringify(count(gen)));
const all = [...diff(gold, genKeys), ...dups];
if (all.length) { console.log(all.join('\n')); console.log(`FAIL ${all.length} mismatches`); process.exit(1); }
console.log('PASS full n=5 template zero diff, no duplicate cells');

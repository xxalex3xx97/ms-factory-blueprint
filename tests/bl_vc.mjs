// VC1 gate: blVC right half vs golden (x 20..29, y 132..155). Run: node tests/bl_vc.mjs   Exit 1 on FAIL.
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLC_BELT = ["DAT_ConveyorBelt", "DAT_ConveyorBelt2", "DAT_ConveyorBelt3"], PLC_SPL = ["DAT_Splitter", "DAT_Splitter_2", "DAT_Splitter_3"], PLC_UG = ["DAT_UndergroundBelt", "DAT_UndergroundBelt_2", "DAT_UndergroundBelt_3"];
const {blVC} = new Function('PLC_BELT', 'PLC_SPL', 'PLC_UG', fs.readFileSync(ROOT + '/js/bl_vc.js', 'utf8') + ';return {blVC}')(PLC_BELT, PLC_SPL, PLC_UG);
const key = o => [o.cls, o.x, o.y, o.rot, (o.off || []).slice().sort().join(','), o.rec || ''].join('|');
const win = o => o.x >= 20 && o.x <= 29 && o.y >= 132 && o.y <= 155;
const gold = JSON.parse(fs.readFileSync(ROOT + '/tests/fixtures/vc_golden.json', 'utf8')).b
  .filter(win).map(key).sort();
const gen = blVC({mk: 1, cls: 'DAT_Assembler', rec: 'ITEM_SiliconWafers+ITEM_MagneticCoils>ITEM_BasicCircuit', X: 24, Y: 132, T: 121, n: 5, w: 5}).filter(win).map(key).sort();
const diff = (a, b) => {
  const m = new Map();
  for (const k of a) m.set(k, (m.get(k) || 0) + 1);
  for (const k of b) m.set(k, (m.get(k) || 0) - 1);
  return [...m].filter(([, c]) => c).map(([k, c]) => (c > 0 ? 'MISSING(golden) ' : 'EXTRA(gen) ') + k + (Math.abs(c) > 1 ? ' x' + Math.abs(c) : ''));
};
const d = diff(gold, gen);
console.log(`golden ${gold.length} items, generated ${gen.length} items`);
if (d.length) { console.log(d.join('\n')); console.log(`FAIL ${d.length} mismatches`); process.exit(1); }
console.log('PASS right half zero diff');

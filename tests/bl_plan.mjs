// BL1 block planner gates (pure function, no browser). Run: node tests/bl_plan.mjs   Exit 1 on FAIL.
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {BL, blM, blNK, blRowsM} = new Function(fs.readFileSync(ROOT + '/js/bl_plan.js', 'utf8') + ';return {BL,blM,blNK,blRowsM}')();
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check(BL.TW === 25 && BL.ROWS === 3, 'BL constants');
check(blM(20, 20, 3, 120, 4, 3) === 6, 'blM 120/min -> 6');
check(blM(20, 20, 3, 60, 4, 3) === 3, 'blM 60/min -> 3');

let r = blNK([6], [6], [3]);
check(r.K === 1 && eq(r.r, [1]), 'blNK [6] -> K1 rows [1]');
r = blNK([18], [6], [3]);
check(r.K === 1 && eq(r.r, [3]), 'blNK [18] -> K1 rows [3]');
r = blNK([19], [6], [3]);
check(r.K === 2, 'blNK [19] -> K2');
r = blNK([6, 36], [6, 6], [2, 3]);
check(r.K === 2 && r.r[0] <= 2 && r.r[1] <= 3, 'blNK two stages -> K2, rows within Rm');

check(eq(blRowsM(14, 6), [6, 6, 2]), 'blRowsM 14/6 -> [6,6,2]');

console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

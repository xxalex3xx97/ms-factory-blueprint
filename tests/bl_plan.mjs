// BL1 block planner gates (pure function, no browser). Run: node tests/bl_plan.mjs   Exit 1 on FAIL.
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {BL, blM, blNK, blRowsM, blRW} = new Function(fs.readFileSync(ROOT + '/js/bl_plan.js', 'utf8') + ';return {BL,blM,blNK,blRowsM,blRW}')();
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

// Z2: zone width 30, row caps
check(BL.W === 30 && BL.RB(5) === 5 && BL.RB(3) === 9 && BL.RB(4) === 7 && BL.RB(7) === 4, 'BL.RB rows per zone (P=5 ->5, P=3 ->9, P=4 ->7, P=7 ->4)');
check(eq(blRW(5, 3), {X0: 6, rx: 6, M: 6}), 'blRW R=5 w=3 -> X0 6, rx 6, M 6');
check(eq(blRW(4, 3), {X0: 5, rx: 6, M: 6}), 'blRW R=4 w=3 -> X0 5, rx 6, M 6');
check(blRW(6, 3).M === 5, 'blRW R=6 w=3 -> M 5');
check(blRW(3, 3).M === 8 && blRW(1, 3).X0 === 0, 'blRW R=3 M 8, R=1 X0 0');
r = blNK([30], [3], [9]);
check(r.K === 3 && eq(r.r, [4]), 'blNK rows capped at 4: 30 machines, M3, Rm9 -> K3 rows [4]');

console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

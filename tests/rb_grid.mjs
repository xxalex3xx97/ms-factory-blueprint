// RB S1: js/rb_grid.js (occupancy, corridor rows, spot search). Node only. Run: node tests/rb_grid.mjs   Exit 1 on FAIL.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath} from 'url';
const require = createRequire(import.meta.url);
const {rbGrid, rbCandidates} = require(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../js/rb_grid.js'));
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const g = rbGrid(), A = {id: 'A'}, B = {id: 'B'};
const cells = (c, r, n) => Array.from({length: n}, (_, i) => ({gx: c, gy: r + i, dx: 0, dy: i}));
check(g.claim(A, cells(2, 0, 3)), 'claim free cells');
check(!g.claim(B, cells(2, 2, 2)), 'overlap refused');
check(!g.occ.has('2,3'), 'refused claim leaves nothing behind');
check(g.claim(B, cells(2, 3, 2)), 'adjacent claim ok');
check(g.occ.get('2,1').mod === A && g.occ.get('2,1').dy === 1, 'occupancy keeps mod,dx,dy');
check(!g.free(cells(2, 0, 1)) && g.free(cells(3, 0, 5)), 'free() true only for unclaimed cells');
g.release(A);
check(g.free(cells(2, 0, 3)) && !g.free(cells(2, 3, 1)), 'release restores A cells only');
check(g.claim(A, cells(2, 0, 3)), 'reclaim after release');
// corridor rows: lane from block col 0 to col 6 in row 5 at local y 4
check(g.laneFree(0, 6, 5, 4), 'corridor row free');
g.laneClaim(0, 6, 5, 4);
check(!g.laneFree(0, 6, 5, 4) && !g.laneFree(2, 4, 5, 4), 'corridor row occupied between ends and in a sub-span');
check(g.laneFree(0, 6, 5, 6) && g.laneFree(0, 6, 6, 4), 'other local y / other block row stay free');
check(g.laneFree(0, 1, 5, 4) && g.laneFree(5, 6, 5, 4), 'ends are exclusive (no block between)');
check(!g.free([{gx: 3, gy: 5}]), 'a module cannot claim a block that carries a lane');
g.laneRelease(0, 6, 5, 4);
check(g.laneFree(0, 6, 5, 4) && g.cor.size === 0, 'laneRelease restores');
check(!g.laneFree(0, 6, 1, 4), 'lane blocked by a module cell in its way');
// spot order
const o = rbCandidates(3, 10).map(q => q.c + ',' + (q.r - 10));
const want = []; for (let dc = 0; dc < 4; dc++) for (const dr of [0, 1, -1, 2, -2, 3]) want.push((3 + dc) + ',' + dr);
check(o.length === 24 && o.join() === want.join(), 'candidate order dc 0..3, dr 0,+1,-1,+2,-2,+3 (24)');
check(rbCandidates(0, 0, 7).length === 7 && rbCandidates(0, 0, 7).map(q => q.r).join() === '0,1,-1,2,-2,3,0', 'cap respected');
console.log(fails ? 'FAIL ' + fails : 'PASS rb_grid');
process.exit(fails ? 1 : 0);

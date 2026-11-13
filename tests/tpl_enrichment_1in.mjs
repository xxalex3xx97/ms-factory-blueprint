// TPL Enrichment Chamber 1-input template: js/tpl/enrichment_1in.js. Run: node tests/tpl_enrichment_1in.mjs   Exit 1 on FAIL or page error.
// Per block type (1x1, 1x2, 2x2, 2x2c) and n in {1,2,nMax-1,nMax}: overlap, inside floor, placerTile (ok, ov 0, span 0, 1 block), connectivity flood
// (every machine input port reached from a lane and only its in-port; every machine out reaches the east-edge out lane; no machine out reaches an in port), rate check (derate printed).
// n=nMax+1 must be refused. Also screenshots tests/shots/tpl_enrichment_1in_<block>_n<N>.png (canvas render of the items, if SHOTS=1).
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerTile === 'function' && typeof pfSplOff === 'function');
await pg.addScriptTag({path: ROOT + '/js/tpl/enrichment_1in.js'});
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const REC = {fuel: 'ITEM_HydrogenFuel>ITEM_EnrichedFuel', ore: 'ITEM_NickelOre>ITEM_EnrichedNickelOre', cool: 'ITEM_NitrogenGas>ITEM_Coolant', proto: 'ITEM_Protomatter>ITEM_Silica'};
const BLK = ['1x1', '1x2', '2x2', '2x2c'];
const rows = [];
async function one(block, n, mk, rec, shot) {
  return pg.evaluate(([block, n, mk, rec]) => {
    const spec = {block, cls: 'DAT_EnrichmentChamber', rec, n, mk, spMk: mk};
    const T = tplBuild(spec);
    if (!T.ok) return {refused: T.why, nMax: tplMax(spec)};
    const out = {nMax: T.nMax, w: T.w, h: T.h, stats: T.stats};
    const IT = T.items, occ = new Map(), isB = b => PLC_BELT.includes(b.cls), isS = b => PLC_SPL.includes(b.cls), isU = b => PLC_UG.includes(b.cls), isMach = b => b.cls === 'DAT_EnrichmentChamber';
    let ov = 0, outside = 0;
    for (const b of IT) { const d = dim(b); if (b.x < 0 || b.y < 0 || b.x + d.w > T.w || b.y + d.h > T.h) outside++;
      for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (occ.has(k)) ov++; else occ.set(k, b) } }
    out.ov = ov; out.outside = outside;
    // placerTile
    const L = {ok: true, items: IT, w: T.w, h: T.h, pitch: T.h + 1, lanes: 1, tall: true, mk, box: 'DAT_Container_2', cuts: [], ports: [], note: [], mod: false};
    const okv = [false, false, false, false]; okv[BLK_IDX[block]] = true;
    const PT = placerTile(L, okv);
    out.tile = {ok: PT.ok, ov: PT.ov, span: PT.span, blocks: PT.blocks ? PT.blocks.length : 0, cls: PT.blocks && PT.blocks[0] ? PT.blocks[0].cls : null, why: PT.ok ? '' : String(PT.why).slice(0, 160), want: plcCls(PL_ALL[BLK_IDX[block]])};
    // flood
    const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const mach = IT.filter(isMach).map((m, i) => ({m, i, ps: portsOf(m)}));
    const portAt = new Map();   // cell -> {mi, p}
    mach.forEach(q => q.ps.forEach(p => portAt.set(p.x + ',' + p.y, {q, p})));
    const enP = q => q.ps.filter(p => p.en);
    out.portsEn = mach.map(q => enP(q).length);
    const at = (x, y) => occ.get(x + ',' + y);
    // walk(start cell, dir): token moves into cell (x,y) travelling direction d; returns {machIn:Set of "mi:key", exitEast:bool, dead:[...]}.
    function walk(starts) {
        const seen = new Set(), res = {machIn: [], east: [], dead: [], hitOutPort: []};
        const q = starts.map(s => ({...s}));
        while (q.length) {
            let {x, y, d} = q.pop();   // token enters cell (x,y) moving in direction d
            for (let guard = 0; guard < 400; guard++) {
                const k = x + ',' + y + ',' + d; if (seen.has(k)) break; seen.add(k);
                if (x >= T.w) { res.east.push(y); break }
                const b = at(x, y);
                if (!b) { res.dead.push(x + ',' + y); break }
                if (isMach(b)) {   // entering a machine through the cell next to its port: port cell = (x,y) must be an enabled port with outward normal opposite d
                    const hit = portAt.get(x + ',' + y);
                    if (hit && hit.p.en && hit.p.nx === -DIR[d][0] && hit.p.ny === -DIR[d][1]) res.machIn.push(hit.q.i + ':' + hit.p.key);
                    else res.dead.push('machwall ' + x + ',' + y);
                    break;
                }
                if (isB(b)) { if ((b.rot + 2) % 4 === d) { res.dead.push('headon ' + x + ',' + y); break } const nd = b.rot; x += DIR[nd][0]; y += DIR[nd][1]; d = nd; continue }
                if (isS(b)) {
                    if (b.rot !== d) { res.dead.push('splSide ' + x + ',' + y); break }
                    const ps = portsOf(b).filter(p => p.dir !== 'in' && p.en);
                    ps.slice(1).forEach(p => q.push({x: p.x + p.nx, y: p.y + p.ny, d: DIR.findIndex(v => v[0] === p.nx && v[1] === p.ny)}));
                    const p0 = ps[0]; if (!p0) { res.dead.push('splNoOut'); break }
                    x = p0.x + p0.nx; y = p0.y + p0.ny; d = DIR.findIndex(v => v[0] === p0.nx && v[1] === p0.ny); continue;
                }
                if (isU(b)) {   // entrance: jump to the next UG on the same line within maxApart (in direction b.rot), continue past it
                    if (b.rot !== d) { res.dead.push('ugSide ' + x + ',' + y); break }
                    const mx = def(b.cls).maxApart; let j = 1, t = null;
                    for (; j < mx; j++) { const c = at(x + DIR[d][0] * j, y + DIR[d][1] * j); if (c && isU(c) && c.rot === d) { t = c; break } if (c && isU(c)) break }
                    if (!t) { res.dead.push('ugNoExit ' + x + ',' + y); break }
                    x = t.x + DIR[d][0]; y = t.y + DIR[d][1]; continue;
                }
                res.dead.push('unk'); break;
            }
        }
        return res;
    }
    // input lanes
    const lanes = T.ports.in.map(l => walk([{x: l.x, y: l.y, d: 0}]));
    const wantIn = new Set(mach.map(q => { const p = enP(q); return null }));
    // declared in/out port per machine: enabled ports; in = the one reached from a lane, out = the other; we need exactly 2 enabled and in-reach count n
    const inReach = new Map(); lanes.forEach((r, li) => r.machIn.forEach(s => { inReach.set(s, li) }));
    out.laneLoadN = T.ports.in.map((_, li) => [...inReach.values()].filter(v => v === li).length);
    out.inMachines = new Set([...inReach.keys()].map(s => s.split(':')[0])).size;
    out.inPortsPerMachine = Math.max(...[...mach.map(q => [...inReach.keys()].filter(s => s.startsWith(q.i + ':')).length)]);
    out.laneDead = lanes.map((r, li) => r.dead.filter(d => !(li === 1 && out.laneLoadN[1] === 0)).slice(0, 4));
    // machine outputs: for each machine, the enabled port not used as in port
    let outsOk = 0, outBad = [], toIn = 0;
    const outEast = new Set(), mixed = [];
    for (const q of mach) {
        const inK = [...inReach.keys()].filter(s => s.startsWith(q.i + ':')).map(s => s.split(':')[1]), op = enP(q).filter(p => !inK.includes(p.key));
        if (op.length !== 1) { outBad.push(q.i + ' outports ' + op.length); continue }
        const p = op[0], c = {x: p.x + p.nx, y: p.y + p.ny}, nb = at(c.x, c.y);
        if (!nb) { outBad.push(q.i + ' no belt at out port'); continue }
        if (isB(nb) && (nb.rot + 2) % 4 === DIR.findIndex(v => v[0] === p.nx && v[1] === p.ny)) { outBad.push(q.i + ' out belt faces machine'); continue }
        const d = DIR.findIndex(v => v[0] === p.nx && v[1] === p.ny), r = walk([{x: c.x, y: c.y, d: isB(nb) ? nb.rot : d}]);
        // walk() with a belt start: the token enters the belt cell moving along its own rot (a side input into it)
        r.east.forEach(y => outEast.add(y)); toIn += r.machIn.length; if (r.east.length) outsOk++; else outBad.push(q.i + ' out does not reach east ' + r.dead.slice(0, 2).join('|'));
    }
    out.outsOk = outsOk; out.outBad = outBad; out.outEast = [...outEast]; out.outToMachine = toIn;
    // rates
    out.rate = tplEnrRate(spec); out.rateMax = tplRateMax(spec);
    out.outLane = T.ports.out[0];
    out.lastOutBelt = (() => { const b = at(T.w - 1, T.ports.out[0].y); return b && isB(b) && b.rot === 0 })();
    out.inLaneBelts = T.ports.in.map(l => { const b = at(l.x, l.y); return !!b && b.rot === 0 && (isB(b) || isS(b)) });
    // wall columns: only lane cells (rot-0 belts at the lane rows) on x=0 and x=W-1 (a neighbour block pastes next to them)
    const lanesY = new Set(T.ports.in.map(l => l.y)), edgeBad = [];
    for (const b of IT) { if (isMach(b)) continue; if (b.x === 0 && !lanesY.has(b.y)) edgeBad.push('W' + b.y); if (b.x === T.w - 1 && b.y !== T.ports.out[0].y) edgeBad.push('E' + b.y) }
    out.edgeBad = edgeBad; out.nIn = T.ports.in.length;
    // wall crossings with straight belt stubs of a neighbour zone on the lane rows (placer bank rules: plcTryCut at column 0 = west wall, column W = east wall): lane belts must convert to UG pairs
    const st = (x, y) => ({cls: PLC_BELT[mk], x, y, rot: 0, h: 0, pid: 0});
    const ITw = IT.concat(T.ports.in.map(l => st(-1, l.y))), cw = plcTryCut(ITw, plcOcc(ITw), T.h, true, 0);
    const ITe = IT.concat([st(T.w, T.ports.out[0].y)]), ce = plcTryCut(ITe, plcOcc(ITe), T.h, true, T.w);
    out.cutW = cw ? cw.length : null; out.cutE = ce ? ce.length : null;
    out.items = IT.map(b => ({cls: b.cls, x: b.x, y: b.y, rot: b.rot, w: dim(b).w, h: dim(b).h}));
    return out;
  }, [block, n, mk, rec]).then(r => r);
}
await pg.evaluate(() => { window.BLK_IDX = {'1x1': 0, '1x2': 1, '2x2': 2, '2x2c': 3}; });
fs.mkdirSync(path.join(ROOT, 'tests/shots'), {recursive: true});
const shotPage = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
async function shot(block, n, r) {
    const W = r.w, H = r.h, S = Math.max(8, Math.floor(Math.min(1200 / W, 760 / H)));
    const html = `<canvas id=c width=${W * S + 2} height=${H * S + 2}></canvas>`;
    await shotPage.setContent(html);
    await shotPage.evaluate(([items, W, H, S]) => {
        const c = document.getElementById('c').getContext('2d'); c.fillStyle = '#10151a'; c.fillRect(0, 0, W * S + 2, H * S + 2);
        c.strokeStyle = '#2b3640'; c.strokeRect(.5, .5, W * S + 1, H * S + 1);
        const col = b => b.cls === 'DAT_EnrichmentChamber' ? '#3a7' : /Splitter/.test(b.cls) ? '#e8b' : /Underground/.test(b.cls) ? '#f90' : '#9ab';
        for (const b of items) { c.fillStyle = col(b); c.fillRect(1 + b.x * S + 1, 1 + b.y * S + 1, b.w * S - 2, b.h * S - 2);
            if (/Conveyor|Underground|Splitter/.test(b.cls)) { c.fillStyle = '#000'; c.font = (S - 2) + 'px sans-serif'; c.fillText(['>', 'v', '<', '^'][b.rot], 1 + b.x * S + S * .25, 1 + b.y * S + S * .8) } }
    }, [r.items, W, H, S]);
    await shotPage.screenshot({path: path.join(ROOT, `tests/shots/tpl_enrichment_1in_${block}_n${n}.png`), clip: {x: 0, y: 0, width: Math.min(1280, W * S + 2), height: Math.min(800, H * S + 2)}});
}
const tests = [];
for (const block of BLK) {
    const nMax = await pg.evaluate(b => tplMax({block: b}), block);
    console.log(`== ${block}: nMax ${nMax}`);
    const ns = [...new Set([1, 2, nMax - 1, nMax].filter(n => n >= 1 && n <= nMax))];
    for (const n of ns) {
        for (const [mk, rec] of [[2, REC.fuel]]) {
            const r = await one(block, n, mk, rec);
            const tag = `${block} n=${n} Mk${mk + 1}`;
            if (r.refused) { check(false, tag + ' refused ' + r.refused); continue }
            check(r.ov === 0, tag + ' no overlap'); check(r.outside === 0, tag + ' inside floor');
            check(r.tile.ok && r.tile.ov === 0 && r.tile.span === 0 && r.tile.blocks === 1 && r.tile.cls === r.tile.want, tag + ' placerTile ' + JSON.stringify(r.tile));
            check(r.portsEn.every(v => v === 2), tag + ' every machine has exactly 2 enabled ports');
            check(r.inMachines === n && r.inPortsPerMachine === 1, tag + ` input reaches ${r.inMachines}/${n} machines (1 port each)`);
            check(r.outsOk === n && !r.outBad.length && r.outEast.length === 1 && r.outEast[0] === r.outLane.y, tag + ` outputs reach the east out lane ${r.outsOk}/${n} ${r.outBad.join(';')}`);
            check(r.outToMachine === 0, tag + ' no output reaches a machine port');
            check(r.laneDead.every(d => d.every(x => !/headon|ugNoExit|unk|splSide|ugSide|splNoOut|machwall/.test(x))), tag + ' no broken belt hops ' + JSON.stringify(r.laneDead));
            check(r.edgeBad.length === 0, tag + ' wall columns clean ' + r.edgeBad.join(','));
            check(r.cutW === 2 * (r.nIn) && r.cutE === 2, tag + ` wall crossings (plcTryCut bank): west ${r.cutW} cells (${r.nIn} lanes), east ${r.cutE} cells -> UG pairs`);
            check(r.lastOutBelt && r.inLaneBelts.every(Boolean), tag + ' lane port cells are rot-0 belts (in ' + r.inLaneBelts + ', out ' + r.lastOutBelt + ')');
            check(r.rate.ok && r.rate.capOk, tag + ` rate within raw cap (in ${r.rate.inLoads.map(v => v.toFixed(0))}/min out ${r.rate.outLoad.toFixed(0)}/min, cap ${r.rate.cap}) derate ${r.rate.derOk ? 'OK' : 'EXCEEDED'} (n<=${r.rateMax} fits derate)`);
            rows.push([block, n, r.stats.machines, r.stats.belts, r.stats.ug, r.stats.spl, r.w * r.h, (r.stats.belts + r.stats.ug + r.stats.spl) / n]);
            if (process.env.SHOTS !== '0' && (n === 1 || n === nMax)) await shot(block, n, r);
        }
    }
    // negative: nMax+1 refused; machine count nMax is truly the max (geometric check: a 10th placement overlaps)
    const neg = await pg.evaluate(([b, n]) => tplBuild({block: b, cls: 'DAT_EnrichmentChamber', rec: 'x', n, mk: 2, spMk: 2}), [block, nMax + 1]);
    check(!neg.ok, `${block} n=${nMax + 1} refused (${neg.why})`);
    // nMax is the real max: the free floor cells cannot hold another 9x9 machine next to the template at nMax
    const fit = await pg.evaluate(([b, n]) => {
        const T = tplBuild({block: b, cls: 'DAT_EnrichmentChamber', rec: 'x', n, mk: 1, spMk: 1}), occ = new Set();
        for (const q of T.items) { const d = dim(q); for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) occ.add((q.x + i) + ',' + (q.y + j)) }
        for (let x = 0; x + 9 <= T.w; x++) for (let y = 0; y + 9 <= T.h; y++) { let free = true; for (let i = 0; i < 9 && free; i++) for (let j = 0; j < 9; j++) if (occ.has((x + i) + ',' + (y + j))) { free = false; break } if (free) return {x, y} }
        return null;
    }, [block, nMax]);
    check(fit === null, `${block} nMax ${nMax} is the max: ${fit ? 'a free 9x9 spot exists at ' + JSON.stringify(fit) : 'no free 9x9 spot left'}`);
}
// other belt tiers at nMax (Mk1/Mk3, spMk follows)
for (const block of BLK) {
    const nMax = await pg.evaluate(b => tplMax({block: b}), block);
    for (const mk of [0, 2]) {
        const r = await one(block, nMax, mk, REC.ore);
        const tag = `${block} n=${nMax} Mk${mk + 1} (Nickel ore recipe)`;
        check(!r.refused && r.ov === 0 && r.outside === 0 && r.tile.ok && r.tile.ov === 0 && r.tile.span === 0 && r.inMachines === nMax && r.outsOk === nMax, tag + ' builds, tiles, connects');
        console.log(`     rate: in ${r.rate.inLoads.map(v => v.toFixed(0))} out ${r.rate.outLoad.toFixed(0)} cap ${r.rate.cap} derateOK ${r.rate.derOk} nByDerate ${r.rateMax}`);
    }
}
console.log('block  n machines belts ug spl area (belts+ug+spl)/machine');
for (const r of rows) console.log(r.slice(0, 7).join('\t') + '\t' + r[7].toFixed(1));
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

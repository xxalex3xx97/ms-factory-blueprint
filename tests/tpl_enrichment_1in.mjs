// TPL Enrichment Chamber 1-input template: js/tpl/enrichment_1in.js. Run: node tests/tpl_enrichment_1in.mjs   Exit 1 on FAIL or page error.
// Per block type (1x1, 1x2, 2x2, 2x2c) and n in {1,2,nMax-1,nMax}: overlap, inside floor, placerTile (ok, ov 0, span 0, 1 block), connectivity flood
// (every machine input port reached from a lane and only its in-port; every machine out reaches the east-edge out lane; no machine out reaches an in port), rate check (derate printed).
// n=nMax+1 must be refused. Also screenshots tests/shots/tpl_enrichment_1in_<block>_n<N>.png (canvas render of the items, if SHOTS=1).
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkIface, checkChain} from './tpl_iface.mjs';
import {checkPlan} from './tpl_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerTile === 'function' && typeof pfSplOff === 'function');
if (!(await pg.evaluate(() => typeof tplIfSets === 'function'))) await pg.addScriptTag({path: ROOT + '/js/tpl/iface.js'});   // index.html may already load iface.js
await pg.addScriptTag({path: ROOT + '/js/tpl/enrichment_1in.js'});   // fresh copy (const redeclare is fine only if bundle lacks it)
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
    const out = {T: {items: T.items, ports: T.ports, w: T.w, h: T.h, iface: T.iface, nMax: T.nMax}, nMax: T.nMax, w: T.w, h: T.h, stats: T.stats};
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
    out.fill = T.iface.sets.map(s => s.n);
    out.inMachines = new Set([...inReach.keys()].map(s => s.split(':')[0])).size;
    out.inPortsPerMachine = Math.max(...[...mach.map(q => [...inReach.keys()].filter(s => s.startsWith(q.i + ':')).length)]);
    out.laneDead = lanes.map((r, li) => r.dead.filter(d => !(out.laneLoadN[li] === 0)).slice(0, 4));
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
    out.outYs = T.ports.out.map(p => p.y);
    out.lastOutBelt = T.ports.out.every(p => { const b = at(T.w - 1, p.y); return b && isB(b) && b.rot === 0 });
    out.prioOk = IT.filter(isS).every(b => b.pr && b.pr[0] === 0 && b.pr[1] === -1) && IT.filter(isS).every(b => portsOf(b).filter(p => p.dir === 'out' && p.en).length === 2 && portsOf(b).some(p => p.pr && p.nx === 0 && p.ny === 1));
    out.inLaneBelts = T.ports.in.map(l => { const b = at(l.x, l.y); return !!b && b.rot === 0 && (isB(b) || isS(b)) });
    out.nIn = T.ports.in.length;
    // wall crossings with straight belt stubs of a neighbour zone on the lane rows (placer bank rules: plcTryCut at column 0 = west wall, column W = east wall): lane belts must convert to UG pairs
    const st = (x, y) => ({cls: PLC_BELT[mk], x, y, rot: 0, h: 0, pid: 0});
    const ITw = IT.concat(T.ports.in.map(l => st(-1, l.y))), cw = plcTryCut(ITw, plcOcc(ITw), T.h, true, 0);
    const ITe = IT.concat(T.ports.out.map(p => st(T.w, p.y))), ce = plcTryCut(ITe, plcOcc(ITe), T.h, true, T.w);
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
const TPL = {build: 'tplBuild', max: 'tplMax', cls: 'DAT_EnrichmentChamber'};
const nMaxOf = (block, rec, mk) => pg.evaluate(([b, r, m]) => tplMax({block: b, rec: r, mk: m}), [block, rec, mk]);
const tabIface = [];
for (const block of BLK) {
    const nMax = await nMaxOf(block, REC.fuel, 2), nMaxG = await pg.evaluate(b => tplMax({block: b}), block);
    console.log(`== ${block}: nMax ${nMax} (geometric ${nMaxG}, before Edge v1: ${{'1x1': 1, '1x2': 3, '2x2': 9, '2x2c': 9}[block]})`);
    check(nMax === nMaxG, `${block} nMax with fuel recipe at Mk3 equals geometric`);
    const ns = [...new Set([1, 2, nMax - 1, nMax].filter(n => n >= 1 && n <= nMax))];
    let ref = null;
    for (const n of ns) {
        for (const [mk, rec] of [[2, REC.fuel]]) {
            const r = await one(block, n, mk, rec);
            const tag = `${block} n=${n} Mk${mk + 1}`;
            if (r.refused) { check(false, tag + ' refused ' + r.refused); continue }
            if (n === 1) ref = r.T;
            const ci = await checkIface(pg, r.T, block, ref);
            check(ci.ok, tag + ' checkIface ' + ci.errs.join('; '));
            check(r.ov === 0, tag + ' no overlap'); check(r.outside === 0, tag + ' inside floor');
            check(r.tile.ok && r.tile.ov === 0 && r.tile.span === 0 && r.tile.blocks === 1 && r.tile.cls === r.tile.want, tag + ' placerTile ' + JSON.stringify(r.tile));
            check(r.portsEn.every(v => v === 2), tag + ' every machine has exactly 2 enabled ports');
            check(r.inMachines === n && r.inPortsPerMachine === 1, tag + ` input reaches ${r.inMachines}/${n} machines (1 port each), per set ${r.laneLoadN}`);
            check(JSON.stringify(r.laneLoadN) === JSON.stringify(r.fill), tag + ' each set lane feeds exactly its own machines ' + r.fill);
            const wantEast = r.outYs.filter((y, s) => r.fill[s] > 0);
            check(r.outsOk === n && !r.outBad.length && JSON.stringify([...r.outEast].sort((a, b) => a - b)) === JSON.stringify(wantEast), tag + ` outputs reach the east out lanes ${r.outsOk}/${n} ${r.outBad.join(';')}`);
            check(r.outToMachine === 0, tag + ' no output reaches a machine port');
            check(r.laneDead.every(d => d.every(x => !/headon|ugNoExit|unk|splSide|ugSide|splNoOut|machwall/.test(x))), tag + ' no broken belt hops ' + JSON.stringify(r.laneDead));
            check(r.prioOk, tag + ' every manifold splitter has priority on its machine output (b.pr=[0,-1])');
            check(r.cutW === 2 * r.nIn && r.cutE === 2 * r.nIn, tag + ` wall crossings (plcTryCut bank): west ${r.cutW} cells (${r.nIn} lanes), east ${r.cutE} cells -> UG pairs`);
            check(r.lastOutBelt && r.inLaneBelts.every(Boolean), tag + ' lane port cells are rot-0 belts (in ' + r.inLaneBelts + ', out ' + r.lastOutBelt + ')');
            check(r.rate.ok && r.rate.capOk && r.rate.derOk, tag + ` rate (in ${r.rate.inLoads.map(v => v.toFixed(0))}/min out ${r.rate.outLoads.map(v => v.toFixed(0))}/min, cap ${r.rate.cap}) derate ${r.rate.derOk ? 'OK' : 'EXCEEDED'} (n<=${r.rateMax} fits derate)`);
            rows.push([block, n, r.stats.machines, r.stats.belts, r.stats.ug, r.stats.spl, r.w * r.h, (r.stats.belts + r.stats.ug + r.stats.spl) / n]);
            if (n === nMax) tabIface.push(block + ' S=' + r.T.iface.S + ' sets ' + JSON.stringify(r.T.iface.sets.map(s => s.o)) + ' in rows ' + JSON.stringify(r.T.ports.in.map(p => p.y)) + ' out rows ' + JSON.stringify(r.T.ports.out.map(p => p.y)));
            if (process.env.SHOTS !== '0' && (n === 1 || n === nMax)) await shot(block, n, r);
        }
    }
    // nMax+1 must stay refused and fail checkIface (no build is produced)
    const neg = await pg.evaluate(([b, n]) => tplBuild({block: b, cls: 'DAT_EnrichmentChamber', rec: 'ITEM_HydrogenFuel>ITEM_EnrichedFuel', n, mk: 2, spMk: 2}), [block, nMax + 1]);
    check(!neg.ok, `${block} n=${nMax + 1} refused (${neg.why})`);
    const ciNeg = await checkIface(pg, neg, block, ref);
    check(!ciNeg.ok, `${block} n=${nMax + 1}: checkIface ok:false`);
    // free 9x9 spot at nMax (info only: set rows are fixed by the iface table)
    const fit = await pg.evaluate(([b, n]) => {
        const T = tplBuild({block: b, cls: 'DAT_EnrichmentChamber', rec: 'x', n, mk: 1, spMk: 1}), occ = new Set();
        for (const q of T.items) { const d = dim(q); for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) occ.add((q.x + i) + ',' + (q.y + j)) }
        for (let x = 0; x + 9 <= T.w; x++) for (let y = 0; y + 9 <= T.h; y++) { let free = true; for (let i = 0; i < 9 && free; i++) for (let j = 0; j < 9; j++) if (occ.has((x + i) + ',' + (y + j))) { free = false; break } if (free) return {x, y} }
        return null;
    }, [block, nMaxG]);
    console.log(`     ${block}: free 9x9 spot at nMax: ${JSON.stringify(fit)}`);
}
// other belt tiers: rate-clamped nMax (ore recipe 60/min: g Mk1 1, Mk2 2, Mk3 3) builds at nMax and refuses nMax+1
for (const block of BLK) {
    for (const mk of [0, 1, 2]) {
        const nMax = await nMaxOf(block, REC.ore, mk);
        const tag = `${block} n=${nMax} Mk${mk + 1} (Nickel ore recipe, rate-clamped)`;
        const r = await one(block, nMax, mk, REC.ore);
        check(!r.refused && r.ov === 0 && r.outside === 0 && r.tile.ok && r.tile.ov === 0 && r.tile.span === 0 && r.inMachines === nMax && r.outsOk === nMax && r.rate.derOk, tag + ' builds, tiles, connects, within rate');
        const ci = await checkIface(pg, r.T, block); check(ci.ok, tag + ' checkIface ' + ci.errs.join('; '));
        const neg = await pg.evaluate(([b, n, m]) => tplBuild({block: b, cls: 'DAT_EnrichmentChamber', rec: 'ITEM_NickelOre>ITEM_EnrichedNickelOre', n, mk: m, spMk: m}), [block, nMax + 1, mk]);
        check(!neg.ok, tag + ' nMax+1 refused (' + neg.why + ')');
        console.log(`     rate: in ${r.rate.inLoads.map(v => v.toFixed(0))} out ${r.rate.outLoads.map(v => v.toFixed(0))} cap ${r.rate.cap} derateOK ${r.rate.derOk} nByDerate ${r.rateMax}`);
    }
}
// chains: block next to itself (A.out meets B.in main); 2x2 -> 2x2c refused
for (const block of BLK) {
    const a = await pg.evaluate(b => tplBuild({block: b, cls: 'DAT_EnrichmentChamber', rec: 'ITEM_HydrogenFuel>ITEM_EnrichedFuel', n: 1, mk: 2, spMk: 2}), block);
    const c = checkChain(a, a);
    check(c.ok, `${block} chains to itself ` + (c.errs || []).join('; '));
}
{
  const a = await pg.evaluate(() => tplBuild({block: '2x2', cls: 'DAT_EnrichmentChamber', rec: 'x', n: 1, mk: 2, spMk: 2})), b = await pg.evaluate(() => tplBuild({block: '2x2c', cls: 'DAT_EnrichmentChamber', rec: 'x', n: 1, mk: 2, spMk: 2}));
  check(!checkChain(a, b).ok, '2x2 -> 2x2c chain refused');
}
// checkPlan: planner N vs template (R1 minimal, R2 fractional, R3 nMax, R4 multi-block) per block, recipes fuel (20/min) and ore (60/min), Mk2 belts
const planRows = [];
for (const block of BLK) for (const key of [REC.fuel, REC.ore]) {
    const info = await pg.evaluate(([k, blk, t]) => { const r = [].concat(...Object.values(RECS)).find(x => rk(x) === k); const P = plan(r.o[0], 1, 1, {}, {[r.o[0]]: k}, {proto: false, enr: false, obs: false}); return {pm: P.nodes[r.o[0]].pmach, nMax: window[t.max]({block: blk, cls: t.cls, rec: k, mk: 1, spMk: 1})} }, [key, block, TPL]);
    const pm = info.pm, nm = info.nMax;
    for (const [tag, rate] of [['R1 pmach', pm], ['R1b 0.25 pmach', 0.25 * pm], ['R2 (nMax-1+0.3)', (nm - 1 + 0.3) * pm], ['R3 nMax', nm * pm], ['R4 (nMax+1)', (nm + 1) * pm], ['R4b (2nMax+0.5)', (2 * nm + 0.5) * pm]]) {
        const r = await checkPlan(pg, TPL, key, rate, block, 1);
        r.row.set = tag; r.row.rec = key.split('>')[1].replace('ITEM_', ''); planRows.push(r.row);
        check(r.ok, `checkPlan ${block} ${r.row.rec} ${tag}: ` + r.errs.join('; '));
    }
}
console.log('\nset                 block recipe               rate     N   B  nMax  pmach   planUtil minUtil maxUtil belts maxBelt supply machines');
for (const x of planRows) console.log([x.set.padEnd(19), x.block.padEnd(5), x.rec.padEnd(20), String(x.rate).padEnd(8), String(x.N).padEnd(3), String(x.B).padEnd(2), String(x.nMax).padEnd(5), String(x.pmach).padEnd(7), String(x.planUtil).padEnd(8), String(x.minUtil).padEnd(7), String(x.maxUtil).padEnd(7), String(x.belts).padEnd(5), String(x.maxBeltUtil).padEnd(7), x.supply.padEnd(7), x.machines].join(' '));
console.log('\niface at nMax:'); tabIface.forEach(l => console.log('  ' + l));
console.log('block  n machines belts ug spl area (belts+ug+spl)/machine');
for (const r of rows) console.log(r.slice(0, 7).join('\t') + '\t' + r[7].toFixed(1));
// regression (1x1 overflow): every recipe x block x S x mk x n in {1,2,nMax}: all items inside the floor, or refused
{
  const bad = await pg.evaluate(() => {
    const out = [], recs = CATALOG.recipes.CRAFT_Enrichment.filter(r => r.i.length === 1).map(r => r.i[0][0] + '>' + r.o[0]);
    for (const rec of recs) for (const block of ['1x1', '1x2', '2x2', '2x2c']) for (const S of [undefined, 1, 2, 3, 4, 6]) for (let mk = 0; mk < 3; mk++) {
      const sp = {S, block, cls: 'DAT_EnrichmentChamber', rec, mk, spMk: mk}, nm = tplMax(sp);
      for (const n of new Set([1, 2, nm])) { if (n < 1 || n > nm) continue; const T = tplBuild({...sp, n});
        if (!T.ok) { out.push([rec, block, S, mk, n, 'refused ' + T.why]); continue }
        for (const b of T.items) { const d = dim(b); if (b.x < 0 || b.y < 0 || b.x + d.w > T.w || b.y + d.h > T.h) { out.push([rec, block, S, mk, n, b.cls, b.x, b.y]); break } } }
    }
    return {recs: recs.length, out};
  });
  check(bad.recs === 11 && bad.out.length === 0, `floor regression: 11 recipes x blocks x S x mk x n all inside floor ` + JSON.stringify(bad.out.slice(0, 3)));
  const s2 = await pg.evaluate(() => tplBuild({S: 2, block: '1x1', cls: 'DAT_EnrichmentChamber', rec: 'ITEM_NickelOre>ITEM_EnrichedNickelOre', n: 1, mk: 1, spMk: 1}));
  check(!s2.ok, '1x1 S=2 refused (sets of 7 rows cannot hold an 11-row machine row): ' + s2.why);
}
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

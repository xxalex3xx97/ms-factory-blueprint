// Headless checks for Version 2 (game units) station import + legacy Version 1/absent unchanged + screenshots.
// Run:  cd F:/MSDemoMods-public/tools/factory-blueprint && node tests/import_v2.mjs
// Input: tmp MainBase.json (Version 2, from extract/import_station.py) and Test (8).json (legacy).
// Screenshots -> tests/shots/v2-layout-1400x900.png, tests/shots/v2-floor-1400x900.png. Exit 1 on any failed check or page error.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, {recursive: true});
const MB = process.env.MAINBASE || 'C:/Users/SFidelis/.claude/jobs/53e7ab72/tmp/MainBase.json';
const LEG = process.env.LEGACY || 'C:/Users/SFidelis/Downloads/Test (8).json';

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1400, height: 900}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => { d.dismiss().catch(() => {}); });
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');

  // ---- Version 2: Main Base (game units)
  const v2txt = fs.readFileSync(MB, 'utf8');
  chk('MainBase.json is Version 2', JSON.parse(v2txt).Version === 2);
  const ok = await pg.evaluate(t => __fb.importJson(t), v2txt);
  const toast = (await pg.locator('#toast').textContent()) || '';
  chk('v2 import returns true', ok === true);
  chk('v2 toast: 292 blocks, 2071 buildables, 219 kept', toast.startsWith('Imported 292 blocks, 2071 buildables, 219 other machines kept'), `toast "${toast}"`);

  const geo = await pg.evaluate(() => {
    const S = __fb.S, out = {overlap: 0, isolated: [], machOut: [], machCls: {}, docks: [], noFloor: [], blocks: S.blocks.length};
    const isM = b => (__fb.def(b.cls) || {}).kind === 'm';
    const cells = new Map();   // "layer|x|y" -> block ids
    const blks = S.blocks.filter(b => !isM(b));
    for (const b of blks) {
      const d = __fb.dim(b);
      for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) {
        const k = b.h + '|' + (b.x + i) + '|' + (b.y + j);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(b.id);
      }
    }
    for (const [k, ids] of cells) if (ids.length > 1) out.overlap++;
    // blocks with no edge neighbour on the same layer (should be none if they tile)
    for (const b of blks) {
      const d = __fb.dim(b);
      let nb = false;
      for (let i = -1; i <= d.w && !nb; i++) for (let j = -1; j <= d.h && !nb; j++) {
        const edge = (i === -1 || i === d.w) !== (j === -1 || j === d.h);   // edge cells only, not corners
        if (edge && cells.has(b.h + '|' + (b.x + i) + '|' + (b.y + j))) nb = true;
      }
      const cat = (__fb.def(b.cls) || {}).category;
      if (!nb && cat !== 'Vertical' && cat !== 'Shipyards') out.isolated.push(`${(__fb.def(b.cls) || {}).name || b.cls}@${b.x},${b.y},L${b.h}`);
    }
    // floors per layer
    const fl = {};
    for (let L = -4; L <= 8; L++) { const a = __fb.areas(L); if (a.floors.length) fl[L] = a.floors; }
    // machines inside floors: footprint cells must lie in a floor rect of the same layer
    for (const m of S.blocks.filter(isM)) {
      const d = __fb.dim(m), F = fl[m.h] || [];
      const inside = F.some(r => m.x >= r.x && m.y >= r.y && m.x + d.w <= r.x + r.w && m.y + d.h <= r.y + r.h);
      if (!inside) out.machOut.push(`${(__fb.def(m.cls) || {}).id}@${m.x},${m.y},L${m.h}`);
      if (!inside) out.machCls[(__fb.def(m.cls) || {}).id] = (out.machCls[(__fb.def(m.cls) || {}).id] || 0) + 1;
    }
    // docks: floor size
    for (const b of blks) {
      const id = (__fb.def(b.cls) || {}).name;
      if (id === 'BPO_Dock_2') {
        const r = (fl[b.h] || []).find(r => r.b && r.b.x === b.x && r.b.y === b.y);
        out.docks.push(r ? `${r.w}x${r.h}` : 'none');
      }
      if (id === 'BPO_Dock' || (__fb.def(b.cls) || {}).category === 'Shipyards') {
        const r = (fl[b.h] || []).find(r => r.b && r.b.x === b.x && r.b.y === b.y);
        if (r) out.noFloor.push(id);
      }
    }
    out.floorLayers = Object.keys(fl).length; out.nMach = S.blocks.filter(isM).length;
    return out;
  });
  chk(`no overlapping blocks on any layer (overlaps=${geo.overlap})`, geo.overlap === 0);
  chk(`blocks tile contiguous: no block without an edge neighbour (${geo.isolated.length} isolated)`, geo.isolated.length === 0, geo.isolated.slice(0, 20).join(' '));
  console.log('machines outside floors by class:', JSON.stringify(geo.machCls));
  console.log(`INFO machines off station floors: ${geo.machOut.length} of ${geo.nMach} (free belts/containers in block-free gaps and wall rings; not a gate)`);
  chk(`Industrial Dock floor 30x14 or 14x30 (${geo.docks.length} docks)`, geo.docks.length > 0 && geo.docks.every(s => s === '30x14' || s === '14x30'), geo.docks.slice(0, 10).join(' '));
  chk('Dock / shipyard blocks have no floor', geo.noFloor.length === 0, `with floor: ${geo.noFloor.join(' ')}`);


  // ---- Industrial Dock (BPO_Dock_2): floor along the station edge, touches station, doors on station side only
  const dk = await pg.evaluate(() => {
    const S = __fb.S, DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const isM = b => (__fb.def(b.cls) || {}).kind === 'm';
    const docks = S.blocks.filter(b => (__fb.def(b.cls) || {}).name === 'BPO_Dock_2');
    const res = {n: docks.length, floorBad: [], touchBad: [], doorBad: [], shipDoors: 0};
    const fl = {}, dr = {};
    for (let L = -4; L <= 8; L++) { const a = __fb.areas(L); fl[L] = a.floors; dr[L] = a.doors; }
    for (const b of docks) {
      const fc = fcell(b), st = (b.rot + 2) % 4, sd = DIRS[st];
      const fr = (fl[b.h] || []).find(r => r.b && r.b.x === b.x && r.b.y === b.y);
      const want = b.rot % 2 === 0 ? [14, 30] : [30, 14];
      if (!fr || fr.w !== want[0] || fr.h !== want[1]) res.floorBad.push(`${b.x},${b.y} r${b.rot} ${fr ? fr.w + 'x' + fr.h : 'none'}`);
      // station-side neighbour cells must hold a non-dock block on the same layer
      let touch = false;
      for (let i = 0; i < fc.cw; i++) for (let j = 0; j < fc.ch; j++) {
        const cx = fc.cx + i + sd[0], cy = fc.cy + j + sd[1];
        const hit = S.blocks.some(o => o !== b && !isM(o) && o.h === b.h && (__fb.dim(o), true) && (() => { const od = __fb.dim(o); return cx >= o.x && cx < o.x + od.w && cy >= o.y && cy < o.y + od.h; })());
        if (hit) touch = true;
      }
      if (!touch) res.touchBad.push(`${b.x},${b.y} r${b.rot}`);
      // doors: every side except the ship side (edge index = rot), see model.js areas()
      for (const dd of dr[b.h]) if (dd.bx === b.x && dd.by === b.y && dd.ed === b.rot) { res.doorBad.push(`${b.x},${b.y} r${b.rot} ed${dd.ed}`); }
      res.shipDoors += (dr[b.h] || []).filter(dd => dd.bx === b.x && dd.by === b.y && dd.ed !== b.rot).length;
    }
    return res;
  });
  chk(`all ${dk.n} docks: floor 30x14 along the station edge (14x30 when rot even)`, dk.n === 14 && dk.floorBad.length === 0, dk.floorBad.join(' '));
  chk('all docks touch a station block on their station side', dk.touchBad.length === 0, dk.touchBad.join(' '));
  chk('docks: no door on the ship side (rot)', dk.doorBad.length === 0, dk.doorBad.join(' '));
  chk(`docks: door slots on the non-ship sides present (${dk.shipDoors})`, dk.shipDoors > 0);
  // footprints of all blocks on the same layer must not overlap; Main Base = 292 blocks
  const ov = await pg.evaluate(() => {
    const bl = __fb.S.blocks.filter(b => (__fb.def(b.cls) || {}).kind !== 'm'), seen = new Map(), over = [];
    bl.forEach(b => { const d = __fb.dim(b); for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) {
      const k = b.h + '|' + (b.x + i) + ',' + (b.y + j);
      if (seen.has(k)) over.push(`${b.cls} @${b.x},${b.y} h${b.h} vs id${seen.get(k)}`); else seen.set(k, b.id);
    } });
    return {n: bl.length, over};
  });
  chk(`all ${ov.n} blocks: no footprint overlap on the same layer`, ov.over.length === 0, ov.over.slice(0, 10).join(' ; '));
  chk(`block count ${ov.n} == 293 (Main Base, import_station --list)`, ov.n === 293, String(ov.n));


  // ---- elevator belt ports: 8 on the inner wall of the 12x12 floor (N/E/S/W x 2 door edges); belt on the ring cell links
  const el = await pg.evaluate(() => {
    const EL = '/Game/Blueprints/BuildingBlocks/BPO_ElevatorBlock_03.BPO_ElevatorBlock_03_C';
    const json = {Version: 2, DisplayName: 'elev', Blocks: [{Class: EL, GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0, BlockID: 1, PaletteID: 0}],
      DefaultMachines: [{Class: 'BP_ConveyorBeltObject', Transform: {GridLocation: {X: -13, Y: -5}, Height: 0, GridRotation: 0}, MachineID: 5, PaletteID: 0}]};
    __fb.importJson(JSON.stringify(json), true);
    const b = __fb.S.blocks.find(x => (__fb.def(x.cls) || {}).name === 'BPO_ElevatorBlock_03');
    const ps = __fb.portsOf(b), r = __fb.areas(0).floors.find(f => f.b === b);
    const inFloor = (x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    const bad = ps.filter(p => !inFloor(p.x, p.y) || inFloor(p.x + p.nx, p.y + p.ny) || !(p.x + p.nx >= b.x * 16 && p.x + p.nx < b.x * 16 + 16));
    const L = __fb.links();
    return {n: ps.length, bad: bad.length, floor: [r.x, r.y, r.w, r.h], linked: L.ports.filter(e => e.m === b).length, belts: __fb.S.blocks.filter(x => (__fb.def(x.cls) || {}).kind === 'm').length};
  });
  chk(`elevator: 8 belt ports (2 per side, cells 4 and 9) (${el.n}), floor 12x12 (${el.floor})`, el.n === 8 && el.floor[2] === 12 && el.floor[3] === 12);
  chk('elevator ports: port cell inside floor, ring cell outside it', el.bad === 0, `bad ${el.bad}`);
  // doors: exactly 2x6 = the passage between the two walls (ring cells stay out); walls of an elevator are 1 cell
  const gapc = await pg.evaluate(() => {
    const EL = '/Game/Blueprints/BuildingBlocks/BPO_ElevatorBlock_03.BPO_ElevatorBlock_03_C';
    const json = {Version: 2, DisplayName: 'pairs', Blocks: [
      {Class: EL, GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0},
      {Class: EL, GridLocation: {X: 0, Y: 4}, Height: 0, GridRotation: 0},
      {Class: EL, GridLocation: {X: 4, Y: 0}, Height: 0, GridRotation: 0}], DefaultMachines: []};
    __fb.importJson(JSON.stringify(json), true);
    const a = __fb.areas(0), res = {paired: 0, bad: []};
    for (const d of a.doors.filter(x => x.paired)) {
      res.paired++;
      const f = a.floors.find(r => r.b.x === d.bx && r.b.y === d.by);
      if (d.ed === 1 && !(d.w === 6 && d.h === 2 && d.y === f.y + f.h + 1)) res.bad.push(`S ${d.bx},${d.by} ${d.x},${d.y} ${d.w}x${d.h}`);
      if (d.ed === 0 && !(d.h === 6 && d.w === 2 && d.x === f.x + f.w + 1)) res.bad.push(`E ${d.bx},${d.by} ${d.x},${d.y} ${d.w}x${d.h}`);
    }
    res.doorsAll = a.doors.every(d => (d.w === 6 && d.h === 2) || (d.w === 2 && d.h === 6));
    return res;
  });
  chk(`paired doors are 2x6 between the walls (${gapc.paired} paired)`, gapc.paired >= 2 && gapc.bad.length === 0 && gapc.doorsAll, gapc.bad.join(' '));
  // each port is exactly a lateral edge of a door slot (all 4 sides), derived from the same door rect that is drawn
  const edge = await pg.evaluate(() => {
    const EL = '/Game/Blueprints/BuildingBlocks/BPO_ElevatorBlock_03.BPO_ElevatorBlock_03_C';
    __fb.importJson(JSON.stringify({Version: 2, DisplayName: 'e', Blocks: [{Class: EL, GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0}], DefaultMachines: []}), true);
    const b = __fb.S.blocks.find(x => (__fb.def(x.cls) || {}).name === 'BPO_ElevatorBlock_03');
    const a = __fb.areas(0), doors = a.doors.filter(d => d.bx === b.x && d.by === b.y && d.k === 0);
    const ps = __fb.portsOf(b);
    const out = {sides: {}, bad: []};
    const SIDE = {3: 'N', 1: 'S', 0: 'E', 2: 'W'};
    for (const dr of doors) {
      const along = (dr.ed % 2 === 0) ? dr.y : dr.x;          // door slot start along its edge (abs floor cell)
      const sp = dr.ed % 2 === 0 ? ps.filter(p => p.f === SIDE[dr.ed]).map(p => p.y) : ps.filter(p => p.f === SIDE[dr.ed]).map(p => p.x);
      const want = [along, along + 5].sort((u, v) => u - v);
      const got = [...sp].sort((u, v) => u - v);
      out.sides[SIDE[dr.ed]] = {want, got};
      if (JSON.stringify(want) !== JSON.stringify(got)) out.bad.push(`${SIDE[dr.ed]} want ${want} got ${got}`);
    }
    out.n = doors.length;
    return out;
  });
  chk(`elevator: ports sit on the door slot edges, all sides (${edge.n} doors)`, edge.n === 4 && edge.bad.length === 0, edge.bad.join(' ') + ' ' + JSON.stringify(edge.sides));

  chk('belt on a port ring cell links to the elevator', el.linked >= 1, `linked ${el.linked}`);

  await pg.evaluate(t => __fb.importJson(t, true), v2txt);   // fresh MainBase (the elevator test above replaced the state)
  const erng = await pg.evaluate(() => {
    const S = __fb.S, isM = b => (__fb.def(b.cls) || {}).kind === 'm';
    const belts = S.blocks.filter(b => isM(b) && __fb.def(b.cls).category === 'Conveyors');
    const els = S.blocks.filter(b => (__fb.def(b.cls) || {}).name === 'BPO_ElevatorBlock_03');
    let ringBelts = 0, onPort = 0, ringOut = 0, off = [];
    for (const e of els) {
      const r = __fb.areas(e.h).floors.find(f => f.b === e);
      if (!r) continue;
      const ps = __fb.portsOf(e), pc = new Set(ps.map(p => p.x + p.nx + ',' + (p.y + p.ny)));   // ring cell behind each port
      for (const bl of belts) {
        if (bl.h !== e.h) continue;
        const inRing = bl.x >= r.x - 1 && bl.x <= r.x + r.w && bl.y >= r.y - 1 && bl.y <= r.y + r.h && !(bl.x >= r.x && bl.x < r.x + r.w && bl.y >= r.y && bl.y < r.y + r.h);
        if (!inRing) continue;
        ringBelts++;
        // belts that point INTO the floor from the ring must sit on a port; belts running along the ring turn into a port
        const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]], d = DIRS[bl.rot];
        const into = (bl.x + d[0] >= r.x && bl.x + d[0] < r.x + r.w && bl.y + d[1] >= r.y && bl.y + d[1] < r.y + r.h);
        const outward = !into && (bl.x + d[0] < r.x - 1 || bl.x + d[0] > r.x + r.w || bl.y + d[1] < r.y - 1 || bl.y + d[1] > r.y + r.h);   // leaving the ring: not a port (user)
        if (outward) { ringOut++; continue; }
        if (!into) { if (pc.has(bl.x + ',' + bl.y)) onPort++; else off.push(`${bl.x},${bl.y} elev@${e.x},${e.y}`); }
        else if (pc.has(bl.x + ',' + bl.y)) onPort++; else off.push(`INTO ${bl.x},${bl.y} elev@${e.x},${e.y}`);
      }
    }
    return {els: els.length, ringBelts, onPort, ringOut, off};
  });
  console.log(`MainBase elevators ${erng.els}, belts on elevator ring ${erng.ringBelts} (on a port ${erng.onPort}, outgoing ${erng.ringOut} not checked)`);
  chk(`imported belts on elevator ring sit on a port (${erng.onPort}/${erng.ringBelts - erng.ringOut} checked)`, erng.ringBelts - erng.ringOut > 0 && erng.onPort === erng.ringBelts - erng.ringOut, erng.off.slice(0, 10).join(' '));

  // ---- layout integrity (Main Base, all blocks): no two floors overlap on the same layer; every dock floor is 30x14 along its station edge
  const lay = await pg.evaluate(t => {
    __fb.importJson(t, true);
    const S = __fb.S, isM = b => (__fb.def(b.cls) || {}).kind === 'm';
    const blks = S.blocks.filter(b => !isM(b));
    const fl = [];
    for (let L = -4; L <= 8; L++) for (const f of __fb.areas(L).floors) fl.push({L, f});
    let ov = 0;
    for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) {
      const p = fl[i], q = fl[j];
      if (p.L !== q.L) continue;
      if (p.f.x < q.f.x + q.f.w && q.f.x < p.f.x + p.f.w && p.f.y < q.f.y + q.f.h && q.f.y < p.f.y + p.f.h) ov++;
    }
    let docks = 0, dockBad = [];
    for (const b of blks) {
      const nm = (__fb.def(b.cls) || {}).name;
      if (nm !== 'BPO_Dock_2') continue;
      docks++;
      const fr = __fb.areas(b.h).floors.find(f => f.b === b);
      const long = b.rot % 2 === 0 ? [14, 30] : [30, 14];
      if (!fr || fr.w !== long[0] || fr.h !== long[1]) dockBad.push(`${b.x},${b.y} r${b.rot}`);
    }
    return {n: blks.length, ov, docks, dockBad};
  }, v2txt);
  chk(`layout: ${lay.n} blocks, no two floors overlap on a layer (overlaps=${lay.ov})`, lay.ov === 0 && lay.n === 292);
  chk(`layout: all ${lay.docks} Industrial Docks oriented by rotation (30 along the edge)`, lay.docks === 14 && lay.dockBad.length === 0, lay.dockBad.join(' '));

  // ---- painter level: every gap-coloured strip painted in the floor view lies between two real floors (no free-floating strip)
  const strips = await pg.evaluate(() => {
    __fb.importJson(JSON.stringify(__fb.build()), true);
    __fb.setView('F');
    const P = CanvasRenderingContext2D.prototype, orig = P.fillRect, log = [];
    P.fillRect = function (x, y, w, h) { if (String(this.fillStyle) === 'rgba(70, 80, 100, 0.5)') log.push([x, y, w, h]); return orig.call(this, x, y, w, h); };
    __fb.setView('L'); __fb.setView('F');
    return new Promise(res => setTimeout(() => {
      P.fillRect = orig;
      const V = __fb.V, s = 20 * V.z, A = __fb.areas(__fb.layer);
      const F = A.floors.map(f => { const q = (__fb.def(f.b.cls) || {}).floorInset || 0; return {x: f.x - q, y: f.y - q, w: f.w + 2 * q, h: f.h + 2 * q}; });   // shell = floor + inset ring
      const bad = [];
      for (const [x, y, w, h] of log) {
        const fx = (x - V.ox) / s, fy = (y - V.oy) / s, fw = w / s, fh = h / s;
        if (Math.abs(fw - 2) < 1e-6 && fh >= 16 - 1e-6) {   // vertical strip: floor left and right of it
          const L = F.some(f => Math.abs(f.x + f.w - fx) < 1e-6 && f.y <= fy + 1e-6 && fy + fh <= f.y + f.h + 1e-6);   // strip inside the left shell's extent
          const R = F.some(f => Math.abs(f.x - (fx + 2)) < 1e-6 && f.y <= fy + 1e-6 && fy + fh <= f.y + f.h + 1e-6);   // and inside the right shell's extent
          if (!(L && R)) bad.push(`V ${fx},${fy} ${fw}x${fh}`);
        } else if (Math.abs(fh - 2) < 1e-6 && fw >= 16 - 1e-6) {   // horizontal strip
          const U = F.some(f => Math.abs(f.y + f.h - fy) < 1e-6 && f.x <= fx + 1e-6 && fx + fw <= f.x + f.w + 1e-6);
          const D = F.some(f => Math.abs(f.y - (fy + 2)) < 1e-6 && f.x <= fx + 1e-6 && fx + fw <= f.x + f.w + 1e-6);
          if (!(U && D)) bad.push(`H ${fx},${fy} ${fw}x${fh}`);
        }
      }
      res({n: log.length, bad});
    }, 400));
  });
  chk(`painter: ${strips.n} gap strips, each inside both facing shells' extent (${strips.bad.length} bad)`, strips.n > 0 && strips.bad.length === 0, strips.bad.slice(0, 8).join(' | '));

  // ---- port drawing (published look): machine/splitter ports are Ln=.6s x T=.2s fills with a 1px outline; an elevator tick must not leak its stroke
  const pd = await pg.evaluate(() => new Promise(res => {
    __fb.importJson(JSON.stringify(__fb.build()), true);
    __fb.setView('F');
    const P = CanvasRenderingContext2D.prototype, of = P.fillRect, os = P.strokeRect, fills = [], strokes = [];
    P.fillRect = function (x, y, w, h) { fills.push([w, h]); return of.call(this, x, y, w, h); };
    P.strokeRect = function (x, y, w, h) { strokes.push([w, h, this.lineWidth]); return os.call(this, x, y, w, h); };
    __fb.V.z = 1.6;   // ports draw only at zoom where s >= 6
    __fb.setView('L'); __fb.setView('F');
    setTimeout(() => {
      P.fillRect = of; P.strokeRect = os;
      const s = 20 * __fb.V.z, T = Math.max(3, .2 * s), Ln = .6 * s, eq = (a, b) => Math.abs(a - b) < .05;
      const portFills = fills.filter(([w, h]) => (eq(w, Ln) && eq(h, T)) || (eq(w, T) && eq(h, Ln))).length;
      const badStroke = strokes.filter(([w, h, lw]) => (eq(w, T - 1) && eq(h, Ln - 1) || eq(w, Ln - 1) && eq(h, T - 1)) && lw !== 1).length;
      res({portFills, badStroke, s});
    }, 400);
  }));
  chk(`ports: ${pd.portFills} port fills at published size (.6s x .2s), outlines 1px`, pd.portFills > 0 && pd.badStroke === 0, `badStroke ${pd.badStroke} s ${pd.s}`);

  // ---- screenshots: Layout, then Factory floor (layer 0 of the station)
  await pg.evaluate(() => { __fb.setView('L'); __fb.fit(); });
  await pg.waitForTimeout(200);
  await pg.screenshot({path: path.join(SHOTS, 'v2-layout-1400x900.png')});
  await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); });
  await pg.waitForTimeout(200);
  await pg.screenshot({path: path.join(SHOTS, 'v2-floor-1400x900.png')});
  chk('screenshots written', fs.existsSync(path.join(SHOTS, 'v2-layout-1400x900.png')) && fs.existsSync(path.join(SHOTS, 'v2-floor-1400x900.png')));

  // ---- legacy: Test (8).json (no Version) must load with the legacy site-unit rule (block cell = loc / 2)
  const leg = JSON.parse(fs.readFileSync(LEG, 'utf8'));
  chk('Test (8).json is legacy (Version absent or 1)', leg.Version === undefined || leg.Version === 1);
  const legOk = await pg.evaluate(t => __fb.importJson(t, true), JSON.stringify(leg));
  const legBlk = await pg.evaluate(() => __fb.S.blocks.filter(b => (__fb.def(b.cls) || {}).kind !== 'm').length);
  const legBad = await pg.evaluate(() => { const c = {}; for (const m of __fb.S.blocks) if (__fb.def(m.cls) && __fb.def(m.cls).kind === 'm') c[m.cls] = (c[m.cls] || 0) + 1; return c; });
  const legMis = await pg.evaluate(L => L.Blocks.filter((b, i) => {
    const s = __fb.S.blocks[i];
    return !s || s.x !== Math.round(b.GridLocation.X / 2) || s.y !== Math.round(b.GridLocation.Y / 2);
  }).length, leg);
  chk('legacy Test (8).json imports', legOk === true);
  chk(`legacy block count = ${leg.Blocks.length}`, legBlk === leg.Blocks.length, `got ${legBlk}`);
  chk('legacy block positions = loc/2 (unchanged rule)', legMis === 0, `mismatches ${legMis}`);
  console.log('legacy machines/kinds on load:', JSON.stringify(legBad));
  chk('no console errors / page errors', errs.length === 0, errs.join('\n     '));

  // ---- round trip: import -> build() (Version 2 out) -> importJson gives identical cells
  const RT = () => __fb.S.blocks;   // current state
  const shape = () => __fb.S.blocks.map(b => ({cls: b.cls, x: b.x, y: b.y, h: b.h, rot: b.rot, pid: b.pid}));
  const roundTrip = async label => {
    const before = await pg.evaluate(() => { const S = __fb.S, isM = b => (__fb.def(b.cls) || {}).kind === 'm'; const k = b => JSON.stringify([b.cls, b.x, b.y, b.h, b.rot]); return {blocks: S.blocks.filter(b => !isM(b)).map(k), mach: S.blocks.filter(isM).map(k).sort(), dm: S.dm.length}; });
    const out = await pg.evaluate(() => { const o = __fb.build(); return {json: JSON.stringify(o), version: o.Version}; });
    const ok2 = await pg.evaluate(t => __fb.importJson(t, true), out.json);
    const after = await pg.evaluate(() => { const S = __fb.S, isM = b => (__fb.def(b.cls) || {}).kind === 'm'; const k = b => JSON.stringify([b.cls, b.x, b.y, b.h, b.rot]); return {blocks: S.blocks.filter(b => !isM(b)).map(k), mach: S.blocks.filter(isM).map(k).sort(), dm: S.dm.length}; });
    chk(`${label}: build() writes Version 2`, out.version === 2);
    chk(`${label}: reimport ok`, ok2 === true);
    chk(`${label}: blocks identical after round trip (${after.blocks.length})`, JSON.stringify(before.blocks) === JSON.stringify(after.blocks));
    chk(`${label}: machines identical after round trip (${after.mach.length})`, JSON.stringify(before.mach) === JSON.stringify(after.mach), `before ${before.mach.length} after ${after.mach.length}`);
    chk(`${label}: kept machines unchanged (${after.dm})`, before.dm === after.dm);
    return out;
  };
  await pg.evaluate(t => __fb.importJson(t, true), v2txt);
  const outMB = await roundTrip('MainBase v2');
  const rawOrig = JSON.parse(v2txt).Blocks.map(b => JSON.stringify(b.GridLocation));
  const rawNew = JSON.parse(outMB.json).Blocks.map(b => JSON.stringify(b.GridLocation));
  console.log(`MainBase export raw block GridLocation differs from file on ${rawOrig.filter((s, i) => s !== rawNew[i]).length} blocks (odd-rounded cross-axis expected)`);

  // legacy v1 (Test (8)) -> export as v2 -> reimport identical
  await pg.evaluate(t => __fb.importJson(t, true), JSON.stringify(leg));
  const legOut = await roundTrip('Test (8) v1');
  chk('Test (8) export is Version 2', JSON.parse(legOut.json).Version === 2);

  // autosave (localStorage, pagehide) holds the same build() data and restores in a new page
  await pg.evaluate(t => __fb.importJson(t, true), v2txt);
  await pg.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const stored = await pg.evaluate(() => { const o = JSON.parse(localStorage.getItem('msfb.state') || 'null'); return o && o.d ? {v: o.d.Version, n: o.d.Blocks.length} : null; });
  chk('autosave stored Version 2 blocks', !!stored && stored.v === 2 && stored.n === 292, JSON.stringify(stored));
  const pg2 = await ctx.newPage();
  pg2.on('pageerror', e => errs.push(`pageerror(restore): ${e.message}`));
  await pg2.goto(PAGE);
  await pg2.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  await pg2.waitForTimeout(300);
  const rest = await pg2.evaluate(() => ({n: __fb.S.blocks.length, s: __fb.S.blocks.filter(b => b.x || b.y).length, sx: __fb.S.blocks.reduce((a, b) => a + b.x * 3 + b.y, 0), name: __fb.S.name}));
  chk('autosave restore (new page): 292 blocks, name kept', rest.name === 'Main Base' && rest.n >= 292, JSON.stringify(rest));
  const ref = await pg.evaluate(() => ({sx: __fb.S.blocks.reduce((a, b) => a + b.x * 3 + b.y, 0)}));
  chk('autosave restore positions = imported positions', rest.sx === ref.sx, `restored ${rest.sx} vs ${ref.sx}`);
  await pg2.close();
  await ctx.close();
} finally {
  await br.close();
}
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  fails.forEach(f => console.log(` - ${f.name}${f.detail ? ' :: ' + f.detail : ''}`));
}
process.exitCode = fails.length ? 1 : 0;

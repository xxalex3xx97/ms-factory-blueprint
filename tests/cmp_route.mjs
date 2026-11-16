// CMP S5: cmpRoute lane router (js/cmp_route.js). Run: node tests/cmp_route.mjs   Exit 1 on FAIL or page error.
// Synthetic cases on stacked 30x30 blocks: (a) lanes above/below -> wall hops, (b) crossing lanes -> perpendicular hop, (c) 8 lanes, (d) impossible. Per lane: flood-green with own lane only and with all lanes,
// no belt points into another net, items inside floors, UG spans <= ugMax, nothing in a wall except hop ends, ugPairs pairs every entrance, mutations (drop a belt, drop a UG exit) turn flood red.
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
await pg.waitForFunction(() => window.__fb && typeof placerTile === 'function');
await pg.addScriptTag({path: ROOT + '/js/cmp_route.js'});
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
await pg.evaluate(() => {
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  // follow one lane from its source over `items`: -> {end:'x,y', cells:[keys], err}
  window.walkLane = (items, src, W) => {
    const occ = new Map(items.map(b => [b.x + ',' + b.y, b]));
    const ex = new Map(ugPairs(items.filter(b => PLC_UG.includes(b.cls))).map(p => [p.u, p.t]));
    const isExit = new Set(ex.values());
    let it = occ.get(src.x + ',' + src.y); const cells = [], seen = new Set();
    for (;;) {
      if (!it) return {err: 'dead end', cells};
      const k = it.x + ',' + it.y; if (seen.has(k)) return {err: 'loop', cells}; seen.add(k); cells.push(k);
      if (PLC_UG.includes(it.cls) && !isExit.has(it)) { const t = ex.get(it); if (!t) return {err: 'ug without exit @' + k, cells}; it = t; cells.push(it.x + ',' + it.y); seen.add(it.x + ',' + it.y) }
      const [dx, dy] = DIR[it.rot], nx = it.x + dx, ny = it.y + dy;
      if (nx >= W) return {end: it.x + ',' + it.y, cells};
      const n = occ.get(nx + ',' + ny);
      if (n && PLC_UG.includes(n.cls) && isExit.has(n)) return {err: 'belt into exit @' + nx + ',' + ny, cells};
      if (n && n.rot !== it.rot && PLC_UG.includes(n.cls)) return {err: 'side into ug', cells};
      it = n;
    }
  };
  // wall hop (entrance and exit in different blocks): starts anywhere in its block, vertical (same x, belt rot vertical), crosses exactly one wall (adjacent blocks), length <= ugMax. -> error text | null
  window.wallBad = (p, P, ugMax) => {
    const bu = Math.floor(p.u.y / P), bt = Math.floor(p.t.y / P);
    if (bu === bt) return null;
    if (p.u.x !== p.t.x) return 'wall hop sideways @' + p.u.x + ',' + p.u.y;
    if (Math.abs(bt - bu) !== 1) return 'wall hop crosses ' + Math.abs(bt - bu) + ' walls @' + p.u.x + ',' + p.u.y;
    if (p.n > ugMax) return 'wall hop length ' + p.n + ' > ' + ugMax + ' @' + p.u.x + ',' + p.u.y;
    return null;
  };
  window.chkRoute = (r, a, c) => {   // a: {W,H,rowsN,mk,sources,sinks,ugMax}
    const P = a.H + 2, out = [], own = new Map();
    r.nets.forEach(n => n.cells.forEach(k => own.set(k, n.id)));
    const byKey = new Map(r.items.map(b => [b.x + ',' + b.y, b]));
    if (byKey.size !== r.items.length) out.push('overlap');
    const ug = r.items.filter(b => PLC_UG.includes(b.cls));
    for (const b of r.items) if (b.x < 0 || b.x >= a.W || b.y < 0 || b.y >= a.rowsN * P || b.y % P >= a.H) out.push('item outside floor @' + b.x + ',' + b.y);
    // spans <= ugMax, every UG end paired
    const pr = ugPairs(ug); if (pr.length * 2 !== ug.length) out.push('unpaired ug');
    pr.forEach(p => { if (p.n > a.ugMax) out.push('span ' + p.n + ' > ' + a.ugMax) });
    // walls: hops cross only entrance->exit pairs; no item in wall (checked above); no UG pair spans a wall except last->first cell
    pr.forEach(p => { const w = wallBad(p, P, a.ugMax); if (w) out.push(w) });
    // lanes: own-lane flood and global flood, no foreign cell
    r.nets.forEach(n => {
      const mine = r.items.filter(b => own.get(b.x + ',' + b.y) === n.id);
      const w1 = walkLane(mine, n.src, a.W), w2 = walkLane(r.items, n.src, a.W);
      if (w1.err || w1.end !== n.sink.x + ',' + n.sink.y) out.push('lane ' + n.id + ' own flood red ' + (w1.err || w1.end));
      if (w2.err || w2.end !== n.sink.x + ',' + n.sink.y) out.push('lane ' + n.id + ' global flood red ' + (w2.err || w2.end));
      if (w2.cells.some(k => own.get(k) !== n.id)) out.push('lane ' + n.id + ' touches foreign cell');
      if (n.item !== undefined) { const s = a.sinks.find(t => t.x === n.sink.x && t.y === n.sink.y); if (s.item !== undefined && s.item !== n.item) out.push('lane ' + n.id + ' wrong sink item') }
    });
    if (new Set(r.nets.map(n => n.sink.x + ',' + n.sink.y)).size !== a.sinks.length && r.nets.length === a.sinks.length) out.push('sinks shared');
    // no belt/UG end points into another net's cell
    const ents = new Set(pr.map(p => p.u));   // an entrance feeds its exit underground, not the next cell
    r.items.forEach(b => { if (ents.has(b)) return; const [dx, dy] = DIR[b.rot], n = byKey.get((b.x + dx) + ',' + (b.y + dy)); if (n && own.get(n.x + ',' + n.y) !== own.get(b.x + ',' + b.y)) out.push('belt points into other net @' + b.x + ',' + b.y) });
    // mutation: drop one belt, drop one UG exit -> some lane red
    const red = items => r.nets.some(n => { const w = walkLane(items, n.src, a.W); return w.err || w.end !== n.sink.x + ',' + n.sink.y });
    const plain = r.items.filter(b => PLC_BELT.includes(b.cls) && b.x > 0 && b.x < a.W - 1);
    if (plain.length && !red(r.items.filter(b => b !== plain[plain.length >> 1]))) out.push('mutation belt not red');
    const ex = new Set(pr.map(p => p.t));
    if (pr.length && !red(r.items.filter(b => b !== pr[0].t))) out.push('mutation ug exit not red');
    return {errs: out, nUg: ug.length, nItems: r.items.length, nWallHops: pr.filter(p => Math.floor(p.u.y / P) !== Math.floor(p.t.y / P)).length, nFloorHops: pr.filter(p => Math.floor(p.u.y / P) === Math.floor(p.t.y / P)).length};
  };
});
const ugMax = await pg.evaluate(() => def(PLC_UG[0]).maxApart);
console.log('ugMax mk0 =', ugMax);
const base = {W: 30, H: 30, rowsN: 3, mk: 0};
const P = 32;
const cases = [
  ['a', {...base, sources: [{x: 0, y: 5, item: 'A'}, {x: 0, y: 2 * P + 25, item: 'B'}], sinks: [{x: 29, y: P + 14, item: 'A'}, {x: 29, y: P + 16, item: 'B'}]}, {wall: 1}],
  ['b', {...base, rowsN: 1, sources: [{x: 0, y: 5, item: 'A'}, {x: 0, y: 25, item: 'B'}], sinks: [{x: 29, y: 25, item: 'A'}, {x: 29, y: 5, item: 'B'}]}, {floor: 1}],
  ['c', {...base, sources: [{x: 0, y: 3, item: 'A'}, {x: 0, y: 5, item: 'A'}, {x: 0, y: P + 10, item: 'B'}, {x: 0, y: P + 12, item: 'B'}, {x: 0, y: 2 * P + 4, item: 'C'}, {x: 0, y: 2 * P + 6, item: 'C'}, {x: 0, y: 2 * P + 20, item: 'D'}, {x: 0, y: 2 * P + 22, item: 'D'}],
    sinks: [{x: 29, y: 4, item: 'A'}, {x: 29, y: 8, item: 'A'}, {x: 29, y: P + 8, item: 'B'}, {x: 29, y: P + 14, item: 'B'}, {x: 29, y: 2 * P + 8, item: 'C'}, {x: 29, y: 2 * P + 14, item: 'C'}, {x: 29, y: P + 20, item: 'D'}, {x: 29, y: P + 24, item: 'D'}]}, {}],
];
for (const [name, a, need] of cases) {
  a.ugMax = ugMax;
  const res = await pg.evaluate(a => { const r = cmpRoute(a); return {ok: r.ok, why: r.why, chk: r.ok ? chkRoute(r, a) : null, n: r.nets && r.nets.length} }, a);
  check(res.ok, `case ${name}: routed ${res.n} lanes ${res.why || ''}`);
  if (res.chk) {
    check(res.chk.errs.length === 0, `case ${name}: flood green, no foreign, geometry, mutations red ` + res.chk.errs.slice(0, 4).join('; '));
    console.log(`     items ${res.chk.nItems} ug ${res.chk.nUg} wallHops ${res.chk.nWallHops} floorHops ${res.chk.nFloorHops}`);
    if (need.wall) check(res.chk.nWallHops >= 2, `case ${name}: wall hops used`);
    if (need.floor) check(res.chk.nFloorHops >= 1, `case ${name}: perpendicular floor hop used`);
  }
}
// wall-hop checker mutations: a legal hop passes, a sideways / two-wall / over-long hop must fail
const wb = await pg.evaluate(ugMax => { const P = 32, h = (ux, uy, tx, ty, n) => wallBad({u: {x: ux, y: uy}, t: {x: tx, y: ty}, n}, P, ugMax); return {ok: h(5, 29, 5, 34, 5), side: h(5, 29, 6, 34, 5), two: h(5, 29, 5, 66, 5), long: h(5, 29, 5, 34, ugMax + 1), floor: h(5, 3, 7, 10, 7)} }, ugMax);
check(wb.ok === null && wb.floor === null, 'wallBad: legal wall hop and floor hop pass');
check(!!wb.side && !!wb.two && !!wb.long, 'wallBad mutations (sideways, two walls, over-long) fail: ' + [wb.side, wb.two, wb.long].join(' | '));
// (d) impossible: column x=1 blocked, and more sources than sinks
const d1 = await pg.evaluate(a => { const r = cmpRoute(a); return {ok: r.ok, why: r.why} }, {...base, ugMax, blocked: [...Array(96)].map((_, y) => '1,' + y), sources: [{x: 0, y: 5, item: 'A'}], sinks: [{x: 29, y: 5, item: 'A'}]}).catch(e => ({ok: 'err ' + e.message}));
check(d1.ok === false && d1.why === 'merge routing failed', 'case d: blocked column -> ok:false merge routing failed');
const d2 = await pg.evaluate(a => { a.blocked = new Set(a.blocked); const r = cmpRoute(a); return {ok: r.ok, why: r.why} }, {...base, ugMax, blocked: [...Array(96)].map((_, y) => '1,' + y), sources: [{x: 0, y: 5, item: 'A'}], sinks: [{x: 29, y: 5, item: 'A'}]});
check(d2.ok === false && d2.why === 'merge routing failed', 'case d: blocked Set -> merge routing failed');
check(errs.length === 0, 'no page errors ' + errs.slice(0, 2).join('; '));
await br.close();
console.log(fails ? 'FAIL ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);

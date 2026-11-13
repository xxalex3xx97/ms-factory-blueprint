// BL3 stage + tower gates (page). Run: node tests/bl_stage.mjs   Exit 1 on FAIL or page error.
// Case A: one 3-row refinery stage (rowsM [6,6,6], DAT_Container_2 source+sink): cell clash 0, pfCheck ov 0, connectivity 0, 18 machines, 18 splitters, 3 trunks into sink N cells, Yc-Y = 23.
// Case B: 2 chained stages: middle container gets 3 belts entering N (y=Yc-1) and 3 belts leaving S (y=Yc+4), machines 36.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof blTower === 'function' && typeof pfCheck === 'function' && typeof ugPairs === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const tw = (stages, extra) => ({mk: 1, spMk: 1, bx: 'DAT_Container_2', cx: 5, cls: 'DAT_Refinery', mc: null, rec: 'ITEM_Silica>ITEM_SiliconWafers', raw: 'ITEM_Silica', M: 6, ind: false, dock: null, stages, ...extra});
const r = await pg.evaluate(args => {
  const mc = blMachine('DAT_Refinery');
  const conn = items => {
    const occ = new Map();
    for (const b of items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) occ.set(x + ',' + y, b) }
    const isBelt = b => PLC_BELT.includes(b.cls), isUG = b => PLC_UG.includes(b.cls), isSpl = b => PLC_SPL.includes(b.cls), isBox = b => b.cls.startsWith('DAT_Container');
    const pairs = ugPairs(items), partner = new Map();
    pairs.forEach(({u, t}) => { partner.set(u, t); partner.set(t, u) });
    const exitUG = new Set(pairs.map(p => p.t)), entUG = new Set(pairs.map(p => p.u));
    const out = {dangEnd: 0, noSrc: 0, ugUnpaired: 0, boxNoBelt: 0, ex: []};
    const pm = new Map();
    for (const b of items) if (!isBelt(b) && !isUG(b)) pm.set(b, portsOf(b));
    const fed = new Set(), mark = (x, y) => fed.add(x + ',' + y);
    for (const b of items) if (isSpl(b)) { const d = dim(b); for (let x = b.x - 1; x <= b.x + d.w; x++) for (let y = b.y - 1; y <= b.y + d.h; y++) mark(x, y) }
    for (const b of items) {
      if (isBelt(b)) { const [dx, dy] = DIR[b.rot]; mark(b.x + dx, b.y + dy) }
      else if (isUG(b)) { if (entUG.has(b)) { const t = partner.get(b); mark(t.x, t.y) } else if (exitUG.has(b)) { const [dx, dy] = DIR[b.rot]; mark(b.x + dx, b.y + dy) } }
    }
    for (const [b, ps] of pm) for (const p of ps) if (p.en) mark(p.x + p.nx, p.y + p.ny);
    for (const b of items) {
      if (!isBelt(b) && !isUG(b)) continue;
      const pos = b.cls.slice(-4) + '(' + b.x + ',' + b.y + ')';
      if (isUG(b) && !entUG.has(b) && !exitUG.has(b)) { out.ugUnpaired++; out.ex.push('ugUnpaired ' + pos) }
      if (!(isUG(b) && entUG.has(b))) {
        const [dx, dy] = DIR[b.rot], tx = b.x + dx, ty = b.y + dy, Q = occ.get(tx + ',' + ty);
        let ok = !!Q;
        if (Q && !isBelt(Q) && !isUG(Q) && !isSpl(Q)) ok = (pm.get(Q) || []).some(p => p.en && p.x === tx && p.y === ty && p.nx === -dx && p.ny === -dy && p.dir !== 'out');
        if (!ok) { out.dangEnd++; out.ex.push('dangEnd ' + pos) }
      }
      if (!(isUG(b) && exitUG.has(b)) && !fed.has(b.x + ',' + b.y)) { out.noSrc++; out.ex.push('noSrc ' + pos) }
    }
    const emp = items.filter(b => isBox(b) && b.y > 1 && !(b.ct && b.ct[0]));
    const sinkY = Math.max(...emp.map(b => b.y));
    for (const b of emp) {
      if (b.y === sinkY) continue;
      const s = pm.get(b).find(p => p.f === 'S');
      const q = s && occ.get((s.x + s.nx) + ',' + (s.y + s.ny));
      if (!q || !(isBelt(q) || isUG(q) || isSpl(q))) { out.boxNoBelt++; out.ex.push('boxNoBelt (' + b.x + ',' + b.y + ')') }
    }
    return out;
  };
  const build = (stages, extra) => {
    const Tw = {...args.base, mc, stages, ...extra};
    const T = blTower(Tw);
    if (!T.ok) return {fail: T.why};
    const items = T.items;
    const occ = new Map();
    let ov = 0;
    for (const b of items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) ov++; else occ.set(k, b) } }
    const w = Math.max(...items.map(b => b.x + dim(b).w)), h = Math.max(...items.map(b => b.y + dim(b).h));
    const pf = pfCheck({items, w, h, ports: []});
    return {ov, pfOv: pf.ov, Yend: T.Yend, sinkCols: T.sinkCols, items, conn: conn(items),
      machines: items.filter(b => b.cls === 'DAT_Refinery').length, splitters: items.filter(b => PLC_SPL.includes(b.cls)).length};
  };
  const A = build([{rowsM: [6, 6, 6]}], {});
  const B = build([{rowsM: [6, 6, 6]}, {rowsM: [6, 6, 6]}], {});
  const mid = B.items ? B.items.filter(b => b.cls === 'DAT_Container_2' && b.ct && b.ct.length === 0 && b.y === 24) : [];
  const cp = portsOf({cls: 'DAT_Container_2', x: 0, y: 0, rot: 0, off: []});
  const nX = cp.filter(p => p.f === 'N').map(p => 5 + p.x).sort((a, b) => a - b).slice(0, 3), sX = cp.filter(p => p.f === 'S').map(p => 5 + p.x).sort((a, b) => a - b).slice(0, 3);
  const enterN = B.items ? B.items.filter(b => PLC_BELT.includes(b.cls) && b.rot === 1 && b.y === 23 && nX.includes(b.x)).length : 0;
  const leaveS = B.items ? B.items.filter(b => PLC_BELT.includes(b.cls) && b.rot === 1 && b.y === 28 && sX.includes(b.x)).length : 0;
  const trunkA = A.items ? A.items.filter(b => PLC_BELT.includes(b.cls) && b.rot === 1 && b.y === A.Yend - 1 && A.sinkCols.includes(b.x)).length : 0;
  return {mc, A: {...A, items: undefined, trunkN: trunkA}, B: {...B, items: undefined, midCount: mid.length, enterN, leaveS}};
}, {base: {mk: 1, spMk: 1, bx: 'DAT_Container_2', cx: 5, cls: 'DAT_Refinery', raw: 'ITEM_Silica', rec: 'ITEM_Silica>ITEM_SiliconWafers', M: 6, ind: false, dock: null}});
check(r.mc.ok && r.mc.rot === 0 && r.mc.w === 3 && r.mc.h === 3 && r.mc.xin === 1 && r.mc.xout === 1, 'blMachine(DAT_Refinery) still rot0 3x3 xin1 xout1');
const A = r.A, B = r.B;
check(!A.fail, 'case A builds (' + (A.fail || 'ok') + ')');
check(A.ov === 0 && A.pfOv === 0, 'case A cell clash 0 / pfCheck ov 0 (' + A.ov + ' / ' + A.pfOv + ')');
check(A.conn.dangEnd === 0 && A.conn.noSrc === 0 && A.conn.ugUnpaired === 0 && A.conn.boxNoBelt === 0, 'case A connectivity 0 (' + JSON.stringify(A.conn).slice(0, 200) + ')');
check(A.machines === 18 && A.splitters === 18, 'case A 18 machines / 18 splitters (' + A.machines + ' / ' + A.splitters + ')');
check(A.trunkN === 3, 'case A 3 trunks into sink N cells (' + A.trunkN + ')');
check(A.Yend - 1 === 23, 'case A stage height Yc-Y = 23 (Yc=' + A.Yend + ')');
check(!B.fail, 'case B builds (' + (B.fail || 'ok') + ')');
check(B.ov === 0 && B.pfOv === 0, 'case B cell clash 0 / pfCheck ov 0 (' + B.ov + ' / ' + B.pfOv + ')');
check(B.conn.dangEnd === 0 && B.conn.noSrc === 0 && B.conn.ugUnpaired === 0 && B.conn.boxNoBelt === 0, 'case B connectivity 0 (' + JSON.stringify(B.conn).slice(0, 200) + ')');
check(B.machines === 36 && B.splitters === 36, 'case B 36 machines / 36 splitters (' + B.machines + ' / ' + B.splitters + ')');
check(B.midCount === 1 && B.enterN === 3 && B.leaveS === 3, 'case B middle container: 3 belts enter N, 3 leave S (' + B.enterN + ' / ' + B.leaveS + ')');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

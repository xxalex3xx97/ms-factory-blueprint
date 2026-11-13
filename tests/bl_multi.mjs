// BL8 two-input gates (page, ?engine=bl). Run: node tests/bl_multi.mjs   Exit 1 on FAIL or page error.
// BL8a: blMachine k=2 (Assembler: xin-xinB===2, off 5) and k=1 unchanged; Refinery k=2 refuses; lane stage (Rs 3, M 2, m [2,2,1]): cell clash 0, pfCheck ov 0, connectivity 0, 5 machines, 10 splitters, 10 UG.
import fs from 'fs';
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
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof blMachine === 'function' && typeof blStage === 'function' && typeof pfCheck === 'function' && typeof ugPairs === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
// connectivity: tests/bl_top.mjs __conn, boxNoBelt only for containers with an enabled S port
await pg.evaluate(() => {
  window.__conn = items => {
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
    const sinkY = emp.length ? Math.max(...emp.map(b => b.y)) : -1;
    for (const b of emp) {
      if (b.y === sinkY) continue;
      const s = pm.get(b).find(p => p.f === 'S' && p.en);
      if (!s) continue;
      const q = occ.get((s.x + s.nx) + ',' + (s.y + s.ny));
      if (!q || !(isBelt(q) || isUG(q) || isSpl(q))) { out.boxNoBelt++; out.ex.push('boxNoBelt (' + b.x + ',' + b.y + ')') }
    }
    return out;
  };
});
// machine ports
const m2 = await pg.evaluate(() => {
  const a = blMachine('DAT_Assembler', 2), r = blMachine('DAT_Refinery', 2), a1 = blMachine('DAT_Assembler');
  return {a, r, a1};
});
console.log('blMachine(DAT_Assembler,2) = ' + JSON.stringify(m2.a));
check(m2.a.ok && m2.a.rot === 0 && m2.a.w === 5 && m2.a.h === 5 && m2.a.xin - m2.a.xinB === 2 && m2.a.off.length === 5, 'blMachine(DAT_Assembler,2): rot 0, 5x5, xin-xinB 2, off 5');
check(m2.r.ok === false, 'blMachine(DAT_Refinery,2) refuses');
check(m2.a1.ok && m2.a1.xin === 1 && m2.a1.xinB === undefined, 'blMachine(DAT_Assembler) k=1 unchanged (xin ' + m2.a1.xin + ')');
// lane stage: LC lane container at (5,1) (W ports out, S ports off), DC direct container at (5,6), sink at Yc
const st = await pg.evaluate(() => {
  const cp = portsOf({cls: 'DAT_Container_2', x: 0, y: 0, rot: 0, off: []});
  const PS = cp.filter(p => p.f === 'S').map(p => p.x).sort((a, b) => a - b).slice(0, 3);
  const PN = cp.filter(p => p.f === 'N').map(p => p.x).sort((a, b) => a - b).slice(0, 3);
  const LCoff = cp.filter(p => p.f === 'S').map(p => p.key);
  const mc = blMachine('DAT_Assembler', 2);
  const S = {mk: 1, spMk: 1, bx: 'DAT_Container_2', cx: 5, Y: 6, mc, cls: 'DAT_Assembler', rec: 'ITEM_A+ITEM_B>ITEM_C', rowsM: [2, 2, 1], PS, PN, first: false, ind: false, item: null, M: 2, lane: {y: 1}};
  const r = blStage(S);
  if (!r.ok) return {fail: r.why};
  const LC = {cls: 'DAT_Container_2', x: 5, y: 1, rot: 0, h: 0, pid: 0, ct: [], off: LCoff};
  const DC = {cls: 'DAT_Container_2', x: 5, y: 6, rot: 0, h: 0, pid: 0, ct: [{item: 'ITEM_A', n: 0, inf: true}]};
  const SK = {cls: 'DAT_Container_2', x: 5, y: r.Yc, rot: 0, h: 0, pid: 0, ct: []};
  const items = [LC, DC, ...r.items, SK];
  const occ = new Map();
  let clash = 0;
  for (const b of items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) clash++; else occ.set(k, b) } }
  const w = Math.max(...items.map(b => b.x + dim(b).w)), h = Math.max(...items.map(b => b.y + dim(b).h));
  const pf = pfCheck({items, w, h, ports: []});
  const conn = window.__conn(items);
  const cnt = c => items.filter(b => b.cls === c).length;
  return {Yc: r.Yc, clash, pfOv: pf.ov, conn, machines: cnt('DAT_Assembler'), spl: items.filter(b => PLC_SPL.includes(b.cls)).length,
    ug: items.filter(b => PLC_UG.includes(b.cls)).length, PS, PN, LCoff, lcW: items.filter(b => b.x === 4).map(b => b.cls.slice(-4) + '@' + b.y + ' r' + b.rot)};
}, null);
if (st.fail) check(false, 'lane stage builds (' + st.fail + ')');
else {
  console.log('stage: Yc ' + st.Yc + ', PS ' + st.PS + ', PN ' + st.PN + ', LC off ' + st.LCoff + ', belts at x=4: ' + st.lcW.join(' '));
  check(st.clash === 0, 'lane stage cell clash 0 (' + st.clash + ')');
  check(st.pfOv === 0, 'lane stage pfCheck ov 0 (' + st.pfOv + ')');
  check(st.conn.dangEnd === 0 && st.conn.noSrc === 0 && st.conn.ugUnpaired === 0 && st.conn.boxNoBelt === 0, 'lane stage connectivity 0 (' + JSON.stringify(st.conn).slice(0, 600) + ')');
  check(st.machines === 5, 'lane stage 5 machines (' + st.machines + ')');
  check(st.spl === 10, 'lane stage 10 splitters (' + st.spl + ')');
  check(st.ug === 10, 'lane stage 10 UG (' + st.ug + ')');
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

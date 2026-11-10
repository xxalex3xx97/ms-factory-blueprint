// Bank layout slice 1 (placer.js placerBank): ONE trunk, double machine column. Test hook PLC_BANK=true only.
// REAL UI for the layout checks (clicks, typing, Ctrl+Z). Section P = sim probes of the buffer/splitter assumptions.
// Run:  node tests/placer_bank.mjs     Exit code 1 on any failed check or page error. Shots: tests/shots/bank-*.png
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
const W = 1400, H = 800;

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
function info(msg) { console.log(`INFO ${msg}`); }

async function setTicks(pg, ids) {
  for (const id of ['plnBk11', 'plnBk21', 'plnBk22']) await pg.setChecked('#' + id, ids.includes(id));
}
async function openBuild(pg, ticks) {
  await pg.click('#plnBuild');
  await pg.waitForFunction(() => document.getElementById('plnPrev').open, null, {timeout: 5000}).catch(() => {});
  if (ticks) await setTicks(pg, ticks);
  await pg.waitForTimeout(150);
  return pg.evaluate(() => ({open: $('plnPrev').open, bl: $('pvBlk').textContent, note: $('plnPrevNote').textContent, err: $('plnPrevErr').textContent}));
}
// real mouse click on the first free stage tile (stage = any canvas except the preview)
async function stageClick(pg, tiles = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8]]) {
  const pt = await pg.evaluate(list => {
    for (const [x, y] of list) {
      const p = __fb.px(x, y), e = document.elementFromPoint(p[0], p[1]);
      if (e && e.tagName === 'CANVAS' && e.id !== 'plnPrevMap') return {x: p[0], y: p[1]};
    }
    return null;
  }, tiles);
  if (!pt) return false;
  await pg.mouse.move(pt.x, pt.y);
  await pg.mouse.click(pt.x, pt.y);
  return true;
}
async function reset(pg) {
  await pg.evaluate(() => { S.blocks = []; undoS = []; redoS = []; pasting = null; clip = []; STRICT = true; setView('L'); });
}
async function openPlanner(pg) {
  if (await pg.evaluate(() => $("pln").classList.contains("col"))) await pg.click("#plnC");
}
async function closeIfOpen(pg) {
  if (await pg.evaluate(() => $('plnPrev').open)) await pg.click('#plnCancel');
  await pg.evaluate(() => { pasting = null; });
}
async function shot(pg, name) {
  fs.mkdirSync(SHOTS, {recursive: true});
  await pg.locator('#plnPrevMap').screenshot({path: path.join(SHOTS, `bank-${name}.png`)}).catch(e => info('modal shot failed: ' + e.message));
  await pg.screenshot({path: path.join(SHOTS, `bank-${name}-full.png`)});
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: W, height: H}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined' && typeof placerLayout === 'function');
  await reset(pg);

  // ---- P) sim probes behind the layout constants
  await pg.evaluate(() => { S.blocks = []; });
  const RAW = 'ITEM_CobaltOre';
  const P1 = await pg.evaluate(raw => {
    const bl = (id, cls, x, y, rot, extra = {}) => ({id, cls, x, y, h: 0, rot, pid: 0, ...extra});
    const its = [bl(1, 'DAT_Container_2', 0, 0, 0, {ct: [{item: raw, n: 0, inf: true}]})];
    for (let y = 0; y < 4; y++) { its.push(bl(10 + 2 * y, 'DAT_ConveyorBelt3', 4, y, 0)); its.push(bl(11 + 2 * y, 'DAT_ConveyorBelt3', 5, y, 0)); }
    its.push(bl(2, 'DAT_Container_2', 6, 0, 0, {ct: []}));
    S.blocks = its; simInit({}); simRun(120);
    return SIM.stat.cont.get(1).out;
  }, RAW);
  chk(`P1) Large source out ~ PLC_SRC (480 +/-5%), got ${P1}`, Math.abs(P1 - 480) <= 24, String(P1));
  const P2 = await pg.evaluate(raw => {
    const bl = (id, cls, x, y, rot, extra = {}) => ({id, cls, x, y, h: 0, rot, pid: 0, ...extra});
    S.blocks = [bl(1, 'DAT_Container_2', 0, -5, 0, {ct: [{item: raw, n: 0, inf: true}]}),
      bl(2, 'DAT_ConveyorBelt3', 4, -2, 0), bl(3, 'DAT_ConveyorBelt3', 5, -2, 1), bl(15, 'DAT_ConveyorBelt3', 5, -1, 1),
      bl(4, 'DAT_Splitter', 5, 0, 1, {off: []}),
      bl(5, 'DAT_ConveyorBelt3', 6, 0, 0), bl(6, 'DAT_Container', 7, 0, 0, {ct: []}),
      bl(7, 'DAT_ConveyorBelt3', 4, 0, 2), bl(8, 'DAT_ConveyorBelt3', 3, 0, 2), bl(9, 'DAT_Container', 1, 0, 0, {ct: []}),
      bl(10, 'DAT_ConveyorBelt3', 5, 1, 1), bl(11, 'DAT_ConveyorBelt3', 5, 2, 2), bl(12, 'DAT_ConveyorBelt3', 4, 2, 2),
      bl(13, 'DAT_ConveyorBelt3', 3, 2, 2), bl(14, 'DAT_Container', 1, 2, 0, {ct: []})];
    simInit({}); simRun(120);
    return [6, 9, 14].map(i => SIM.stat.cont.get(i).in).reduce((a, b) => a + b, 0);
  }, RAW);
  chk(`P2) Mk1 splitter 3 outputs: total sink inflow <= 63, got ${P2}`, P2 <= 63 && P2 > 0, String(P2));
  const st = await pg.evaluate(() => ({box: def(PLC_BOX).stats, box2: def('DAT_Container_2').stats}));
  info(`P3) DAT_Container stats ${JSON.stringify(st.box)}, Large ${JSON.stringify(st.box2)}`);
  await reset(pg);

  // ---- candidate: first raw-1 / rec-1 item whose Mk belt fits >= 4 machines; N = min(m, 5)
  const pick = await pg.evaluate(() => {
    for (const mk of [0, 1, 2]) for (const item of plnBy(false).keys()) {
      const P0 = plan(item, 1, mk, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
      if (!P0 || P0.raw.length !== 1 || Object.values(P0.nodes).filter(n => n.rec).length !== 1) continue;
      const T = P0.nodes[item], eI = P0.edges.find(e => e.from === P0.raw[0].item && e.to === item), eO = P0.edges.find(e => e.to == null);
      if (!T || !eI || !eO) continue;
      const m = Math.floor(MKS[mk][1] / Math.max(T.pmach, T.pmach * eI.flow / eO.flow) + 1e-9);
      if (m >= 4) { const N = Math.min(m, 5); return {item, mk, N, rate: N * T.pmach, pmach: T.pmach, m, name: plnNm(item)}; }
    }
    return null;
  });
  chk('setup: found a candidate item (Mk belt fits >= 4 machines)', !!pick, '');
  if (!pick) throw new Error('no candidate');
  info(`candidate ${pick.name} mk=${pick.mk} N=${pick.N} rate=${pick.rate} m=${pick.m}`);

  if (await pg.evaluate(() => document.getElementById('pln').hidden)) await pg.evaluate(() => document.getElementById('plnB').click());
  await openPlanner(pg);
  await pg.evaluate(() => PLC_BANK = true);   // test hook only
  await pg.selectOption('#plnItem', pick.item);
  await pg.evaluate(mk => { $('plnMk').value = String(mk); $('plnMk').dispatchEvent(new Event('change')); }, pick.mk);
  await pg.fill('#plnRate', String(pick.rate));
  const A = await openBuild(pg, ['plnBk22']);
  chk('B0) modal opens from Build factory', A.open === true, JSON.stringify(A));
  await pg.waitForFunction(() => $('plnPrevNote').textContent.length > 0, null, {timeout: 5000}).catch(() => {});
  await shot(pg, `${pick.name}-${pick.mk}`);

  // ---- B1 preview
  const B1 = await pg.evaluate(() => ({bank: plcL && plcL.bank, trunks: plcL && plcL.trunks, err: $('plnPrevErr').textContent, note: $('plnPrevNote').textContent}));
  chk('B1) layout is bank, one trunk', B1.bank === true && B1.trunks === 1, JSON.stringify(B1));
  chk('B1) no preview error', B1.err === '', B1.err);
  chk('B1) note has "1 trunk" and "Makes"', /1 trunk/.test(B1.note) && /Makes/.test(B1.note), B1.note);

  // ---- place: click the stage
  await pg.click('#plnPlace');
  const clicked = await stageClick(pg);
  chk('B2) stage click placed the factory', clicked);
  await pg.waitForTimeout(100);
  await pg.evaluate(() => { PLC_BANK = false; });

  const B2 = await pg.evaluate(() => {
    const isB = b => kindOf(b.cls) === 'b';
    const items = S.blocks.filter(b => !isB(b));
    const mach = items.filter(b => b.rec), spl = items.filter(b => PLC_SPL.includes(b.cls));
    const boxes = items.filter(b => b.cls === PLC_BOX);
    const inf = boxes.filter(b => (b.ct || []).some(x => x.inf));
    const sinks = boxes.filter(b => !(b.ct || []).length);
    return {mach: mach.length, spl: spl.length, boxes: boxes.length, inf: inf.length, infItems: inf.map(b => b.ct.map(x => x.item)), sinks: sinks.length, blocks: S.blocks.length - items.length};
  });
  chk(`B2) machines == N (${pick.N})`, B2.mach === pick.N, JSON.stringify(B2));
  chk('B2) splitters == ceil(N/2)', B2.spl === Math.ceil(pick.N / 2), JSON.stringify(B2));
  chk('B2) exactly one infinite container holding the raw item', B2.inf === 1 && B2.infItems[0].length === 1, JSON.stringify(B2));
  chk('B2) exactly one sink (ct empty)', B2.sinks === 1, JSON.stringify(B2));
  chk('B2) exactly one station block placed', B2.blocks === 1, JSON.stringify(B2));

  // ---- B3 no overlapping cells
  const B3 = await pg.evaluate(() => {
    const items = S.blocks.filter(b => kindOf(b.cls) !== 'b'), cells = new Map(); let ov = 0;
    items.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) ov++; cells.set(k, b) } });
    return ov;
  });
  chk('B3) no overlapping cells', B3 === 0, String(B3));

  // ---- B4 STRICT: everything on a floor, noBuild clean
  const B4 = await pg.evaluate(() => noBuild(S.blocks.filter(b => kindOf(b.cls) !== 'b').map(mItem)));
  chk('B4) noBuild(items) === false with STRICT on', B4 === false, String(B4));

  // ---- B5 sim: production, machine cycles, no blocked machine
  const B5 = await pg.evaluate(item => {
    simInit({}); simRun(300);
    const got = simProd().byItem[item] || 0;
    const ms = [...SIM.M.values()];
    const minCyc = Math.min(...ms.map(m => m.cycles)), need = m => 0.8 * 300 / (recOf(m.b).t / 30);
    const low = ms.filter(m => m.cycles < need(m)).length, blocked = ms.filter(m => m.st === 'blocked').length;
    return {got, n: ms.length, minCyc, low, blocked};
  }, pick.item);
  const want = pick.N * pick.pmach;
  chk(`B5) sim output within 5% of min(rate, N*pmach) = ${want}`, Math.abs(B5.got - want) <= 0.05 * want, JSON.stringify(B5));
  chk('B5) every machine cycles >= 0.8 of its full speed', B5.n === pick.N && B5.low === 0, JSON.stringify(B5));
  chk('B5) no machine blocked', B5.blocked === 0, JSON.stringify(B5));

  // ---- B6 ports: 2 enabled per machine, in faces trunk, out outward; splitter links
  const B6 = await pg.evaluate(() => {
    const items = S.blocks.filter(b => kindOf(b.cls) !== 'b');
    const mach = items.filter(b => b.rec), spl = items.filter(b => PLC_SPL.includes(b.cls));
    const occ = new Set();
    items.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) occ.add((b.x + i) + ',' + (b.y + j)) });
    const tx = spl[0] ? spl[0].x : null;
    const enabled = mach.map(m => portsOf(m).filter(p => p.en));
    const twoOn = enabled.every(a => a.length === 2);
    const faces = mach.map((m, k) => {
      const ns = enabled[k].map(p => p.nx + ',' + p.ny).sort().join(' ');
      return {left: m.x < tx, ns};
    });
    const faceOk = faces.every(f => f.ns === '-1,0 1,0');
    const splOk = spl.map((s, k) => {
      const linked = [[s.x + 1, s.y], [s.x, s.y + 1], [s.x - 1, s.y]].filter(([x, y]) => occ.has(x + ',' + y)).length;
      return linked;
    });
    // expected links: W machine (always) + E machine on that row (if any) + S trunk belt (not on the last splitter: trunk ends there)
    const last = Math.max(...spl.map(s => s.y));
    const want = spl.map(s => 1 + (mach.some(m => m.x > s.x && m.y + 1 === s.y) ? 1 : 0) + (s.y === last ? 0 : 1));
    const linkOk = splOk.every((n, k) => n === want[k]);
    return {twoOn, faceOk, faces, linkOk, splOk, want, nmach: mach.length};
  });
  chk('B6) every machine has exactly 2 enabled ports', B6.twoOn, JSON.stringify(B6));
  chk('B6) enabled ports face trunk (in) and outward (out)', B6.faceOk, JSON.stringify(B6.faces));
  chk('B6) splitters: 3 linked outputs; last row has no S belt (trunk ends) and no E machine if its row is single-sided', B6.linkOk, JSON.stringify({got: B6.splOk, want: B6.want}));

  // ---- B7 golden shape: only if the crafter is 4x4 with cin=1 (Refinery is 3x3: skipped)
  const B7 = await pg.evaluate(() => {
    const items = S.blocks.filter(b => kindOf(b.cls) !== 'b');
    const mach = items.filter(b => b.rec);
    if (!mach.length) return {skip: 'no machines'};
    const d = dim(mach[0]);
    return {w: d.w, h: d.h, n: mach.length};
  });
  if (B7.skip || B7.w !== 4 || B7.h !== 4) info(`B7) golden shape skipped: machine ${B7.w}x${B7.h} (needs 4x4 cin=1)`);
  else info('B7) golden shape: not implemented in slice 1 (crafter is 4x4)');

  // ---- B8 one Control+z removes everything
  const before = await pg.evaluate(() => S.blocks.length);
  await pg.keyboard.press('Control+z');
  const after = await pg.evaluate(() => S.blocks.length);
  chk(`B8) one Control+z removes the whole factory (${before} -> ${after})`, before > 0 && after === 0, `${before} -> ${after}`);

  await closeIfOpen(pg);
  await pg.evaluate(() => { PLC_BANK = false; });
} catch (e) {
  fails.push({name: 'exception', detail: e.stack || String(e)});
  console.log('FAIL exception: ' + (e.stack || e));
} finally {
  await br.close();
}
for (const e of errs) console.log('ERR ' + e);
console.log(`\n${pass}/${total} checks passed${fails.length ? `, ${fails.length} FAILED` : ''}${errs.length ? `, ${errs.length} page errors` : ''}`);
process.exit(fails.length || errs.length ? 1 : 0);

// Build factory (Step 1) tests for index.html (js/placer.js). Standalone; launch/helpers copied from tests/snippets-planner.mjs.
// Run:  node tests/placer.mjs     Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;

let total = 0, pass = 0;
const fails = [], errs = [];
const DLG = {next: null};
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
function wire(pg, tag) {
  pg.on('pageerror', e => errs.push(`[${tag}] pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`[${tag}] console.error: ${m.text()}`); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
}
async function newPage(ctx, tag) {
  const pg = await ctx.newPage();
  wire(pg, tag);
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined' && typeof placerLayout === 'function');
  return pg;
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1400, height: 900}});
  const pg = await newPage(ctx, 'main');
  await pg.evaluate(() => { window.BLK_CLS = () => Object.keys(BASE).find(k => BASE[k].kind === 'b' && BASE[k].name === 'BPO_Station_01'); });

  // ---- (1) candidates: single recipe, single raw input, layout ok
  const cand = await pg.evaluate(() => {
    const out = [];
    for (const item of plnBy(false).keys()) {
      const P = plan(item, 60, 0, {}, {}, {});
      const rec = Object.values(P.nodes).filter(n => n.rec);
      if (rec.length !== 1 || P.raw.length !== 1) continue;
      const L = placerLayout(P, item, 0, 0);
      if (L.ok) out.push({item, N: P.nodes[item].machines});
    }
    return out;
  });
  chk('(1) at least one single-input candidate with a layout', cand.length > 0, `found ${cand.length}`);
  const pick = cand.find(c => c.N >= 2) || cand[0];
  if (!pick) throw new Error('no candidate item; cannot continue');
  console.log(`      using ${pick.item} (${pick.N} machines)`);
  const ITEM = pick.item;

  // ---- (2) shape: counts, containers, no overlapping cells
  const shape = await pg.evaluate(([item]) => {
    const P = plan(item, 60, 0, {}, {}, {}), L = placerLayout(P, item, 0, 0), N = P.nodes[item].machines;
    const its = L.items, d = cls => def(cls);
    const cells = new Map(); let overlap = 0;
    its.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) overlap++; cells.set(k, b.cls); } });
    const cnt = {};
    its.forEach(b => { cnt[b.cls] = (cnt[b.cls] || 0) + 1 });
    const boxes = its.filter(b => b.cls === PLC_BOX);
    const inf = boxes.filter(b => b.ct && b.ct.length === 1 && b.ct[0].inf && b.ct[0].item === P.raw[0].item);
    const bufs = boxes.filter(b => b.ct && b.ct.length === 0);
    const hasWE = b => { const ps = portsOf({...b, rot: 0, off: []}); return ps.some(p => p.f === 'W') && ps.some(p => p.f === 'E') };
    const machines = its.filter(b => b.rec);
    return {N, overlap, machines: machines.length, splitters: cnt[PLC_SPL[0]] || 0, boxes: boxes.length, inf: inf.length, bufs: bufs.length,
      we: boxes.every(hasWE), belts: (cnt[PLC_BELT[0]] || 0), w: L.w, h: L.h, cls: Object.keys(cnt)};
  }, [ITEM]);
  chk('(2) N machines', shape.machines === shape.N, JSON.stringify(shape));
  chk('(2) N splitters', shape.splitters === shape.N, JSON.stringify(shape));
  chk('(2) 4 containers: 1 infinite source, 2 buffers, 1 sink', shape.boxes === 4 && shape.inf === 1 && shape.bufs === 3, JSON.stringify(shape));
  chk('(2) containers have W and E ports', shape.we, JSON.stringify(shape));
  chk('(2) no overlapping cells', shape.overlap === 0, `overlaps ${shape.overlap}`);

  // ---- (3) sim rate: production within 5% of min(rate, N*pmach)
  const sim = await pg.evaluate(([item]) => {
    STRICT = false; S.blocks = []; SIM = null;
    const P = plan(item, 60, 0, {}, {}, {}), L = placerLayout(P, item, 0, 0);
    S.blocks = L.items.map(b => ({...b, id: uid++, x: b.x + 10, y: b.y + 10, h: 0}));
    simInit({}); simRun(300);
    const got = simProd().byItem[item] || 0, want = Math.min(60, P.nodes[item].machines * P.nodes[item].pmach);
    return {got, want, machines: P.nodes[item].machines, pmach: P.nodes[item].pmach, byItem: simProd().byItem};
  }, [ITEM]);
  chk('(3) sim output within 5% of min(rate, N*pmach)', Math.abs(sim.got - sim.want) <= 0.05 * sim.want, JSON.stringify(sim));
  chk('(3) machine count equals plan', sim.machines === pick.N, JSON.stringify(sim));

  // ---- (4) placerBlock sizes
  const blk = await pg.evaluate(() => [
    [14, 14], [30, 14], [30, 15], [31, 1],
  ].map(([w, h]) => { const r = placerBlock({w, h}); return r ? BASE[r.cls].name : null }));
  chk('(4) placerBlock: 14x14 -> Station_01, 30x14 -> 2x1, 30x15 -> 02, 31x1 -> none',
    blk[0] === 'BPO_Station_01' && blk[1] === 'BPO_Station_2x1' && blk[2] === 'BPO_Station_02' && blk[3] === null, JSON.stringify(blk));

  // ---- (5) checked: ghost block + factory, Apply one undo step
  await pg.evaluate(([item]) => {
    S = {name: 't', blocks: [], dm: [], closed: []}; undoS = []; redoS = []; STRICT = true;
    if (view !== 'L') setView('L');
    if (document.getElementById('pln').hidden) document.getElementById('plnB').click();
    $('plnItem').value = item; $('plnRate').value = '60'; $('plnMk').value = '0'; $('plnSp').value = ''; $('plnInc').checked = true; plnDraw();
  }, [ITEM]);
  await pg.evaluate(() => document.getElementById('plnBuild').click());
  const g = await pg.evaluate(() => ({pl: !!(pasting && pasting.pl), view, clip: clip.length, n: S.blocks.length}));
  chk('(5) Build (checked): pasting.pl set, view L, clip empty', g.pl && g.view === 'L' && g.clip === 0 && g.n === 0, JSON.stringify(g));
  await pg.evaluate(() => { hover = {x: 5, y: 5}; pasteAt(); });
  const after = await pg.evaluate(() => {
    const blocks = S.blocks.filter(b => !isM(b)), ms = S.blocks.filter(isM);
    const fr = blocks.length ? floorRect(blocks[0]) : null;
    const inside = fr && ms.every(m => { const e = dim(m); return m.x >= fr.x && m.y >= fr.y && m.x + e.w <= fr.x + fr.w && m.y + e.h <= fr.y + fr.h });
    return {blocks: blocks.length, machines: ms.length, inside, bad: noBuild(ms.map(mItem)), pl: !!(pasting && pasting.pl), n: S.blocks.length};
  });
  chk('(5) click places +1 block and factory machines inside its floor', after.blocks === 1 && after.machines > 0 && after.inside === true && after.bad === false && after.pl === false, JSON.stringify(after));
  await pg.evaluate(() => undo());
  const und = await pg.evaluate(() => S.blocks.length);
  chk('(5) one undo removes block and factory', und === 0, `len ${und}`);
  await pg.evaluate(() => redo());
  const red = await pg.evaluate(() => S.blocks.length);
  chk('(5) redo restores block and factory', red === after.n, `len ${red} want ${after.n}`);

  // ---- (6) overlap with existing block: toast, nothing changes, pasting kept
  await pg.evaluate(([item]) => {
    S = {name: 't', blocks: [{id: uid++, cls: BLK_CLS(), x: 5, y: 5, h: 0, rot: 0, pid: 0}], dm: [], closed: []}; undoS = []; redoS = [];
    if (view !== 'L') setView('L');
    $('plnItem').value = item; $('plnRate').value = '60'; $('plnInc').checked = true; plnDraw();
    document.getElementById('plnBuild').click();
  }, [ITEM]);
  await pg.evaluate(() => { hover = {x: 5, y: 5}; pasteAt(); });
  const ov = await pg.evaluate(() => ({toast: $('toast').textContent, n: S.blocks.length, pl: !!(pasting && pasting.pl)}));
  chk('(6) overlap: toast, no change, pasting still set', ov.toast === 'Block overlaps another block' && ov.n === 1 && ov.pl, JSON.stringify(ov));

  // ---- (7) too big rate on Mk1: refused with belt note, nothing placed
  await pg.evaluate(([item]) => {
    S = {name: 't', blocks: [], dm: [], closed: []}; pasting = null;
    $('plnItem').value = item; $('plnRate').value = '500'; $('plnMk').value = '0'; plnDraw();
    document.getElementById('plnBuild').click();
  }, [ITEM]);
  const big = await pg.evaluate(() => ({toast: $('toast').textContent, pl: !!(pasting && pasting.pl), n: S.blocks.length}));
  chk('(7) 500/min Mk1: belt note toast, nothing placed', /belts/.test(big.toast) && !big.pl && big.n === 0, JSON.stringify(big));

  // ---- (8) unchecked: factory only into existing floor
  await pg.evaluate(([item]) => {
    S = {name: 't', blocks: [], dm: [], closed: []}; undoS = []; redoS = []; pasting = null;
    $('plnItem').value = item; $('plnRate').value = '60'; $('plnMk').value = '0'; $('plnInc').checked = false; plnDraw();
    document.getElementById('plnBuild').click();
  }, [ITEM]);
  const nof = await pg.evaluate(() => ({toast: $('toast').textContent, pl: !!(pasting && pasting.pl), clip: clip.length}));
  chk('(8) unchecked, no floor: "Does not fit" toast', /^Does not fit/.test(nof.toast) && nof.clip === 0 && !nof.pl, JSON.stringify(nof));
  // 14x14 Station_01 floor is too small for this factory (checked above); use the 30x30 Station_02 floor
  await pg.evaluate(() => { S.blocks = [{id: uid++, cls: Object.keys(BASE).find(k => BASE[k].kind === 'b' && BASE[k].name === 'BPO_Station_02'), x: 5, y: 5, h: 0, rot: 0, pid: 0}]; setView('F'); });
  await pg.evaluate(() => document.getElementById('plnBuild').click());
  const fit = await pg.evaluate(() => ({pl: !!(pasting && pasting.pl), paste: !!pasting, clip: clip.length, view}));
  chk('(8) unchecked with floor: clip set, paste mode, no ghost block', fit.paste && !fit.pl && fit.clip > 0 && fit.view === 'F', JSON.stringify(fit));
  await pg.evaluate(() => { pasting = null; S.blocks = []; });

  // ---- (9) negatives
  const negTwo = await pg.evaluate(() => {
    for (const item of plnBy(false).keys()) { const P = plan(item, 60, 0, {}, {}, {}); if (P.raw.length === 2) return placerLayout(P, item, 0, 0).why || 'ok' }
    return 'none';
  });
  chk('(9) 2-raw item: why contains "single-input"', /single-input/.test(negTwo), negTwo);
  const negBig = await pg.evaluate(([item]) => { const L = placerLayout(plan(item, 500, 0, {}, {}, {}), item, 0, 0); return {ok: L.ok, why: L.why || ''} }, [ITEM]);
  chk('(9) 500/min at Mk1: ok false, why contains "belts"', negBig.ok === false && /belts/.test(negBig.why), JSON.stringify(negBig));

  // ---- (10) Esc clears the ghost, nothing placed
  await pg.evaluate(([item]) => {
    S = {name: 't', blocks: [], dm: [], closed: []}; if (view !== 'L') setView('L');
    $('plnItem').value = item; $('plnRate').value = '60'; $('plnInc').checked = true; plnDraw();
    document.getElementById('plnBuild').click();
  }, [ITEM]);
  await pg.keyboard.press('Escape');
  const esc = await pg.evaluate(() => ({pl: !!(pasting && pasting.pl), n: S.blocks.length}));
  chk('(10) Esc clears pasting, nothing placed', !esc.pl && esc.n === 0, JSON.stringify(esc));

  // ---- (11) sweep: single-input candidates, Mk1 @60 and Mk2 @120. Sim <= 105% of N*pmach and >= 95% of min(rate, N*pmach)
  const sw = await pg.evaluate(() => {
    const bad = [], seen = [];
    for (const item of plnBy(false).keys()) {
      for (const [R, mk] of [[60, 0], [120, 1]]) {
        const P = plan(item, R, mk, {}, {}, {});
        const rec = Object.values(P.nodes).filter(q => q.rec);
        if (rec.length !== 1 || P.raw.length !== 1 || rec[0].rec.i.length !== 1) continue;
        const L = placerLayout(P, item, mk, mk);
        if (!L.ok) { if (!/belt/.test(L.why)) bad.push(item + ' R' + R + ' refused: ' + L.why); continue; }   // belt-limited refusals are expected
        STRICT = false; S.blocks = L.items.map(b => ({...b, id: uid++, x: b.x + 10, y: b.y + 10, h: 0}));
        simInit({}); simRun(300);
        const cap = P.nodes[item].machines * P.nodes[item].pmach, got = simProd().byItem[item] || 0;
        seen.push(item + '@' + R + '/Mk' + (mk + 1));
        if (got < 0.95 * Math.min(R, cap) || got > 1.05 * cap) bad.push(item + ' R' + R + ' Mk' + (mk + 1) + ': sim ' + got.toFixed(1) + ' cap ' + cap);
      }
    }
    S.blocks = [];
    return {n: seen.length, bad};
  });
  chk('(11) sweep ' + sw.n + ' single-input candidate runs: sim matches machine capacity', sw.bad.length === 0 && sw.n > 0, sw.bad.join('\n     '));

  // ---- (12) unchecked into an existing Station_2x1 / Station_02 floor (STRICT on): Apply adds all items, one undo leaves the block
  for (const nm of ['BPO_Station_2x1', 'BPO_Station_02']) {
    const r = await pg.evaluate(([nm]) => {
      const cls = Object.keys(BASE).find(k => BASE[k].kind === 'b' && BASE[k].name === nm);
      S = {name: 't', blocks: [{id: uid++, cls, x: 5, y: 5, h: 0, rot: 0, pid: 0}], dm: [], closed: []}; undoS = []; redoS = []; pasting = null; clip = []; STRICT = true; setView('F');
      $('plnItem').value = 'ITEM_CobaltPlates'; $('plnRate').value = '60'; $('plnMk').value = '0'; $('plnSp').value = ''; $('plnInc').checked = false; plnDraw();
      const x = placerPlan(), L = placerLayout(x.P, 'ITEM_CobaltPlates', 0, 0), fit = placerFit(L.items, L.w, L.h);
      document.getElementById('plnBuild').click();
      if (!fit || !(pasting && !pasting.pl)) return {fit, paste: !!pasting, toast: $('toast').textContent};
      const before = S.blocks.length; hover = {x: fit.x, y: fit.y}; pasteAt();
      const ms = S.blocks.filter(isM), f = floorRect(S.blocks[0]);
      const inside = ms.every(m => { const e = dim(m); return m.x >= f.x && m.y >= f.y && m.x + e.w <= f.x + f.w && m.y + e.h <= f.y + f.h; });
      const res = {added: S.blocks.length - before, want: L.items.length, inside, bad: noBuild(ms.map(mItem))};
      undo(); res.afterUndo = S.blocks.length;
      return res;
    }, [nm]);
    chk('(12) unchecked into ' + nm + ' floor: Apply adds all items, inside floor, one undo leaves block only', r.added === r.want && r.inside && r.bad === false && r.afterUndo === 1, JSON.stringify(r));
  }

  // ---- (13) checked block placed adjacent to an existing block: placed; overlapping: toast, nothing added
  const adj = await pg.evaluate(() => {
    const cls = Object.keys(BASE).find(k => BASE[k].kind === 'b' && BASE[k].name === 'BPO_Station_01');
    const go = hx => {
      S = {name: 't', blocks: [{id: uid++, cls, x: 5, y: 5, h: 0, rot: 0, pid: 0}], dm: [], closed: []}; undoS = []; redoS = []; pasting = null; clip = []; STRICT = true; setView('L');
      $('plnItem').value = 'ITEM_CobaltPlates'; $('plnRate').value = '60'; $('plnMk').value = '0'; $('plnSp').value = ''; $('plnInc').checked = true; plnDraw();
      document.getElementById('plnBuild').click(); hover = {x: hx, y: 5}; pasteAt();
      return {blocks: S.blocks.filter(b => !isM(b)).length, machines: S.blocks.filter(isM).length, toast: $('toast').textContent, pl: !!(pasting && pasting.pl)};
    };
    return {adjacent: go(6), overlap: go(5)};
  });
  chk('(13) block adjacent to existing block: placed with factory', adj.adjacent.blocks === 2 && adj.adjacent.machines > 0 && !adj.adjacent.pl, JSON.stringify(adj.adjacent));
  chk('(13) block overlapping existing block: toast, nothing added', adj.overlap.toast === 'Block overlaps another block' && adj.overlap.blocks === 1 && adj.overlap.pl, JSON.stringify(adj.overlap));

  // ---- (14) multi-input recipe must be refused. ITEM_Xenoeukarya recipe takes Xenoeukarya + Biomass (2 ingredients) and passes the single-raw check. EXPECTED FAIL until fixed.
  const xe = await pg.evaluate(() => {
    const P = plan('ITEM_Xenoeukarya', 60, 0, {}, {}, {}), L = placerLayout(P, 'ITEM_Xenoeukarya', 0, 0);
    return {ok: L.ok, why: L.why || '', ingredients: P.nodes.ITEM_Xenoeukarya.rec.i.length};
  });
  chk('(14) two-ingredient recipe (ITEM_Xenoeukarya) refused, not laid out', xe.ok === false && /single-input/.test(xe.why), JSON.stringify(xe));

  chk('(h) no pageerror / console.error during the run', errs.length === 0, errs.join('\n     '));
  await ctx.close();
} finally {
  await br.close();
}
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  fails.forEach(f => console.log(` - ${f.name}${f.detail ? ' :: ' + f.detail : ''}`));
}
process.exitCode = fails.length || errs.length ? 1 : 0;

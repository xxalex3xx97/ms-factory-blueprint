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
  await pg.evaluate(() => {
    window.BK = on => ['plnBk11', 'plnBk21', 'plnBk22'].forEach(i => { document.getElementById(i).checked = on });
    window.GO = () => { placerGo(); placerPlace(); };
  });

  // ---- (1) candidates: single recipe, single raw input, layout ok
  const cand = await pg.evaluate(() => {
    const out = [];
    for (const item of plnBy(false).keys()) {
      const P = plan(item, 60, 0, {}, {}, {});
      const rec = Object.values(P.nodes).filter(n => n.rec);
      if (rec.length !== 1 || P.raw.length !== 1) continue;
      if (Object.values(P.nodes).some(n => n.rec && n.rec.i.some(([x]) => x === n.item))) continue;   // growth items (self-fed) are tested in multi3
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
    const its = L.items;
    const cells = new Map(); let overlap = 0;
    its.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) overlap++; cells.set(k, b.cls); } });
    const cnt = {};
    its.forEach(b => { cnt[b.cls] = (cnt[b.cls] || 0) + 1 });
    const boxes = its.filter(b => b.cls === PLC_BOX);
    const inf = boxes.filter(b => b.ct && b.ct.length === 1 && b.ct[0].inf && b.ct[0].item === P.raw[0].item);
    const bufs = boxes.filter(b => b.ct && b.ct.length === 0);
    const hasWE = b => { const ps = portsOf({...b, rot: 0, off: []}); return ps.some(p => p.f === 'W') && ps.some(p => p.f === 'E') };
    const machines = its.filter(b => b.rec);
    const bw = def(PLC_BOX).w, cp = portsOf({cls: PLC_BOX, x: 0, y: 0, rot: 0, off: []});
    const ps = Math.max(1, Math.min(cp.filter(p => p.nx === 1).length, cp.filter(p => p.nx === -1).length, Math.floor(PLC_SRC / MKS[0][1])));
    const maxx = Math.max(...boxes.map(b => b.x)), emp = boxes.filter(b => b.ct && b.ct.length === 0);
    return {N, overlap, lanes: L.lanes, machines: machines.length, splitters: cnt[PLC_SPL[0]] || 0, boxes: boxes.length, inf: inf.length, bufs: bufs.length,
      we: boxes.every(hasWE), belts: (cnt[PLC_BELT[0]] || 0), w: L.w, h: L.h, cls: Object.keys(cnt), bank: !!L.bank, nS: L.nS || 0, nK: L.nK || 0, per: L.per, ps,
      inB: emp.filter(b => b.x === bw + 1).length, sinkB: emp.filter(b => b.x === maxx).length, outB: emp.filter(b => b.x === maxx - bw - 1).length};
  }, [ITEM]);
  chk('(2) N machines', shape.machines === shape.N, JSON.stringify(shape));
  // bank (N > belt capacity): one splitter per 2 machines of each trunk; legacy lane: one per machine
  chk('(2) splitters: N (lane) or sum ceil(trunk/2) (bank)', shape.splitters === (shape.bank ? shape.per.reduce((a, c) => a + Math.ceil(c / 2), 0) : shape.N), JSON.stringify(shape));
  // bank: nS source + nS in-buffer + nK out-buffer + nK sink; nK = ceil(trunks/ps), ps = lanes per container (ports, belt Mk1)
  chk('(2) containers: lane = 4 per lane (1 infinite source, 2 buffers, 1 sink); bank = 2nS+2nK (source, in-buffer, out-buffer, sink)',
    shape.bank ? (shape.boxes === 2 * shape.nS + 2 * shape.nK && shape.inf === shape.nS && shape.bufs === shape.nS + 2 * shape.nK
      && shape.inB === shape.nS && shape.sinkB === shape.nK && shape.outB === shape.nK && shape.nK === Math.ceil(shape.lanes / shape.ps))
      : (shape.boxes === 4 * shape.lanes && shape.inf === shape.lanes && shape.bufs === 3 * shape.lanes), JSON.stringify(shape));
  chk('(2) containers have W and E ports', shape.we, JSON.stringify(shape));
  chk('(2) no overlapping cells', shape.overlap === 0, `overlaps ${shape.overlap}`);

  // ---- (3) sim rate: production within 5% of min(rate, N*pmach)
  const sim = await pg.evaluate(([item]) => {
    STRICT = false; S.blocks = []; SIM = null;
    const P = plan(item, 60, 0, {}, {}, {}), L = placerLayout(P, item, 0, 0);
    S.blocks = L.items.map(b => ({...b, id: uid++, x: b.x + 10, y: b.y + 10, h: 0}));
    simInit({}); simRun(300);
    const got = simProd().byItem[item] || 0, cap = P.nodes[item].machines * P.nodes[item].pmach;
    return {got, cap, want: Math.min(60, cap), machines: P.nodes[item].machines, pmach: P.nodes[item].pmach, byItem: simProd().byItem};
  }, [ITEM]);
  chk('(3) sim output: >=95% of min(60, N*pmach) and <=105% of N*pmach', sim.got >= 0.95 * sim.want && sim.got <= 1.05 * sim.cap, JSON.stringify(sim));
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
    $('plnItem').value = item; $('plnRate').value = '60'; $('plnMk').value = '0'; $('plnSp').value = ''; BK(true); plnDraw();
  }, [ITEM]);
  const Tt = await pg.evaluate(() => { const x = placerPlan(), L = placerLayout(x.P, x.it, x.mk, x.sp ?? x.mk, {box: $('plnBuf').value, mod: $('plnMod').checked}), T = placerTile(L, [true, true, true]); return {blocks: T.ok ? T.blocks.length : -1, w: L.w, h: L.h} });
  await pg.evaluate(() => GO());
  const g = await pg.evaluate(() => ({pl: !!(pasting && pasting.pl), view, clip: clip.length, n: S.blocks.length}));
  chk('(5) Build (checked): pasting.pl set, view L, clip empty', g.pl && g.view === 'L' && g.clip === 0 && g.n === 0, JSON.stringify(g));
  await pg.evaluate(() => { hover = {x: 5, y: 5}; pasteAt(); });
  const after = await pg.evaluate(() => {
    const blocks = S.blocks.filter(b => !isM(b)), ms = S.blocks.filter(isM);
    const frs = blocks.map(b => floorRect(b));   // bank factory may spread over several blocks: each item must sit on one of their floors
    const inside = blocks.length > 0 && ms.every(m => { const e = dim(m); return frs.some(fr => fr && m.x >= fr.x && m.y >= fr.y && m.x + e.w <= fr.x + fr.w && m.y + e.h <= fr.y + fr.h) });
    return {blocks: blocks.length, machines: ms.length, inside, bad: noBuild(ms.map(mItem)), pl: !!(pasting && pasting.pl), n: S.blocks.length};
  });
  chk('(5) click places exactly the tile blocks (1 if the factory fits a 30x30 floor), factory items inside their floors', after.blocks === Tt.blocks && (!(Tt.w + 1 <= 30 && Tt.h <= 30) || after.blocks === 1) && after.machines > 0 && after.inside === true && after.bad === false && after.pl === false, JSON.stringify({after, Tt}));
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
    $('plnItem').value = item; $('plnRate').value = '60'; BK(true); plnDraw();
    GO();
  }, [ITEM]);
  await pg.evaluate(() => { hover = {x: 5, y: 5}; pasteAt(); });
  const ov = await pg.evaluate(() => ({toast: $('toast').textContent, n: S.blocks.length, pl: !!(pasting && pasting.pl)}));
  chk('(6) overlap: toast, no change, pasting still set', ov.toast === 'Block overlaps another block' && ov.n === 1 && ov.pl, JSON.stringify(ov));

  // ---- (7) 500/min on Mk1: not refused, parallel lanes, sim matches machine capacity
  const big = await pg.evaluate(([item]) => {
    STRICT = false; S.blocks = [];
    const P = plan(item, 120, 0, {}, {}, {}), L = placerLayout(P, item, 0, 0, {box: 'DAT_Container_2'});
    if (!L.ok) return {why: L.why};
    S.blocks = L.items.map(b => ({...b, id: uid++, x: b.x + 10, y: b.y + 10, h: 0}));
    simInit({}); simRun(300);
    const cap = P.nodes[item].machines * P.nodes[item].pmach;
    return {lanes: L.lanes, sum: L.per.reduce((a, b) => a + b, 0), N: P.nodes[item].machines, got: simProd().byItem[item] || 0, cap, rate: 120, note: L.note.join('|')};
  }, [ITEM]);
  chk('(7) 120/min Mk1, Large sink (4 ports): not refused, >=2 lanes, machines sum to N, sim within 5% of min(rate,cap)', big.lanes >= 2 && big.sum === big.N && big.got >= 0.95 * Math.min(120, big.cap) && big.got <= 1.05 * big.cap && /Makes/.test(big.note), JSON.stringify(big));
  // 500/min Mk1 = 9 trunks: sink containers stack (no 'Output needs' refusal), both buffer types build and run at full rate
  const big5 = await pg.evaluate(([item]) => ['DAT_Container', 'DAT_Container_2'].map(box => {
    const P = plan(item, 500, 0, {}, {}, {}), L = placerLayout(P, item, 0, 0, {box});
    if (!L.ok) return {box, ok: false, why: L.why};
    const cells = new Map(); let overlap = 0;
    L.items.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) overlap++; cells.set(k, b.cls); } });
    const pc = portsOf({cls: box, x: 0, y: 0, rot: 0, off: []}), ps = Math.max(1, Math.min(pc.filter(p => p.nx === 1).length, pc.filter(p => p.nx === -1).length, Math.floor(PLC_SRC / MKS[0][1])));
    STRICT = false; S.blocks = L.items.map(b => ({...b, id: uid++, x: b.x + 10, y: b.y + 10, h: 0}));
    simInit({}); simRun(300);
    const cap = P.nodes[item].machines * P.nodes[item].pmach, got = simProd().byItem[item] || 0;
    S.blocks = [];
    return {box, ok: true, N: P.nodes[item].machines, sum: L.per.reduce((a, b) => a + b, 0), trunks: L.lanes, nK: L.nK, ps, wantK: Math.ceil(L.lanes / ps), overlap, got, cap};
  }), [ITEM]);
  big5.forEach(r => chk('(7) 500/min Mk1, ' + r.box + ': ok, nK === ceil(trunks/ps), machines sum to N, no overlap, sim within 5% of min(500,cap)',
    r.ok === true && r.nK === r.wantK && r.sum === r.N && r.overlap === 0 && r.got >= 0.95 * Math.min(500, r.cap) && r.got <= 1.05 * r.cap, JSON.stringify(r)));

  // ---- (8) unchecked: factory only into existing floor
  await pg.evaluate(([item]) => {
    S = {name: 't', blocks: [], dm: [], closed: []}; undoS = []; redoS = []; pasting = null;
    $('plnItem').value = item; $('plnRate').value = '60'; $('plnMk').value = '0'; BK(false); plnDraw();
    GO();
  }, [ITEM]);
  const nof = await pg.evaluate(() => ({err: $('plnPrevErr').textContent, open: document.getElementById('plnPrev').open, pl: !!(pasting && pasting.pl), clip: clip.length}));
  chk('(8) unchecked, no floor: "Does not fit" in #plnPrevErr, modal stays open', /^Does not fit/.test(nof.err) && nof.open && nof.clip === 0 && !nof.pl, JSON.stringify(nof));
  // 14x14 Station_01 floor is too small for this factory (checked above); use the 30x30 Station_02 floor
  // 60/min is a 2-trunk bank now (wider than one 30x30 floor): use 30/min (one machine, single lane) so it fits
  await pg.evaluate(() => { S.blocks = [{id: uid++, cls: Object.keys(BASE).find(k => BASE[k].kind === 'b' && BASE[k].name === 'BPO_Station_02'), x: 5, y: 5, h: 0, rot: 0, pid: 0}]; setView('F'); $('plnRate').value = '30'; });
  await pg.evaluate(() => GO());
  const fit = await pg.evaluate(() => ({pl: !!(pasting && pasting.pl), paste: !!pasting, clip: clip.length, view}));
  chk('(8) unchecked with floor: clip set, paste mode, no ghost block', fit.paste && !fit.pl && fit.clip > 0 && fit.view === 'F', JSON.stringify(fit));
  await pg.evaluate(() => { pasting = null; S.blocks = []; });

  // ---- (9) negatives
  const negTwo = await pg.evaluate(() => {
    for (const item of plnBy(false).keys()) { const P = plan(item, 60, 0, {}, {}, {}); if (P.raw.length === 2) return placerLayout(P, item, 0, 0).why || 'ok' }
    return 'none';
  });
  chk('(9) 2-raw item: why contains "single-input"', /single-input/.test(negTwo), negTwo);
  const negBig = await pg.evaluate(([item]) => { const L = placerLayout(plan(item, 120, 0, {}, {}, {}), item, 0, 0, {box: 'DAT_Container_2'}); return {ok: L.ok, why: L.why || '', lanes: L.lanes} }, [ITEM]);
  chk('120/min at Mk1, Large sink: ok with parallel lanes', negBig.ok === true && negBig.lanes >= 2, JSON.stringify(negBig));

  // ---- (10) Esc clears the ghost, nothing placed
  await pg.evaluate(([item]) => {
    S = {name: 't', blocks: [], dm: [], closed: []}; if (view !== 'L') setView('L');
    $('plnItem').value = item; $('plnRate').value = '60'; BK(true); plnDraw();
    GO();
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
      $('plnItem').value = 'ITEM_CobaltPlates'; $('plnRate').value = '60'; $('plnMk').value = '0'; $('plnSp').value = ''; BK(false); plnDraw();
      const x = placerPlan(), L = placerLayout(x.P, 'ITEM_CobaltPlates', 0, 0), fit = placerFit(L.items, L.w, L.h);
      GO();
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
      $('plnItem').value = 'ITEM_CobaltPlates'; $('plnRate').value = '60'; $('plnMk').value = '0'; $('plnSp').value = ''; BK(true); plnDraw();
      GO(); hover = {x: hx, y: 5}; pasteAt();
      return {blocks: S.blocks.filter(b => !isM(b)).length, machines: S.blocks.filter(isM).length, toast: $('toast').textContent, pl: !!(pasting && pasting.pl)};
    };
    return {adjacent: go(6), overlap: go(5)};
  });
  chk('(13) block adjacent to existing block: placed with factory', adj.adjacent.blocks === 2 && adj.adjacent.machines > 0 && !adj.adjacent.pl, JSON.stringify(adj.adjacent));
  chk('(13) block overlapping existing block: toast, nothing added', adj.overlap.toast === 'Block overlaps another block' && adj.overlap.blocks === 1 && adj.overlap.pl, JSON.stringify(adj.overlap));

  // ---- (14) multi-input recipe must be refused. ITEM_Xenoeukarya recipe takes Xenoeukarya + Biomass (2 ingredients) and passes the single-raw check.
  const xe = await pg.evaluate(() => {
    const P = plan('ITEM_Xenoeukarya', 60, 0, {}, {}, {}), L = placerLayout(P, 'ITEM_Xenoeukarya', 0, 0);
    return {ok: L.ok, why: L.why || '', note: (L.note || []).join(' '), ingredients: P.nodes.ITEM_Xenoeukarya.rec.i.length};
  });
  chk('(14) growth recipe (ITEM_Xenoeukarya, self-fed + Biomass) laid out by the growth lane with a Seed note', xe.ok === true && /Seed:/.test(xe.note), JSON.stringify(xe));

  // ---- (15) preview: Build shows preview only; Cancel hides; Build + Place starts the ghost
  await pg.evaluate(([item]) => {
    S = {name: 't', blocks: [], dm: [], closed: []}; undoS = []; redoS = []; pasting = null; clip = []; if (view !== 'L') setView('L');
    if (document.getElementById('pln').hidden) document.getElementById('plnB').click();
    $('plnItem').value = item; $('plnRate').value = '60'; $('plnMk').value = '0'; $('plnSp').value = ''; $('plnBuf').value = 'DAT_Container'; $('plnMod').checked = false; BK(true); plnDraw();
    document.getElementById('plnBuild').click();
  }, [ITEM]);
  const pv = await pg.evaluate(([item]) => ({shown: document.getElementById('plnPrev').open, N: plan(item, 60, 0, {}, {}, {}).nodes[item].machines,
    mach: $('pvMach').textContent, blk: $('pvBlk').textContent, cell: $('pvCell').textContent, io: $('pvIO').textContent, note: $('plnPrevNote').textContent,
    n: S.blocks.length, pl: !!(pasting && pasting.pl)}), [ITEM]);
  chk('(15) Build shows preview (machines, block, cells, IN/OUT, note), nothing placed', pv.shown && pv.mach === String(pv.N) && !!pv.blk && !!pv.cell && !!pv.io && !!pv.note && pv.n === 0 && !pv.pl, JSON.stringify(pv));
  await pg.evaluate(() => document.getElementById('plnCancel').click());
  const hid = await pg.evaluate(() => !document.getElementById('plnPrev').open);
  chk('(15) Cancel closes preview', hid === true, String(hid));
  await pg.evaluate(() => { document.getElementById('plnBuild').click(); document.getElementById('plnPlace').click(); });
  const pl2 = await pg.evaluate(() => ({pl: !!(pasting && pasting.pl), hidden: !document.getElementById('plnPrev').open, n: S.blocks.length}));
  chk('(15) Build then Place: ghost block set, preview closed, nothing placed yet', pl2.pl && pl2.hidden && pl2.n === 0, JSON.stringify(pl2));
  await pg.evaluate(() => { pasting = null; });

  // ---- (15b) modal shows real floor; Build + placerShot + zoom never touch S.blocks (identity, length), view, V, layer; Cancel closes
  const sh = await pg.evaluate(() => {
    const b0 = S.blocks, n0 = S.blocks.length, v0 = view, V0 = JSON.stringify(V), l0 = layer;
    document.getElementById('plnBuild').click(); placerShot();
    document.getElementById('plnZi').click(); document.getElementById('plnZi').click();
    const r = {open: document.getElementById('plnPrev').open, sameArr: S.blocks === b0, n: S.blocks.length === n0, view: view === v0, V: JSON.stringify(V) === V0, layer: layer === l0};
    document.getElementById('plnCancel').click();
    r.closed = !document.getElementById('plnPrev').open;
    return r;
  });
  chk('(15b) modal: Build opens it; zoom leaves S.blocks identity+length, view, V, layer unchanged; Cancel closes', sh.open && sh.sameArr && sh.n && sh.view && sh.V && sh.layer && sh.closed, JSON.stringify(sh));

  // ---- (16) large buffer container: every container DAT_Container_2, 4 per lane, no overlap; sim matches
  const lb = await pg.evaluate(([item]) => {
    const P = plan(item, 60, 0, {}, {}, {}), L = placerLayout(P, item, 0, 0, {box: 'DAT_Container_2'});
    if (!L.ok) return {ok: false, why: L.why};
    const cells = new Map(); let overlap = 0;
    L.items.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) overlap++; cells.set(k, b.cls); } });
    const cs = L.items.filter(b => b.ct);
    STRICT = false; S.blocks = L.items.map(b => ({...b, id: uid++, x: b.x + 10, y: b.y + 10, h: 0}));
    simInit({}); simRun(300);
    const cap = P.nodes[item].machines * P.nodes[item].pmach, got = simProd().byItem[item] || 0;
    S.blocks = [];
    return {ok: true, lanes: L.lanes, boxes: cs.length, allLarge: cs.every(b => b.cls === 'DAT_Container_2'), overlap, got, cap, nS: L.nS, nK: L.nK, bank: !!L.bank,
      bufs: cs.filter(b => b.ct.length === 0).length, opts: [...document.getElementById('plnBuf').options].map(o => o.value)};
  }, [ITEM]);
  chk('(16) large buffer: every container DAT_Container_2, boxes 2nS+2nK, buffers nS+2nK (bank), no overlap', lb.ok && lb.allLarge && lb.bank && lb.boxes === 2 * lb.nS + 2 * lb.nK && lb.bufs === lb.nS + 2 * lb.nK && lb.overlap === 0, JSON.stringify(lb));
  chk('(16) large buffer sim: >=95% of min(60,cap), <=105% of cap', lb.ok && lb.got >= 0.95 * Math.min(60, lb.cap) && lb.got <= 1.05 * lb.cap, JSON.stringify(lb));
  chk('(16) #plnBuf offers DAT_Container and DAT_Container_2', !!lb.opts && lb.opts.length === 2 && lb.opts.includes('DAT_Container') && lb.opts.includes('DAT_Container_2'), JSON.stringify(lb.opts));

  // ---- (17) 1000/min on Mk2: parallel lanes, no overlap
  const m2 = await pg.evaluate(([item]) => {
    const L = placerLayout(plan(item, 240, 1, {}, {}, {}), item, 1, 1, {box: 'DAT_Container_2'});   // 240/min Mk2 = 2-4 trunks (Large has 4 ports); 1000/min is refused, see negative below
    if (!L.ok) return {ok: false, why: L.why};
    const cells = new Map(); let overlap = 0;
    L.items.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) overlap++; cells.set(k, b.cls); } });
    return {ok: true, lanes: L.lanes, overlap, boxes: L.items.filter(b => b.ct).length, nS: L.nS, nK: L.nK, bank: !!L.bank};
  }, [ITEM]);
  chk('(17) 240/min Mk2 (Large): ok, lanes>=2, no overlap, boxes === 2nS+2nK (bank)', m2.ok && m2.lanes >= 2 && m2.overlap === 0 && m2.bank && m2.boxes === 2 * m2.nS + 2 * m2.nK, JSON.stringify(m2));
  // 1000/min Mk2 = 9 trunks on a 2-port Container: sinks stack (ps = 2 lanes each), no refusal
  const m3 = await pg.evaluate(([item]) => {
    const L = placerLayout(plan(item, 1000, 1, {}, {}, {}), item, 1, 1); if (!L.ok) return {ok: false, why: L.why || ''};
    const cells = new Map(); let overlap = 0;
    L.items.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) overlap++; cells.set(k, b.cls); } });
    return {ok: true, trunks: L.lanes, nK: L.nK, want: Math.ceil(L.lanes / 2), overlap};
  }, [ITEM]);
  chk('(17) 1000/min Mk2 with Container (2 ports): ok, nK === ceil(trunks/2), no overlap', m3.ok === true && m3.nK === m3.want && m3.overlap === 0, JSON.stringify(m3));

  // ---- (18) modular: open ends (IN west, OUT east), no source/sink; copies chain; sim with external source/sink
  const md = await pg.evaluate(([item]) => {
    const P = plan(item, 60, 0, {}, {}, {}), L = placerLayout(P, item, 0, 0, {mod: true});
    if (!L.ok) return {ok: false, why: L.why};
    const its = L.items, pp = portsOf({cls: 'DAT_Container', x: 0, y: 0, rot: 0, off: []});
    const pe = pp.find(p => p.f === 'E'), pw = pp.find(p => p.f === 'W');
    const cs = its.filter(b => b.ct);
    const inB = its.filter(b => b.cls === PLC_BELT[0] && b.x === 0 && b.rot === 0), outB = its.filter(b => b.cls === PLC_BELT[0] && b.x === L.w - 1 && b.rot === 0);
    const sy = a => a.map(b => b.y).sort((p, q) => p - q);
    const copy2 = its.map(b => ({...b, x: b.x + L.w}));
    const cells = new Map(); let overlap2 = 0;
    [...its, ...copy2].forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) overlap2++; cells.set(k, b.cls); } });
    const adj = outB.every(o => copy2.some(c => c.cls === PLC_BELT[0] && c.rot === 0 && c.x === o.x + 1 && c.y === o.y));
    const srcs = inB.map(b => ({cls: 'DAT_Container', x: -2, y: b.y - pe.y, h: 0, rot: 0, pid: 0, ct: [{item: P.raw[0].item, n: 0, inf: true}]}));
    const sinks = outB.map(b => ({cls: 'DAT_Container', x: L.w, y: b.y - pw.y, h: 0, rot: 0, pid: 0, ct: []}));
    STRICT = false; S.blocks = [...its, ...srcs, ...sinks].map(b => ({...b, id: uid++, x: b.x + 10, y: b.y + 10, h: 0}));
    simInit({}); simRun(300);
    const cap = P.nodes[item].machines * P.nodes[item].pmach, got = simProd().byItem[item] || 0;
    S.blocks = [];
    return {ok: true, lanes: L.lanes, boxes: cs.length, inf: cs.filter(b => b.ct.some(c => c.inf)).length, inCount: inB.length, outCount: outB.length,
      sameYs: JSON.stringify(sy(inB)) === JSON.stringify(sy(outB)), overlap2, adj, got, cap};
  }, [ITEM]);
  chk('(18) modular: boxes 2*lanes, no infinite source/sink', md.ok && md.boxes === 2 * md.lanes && md.inf === 0, JSON.stringify(md));
  chk('(18) modular: IN belts and OUT belts = lanes, same y lists', md.ok && md.inCount === md.lanes && md.outCount === md.lanes && md.sameYs, JSON.stringify(md));
  chk('(18) modular sim with external source/sink: >=95% of min(60,cap)', md.ok && md.got >= 0.95 * Math.min(60, md.cap), JSON.stringify(md));
  chk('(18) two copies: no overlap, copy-2 IN directly east of copy-1 OUT', md.ok && md.overlap2 === 0 && md.adj, JSON.stringify(md));

  // ---- (19) Mk3 note; Mk1 with pmach > 60 refused with "higher belt"
  const mk3 = await pg.evaluate(([item]) => { const L = placerLayout(plan(item, 60, 2, {}, {}, {}), item, 2, 2); return {ok: L.ok, why: L.why || '', note: (L.note || []).join('|')}; }, [ITEM]);
  chk('(19) Mk3: note has "not verified" and "Makes"', mk3.ok && /not verified/.test(mk3.note) && /Makes/.test(mk3.note), JSON.stringify(mk3));
  const hi = await pg.evaluate(() => {
    for (const item of plnBy(false).keys()) {
      const P = plan(item, 60, 0, {}, {}, {}), rec = Object.values(P.nodes).filter(n => n.rec);
      if (rec.length !== 1 || P.raw.length !== 1 || rec[0].rec.i.length !== 1) continue;
      if (P.nodes[item].pmach > 60) { const L = placerLayout(P, item, 0, 0); return {item, ok: L.ok, why: L.why || ''}; }
    }
    return null;
  });
  chk('(19) Mk1 with pmach>60: ok false, why matches /higher belt/ (detail "none" if no such item)', hi === null || (hi.ok === false && /higher belt/.test(hi.why)), hi === null ? 'none' : JSON.stringify(hi));

  // ---- (21) ITEM_Exosuit (55 nodes, 11 raw inputs, cyclic): modal opens with the error inside, Place off, nothing placed; Cancel closes
  await pg.evaluate(() => {
    S = {name: 't', blocks: [], dm: [], closed: []}; if (view !== 'L') setView('L');
    pasting = null; plcL = null; if ($('plnPrev').open) $('plnPrev').close(); $('toast').textContent = '';
    $('plnItem').value = 'ITEM_Exosuit'; $('plnRate').value = '1'; $('plnMk').value = '0'; BK(true); plnDraw();
  });
  const exo = await pg.evaluate(() => {
    const blk0 = JSON.stringify(S.blocks);
    let err = '', ms = -1;
    try { const t0 = performance.now(); placerGo(); ms = performance.now() - t0; } catch (e) { err = e.message; }
    const open = document.getElementById('plnPrev').open, msg = $('plnPrevErr').textContent, placeOff = $('plnPlace').disabled;
    const same = JSON.stringify(S.blocks) === blk0, pl = !!(pasting && pasting.pl);
    let Lok = null, Lwhy = '', Lerr = '';
    try { const x = placerPlan(), L = placerLayout(x.P, 'ITEM_Exosuit', 0, 0); Lok = L.ok; Lwhy = L.why || ''; } catch (e) { Lerr = e.message; }
    return {err, ms, open, msg, placeOff, same, pl, Lok, Lwhy, Lerr};
  });
  chk('(21) Exosuit: placerGo no exception, < 2000 ms', exo.err === '' && exo.ms >= 0 && exo.ms < 2000, JSON.stringify(exo));
  chk('(21) Exosuit: #plnPrev open, #plnPrevErr matches /single-input single-recipe/, #plnPlace disabled, S.blocks unchanged, no ghost', exo.open === true && /single-input single-recipe/.test(exo.msg) && exo.placeOff === true && exo.same && !exo.pl, JSON.stringify(exo));
  await pg.evaluate(() => document.getElementById('plnCancel').click());
  const exoClosed = await pg.evaluate(() => !document.getElementById('plnPrev').open);
  chk('(21) Exosuit: Cancel closes the modal', exoClosed === true, String(exoClosed));
  chk('(21) Exosuit: placerLayout ok:false with why', exo.Lerr === '' && exo.Lok === false && /single-input single-recipe/.test(exo.Lwhy), JSON.stringify(exo));

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

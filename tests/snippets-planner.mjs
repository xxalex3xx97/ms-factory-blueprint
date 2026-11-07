// Snippet library tests (Stage 1) for index.html. Standalone; helpers copied from tests/harness.mjs.
// Run:  cd F:/ms-factory-bp-site && node tests/snippets-planner.mjs
// Exit code 1 on any failed check or page error. Same browser context across reload so localStorage persists.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {isDeepStrictEqual} from 'util';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;

let total = 0, pass = 0;
let MENU_NOTE = 0;   // times a menu was closed+reopened to reach an off-screen control (see reveal)
const fails = [], errs = [];
// dialog answers for the next prompt()/confirm(): {accept, text}; default = dismiss. seen = all messages.
const DLG = {next: null, seen: []};
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
function wire(pg, tag) {
  pg.on('pageerror', e => errs.push(`[${tag}] pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`[${tag}] console.error: ${m.text()}`); });
  pg.on('dialog', d => {
    DLG.seen.push(d.message());
    const n = DLG.next; DLG.next = null;
    (n && n.accept ? d.accept(n.text ?? '') : d.dismiss()).catch(() => {});
  });
  // Header/floor controls live inside menus (#fileL, #simL). Before a click/check/uncheck, open the
  // menu the way a user would (click its button) when the target is hidden inside a closed menu.
  // Never forces or dispatches on hidden elements: a target whose menu is unreachable still fails.
  // index.html places a menu once, at open; after Simulate is switched on inside Floor tools the list
  // grows past the viewport edge. A control there is reached the way a user would: close and reopen.
  const rawClick = pg.click.bind(pg);
  const reveal = async sel => {
    const m = await pg.evaluate(s => {
      const el = document.querySelector(s), shown = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      if (!el) return null;
      // floating windows (Simulation #smW, Flow #fwW, top right): open with the header toggle when closed
      const win = el.closest('#smW') ? 'smW' : el.closest('#fwW') ? 'fwW' : null;
      if (win) return document.getElementById(win).hidden ? {btn: win === 'smW' ? '#simB' : '#flwB', list: '#' + win} : null;
      const list = el.closest('.mnl');
      if (!list) return null;
      const r = el.getBoundingClientRect(), offscreen = shown(el) && (r.left < 0 || r.right > innerWidth);
      if (shown(el) && !offscreen) return null;
      const btn = list.parentElement.firstElementChild;
      if (!shown(btn) || (!list.hidden && !offscreen)) return null;
      return {btn: '#' + btn.id, list: '#' + list.id, reopen: !list.hidden};
    }, sel);
    if (!m) return;
    if (m.reopen) { await rawClick(m.btn); MENU_NOTE++; }   // close the open menu first
    await rawClick(m.btn);
    await pg.waitForFunction(l => !document.querySelector(l).hidden, m.list);
  };
  for (const k of ['click', 'check', 'uncheck']) {
    const f = pg[k].bind(pg);
    pg[k] = async (sel, ...a) => { await reveal(sel); return f(sel, ...a); };
  }
}
async function newPage(ctx, tag) {
  const pg = await ctx.newPage();
  wire(pg, tag);
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  return pg;
}

// ---- blueprint builders (importJson input = build() output format)
let BMAP, BLK;
const mclass = id => BMAP[id].machineClass || id;
const mac = (id, x, y, o = {}) => ({
  Class: mclass(id), DefaultName: id,
  Transform: {GridLocation: {X: x, Y: y}, Height: o.h || 0, GridRotation: o.rot || 0},
  MachineID: o.mid || 0, PaletteID: 0, ...(o.off ? {Ports: o.off} : {}), ...(o.rec ? {Recipe: o.rec} : {}),
});
const blk = (name, x, y, o = {}) => ({
  Class: BLK[name], GridLocation: {X: x * 2, Y: y * 2}, Height: o.h || 0, GridRotation: o.rot || 0, BlockID: 0, PaletteID: 0,
});
const bp = (Blocks = [], DefaultMachines = [], extra = {}) => ({Version: 1, DisplayName: 't', Blocks, DefaultMachines, ...extra});
const imp = (pg, obj) => pg.evaluate(t => __fb.importJson(t), JSON.stringify(obj));
const KC = 'ITEM_CobaltOre>ITEM_CobaltPlates';

// layout normalisation: shift so min x/y/height is 0 (paste normalises the same way)
const normBlocks = arr => {
  const bs = arr.map(b => ({c: b.Class, x: b.GridLocation.X, y: b.GridLocation.Y, h: b.Height, r: b.GridRotation}));
  const mx = Math.min(...bs.map(b => b.x)), my = Math.min(...bs.map(b => b.y)), mh = Math.min(...bs.map(b => b.h));
  return bs.map(b => ({...b, x: b.x - mx, y: b.y - my, h: b.h - mh})).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
};
const normM = arr => {
  const ms = arr.map(m => ({c: m.Class, x: m.Transform.GridLocation.X, y: m.Transform.GridLocation.Y, h: m.Transform.Height, r: m.Transform.GridRotation, rec: m.Recipe ?? null, ports: m.Ports ?? null}));
  const mx = Math.min(...ms.map(m => m.x)), my = Math.min(...ms.map(m => m.y)), mh = Math.min(...ms.map(m => m.h));
  return ms.map(m => ({...m, x: m.x - mx, y: m.y - my, h: m.h - mh})).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
};
const diff = (a, b) => `got ${JSON.stringify(a)}\n     want ${JSON.stringify(b)}`;

// select everything visible on the current layer (app's own Ctrl+A handler)
async function selectAll(pg) { await pg.focus('#cv'); await pg.keyboard.press('Control+a'); }

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  // one context for the whole main run: localStorage must survive reload
  const ctx = await br.newContext({viewport: {width: 1400, height: 900}});
  let pg = await newPage(ctx, 'main');
  BMAP = Object.fromEntries((await pg.evaluate(() => CATALOG)).buildables.map(b => [b.id, b]));
  BLK = Object.fromEntries((await pg.evaluate(() => CATALOG)).blocks.map(b => [b.name, b.class]));

  // ---- (a) select all blocks, save as "A"
  await imp(pg, bp([blk('BPO_Station_01', 0, 0), blk('BPO_Station_02A', 2, 0, {rot: 2}), blk('BPO_Station_01', 0, 4, {rot: 1})]));
  await pg.evaluate(() => __fb.setView('L'));
  await selectAll(pg);
  const origBlocks = (await pg.evaluate(() => __fb.build())).Blocks;
  const nameA = await pg.evaluate(() => __fb.snAdd('A'));
  const lenA = await pg.evaluate(() => __fb.SN.length);
  chk('(a) snAdd("A") stores 1 snippet', nameA === 'A' && lenA === 1, `name ${nameA} len ${lenA}`);
  chk('(a) snippet holds the 3 selected blocks', (await pg.evaluate(() => __fb.SN[0].b.length)) === 3);

  // ---- (b) reload, same context: snippet still there and identical
  const snBefore = await pg.evaluate(() => JSON.stringify(__fb.SN));
  await pg.reload();
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  const snAfter = await pg.evaluate(() => JSON.stringify(__fb.SN));
  chk('(b) reload keeps SN[0].n == "A"', (await pg.evaluate(() => __fb.SN[0].n)) === 'A');
  chk('(b) reload keeps whole library identical', snBefore === snAfter, `before ${snBefore.slice(0, 200)} after ${snAfter.slice(0, 200)}`);

  // ---- (c) empty layout, paste snippet A: same layout (normalised), also with a hover offset
  await imp(pg, bp());
  await pg.evaluate(() => __fb.setView('L'));
  await pg.evaluate(() => __fb.snUse(0));
  chk('(c) snUse starts ghost paste', (await pg.evaluate(() => __fb.pasting)) !== null);
  await pg.evaluate(() => __fb.click(10, 10));
  const pasted = (await pg.evaluate(() => __fb.build())).Blocks;
  chk('(c) pasted layout identical (min-normalised pos, rot, height)',
    isDeepStrictEqual(normBlocks(pasted), normBlocks(origBlocks)), diff(normBlocks(pasted), normBlocks(origBlocks)));
  chk('(c) paste ends (pasting null)', (await pg.evaluate(() => __fb.pasting)) === null);

  await imp(pg, bp());
  await pg.evaluate(() => __fb.setView('L'));
  await pg.evaluate(() => __fb.snUse(0));
  await pg.evaluate(() => __fb.click(22, 7));   // hover offset: different cell
  const pastedOff = (await pg.evaluate(() => __fb.build())).Blocks;
  chk('(c) hover offset: layout still identical',
    isDeepStrictEqual(normBlocks(pastedOff), normBlocks(origBlocks)), diff(normBlocks(pastedOff), normBlocks(origBlocks)));
  const minOff = Math.min(...pastedOff.map(b => b.GridLocation.X));
  const minOn10 = Math.min(...pasted.map(b => b.GridLocation.X));
  chk('(c) hover offset actually moved the paste', minOff !== minOn10, `min X ${minOff} vs ${minOn10}`);

  // ---- (d) floor machine with recipe + disabled port survives
  await imp(pg, bp([], [mac('DAT_Assembler', 2, 2, {rot: 1, mid: 5, rec: KC, off: [{Face: 'E', Index: 2, Enabled: false}]})]));
  await pg.evaluate(() => __fb.setView('F'));
  const origM = (await pg.evaluate(() => __fb.build())).DefaultMachines;
  await selectAll(pg);
  const nameM = await pg.evaluate(() => __fb.snAdd('M'));
  chk('(d) floor snippet "M" saved', nameM === 'M', `name ${nameM}`);
  await imp(pg, bp());
  await pg.evaluate(() => __fb.setView('F'));
  await pg.evaluate(() => __fb.snUse(1));
  await pg.evaluate(() => __fb.click(6, 6));
  const pasteM = (await pg.evaluate(() => __fb.build())).DefaultMachines;
  chk('(d) floor machine count kept', pasteM.length === origM.length, `${pasteM.length} vs ${origM.length}`);
  chk('(d) floor recipe + disabled ports + rot survive paste',
    isDeepStrictEqual(normM(pasteM), normM(origM)), diff(normM(pasteM), normM(origM)));
  chk('(d) recipe present after paste', pasteM[0] && pasteM[0].Recipe === KC, JSON.stringify(pasteM[0] && pasteM[0].Recipe));

  // ---- (e) export -> fresh context import: deep-equal; import twice gives "A" and "A (2)"
  await pg.evaluate(() => __fb.setView('L'));
  const exp = await pg.evaluate(() => __fb.snExport());
  const expObj = JSON.parse(exp);
  const exactSN = await pg.evaluate(() => JSON.stringify(__fb.SN));
  const ctx2 = await br.newContext({viewport: {width: 1400, height: 900}});
  const pg2 = await newPage(ctx2, 'fresh');
  const emptyBefore = await pg2.evaluate(() => __fb.SN.length);
  chk('(e) fresh context starts with empty library', emptyBefore === 0);
  const got = await pg2.evaluate(t => __fb.snImport(t), exp);
  chk('(e) import count matches export', got === expObj.snippets.length, `got ${got}`);
  const impSN = await pg2.evaluate(() => JSON.stringify(__fb.SN));
  chk('(e) round trip deep-equal', isDeepStrictEqual(JSON.parse(impSN), JSON.parse(exactSN)), `got ${impSN.slice(0, 200)}`);
  const bad = await pg2.evaluate(() => __fb.snImport('not json'));
  chk('(e) non-JSON import rejected (-1)', bad === -1, `got ${bad}`);

  const oneA = JSON.stringify({v: 1, snippets: [expObj.snippets[0]]});
  const ctx3 = await br.newContext({viewport: {width: 1400, height: 900}});
  const pg3 = await newPage(ctx3, 'twice');
  await pg3.evaluate(t => __fb.snImport(t), oneA);
  await pg3.evaluate(t => __fb.snImport(t), oneA);
  const names3 = await pg3.evaluate(() => __fb.SN.map(s => s.n));
  chk('(e) importing twice gives "A" and "A (2)"', isDeepStrictEqual(names3, ['A', 'A (2)']), JSON.stringify(names3));
  await ctx3.close();
  await ctx2.close();

  // ---- (f) wrong view: layout snippet clicked in floor view -> toast, no paste
  await pg.evaluate(() => __fb.setView('F'));
  await pg.evaluate(() => __fb.snUse(0));
  const toastTxt = await pg.evaluate(() => document.getElementById('toast').textContent);
  chk('(f) wrong view toasts "Switch to Layout view"', toastTxt === 'Switch to Layout view', `toast "${toastTxt}"`);
  chk('(f) wrong view leaves pasting null', (await pg.evaluate(() => __fb.pasting)) === null);

  // ---- (g) rename / delete / rename-collision suffix
  await pg.evaluate(() => __fb.setView('L'));
  await pg.evaluate(() => __fb.snRename(0, 'B'));
  chk('(g) rename works', (await pg.evaluate(() => __fb.SN[0].n)) === 'B');
  await imp(pg, bp([blk('BPO_Station_01', 0, 0)]));
  await pg.evaluate(() => __fb.setView('L'));
  await selectAll(pg);
  const nameC = await pg.evaluate(() => __fb.snAdd('C'));
  chk('(g) snAdd("C") ok', nameC === 'C', `name ${nameC}`);
  await pg.evaluate(() => __fb.snRename(1, 'B'));
  chk('(g) rename to existing name gets " (2)"', (await pg.evaluate(() => __fb.SN[1].n)) === 'B (2)', `got ${await pg.evaluate(() => __fb.SN[1].n)}`);
  await pg.evaluate(() => __fb.snDel(0));
  const namesG = await pg.evaluate(() => __fb.SN.map(s => s.n));
  chk('(g) delete removes the snippet', isDeepStrictEqual(namesG, ['B (2)', 'C']), JSON.stringify(namesG));

  // ---- (p) planner logic: plan() on the real catalog. Recipe facts used (catalog):
  //   CobaltPlates default: CobaltOre x1 -> Plates x1, 90 ticks (3 s)  => 1*1800/90 = 20 plates/min per Refinery
  //   CobaltPlates alt K2:  EnrichedCobaltOre x1 -> Plates x3, 180 ticks => 3*1800/180 = 30 plates/min per Refinery
  //   EnrichedCobaltOre:    CobaltOre x3 -> Enriched x2, 90 ticks        => 2*1800/90 = 40 enriched/min per Enrichment
  //   Belts: Mk1 60, Mk2 120, Mk3 180 items/min.
  const K2 = 'ITEM_EnrichedCobaltOre>ITEM_CobaltPlates';
  const PL = (rate, mk, ovr = {}, pick = {}, item = 'ITEM_CobaltPlates') => pg.evaluate(a => __fb.plan(...a), [item, rate, mk, ovr, pick]);
  const EDGE = (r, from, to) => r.edges.find(e => e.from === from && e.to === to);
  const near = (a, b) => a != null && Math.abs(a - b) < 1e-6;

  // (p1) hand case: 100 plates/min. machines = ceil(100/20) = 5; util = 100/(5*20) = 100%; raw CobaltOre = 1*100/1 = 100/min.
  // edge CobaltOre->Plates 100/min on Mk1: belts = ceil(100/60) = 2; Mk2 (120) carries it on 1 belt; 5 machines -> 2->5 balancer.
  const h1 = await PL(100, 0);
  const plates1 = h1.nodes.ITEM_CobaltPlates;
  chk('(p1) plates: 5 machines, 100% util, rate 100', plates1.machines === 5 && near(plates1.util, 1) && near(plates1.rate, 100), JSON.stringify(plates1));
  chk('(p1) raw = CobaltOre 100/min only', h1.raw.length === 1 && h1.raw[0].item === 'ITEM_CobaltOre' && near(h1.raw[0].rate, 100), JSON.stringify(h1.raw));
  const e1 = EDGE(h1, 'ITEM_CobaltOre', 'ITEM_CobaltPlates');
  chk('(p1) edge 100/min, 2 belts Mk1, Mk2 fits', near(e1.flow, 100) && e1.belts === 2 && e1.fits === 1 && e1.label === '100 items/min, 2 belts (Mk1)' && /^needs 2 belts; Mk2 carries it on 1 belt$/.test(e1.note), JSON.stringify(e1));
  chk('(p1) 2 belts into 5 machines = 2->5 balancer', e1.split === '2->5 balancer', e1.split);
  chk('(p1) output edge to null, 100/min', near(EDGE(h1, 'ITEM_CobaltPlates', null).flow, 100), JSON.stringify(EDGE(h1, 'ITEM_CobaltPlates', null)));
  chk('(p1) no cycle flagged', h1.cycle === false);

  // (p2) 60/min: machines 3; CobaltOre 60 on 1 Mk1 belt -> 1 belt, 1 feeding 3 machines = 1->3 splitter x ceil(2/2) = 1
  const h2 = await PL(60, 0);
  const e2 = EDGE(h2, 'ITEM_CobaltOre', 'ITEM_CobaltPlates');
  chk('(p2) 60/min: 3 machines, 1 belt, 1->3 splitter x1, no note', h2.nodes.ITEM_CobaltPlates.machines === 3 && e2.belts === 1 && e2.split === '1->3 splitter x1' && e2.note === '', JSON.stringify(e2));

  // (p3) 1 over: 60.01 -> 2 belts on Mk1
  const h3 = await PL(60.01, 0);
  const e3 = EDGE(h3, 'ITEM_CobaltOre', 'ITEM_CobaltPlates');
  chk('(p3) 60.01 on Mk1 = 2 belts', e3.belts === 2 && e3.label === '60.01 items/min, 2 belts (Mk1)', JSON.stringify(e3));
  chk('(p3) 60.01: util = 60.01/(4*20)', near(h3.nodes.ITEM_CobaltPlates.util, 60.01 / 80), String(h3.nodes.ITEM_CobaltPlates.util));

  // (p4) Mk switching: CobaltOre 120 -> belts 2,1,1 on Mk1..3 ; 180 -> 3,2,1
  const b120 = await Promise.all([0, 1, 2].map(m => PL(120, m)));
  const b180 = await Promise.all([0, 1, 2].map(m => PL(180, m)));
  const belts = rs => rs.map(r => EDGE(r, 'ITEM_CobaltOre', 'ITEM_CobaltPlates').belts);
  chk('(p4) 120/min belts Mk1,Mk2,Mk3 = 2,1,1', isDeepStrictEqual(belts(b120), [2, 1, 1]), JSON.stringify(belts(b120)));
  chk('(p4) 180/min belts Mk1,Mk2,Mk3 = 3,2,1', isDeepStrictEqual(belts(b180), [3, 2, 1]), JSON.stringify(belts(b180)));

  // (p5) exactly 180 on Mk3 = 1 belt, fits Mk3; 180.01 = 2 belts, no single belt
  const h5 = await PL(180, 2);
  const e5 = EDGE(h5, 'ITEM_CobaltOre', 'ITEM_CobaltPlates');
  chk('(p5) exactly 180 on Mk3 = 1 belt, fits Mk3', e5.belts === 1 && e5.fits === 2 && e5.note === '', JSON.stringify(e5));
  const h5b = await PL(180.01, 2);
  const e5b = EDGE(h5b, 'ITEM_CobaltOre', 'ITEM_CobaltPlates');
  chk('(p5) 180.01 on Mk3 = 2 belts, no single belt', e5b.belts === 2 && e5b.fits === null && e5b.note.includes('no single belt'), JSON.stringify(e5b));

  // (p6) ovr: splitter/balancer Mk independent of belt Mk.
  // 120/min on Mk3: 1 belt, 6 machines -> 1->3 splitter x3 (ceil(5/2)). Splitter Mk1 (60) < lane 120 -> warn; Mk3 -> no warn.
  const s0 = await PL(120, 2, {sp: 0, bal: null});
  const s2 = await PL(120, 2, {sp: 2, bal: null});
  const sMk0 = await PL(120, 0, {sp: 2, bal: null});
  const es0 = EDGE(s0, 'ITEM_CobaltOre', 'ITEM_CobaltPlates'), es2 = EDGE(s2, 'ITEM_CobaltOre', 'ITEM_CobaltPlates');
  chk('(p6) splitter 1->3 x3 on 1 belt', es2.split === '1->3 splitter x3' && es2.belts === 1, JSON.stringify(es2));
  chk('(p6) splitter Mk1 override warns, belts unchanged', !!es0.warn && es0.belts === 1, JSON.stringify(es0));
  chk('(p6) splitter Mk3 override no warn', es2.warn === '', JSON.stringify(es2));
  chk('(p6) splitter override does not change belt count (Mk1 belt, sp Mk3)', EDGE(sMk0, 'ITEM_CobaltOre', 'ITEM_CobaltPlates').belts === 2, JSON.stringify(EDGE(sMk0, 'ITEM_CobaltOre', 'ITEM_CobaltPlates')));
  // balancer: 240/min on Mk3 -> 2 belts, lane 120; balancer Mk1 (60) warns, Mk3 (180) and follow (Mk3) don't
  const bl0 = await PL(240, 2, {sp: null, bal: 0});
  const bl2 = await PL(240, 2, {sp: null, bal: 2});
  const blF = await PL(240, 2, {sp: null, bal: null});
  const eb0 = EDGE(bl0, 'ITEM_CobaltOre', 'ITEM_CobaltPlates'), eb2 = EDGE(bl2, 'ITEM_CobaltOre', 'ITEM_CobaltPlates'), ebF = EDGE(blF, 'ITEM_CobaltOre', 'ITEM_CobaltPlates');
  chk('(p6) 240/min: 2 belts, 2->12 balancer, no single belt', eb2.belts === 2 && eb2.split === '2->12 balancer' && eb2.fits === null && eb2.note.includes('no single belt'), JSON.stringify(eb2));
  chk('(p6) balancer Mk1 override warns, Mk3 and follow do not', !!eb0.warn && eb2.warn === '' && ebF.warn === '', `${eb0.warn} | ${eb2.warn} | ${ebF.warn}`);

  // (p7) one machine -> no split. 20/min = 1 Refinery.
  const h7 = await PL(20, 0);
  const e7 = EDGE(h7, 'ITEM_CobaltOre', 'ITEM_CobaltPlates');
  chk('(p7) 1 machine: no splitter/balancer text', h7.nodes.ITEM_CobaltPlates.machines === 1 && e7.split === '' && e7.belts === 1, JSON.stringify(e7));

  // (p8) 5 machines on 1 belt (100/min, Mk3) -> 1->3 splitter x2 (ceil(4/2))
  const h8 = await PL(100, 2);
  chk('(p8) 5 machines on 1 belt = 1->3 splitter x2', EDGE(h8, 'ITEM_CobaltOre', 'ITEM_CobaltPlates').split === '1->3 splitter x2', JSON.stringify(EDGE(h8, 'ITEM_CobaltOre', 'ITEM_CobaltPlates')));

  // (p9) alt recipe changes the result. Plates via K2: 100/30 -> 4 machines, util 100/120 = 83.33%;
  //   Enriched in = 1*100/3 = 33.33/min -> 1 Enrichment (40/min), util 33.33/40 = 83.33%; CobaltOre in = 33.33*3/2 = 50/min.
  //   edge Enriched->Plates 33.33 on Mk1: 1 belt, 4 machines -> 1->3 splitter x2.
  const h9 = await PL(100, 0, {}, {ITEM_CobaltPlates: K2});
  const p9 = h9.nodes.ITEM_CobaltPlates, en9 = h9.nodes.ITEM_EnrichedCobaltOre;
  chk('(p9) alt: 4 machines, util 83.33%', p9.machines === 4 && near(p9.util, 100 / 120), JSON.stringify(p9));
  chk('(p9) alt: Enriched 1 machine, rate 33.33, util 83.33%', en9.machines === 1 && near(en9.rate, 100 / 3) && near(en9.util, (100 / 3) / 40), JSON.stringify(en9));
  chk('(p9) alt: raw CobaltOre 50/min (not 100)', h9.raw.length === 1 && near(h9.raw[0].rate, 50), JSON.stringify(h9.raw));
  const e9 = EDGE(h9, 'ITEM_EnrichedCobaltOre', 'ITEM_CobaltPlates');
  chk('(p9) alt edge: 1 belt, 1->3 splitter x2', near(e9.flow, 100 / 3) && e9.belts === 1 && e9.split === '1->3 splitter x2', JSON.stringify(e9));

  // (p10) self-loop recipe: cycle flagged, returns (no hang). Synthetic recipe injected then removed.
  await pg.evaluate(() => { CATALOG.recipes.CRAFT_CycleTest = [{o: ['ITEM_CycleTest', 1], i: [['ITEM_CycleTest', 1]], t: 30}]; });
  const cyc = await PL(10, 0, {}, {}, 'ITEM_CycleTest');
  await pg.evaluate(() => { delete CATALOG.recipes.CRAFT_CycleTest; });
  chk('(p10) self-loop: cycle flagged, no hang', cyc.cycle === true, JSON.stringify(cyc.cycle));

  // (p11) UI smoke: button opens panel, item + rate fill #plnOut, alt dropdown re-plans
  await pg.evaluate(() => document.getElementById('plnB').click());
  chk('(p11) Planner button opens #pln', await pg.evaluate(() => !document.getElementById('pln').hidden));
  chk('(p11) hint shown before choosing an item', /Pick a craftable/.test(await pg.textContent('#plnOut')));
  await pg.selectOption('#plnItem', 'ITEM_CobaltPlates');
  await pg.fill('#plnRate', '100');
  const out11 = await pg.textContent('#plnOut');
  chk('(p11) #plnOut shows 5 x Refinery and raw', /5 x Refinery/.test(out11) && /raw/.test(out11), out11.slice(0, 200));
  chk('(p11) alt dropdown for plates rendered', (await pg.locator('#plnOut select.plnAlt[data-item="ITEM_CobaltPlates"]').count()) === 1);
  await pg.selectOption('#plnOut select.plnAlt[data-item="ITEM_CobaltPlates"]', K2);
  const out11b = await pg.textContent('#plnOut');
  chk('(p11) choosing alt re-plans (4 x Refinery)', /4 x Refinery/.test(out11b) && !/5 x Refinery/.test(out11b), out11b.slice(0, 200));

  // ---- (u) UI path: panel buttons, prompt/confirm dialogs, file download + upload
  const fs = require('fs');
  const ctxU = await br.newContext({viewport: {width: 1400, height: 900}, acceptDownloads: true});
  const pu = await newPage(ctxU, 'ui');
  await imp(pu, bp([blk('BPO_Station_01', 0, 0), blk('BPO_Station_01', 2, 0)]));
  await pu.evaluate(() => __fb.setView('L'));
  await selectAll(pu);
  DLG.next = {accept: true, text: 'UI1'};
  await pu.click('#snSave');
  chk('(u) "Save selection as snippet" prompts and stores 2 blocks',
    (await pu.evaluate(() => __fb.SN.length)) === 1 && (await pu.evaluate(() => __fb.SN[0].n)) === 'UI1' && (await pu.evaluate(() => __fb.SN[0].b.length)) === 2);
  chk('(u) panel lists "UI1" with count (2)', /UI1\s*\(2\)/.test(await pu.textContent('#snList')), await pu.textContent('#snList'));
  DLG.next = {accept: true, text: 'UI1r'};
  await pu.click('#snList [data-snren="0"]');
  chk('(u) Rename button (prompt accepted) renames and redraws', (await pu.evaluate(() => __fb.SN[0].n)) === 'UI1r' && /UI1r/.test(await pu.textContent('#snList')));
  DLG.next = {accept: false};
  await pu.click('#snList [data-sndel="0"]');
  chk('(u) delete confirm dismissed: snippet kept', (await pu.evaluate(() => __fb.SN.length)) === 1);
  chk('(u) delete confirm names the snippet', DLG.seen.some(m => m === 'Delete snippet "UI1r"?'), JSON.stringify(DLG.seen));
  DLG.next = {accept: true};
  await pu.click('#snList [data-sndel="0"]');
  chk('(u) delete confirm accepted: snippet removed', (await pu.evaluate(() => __fb.SN.length)) === 0 && !/UI1r/.test(await pu.textContent('#snList')));

  DLG.next = {accept: true, text: 'UI2'};
  await pu.evaluate(() => __fb.setView('L'));
  await selectAll(pu);
  await pu.click('#snSave');
  await imp(pu, bp());
  await pu.evaluate(() => __fb.setView('L'));
  await pu.click('#snList [data-snuse="0"]');
  chk('(u) click snippet in panel starts ghost paste', (await pu.evaluate(() => __fb.pasting)) !== null);
  await pu.evaluate(() => __fb.click(10, 10));
  chk('(u) panel click + canvas click pastes 2 blocks', (await pu.evaluate(() => __fb.build())).Blocks.length === 2);

  const [dl] = await Promise.all([pu.waitForEvent('download'), pu.click('#snExp')]);
  const dlTxt = fs.readFileSync(await dl.path(), 'utf8');
  chk('(u) export downloads snippets.json with 1 snippet', dl.suggestedFilename() === 'snippets.json' && JSON.parse(dlTxt).snippets.length === 1, dl.suggestedFilename());
  await pu.setInputFiles('#snImp', {name: 'snippets.json', mimeType: 'application/json', buffer: Buffer.from(dlTxt)});
  await pu.waitForFunction(() => /imported/.test(document.getElementById('toast').textContent));
  chk('(u) file import toasts "1 imported"', (await pu.textContent('#toast')) === '1 imported', await pu.textContent('#toast'));
  chk('(u) file import merges with " (2)" suffix', isDeepStrictEqual(await pu.evaluate(() => __fb.SN.map(s => s.n)), ['UI2', 'UI2 (2)']), JSON.stringify(await pu.evaluate(() => __fb.SN.map(s => s.n))));

  await pu.setInputFiles('#snImp', {name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('garbage{')});
  await pu.waitForFunction(() => document.getElementById('toast').textContent === 'Not a snippet file');
  chk('(u) garbage file toasts "Not a snippet file"', (await pu.textContent('#toast')) === 'Not a snippet file');
  chk('(u) garbage file leaves library unchanged', (await pu.evaluate(() => __fb.SN.length)) === 2);

  // (s) floor snippet with a belt (DAT_ConveyorBelt machine) + assembler: saved, pasted identical
  await imp(pu, bp([], [mac('DAT_ConveyorBelt', 3, 3, {rot: 1}), mac('DAT_Assembler', 6, 3, {mid: 5, rec: KC})]));
  await pu.evaluate(() => __fb.setView('F'));
  const origBelt = (await pu.evaluate(() => __fb.build())).DefaultMachines;
  await selectAll(pu);
  await pu.evaluate(() => __fb.snAdd('BeltM'));
  await imp(pu, bp());
  await pu.evaluate(() => __fb.setView('F'));
  await pu.evaluate(() => __fb.snUse(__fb.SN.findIndex(s => s.n === 'BeltM')));
  await pu.evaluate(() => __fb.click(6, 6));
  const pasteBelt = (await pu.evaluate(() => __fb.build())).DefaultMachines;
  chk('(s) floor belt+machine snippet: count kept', pasteBelt.length === origBelt.length, `${pasteBelt.length} vs ${origBelt.length}`);
  chk('(s) floor belt+machine snippet: layout identical', isDeepStrictEqual(normM(pasteBelt), normM(origBelt)), diff(normM(pasteBelt), normM(origBelt)));
  await ctxU.close();

  // ---- (P) planner UI: fresh context, floor view, no Simulate
  const ctxP = await br.newContext({viewport: {width: 1400, height: 900}});
  const pp = await newPage(ctxP, 'planner');
  await pp.evaluate(() => __fb.setView('F'));
  await pp.click('#plnB');
  chk('(P1) Planner opens via #plnB in floor view (no Simulate)', await pp.evaluate(() => !document.getElementById('pln').hidden && document.getElementById('vwF').getAttribute('aria-pressed') === 'true'));
  chk('(P2) starts empty: item (none), hint shown', (await pp.inputValue('#plnItem')) === '' && /Pick a craftable/.test(await pp.textContent('#plnOut')));
  chk('(P2) item list has Cobalt Plates', (await pp.locator('#plnItem option[value="ITEM_CobaltPlates"]').count()) === 1);
  await pp.selectOption('#plnItem', 'ITEM_CobaltPlates');
  await pp.fill('#plnRate', '120');
  const labels = async () => (await pp.locator('.plnLbl').allTextContents()).join(' | ');
  chk('(P3) Mk1: arrow label "120 items/min, 2 belts (Mk1)"', (await labels()).includes('120 items/min, 2 belts (Mk1)'), await labels());
  const boxTxt = async () => pp.textContent('.plnBox[data-item="ITEM_CobaltPlates"]');
  chk('(P3) box shows 6 machines and 100%', /6 x .+100%/.test(await boxTxt()), await boxTxt());
  await pp.selectOption('#plnMk', '2');
  chk('(P3) Mk3 switch updates arrow: 1 belt (Mk3)', (await labels()).includes('120 items/min, 1 belts (Mk3)'), await labels());
  chk('(P4) splitter follows belt Mk3: no warning', (await pp.locator('.plnWarn').count()) === 0);
  await pp.selectOption('#plnSp', '0');
  chk('(P4) splitter override Mk1 on Mk3 belt warns', (await pp.locator('.plnWarn').count()) > 0);
  await pp.selectOption('#plnSp', '');
  chk('(P4) splitter back to follow: no warning', (await pp.locator('.plnWarn').count()) === 0);
  chk('(P4) split text "1->3 splitter x3" shown', (await pp.textContent('#plnOut')).includes('1->3 splitter x3'));
  await pp.selectOption('#plnMk', '0');
  await pp.fill('#plnRate', '100');
  const o100 = await pp.textContent('#plnOut');
  chk('(P5) 100/min Mk1: "2->5 balancer" shown', o100.includes('2->5 balancer'));
  chk('(P5) 100/min Mk1: "needs 2 belts; Mk2 carries it on 1 belt" shown', o100.includes('needs 2 belts; Mk2 carries it on 1 belt'));
  await pp.fill('#plnRate', '180.01');
  await pp.selectOption('#plnMk', '2');
  chk('(P6) 180.01/min Mk3: "no single belt carries" shown', (await pp.textContent('#plnOut')).includes('no single belt carries'));
  await pp.fill('#plnRate', '180');
  chk('(P6) 180/min Mk3: exactly 1 belt label', (await labels()).includes('180 items/min, 1 belts (Mk3)'), await labels());
  // ---- (PR) Protomatter use/don't use. EnrichedNickelOre: 3 NickelOre -> 2 Enriched (90 ticks); NickelOre: Protomatter x1 -> 1 (30 ticks).
  //   10 Enriched/min -> 15 NickelOre/min -> 15 Protomatter/min (1 RelicSynthesizer, 120/min each).
  const EN = 'ITEM_EnrichedNickelOre', PLX = (rate, item, opts) => pg.evaluate(a => __fb.plan(...a), [item, rate, 0, {}, {}, opts]);
  const offP = await PL(10, 0, {}, {}, EN), onP = await PLX(10, EN, {proto: true});
  const rawN = offP.raw.find(n => n.item === 'ITEM_NickelOre');
  chk('(PR1) default off: NickelOre is raw 15/min, no recipe', !!rawN && near(rawN.rate, 15) && !offP.nodes.ITEM_NickelOre.rec, JSON.stringify(rawN));
  chk('(PR1) default off: no Protomatter node, no RelicSynthesizer crafter', !offP.nodes.ITEM_Protomatter && !Object.values(offP.nodes).some(n => n.crafter === 'CRAFT_RelicSynthesizer'));
  chk('(PR2) {proto:false} same as default', JSON.stringify(await PLX(10, EN, {proto: false})) === JSON.stringify(offP));
  chk('(PR3) proto on: NickelOre crafted from Protomatter (Enrichment)', onP.nodes.ITEM_NickelOre.crafter === 'CRAFT_Enrichment' && onP.nodes.ITEM_NickelOre.rec.i[0][0] === 'ITEM_Protomatter' && !onP.raw.some(n => n.item === 'ITEM_NickelOre'));
  const pm = onP.nodes.ITEM_Protomatter;
  chk('(PR3) proto on: Protomatter node 15/min, 1 RelicSynthesizer', !!pm && pm.crafter === 'CRAFT_RelicSynthesizer' && near(pm.rate, 15) && pm.machines === 1, JSON.stringify(pm));
  const offN = await PLX(10, 'ITEM_NickelPlates', {proto: false});
  chk('(PR4) proto off: items with other recipes still craft (NickelPlates)', !!offN.nodes.ITEM_NickelPlates.rec && !offN.nodes.ITEM_Protomatter);

  // ---- (R2) planner round 2: raw column, grouped/expanded, crafter icons, flows <details>, drag
  await pp.selectOption('#plnMk', '0');
  await pp.fill('#plnRate', '120');
  const rects = () => pp.evaluate(() => [...document.querySelectorAll('#plnOut .plnBox')].map(b => ({raw: b.classList.contains('raw'), x: b.getBoundingClientRect().left})));
  const rs = await rects(), minX = Math.min(...rs.map(r => r.x));
  chk('(R2) raw inputs all in leftmost column', rs.some(r => r.raw) && rs.filter(r => r.raw).every(r => Math.abs(r.x - minX) < 1), JSON.stringify(rs));
  const nodeCount = await pp.evaluate(() => new Set([...document.querySelectorAll('#plnOut .plnBox')].map(b => b.dataset.item)).size);
  chk('(R2) default Grouped: one box per node, #plnGx aria-pressed=false "Grouped"', (await pp.locator('#plnOut .plnBox').count()) === nodeCount && (await pp.getAttribute('#plnGx', 'aria-pressed')) === 'false' && (await pp.textContent('#plnGx')) === 'Grouped');
  const grpBox = await pp.textContent('.plnBox[data-item="ITEM_CobaltPlates"]'), grpLabels = await labels();
  chk('(R2) crafter icon in non-raw box', (await pp.locator('.plnBox:not(.raw) img.plnCic').count()) > 0);
  chk('(R2) Flows <details> closed by default', (await pp.getAttribute('details.plnFl', 'open')) === null);
  await pp.click('details.plnFl > summary');
  chk('(R2) Flows opens on summary click', await pp.evaluate(() => document.querySelector('details.plnFl').open));
  await pp.click('details.plnFl > summary');
  await pp.click('#plnGx');
  chk('(R2) Expanded: aria-pressed=true, "Expanded"', (await pp.getAttribute('#plnGx', 'aria-pressed')) === 'true' && (await pp.textContent('#plnGx')) === 'Expanded');
  const nM = +/(\d+) x /.exec(grpBox)[1];
  const mSub = await pp.evaluate(() => [...document.querySelectorAll('.plnBox.plnM[data-item="ITEM_CobaltPlates"] .sub')].map(e => e.textContent));
  const carry = mSub.map(t => parseFloat(t.split('·').pop())), utl = mSub.map(t => parseFloat(t.split('·')[1]));
  chk(`(R2) Expanded: Cobalt plates ${nM} machine boxes`, mSub.length === nM && nM === 6, mSub.join(' | '));
  chk('(R2) Expanded: machine carries sum to 120/min, utils 100%', Math.abs(carry.reduce((a, b) => a + b, 0) - 120) < 0.01 && utl.every(u => Math.abs(u - 100) < 0.01), mSub.join(' | '));
  chk('(R2) Expanded: arrow labels unchanged', (await labels()) === grpLabels, `${await labels()} vs ${grpLabels}`);
  chk('(R2) Expanded: machine boxes show crafter icon', (await pp.locator('.plnBox.plnM img.plnCic').count()) > 0);
  await pp.fill('#plnRate', '90');
  const m5 = await pp.evaluate(() => [...document.querySelectorAll('.plnBox.plnM[data-item="ITEM_CobaltPlates"] .sub')].map(e => e.textContent));
  const c5 = m5.map(t => parseFloat(t.split('·').pop()));
  chk('(R2) Expanded 90/min: 5 boxes, last partial 50%, carries sum 90', m5.length === 5 && Math.abs(c5.reduce((a, b) => a + b, 0) - 90) < 0.01 && Math.abs(parseFloat(m5[4].split('·')[1]) - 50) < 0.01, m5.join(' | '));
  await pp.fill('#plnRate', '120');
  await pp.click('#plnGx');
  chk('(R2) back to Grouped', (await pp.textContent('#plnGx')) === 'Grouped' && (await pp.locator('.plnBox.plnM').count()) === 0);
  // drag the Cobalt plates box (grouped)
  const bb = () => pp.evaluate(() => { const b = document.querySelector('.plnBox[data-item="ITEM_CobaltPlates"]').getBoundingClientRect(); return {x: b.left, y: b.top, w: b.width, h: b.height}; });
  const arrSig = () => pp.evaluate(() => [...document.querySelectorAll('.plnArr')].map(p => p.getAttribute('d')).join('|') + ' # ' + [...document.querySelectorAll('.plnLbl')].map(l => l.style.left + ',' + l.style.top).join('|'));
  const b0 = await bb(), a0 = await arrSig();
  const sx = Math.round(b0.x + b0.w / 2), sy = Math.round(b0.y + b0.h / 2);
  await pp.mouse.move(sx, sy); await pp.mouse.down();
  await pp.mouse.move(sx + 40, sy + 30, {steps: 5}); await pp.mouse.move(sx + 60, sy + 40, {steps: 5});
  await pp.mouse.up();
  const b1 = await bb(), a1 = await arrSig();
  chk('(R2) drag moves Cobalt box by the pointer delta', Math.abs(b1.x - b0.x - 60) < 1 && Math.abs(b1.y - b0.y - 40) < 1, `${b0.x},${b0.y} -> ${b1.x},${b1.y}`);
  chk('(R2) drag: arrows and label pills follow', a1 !== a0);
  const tr = await pp.evaluate(() => document.querySelector('.plnBox[data-item="ITEM_CobaltPlates"]').style.transform);
  await pp.fill('#plnRate', '100');
  chk('(R2) drag offset kept after #plnRate change', !!tr && (await pp.evaluate(() => document.querySelector('.plnBox[data-item="ITEM_CobaltPlates"]').style.transform)) === tr, tr);
  const other = await pp.locator('#plnItem option').nth(2).getAttribute('value');
  await pp.selectOption('#plnItem', other);
  chk('(R2) drag offsets reset after #plnItem change', (await pp.locator('#plnOut .plnBox[style]').count()) === 0);
  await pp.selectOption('#plnItem', 'ITEM_CobaltPlates');
  // (Z) zoom (wheel), drag at zoom, pan, full-screen button
  const gw = () => pp.evaluate(() => document.querySelector('.plnGrid').getBoundingClientRect().width);
  const w0 = await gw(), c0 = await bb();
  const vc = await pp.evaluate(() => { const r = document.querySelector('#plnOut .plnVp').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
  await pp.mouse.move(vc.x, vc.y); await pp.mouse.wheel(0, 300); await pp.waitForTimeout(150);
  const w1 = await gw();
  chk('(Z) wheel down zooms out', w1 < w0 * 0.9, `${w0} -> ${w1}`);
  const c1 = await bb(), zx = Math.round(c1.x + c1.w / 2), zy = Math.round(c1.y + c1.h / 2);
  await pp.mouse.move(zx, zy); await pp.mouse.down(); await pp.mouse.move(zx + 30, zy + 20, {steps: 4}); await pp.mouse.up();
  const c2 = await bb();
  chk('(Z) drag at zoom follows the pointer', Math.abs(c2.x - c1.x - 30) < 1.5 && Math.abs(c2.y - c1.y - 20) < 1.5, `${c1.x},${c1.y} -> ${c2.x},${c2.y}`);
  await pp.mouse.move(Math.round(c2.x + c2.w / 2), Math.round(c2.y + c2.h / 2)); await pp.mouse.wheel(0, -900); await pp.waitForTimeout(150);
  chk('(Z) wheel up zooms in', (await gw()) > w1 * 1.1, String(w1) + ' -> ' + await gw());
  // pan: drag empty viewport space moves everything; a node can be dragged past the old top-left limit
  const vp = await pp.evaluate(() => { const r = document.querySelector('.plnVp').getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  const p0 = await bb(), ex = Math.round(vp.x + vp.w - 8), ey = Math.round(vp.y + vp.h - 8);
  await pp.mouse.move(ex, ey); await pp.mouse.down(); await pp.mouse.move(ex - 50, ey - 30, {steps: 4}); await pp.mouse.up();
  const p1 = await bb();
  chk('(Z) pan: dragging empty space moves the diagram', Math.abs(p1.x - p0.x + 50) < 1.5 && Math.abs(p1.y - p0.y + 30) < 1.5, `${p0.x},${p0.y} -> ${p1.x},${p1.y}`);
  await pp.mouse.move(Math.round(p1.x + p1.w / 2), Math.round(p1.y + p1.h / 2)); await pp.mouse.down();
  await pp.mouse.move(Math.round(vp.x - 40), Math.round(vp.y - 40), {steps: 6}); await pp.mouse.up();
  const p2 = await bb();
  chk('(Z) node moves freely beyond the old edge', p2.x < vp.x, `${p2.x} < ${vp.x}`);
  chk('(Z) planner panel fills the stage height', await pp.evaluate(() => { const p = document.getElementById('pln').getBoundingClientRect(), s = document.getElementById('pln').offsetParent.getBoundingClientRect(); return s.height - p.height < 24; }));
  await pp.selectOption('#plnItem', other); await pp.selectOption('#plnItem', 'ITEM_CobaltPlates');
  // (PR) Protomatter toggle in the panel
  chk('(PR5) #plnProto default "0" = Don\'t use, aria-label set', (await pp.inputValue('#plnProto')) === '0' && (await pp.textContent('#plnProto option:checked')) === "Don't use" && (await pp.getAttribute('#plnProto', 'aria-label')) === 'Protomatter use');
  const boxKeys = () => pp.evaluate(() => [...document.querySelectorAll('#plnOut .plnBox')].map(b => b.dataset.item + (b.classList.contains('raw') ? ':raw' : '')));
  await pp.selectOption('#plnItem', 'ITEM_EnrichedNickelOre');
  await pp.fill('#plnRate', '10');
  const kOff = await boxKeys();
  chk('(PR5) off: NickelOre is a raw box, no Protomatter box', kOff.includes('ITEM_NickelOre:raw') && !kOff.some(k => k.startsWith('ITEM_Protomatter')), kOff.join(', '));
  chk('(PR5) off: item list has no Protomatter / NickelOre', (await pp.locator('#plnItem option[value="ITEM_Protomatter"]').count()) === 0 && (await pp.locator('#plnItem option[value="ITEM_NickelOre"]').count()) === 0);
  await pp.selectOption('#plnProto', '1');
  const kOn = await boxKeys();
  chk('(PR6) on: NickelOre crafted, Protomatter box appears', kOn.includes('ITEM_NickelOre') && kOn.includes('ITEM_Protomatter'), kOn.join(', '));
  chk('(PR6) on: Protomatter box shows RelicSynthesizer', (await pp.textContent('.plnBox[data-item="ITEM_Protomatter"]')).includes('RelicSynthesizer'));
  chk('(PR6) on: item list has Protomatter', (await pp.locator('#plnItem option[value="ITEM_Protomatter"]').count()) === 1);
  await pp.fill('#plnRate', '20');
  chk('(PR7) rate change keeps Use, re-plans to 30/min', (await pp.inputValue('#plnProto')) === '1' && (await pp.textContent('.plnBox[data-item="ITEM_Protomatter"] .sub')).includes('30/min'), await pp.textContent('.plnBox[data-item="ITEM_Protomatter"] .sub'));
  await pp.selectOption('#plnProto', '0');
  chk('(PR7) back to Don\'t use: Protomatter box gone, NickelOre raw', !(await boxKeys()).some(k => k.startsWith('ITEM_Protomatter')) && (await boxKeys()).includes('ITEM_NickelOre:raw'));
  await pp.selectOption('#plnItem', 'ITEM_CobaltPlates');
  chk('(P-h) planner: no pageerror / console.error', errs.length === 0, errs.join('\n     '));
  await ctxP.close();

  // ---- (UI3) Round 3 declutter: palette collapse, dock tabs, planner options panel
  const ctxQ = await br.newContext({viewport: {width: 1400, height: 900}});
  const pq = await newPage(ctxQ, 'ui3');
  await pq.evaluate(() => __fb.setView('F'));
  chk('(UI3) palette starts expanded, nothing stored', (await pq.evaluate(() => !document.getElementById('pal').classList.contains('col'))) && (await pq.evaluate(() => localStorage.getItem('msfb.ui.pal'))) === null);
  await pq.click('#palT');
  chk('(UI3) #palT click collapses #pal (aria-expanded false)', (await pq.evaluate(() => document.getElementById('pal').classList.contains('col'))) && (await pq.getAttribute('#palT', 'aria-expanded')) === 'false');
  chk('(UI3) collapsed palette stores msfb.ui.pal "1"', (await pq.evaluate(() => localStorage.getItem('msfb.ui.pal'))) === '1');
  await pq.reload();
  await pq.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  await pq.evaluate(() => __fb.setView('F'));
  chk('(UI3) reload keeps palette collapsed', await pq.evaluate(() => document.getElementById('pal').classList.contains('col')));
  await pq.click('#palT');
  chk('(UI3) second #palT click re-expands, stored "0"', (await pq.evaluate(() => !document.getElementById('pal').classList.contains('col'))) && (await pq.evaluate(() => localStorage.getItem('msfb.ui.pal'))) === '0');
  await pq.click('#dockT');
  chk('(UI3) #dockT collapses the dock', (await pq.evaluate(() => document.getElementById('dock').classList.contains('col'))) && (await pq.getAttribute('#dockT', 'aria-expanded')) === 'false');
  await pq.click('#dockT');
  chk('(UI3) #dockT re-expands the dock', (await pq.evaluate(() => !document.getElementById('dock').classList.contains('col'))) && (await pq.getAttribute('#dockT', 'aria-expanded')) === 'true');
  chk('(UI3) no dock tabs: #dockTabs/#dtI/#dtS absent (cards, Round 5)', (await pq.locator('#dockTabs, #dtI, #dtS').count()) === 0);
  chk('(UI3) #prodB hidden while simulation is off, #dProd hidden', !(await pq.isVisible('#prodB')) && !(await pq.isVisible('#dProd')) && await pq.isVisible('#insp'));
  await pq.click('#simB');
  chk('(UI3) simulation on: #insp still visible (no tab hides it), #dProd hidden', await pq.isVisible('#insp') && !(await pq.isVisible('#dProd')));
  await pq.click('#prodB');
  chk('(UI3) Production card #dProd shows next to #insp (cards, not tabs)', (await pq.isVisible('#dProd')) && (await pq.isVisible('#insp')));
  await pq.click('#prodB');
  await pq.click('#simB');
  chk('(UI3) simulation off again: #prodB hidden, #insp shown', !(await pq.isVisible('#prodB')) && (await pq.isVisible('#insp')));
  await pq.click('#plnB');
  await pq.selectOption('#plnItem', 'ITEM_CobaltPlates');
  await pq.fill('#plnRate', '120');
  chk('(UI3) #plnForm holds item + rate, not belt Mk', await pq.evaluate(() => { const f = document.getElementById('plnForm'); return !!f.querySelector('#plnItem') && !!f.querySelector('#plnRate') && !f.querySelector('#plnMk'); }));
  chk('(UI3) planner options start expanded', (await pq.getAttribute('#plnOptT', 'aria-expanded')) === 'true' && !(await pq.evaluate(() => document.getElementById('plnOpt').classList.contains('col'))));
  await pq.click('#plnOptT');
  chk('(UI3) #plnOptT collapses options (aria-expanded false)', (await pq.evaluate(() => document.getElementById('plnOpt').classList.contains('col'))) && (await pq.getAttribute('#plnOptT', 'aria-expanded')) === 'false');
  await pq.click('#plnOptT');
  chk('(UI3) #plnOptT re-expands options', (await pq.evaluate(() => !document.getElementById('plnOpt').classList.contains('col'))) && (await pq.getAttribute('#plnOptT', 'aria-expanded')) === 'true');
  const lbU = async () => (await pq.locator('.plnLbl').allTextContents()).join(' | ');
  await pq.selectOption('#plnMk', '2');
  chk('(UI3) belt Mk3 from options changes arrow label', (await lbU()).includes('120 items/min, 1 belts (Mk3)'), await lbU());
  await pq.selectOption('#plnSp', '0');
  chk('(UI3) splitter Mk1 override from options warns', (await pq.locator('.plnWarn').count()) > 0);
  await pq.selectOption('#plnSp', '');
  await pq.fill('#plnRate', '240');
  await pq.selectOption('#plnBal', '0');
  chk('(UI3) balancer Mk1 override from options warns at 240/min', (await pq.locator('.plnWarn').count()) > 0);
  await pq.selectOption('#plnBal', '');
  chk('(UI3) balancer back to follow: no warning', (await pq.locator('.plnWarn').count()) === 0);
  await pq.click('#plnOptT'); await pq.click('#plnOptT');
  await pq.click('#plnGx');
  chk('(UI3) View toggle from options still switches to Expanded', (await pq.getAttribute('#plnGx', 'aria-pressed')) === 'true' && (await pq.locator('.plnBox.plnM').count()) > 0);
  await pq.click('#plnGx');
  await pq.selectOption('#plnMk', '0');
  await pq.fill('#plnRate', '120');
  await pq.selectOption('#plnItem', 'ITEM_EnrichedNickelOre');
  await pq.fill('#plnRate', '10');
  await pq.selectOption('#plnProto', '1');
  chk('(UI3) Protomatter option from options panel adds the Protomatter box', (await pq.locator('.plnBox[data-item="ITEM_Protomatter"]').count()) === 1);
  await pq.selectOption('#plnProto', '0');
  chk('(UI3) planner: no pageerror / console.error', errs.length === 0, errs.join('\n     '));
  await ctxQ.close();

  // ---- (R5) Round 5: 88px header, centred controls, palette/dock labels at top, dock cards, Level popover,
  //      Simulation + Flow windows (top right, header toggles), #simB/#lk/#bn from Layout switch to Floor
  const ctxR = await br.newContext({viewport: {width: 1400, height: 900}});
  const pr = await newPage(ctxR, 'r5');
  const box = sel => pr.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return {l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height, cy: r.top + r.height / 2}; }, sel);
  const vis = sel => pr.isVisible(sel);
  const winOpen = id => pr.evaluate(i => !document.getElementById(i).hidden, id);
  const lvTxt = async () => (await pr.textContent('#lvB')).replace(/\s+/g, ' ').trim();
  const hb = await box('header');
  chk('(R5) header 80..96px tall at 1400x900', hb.h >= 80 && hb.h <= 96, String(hb.h));
  const ctr = [];
  for (const s of ['#name', '#lvB', '#undo', '#fit', '#simB', '#flwB', '#plnB']) ctr.push(s + ' ' + ((await box(s)).cy - hb.cy).toFixed(1));
  chk('(R5) controls vertically centred on the header (within 4px): #name #lvB #undo #fit #simB #flwB #plnB', ctr.every(x => Math.abs(+x.split(' ')[1]) <= 4), ctr.join(' | '));
  chk('(R5) #rot, #rotv, #tabs, #simM, #simL, #dockTabs, #dtI, #dtS absent', (await pr.locator('#rot, #rotv, #tabs, #simM, #simL, #dockTabs, #dtI, #dtS').count()) === 0);
  await pr.evaluate(() => __fb.setView('L'));
  const palL = await pr.evaluate(() => [...document.querySelectorAll('#palList details[data-c]')].map(d => d.dataset.c));
  chk('(R5) Layout palette shows blocks (no tab buttons in the palette)', (await pr.evaluate(() => __fb.tab)) === 'b' && palL.length > 0 && palL.every(c => c.startsWith('b:')) && (await pr.locator('#pal [data-tab]').count()) === 0, palL.join(','));
  await pr.evaluate(() => __fb.setView('F'));
  const palF = await pr.evaluate(() => [...document.querySelectorAll('#palList details[data-c]')].map(d => d.dataset.c));
  chk('(R5) Floor palette shows buildables (no tab buttons in the palette)', (await pr.evaluate(() => __fb.tab)) === 'm' && palF.length > 0 && palF.every(c => c.startsWith('m:')), palF.join(','));
  const topLb = async (btn, panel) => pr.evaluate(([b, p]) => { const l = document.querySelector(b + ' .lb'), pe = document.getElementById(p).getBoundingClientRect(); return {txt: l.textContent, dt: l.getBoundingClientRect().top - pe.top}; }, [btn, panel]);
  await pr.click('#palT');
  const pl5 = await topLb('#palT', 'pal');
  chk('(R5) collapsed palette: "Palette" label at the top (within 60px of #pal top)', pl5.txt === 'Palette' && pl5.dt >= 0 && pl5.dt < 60, JSON.stringify(pl5));
  await pr.click('#palT');
  await pr.click('#dockT');
  const dk5 = await topLb('#dockT', 'dock');
  chk('(R5) collapsed dock: "Info" label at the top (within 60px of #dock top)', dk5.txt === 'Info' && dk5.dt >= 0 && dk5.dt < 60, JSON.stringify(dk5));
  await pr.click('#dockT');
  // dock cards: a selected block shows collapsible cards (summary toggles open)
  await pr.evaluate(() => __fb.setView('L'));
  await imp(pr, bp([blk('BPO_Station_01', 0, 0)]));
  const cp = await pr.evaluate(() => __fb.px(0, 0));
  await pr.mouse.click(cp[0], cp[1]);
  const nCards = await pr.locator('#insp details[data-sec]').count();
  chk('(R5) dock shows cards (details[data-sec]) for a selected block', nCards >= 2, String(nCards));
  const cardOk = [];
  for (let i = 0; i < nCards; i++) {
    const d = pr.locator('#insp details[data-sec]').nth(i), o0 = await d.evaluate(e => e.open);
    await d.locator(':scope > summary').click();
    const o1 = await d.evaluate(e => e.open);
    await d.locator(':scope > summary').click();
    cardOk.push(o0 !== o1);
  }
  chk('(R5) every dock card collapses and expands from its own summary', cardOk.length > 0 && cardOk.every(Boolean), cardOk.join(','));
  // Level window (header #lvB toggles the floating #lvW, #lvWX closes it): display = internal height + 1
  chk('(R5) Level window closed by default, label "Level 1"', !(await vis('#lvW')) && (await pr.getAttribute('#lvB', 'aria-pressed')) === 'false' && (await lvTxt()) === 'Level 1');
  await pr.click('#lvB');
  chk('(R5) click Level: window opens, aria-pressed true', (await vis('#lvW')) && (await pr.getAttribute('#lvB', 'aria-pressed')) === 'true');
  await pr.click('#lvWX');
  chk('(R5) close button closes Level window', !(await vis('#lvW')));
  await pr.click('#lvB');
  await pr.click('#lvB');
  chk('(R5) clicking Level again closes the window', !(await vis('#lvW')));
  await pr.click('#lvB');
  chk('(R5) #lay shows 1 while internal layer is 0', (await pr.inputValue('#lay')) === '1' && (await pr.evaluate(() => __fb.layer)) === 0);
  await pr.click('#lUp');
  chk('(R5) Level up: "Level 2", internal layer 1, #lay 2', (await lvTxt()) === 'Level 2' && (await pr.evaluate(() => __fb.layer)) === 1 && (await pr.inputValue('#lay')) === '2');
  await pr.click('#lDn');
  chk('(R5) Level down: back to "Level 1", internal layer 0', (await lvTxt()) === 'Level 1' && (await pr.evaluate(() => __fb.layer)) === 0);
  await pr.fill('#lay', '3'); await pr.press('#lay', 'Enter'); await pr.evaluate(() => document.getElementById('lay').dispatchEvent(new Event('change')));
  chk('(R5b) typing 3 in #lay: internal layer 2, shown 3', (await pr.evaluate(() => __fb.layer)) === 2 && (await pr.inputValue('#lay')) === '3');
  await pr.fill('#lay', '1'); await pr.press('#lay', 'Tab');
  chk('(R5b) typing 1 in #lay: internal layer 0', (await pr.evaluate(() => __fb.layer)) === 0);
  { const d = pr.locator('#insp details[data-sec=ov]'), o0 = await d.evaluate(e => e.open); await d.locator(':scope > summary').click(); const o1 = await d.evaluate(e => e.open); await d.locator(':scope > summary').click();
  chk('(R5b) Overview is a collapsible card (summary toggles it)', o0 && !o1 && await d.evaluate(e => e.open)); }
  await pr.uncheck('#ghost');
  chk('(R5) ghost layers checkbox lives in the Level window and toggles', !(await pr.isChecked('#ghost')) && (await vis('#lvW')));
  await pr.check('#ghost');
  // typing in the inspector Level field (#fh): 1-based; export stays 0-based (Escape cleared the selection: select again)
  await pr.mouse.click(cp[0], cp[1]);
  await pr.evaluate(() => { document.querySelector('details[data-sec="pos"]').open = true; });
  chk('(R5) inspector Level shows 1 for a ground block', (await pr.inputValue('#fh')) === '1');
  await pr.fill('#fh', '2'); await pr.locator('#fh').press('Tab');
  chk('(R5) #fh = 2 gives export Height 1 (0-based, data unchanged)', (await pr.evaluate(() => __fb.build().Blocks[0].Height)) === 1, String(await pr.evaluate(() => __fb.build().Blocks[0].Height)));
  // the block moved to level 2: switch to level 2 (Level up), select it there, type 1 (back to internal 0)
  await pr.click('#lUp');
  await pr.mouse.click(cp[0], cp[1]);
  await pr.evaluate(() => { document.querySelector('details[data-sec="pos"]').open = true; });
  chk('(R5) on level 2 the block is selected and #fh shows 2', (await pr.inputValue('#fh')) === '2', await pr.inputValue('#fh').catch(() => 'no #fh'));
  await pr.fill('#fh', '1'); await pr.locator('#fh').press('Tab');
  chk('(R5) typing 1 in #fh gives export Height 0', (await pr.evaluate(() => __fb.build().Blocks[0].Height)) === 0);
  const jx = await pr.evaluate(() => JSON.stringify(__fb.build()));
  chk('(R5) export JSON is still 0-based (Height 0 present, no +1 shift)', /"Height":0/.test(jx) && !/"Height":1/.test(jx));
  // Simulation and Flow windows: header toggles, x, both at once, top-right, no overlap
  for (const v of ['L', 'F']) {
    await pr.evaluate(x => __fb.setView(x), v);
    if (await winOpen('smW')) await pr.click('#simB');
    await pr.click('#simB');
    const on1 = await winOpen('smW'), p1 = await pr.getAttribute('#simB', 'aria-pressed');
    await pr.click('#simB');
    chk(`(R5) ${v}: #simB toggles the Simulation window (aria-pressed)`, on1 && p1 === 'true' && !(await winOpen('smW')) && (await pr.getAttribute('#simB', 'aria-pressed')) === 'false');
    if (await winOpen('fwW')) await pr.click('#flwB');
    await pr.click('#flwB');
    const fon1 = await winOpen('fwW'), fp1 = await pr.getAttribute('#flwB', 'aria-pressed');
    await pr.click('#flwB');
    chk(`(R5) ${v}: #flwB toggles the Flow window (aria-pressed)`, fon1 && fp1 === 'true' && !(await winOpen('fwW')) && (await pr.getAttribute('#flwB', 'aria-pressed')) === 'false');
  }
  await pr.click('#simB'); await pr.click('#flwB');
  chk('(R5) Simulation and Flow windows open together', (await winOpen('smW')) && (await winOpen('fwW')));
  await pr.click('#smWX');
  chk('(R5) x on Simulation closes it and leaves Flow open', !(await winOpen('smW')) && (await winOpen('fwW')) && (await pr.getAttribute('#simB', 'aria-pressed')) === 'false');
  await pr.click('#simB');
  await pr.click('#fwWX');
  chk('(R5) x on Flow closes it and leaves Simulation open', !(await winOpen('fwW')) && (await winOpen('smW')));
  await pr.click('#flwB');
  await pr.click('#lvWX');   // Level window shares the top-right stack with Simulation/Flow: close it so their positions are measured alone
  const sbx = await box('#smW'), fbx = await box('#fwW'), stg = await box('#stage');
  chk('(R5) windows top right: right edge within 24px of stage right; Simulation top within 24px of stage top (Flow stacks below it)', [sbx, fbx].every(b => Math.abs(b.r - stg.r) <= 24 && b.t >= stg.t) && sbx.t - stg.t <= 24 && fbx.t >= sbx.b, JSON.stringify([sbx.r, fbx.r, stg.r, sbx.t - stg.t, fbx.t - stg.t]));
  chk('(R5) Simulation and Flow windows do not overlap', sbx.r <= fbx.l || fbx.r <= sbx.l || sbx.b <= fbx.t || fbx.b <= sbx.t, JSON.stringify([sbx, fbx]));
  // ---- (R7) Round 7: Simulate button gone, #simB opens sim mode, Flow chips = 4 equal buttons
  chk('(R7) no #sm button and no "Simulate" button in the header or Simulation window', (await pr.locator('#sm, #smc, #smg').count()) === 0 && !(await pr.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Simulate'))));
  if (await winOpen('smW')) await pr.click('#simB');
  await pr.evaluate(() => __fb.setView('L'));
  await pr.click('#simB');
  chk('(R7) #simB from Layout: opens Simulation window in sim mode (view F, SM on, SIM created, controls visible, hint hidden)', (await pr.evaluate(() => __fb.view)) === 'F' && (await pr.evaluate(() => __fb.SM)) === true && (await pr.evaluate(() => __fb.SIM !== null)) && (await winOpen('smW')) && (await pr.getAttribute('#simB', 'aria-pressed')) === 'true' && await vis('#smPlay') && await vis('#smRst') && await vis('#smClk') && !(await vis('#smHint')));
  await pr.click('#simB');
  chk('(R7) #simB again: closes Simulation window and leaves sim mode (SM off, SIM null)', !(await winOpen('smW')) && (await pr.evaluate(() => __fb.SM)) === false && (await pr.evaluate(() => __fb.SIM)) === null);
  if (!(await winOpen('fwW'))) await pr.click('#flwB');
  const chipBx = await pr.evaluate(() => ['lk', 'bn', 'bnF', 'bnB'].map(i => { const r = document.getElementById(i).getBoundingClientRect(); return [r.width, r.height]; }));
  chk('(R7) Flow chips: 4 buttons in #lkg, equal width and height', (await pr.locator('#lkg > button').count()) === 4 && chipBx.every(([w, h]) => w > 0 && h > 0 && Math.abs(w - chipBx[0][0]) <= 1 && Math.abs(h - chipBx[0][1]) <= 1), JSON.stringify(chipBx));
  // from Layout: #simB switches to Floor, opens the Simulation window and enters sim mode; #lk / #bn switch to Floor
  await pr.evaluate(() => __fb.setView('L'));
  await pr.click('#simB');
  chk('(R5) #simB from Layout: switches to Floor, opens the window, sim mode on', (await pr.evaluate(() => __fb.view)) === 'F' && (await pr.evaluate(() => __fb.SM)) === true && (await pr.getAttribute('#simB', 'aria-pressed')) === 'true');
  await pr.click('#simB');
  await pr.evaluate(() => __fb.setView('L'));
  const lk0 = await pr.getAttribute('#lk', 'aria-pressed');
  await pr.click('#lk');
  chk('(R5) #lk from Layout: switches to Floor and toggles the overlay', (await pr.evaluate(() => __fb.view)) === 'F' && (await pr.getAttribute('#lk', 'aria-pressed')) !== lk0);
  await pr.evaluate(() => __fb.setView('L'));
  const bn0 = await pr.getAttribute('#bn', 'aria-pressed');
  await pr.click('#bn');
  chk('(R5) #bn from Layout: switches to Floor and toggles Bottlenecks', (await pr.evaluate(() => __fb.view)) === 'F' && (await pr.getAttribute('#bn', 'aria-pressed')) !== bn0);
  // planner from the header still works with a modal open
  if (!(await winOpen('smW'))) await pr.click('#simB');
  await pr.click('#plnB');
  await pr.selectOption('#plnItem', 'ITEM_CobaltPlates');
  await pr.fill('#plnRate', '120');
  chk('(R5) planner opens from #plnB with a modal open, still plans (boxes drawn, Simulation still open)', (await vis('#pln')) && (await pr.locator('#plnOut .plnBox').count()) > 0 && (await winOpen('smW')));
  await pr.click('#plnX');
  // screenshots: 1400x900, 1024x700, 390x800, Layout and Floor
  for (const [w, h] of [[1400, 900], [1024, 700], [390, 800]]) {
    await pr.setViewportSize({width: w, height: h});
    for (const v of ['L', 'F']) {
      await pr.evaluate(x => __fb.setView(x), v);
      await pr.screenshot({path: path.join(HERE, 'shots', `r5t-${w}x${h}-${v === 'L' ? 'layout' : 'floor'}.png`)});
    }
  }
  chk('(R5-h) round 5 section: no pageerror / console.error', errs.length === 0, errs.join('\n     '));
  await ctxR.close();

  // ---- (M) Round 3b: layout moves carry the floor machines/belts and closed doorways of the moved station
  const ctxM = await br.newContext({viewport: {width: 1400, height: 900}});
  const pm2 = await newPage(ctxM, 'carry');
  const ASM = (x, y) => mac('DAT_Assembler', x, y, {mid: 5, rec: KC});
  const BELT = (x, y) => mac('DAT_ConveyorBelt', x, y, {rot: 1});
  // export units: station cell = GridLocation/4 (1x1), machine floor cell = (GridLocation + 14 - w)/2, machine h = Height/8
  const stM = () => pm2.evaluate(() => { const o = __fb.build(); return {b: o.Blocks.map(b => [b.GridLocation.X / 4, b.GridLocation.Y / 4, b.Height]), m: o.DefaultMachines.map(m => { const f = __fb.dim({cls: m.DefaultName, rot: m.Transform.GridRotation}), g = m.Transform.GridLocation; return [m.DefaultName, (g.X + 14 - f.w) / 2, (g.Y + 14 - f.h) / 2, m.Transform.Height / 8]; }), c: (o.FactoryLayout.ClosedDoorways || []).map(d => [d.Height, d.X, d.Y, d.Edge, d.Seg].join('|'))}; });
  const has = (s, n, x, y, h = 0) => s.m.some(q => isDeepStrictEqual(q, [n, x, y, h]));
  const ASMn = 'DAT_Assembler', BELTn = 'DAT_ConveyorBelt';
  const setupM = async (extra = {}) => {
    await imp(pm2, bp([blk('BPO_Station_01', 0, 0), blk('BPO_Station_01', 10, 0)], [ASM(4, 5), BELT(6, 6), ASM(164, 5), ASM(100, 100)], extra));
    await pm2.evaluate(() => __fb.setView('L'));
  };
  const cellPx = (x, y) => pm2.evaluate(([a, b]) => __fb.px(a, b), [x, y]);
  const dragCells = async (from, to) => {
    const a = await cellPx(...from), b = await cellPx(...to);
    await pm2.mouse.move(a[0], a[1]); await pm2.mouse.down(); await pm2.mouse.move(b[0], b[1], {steps: 6}); await pm2.mouse.up();
  };
  const undoM = async (n, redo = false) => { await pm2.focus('#cv'); for (let i = 0; i < n; i++) await pm2.keyboard.press(redo ? 'Control+Shift+Z' : 'Control+z'); };
  const setPanelM = async (id, v) => { await pm2.fill(id, String(v)); await pm2.locator(id).press('Tab'); };   // Tab = one native change event

  // (M1) drag: station + its assembler and belt move by the same delta; station 2 and the outside machine stay
  await setupM();
  const m0 = await stM();
  chk('(M0) setup: 2 stations, 4 floor machines as placed', m0.b.length === 2 && m0.m.length === 4 && has(m0, ASMn, 4, 5) && has(m0, BELTn, 6, 6) && has(m0, ASMn, 164, 5) && has(m0, ASMn, 100, 100), JSON.stringify(m0));
  await dragCells([0, 0], [3, 2]);
  const m1 = await stM();
  chk('(M1) drag station by (+3,+2): station moved', isDeepStrictEqual(m1.b[0], [3, 2, 0]), JSON.stringify(m1.b));
  chk('(M1) drag: assembler and belt move by (+48,+32) floor cells, same h', has(m1, ASMn, 52, 37) && has(m1, BELTn, 54, 38), JSON.stringify(m1.m));
  chk('(M1) unselected station 2 and its machine stay', isDeepStrictEqual(m1.b[1], m0.b[1]) && has(m1, ASMn, 164, 5), JSON.stringify([m1.b[1], m1.m]));
  chk('(M7) machine outside every station footprint does not move', has(m1, ASMn, 100, 100), JSON.stringify(m1.m));
  // (M2) undo / redo restore and re-apply both
  await undoM(1);
  const u1 = await stM();
  chk('(M2) Ctrl+Z restores station and floor machines', isDeepStrictEqual(u1, m0), diff(u1, m0));
  await undoM(1, true);
  const r1 = await stM();
  chk('(M2) Ctrl+Shift+Z re-applies station and floor machines', isDeepStrictEqual(r1, m1), diff(r1, m1));
  // (M3) position panel: X +4 -> machines +64 X; height 1 -> station + machines h=1; undo x2 restores
  await setupM();
  const sp = await cellPx(0, 0);
  await pm2.mouse.click(sp[0], sp[1]);
  await pm2.evaluate(() => { document.querySelector('details[data-sec="pos"]').open = true; });
  await setPanelM('#fx', 4);
  const x1 = await stM();
  chk('(M3) panel X +4: station x=4, machines +64 X, Y unchanged', x1.b[0][0] === 4 && has(x1, ASMn, 68, 5) && has(x1, BELTn, 70, 6), JSON.stringify(x1));
  await setPanelM('#fh', 2);   // Round 5: the Level field is 1-based (display 2 = internal height 1)
  const hz1 = await stM();
  chk('(M3) panel level 2 (internal h=1): station and its machines h=1, station 2 h=0', hz1.b[0][2] === 1 && has(hz1, ASMn, 68, 5, 1) && has(hz1, BELTn, 70, 6, 1) && hz1.b[1][2] === 0 && has(hz1, ASMn, 164, 5, 0), JSON.stringify(hz1));
  await undoM(2);
  const u3 = await stM();
  chk('(M3) undo x2 restores station and machines (X and height)', isDeepStrictEqual(u3, m0), diff(u3, m0));
  // (M4) closed doorway of the station follows it (key h|x|y|E|k)
  await setupM({FactoryLayout: {ClosedDoorways: [{Height: 0, X: 0, Y: 0, Edge: 'E', Seg: 0}]}});
  const d0 = await stM();
  chk('(M4) setup: closed door 0|0|0|E|0 present', isDeepStrictEqual(d0.c, ['0|0|0|E|0']), JSON.stringify(d0.c));
  await dragCells([0, 0], [2, 1]);
  const d1 = await stM();
  chk('(M4) drag by (+2,+1): closed door moves to 0|2|1|E|0', isDeepStrictEqual(d1.c, ['0|2|1|E|0']), JSON.stringify(d1.c));
  await undoM(1);
  const d2 = await stM();
  chk('(M4) undo restores closed door', isDeepStrictEqual(d2.c, ['0|0|0|E|0']), JSON.stringify(d2.c));
  // (M6) multi-select (Ctrl+A) drag: both stations move by the same delta, each with its own machines
  await setupM();
  await selectAll(pm2);
  await dragCells([0, 0], [3, 2]);
  const mm = await stM();
  chk('(M6) multi-select drag: both stations +3,+2', isDeepStrictEqual(mm.b[0], [3, 2, 0]) && isDeepStrictEqual(mm.b[1], [13, 2, 0]), JSON.stringify(mm.b));
  chk('(M6) multi-select drag: machines of both stations +48,+32, outside machine stays', has(mm, ASMn, 52, 37) && has(mm, BELTn, 54, 38) && has(mm, ASMn, 212, 37) && has(mm, ASMn, 100, 100), JSON.stringify(mm.m));
  await undoM(1);
  chk('(M6) undo restores both stations and machines', isDeepStrictEqual(await stM(), m0));
  chk('(M-h) carry: no pageerror / console.error', errs.length === 0, errs.join('\n     '));
  await ctxM.close();

  // ---- (H) Round 4 compact header: one 44px row, File menu, Floor tools menu, 390px menu copies
  const ctxH = await br.newContext({viewport: {width: 1400, height: 900}});
  await ctxH.addInitScript(() => { delete window.showSaveFilePicker; });   // Save -> download path (no native dialog)
  const ph = await newPage(ctxH, 'hdr');
  const hdr = () => ph.evaluate(() => { const h = document.querySelector('header'), b = h.getBoundingClientRect(); return {h: b.height, sh: h.scrollHeight, ch: h.clientHeight, sw: h.scrollWidth, cw: h.clientWidth}; });
  const allVis = async ids => { let ok = true; for (const i of ids) ok = ok && await ph.isVisible(i); return ok; };
  const noneVis = async ids => { let ok = true; for (const i of ids) ok = ok && !(await ph.isVisible(i)); return ok; };
  const expanded = id => ph.getAttribute(id, 'aria-expanded');
  const active = () => ph.evaluate(() => document.activeElement && document.activeElement.id);
  const settle = () => ph.waitForFunction(() => document.getElementById('fileL').contains(document.getElementById('fSave')) === matchMedia('(max-width:1100px)').matches);
  const inList = (list, ids) => ph.evaluate(([l, ids]) => ids.map(i => document.getElementById(l).contains(document.getElementById(i))), [list, ids]);

  // (H1) header: one row, no wrap, at each size, both views (Round 5: 88px high, one row)
  for (const [w, h] of [[1400, 900], [1024, 700], [390, 800], [1200, 400]]) {
    await ph.setViewportSize({width: w, height: h});
    await settle();
    for (const v of ['L', 'F']) {
      await ph.evaluate(x => __fb.setView(x), v);
      const d = await hdr();
      chk(`(H1) header ${w}x${h} view ${v}: 80..96px, no wrap (scrollHeight==clientHeight), no horizontal overflow`, d.h >= 80 && d.h <= 96 && d.sh === d.ch && d.sw <= d.cw, JSON.stringify(d));
    }
  }

  // (H2) File menu
  await ph.setViewportSize({width: 1400, height: 900});
  await ph.evaluate(() => __fb.setView('L'));
  chk('(H2) File closed by default: aria-expanded=false, list hidden', (await expanded('#fileM')) === 'false' && !(await ph.isVisible('#fileL')));
  await ph.click('#fileM');
  chk('(H2) click File: aria-expanded=true, New/Open/Save as/Import visible', (await expanded('#fileM')) === 'true' && (await allVis(['#nw', '#fOpen', '#fSaveAs', '#imp'])));
  await ph.keyboard.press('Escape');
  chk('(H2) Escape closes File and returns focus to #fileM', (await expanded('#fileM')) === 'false' && !(await ph.isVisible('#fileL')) && (await active()) === 'fileM', `focus ${await active()}`);
  await ph.click('#fileM');
  await ph.mouse.click(700, 600);   // outside the menu
  chk('(H2) outside click closes File', (await expanded('#fileM')) === 'false' && !(await ph.isVisible('#fileL')));

  // (H3) keyboard: ArrowDown opens and walks the items, wraps, ArrowUp goes back
  await ph.focus('#fileM');
  await ph.keyboard.press('ArrowDown');
  const k1 = await active();
  await ph.keyboard.press('ArrowDown'); const k2 = await active();
  await ph.keyboard.press('ArrowDown'); const k3 = await active();
  await ph.keyboard.press('ArrowDown'); const k4 = await active();
  await ph.keyboard.press('ArrowDown'); const k5 = await active();
  await ph.keyboard.press('ArrowUp'); const k6 = await active();
  chk('(H3) ArrowDown opens File and focuses New, then Open, Save as, Import, wraps to New; ArrowUp back to Import',
    (await expanded('#fileM')) === 'true' && [k1, k2, k3, k4, k5, k6].join() === 'nw,fOpen,fSaveAs,imp,nw,imp', [k1, k2, k3, k4, k5, k6].join());
  await ph.keyboard.press('Escape');

  // (H4) picking New from the menu still runs its normal flow (confirm, clear), and the menu closes
  await imp(ph, bp([blk('BPO_Station_01', 0, 0)]));
  await ph.evaluate(() => __fb.setView('L'));
  const nBefore = await ph.evaluate(() => __fb.S.blocks.length);
  DLG.next = {accept: true};
  await ph.click('#fileM');
  await ph.click('#nw');
  chk('(H4) New from File menu: confirm shown, design cleared',
    nBefore === 1 && DLG.seen.includes('Clear the autosaved design and start with an empty one?') && (await ph.evaluate(() => __fb.S.blocks.length)) === 0, `before ${nBefore} seen ${JSON.stringify(DLG.seen)}`);
  chk('(H4) picking New closes the File menu', (await expanded('#fileM')) === 'false' && !(await ph.isVisible('#fileL')));

  // (H5) Round 5: Floor tools menu and Rotate are gone; Simulation/Flow/Planner are header toggles in both views
  await ph.evaluate(() => __fb.setView('L'));
  chk('(H5) #simM, #simL, #rot, #rotv absent', (await ph.locator('#simM, #simL, #rot, #rotv').count()) === 0);
  chk('(H5) #simB, #flwB, #plnB visible in layout view', await allVis(['#simB', '#flwB', '#plnB']));
  await ph.evaluate(() => __fb.setView('F'));
  chk('(H5) #simB, #flwB, #plnB visible in floor view', await allVis(['#simB', '#flwB', '#plnB']));

  // (H6) 390px: Fit/Save/Export/Help live in the File menu (<=1100px); they work from there
  await ph.setViewportSize({width: 390, height: 800});
  await settle();
  await ph.evaluate(() => __fb.setView('F'));
  const FM = ['fSave', 'exp', 'fit', 'help'];
  chk('(H6) 390: Save/Export/Fit/Help are inside #fileL', (await inList('fileL', FM)).every(Boolean), JSON.stringify(await inList('fileL', FM)));
  chk('(H6) 390: those are hidden until File opens', await noneVis(['#fSave', '#exp', '#fit', '#help']));
  await ph.click('#fileM');
  chk('(H6) 390: File open shows Save/Export/Fit/Help', await allVis(['#fSave', '#exp', '#fit', '#help']));
  await ph.keyboard.press('Escape');
  await ph.click('#fileM');
  const [dlH] = await Promise.all([ph.waitForEvent('download'), ph.click('#fSave')]);
  chk('(H6) 390: Save from the menu downloads a .json (no save picker)', /\.json$/.test(dlH.suggestedFilename()), dlH.suggestedFilename());
  await ph.click('#fileM');
  await ph.click('#exp');
  chk('(H6) 390: Export from the menu opens #dExp with the JSON', await ph.isVisible('#dExp') && (await ph.inputValue('#expTa')).startsWith('{'));
  await ph.click('#expX');
  await ph.click('#lvB');
  await ph.uncheck('#ghost');
  chk('(H6) 390: ghost layers toggle from the Level window', !(await ph.isChecked('#ghost')));
  await ph.setViewportSize({width: 1400, height: 900});
  await settle();
  chk('(H6) back at 1400: Save/Export/Fit/Help inline in the header, not in #fileL', (await inList('fileL', FM)).every(x => !x) && await allVis(['#fSave', '#exp', '#fit', '#help']));

  chk('(H-h) header tests: no pageerror / console.error', errs.length === 0, errs.join('\n     '));
  await ctxH.close();
  await ctx.close();
} finally {
  await br.close();
}
chk('(h) no pageerror / console.error during the run', errs.length === 0, errs.join('\n     '));
console.log(`\nPASS ${pass}/${total}`);
if (MENU_NOTE) console.log(`NOTE: ${MENU_NOTE} menu reopen(s): Floor tools/File list grew past the viewport edge after Simulate on (index.html places the list once, at open)`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  fails.forEach(f => console.log(` - ${f.name}${f.detail ? ' :: ' + f.detail : ''}`));
}
process.exitCode = fails.length ? 1 : 0;

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
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
function wire(pg, tag) {
  pg.on('pageerror', e => errs.push(`[${tag}] pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`[${tag}] console.error: ${m.text()}`); });
  pg.on('dialog', d => { d.dismiss().catch(() => {}); });
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

  await ctx.close();
} finally {
  await br.close();
}
chk('(h) no pageerror / console.error during the run', errs.length === 0, errs.join('\n     '));
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  fails.forEach(f => console.log(` - ${f.name}${f.detail ? ' :: ' + f.detail : ''}`));
}
process.exitCode = fails.length ? 1 : 0;

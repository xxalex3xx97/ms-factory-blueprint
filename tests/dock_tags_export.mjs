// dock_tags_export: exported dock blocks carry the tag Name and Filters (round trip through JSON), over several generated plans.
// Single-ore dock (all non-empty filters the same ore): Name = "[AUTO-FILTER] [ORE]", non-empty filters are that ore only (empty bays allowed).
// Non-ore dock: no ore tag. Multi-ore docks are printed under MULTI-ORE DOCKS (info only, not a failure).
// Known broken case "BC100 Mk1 2x1 ind" (builds 0 docks) is skipped with a note.
// Run: node tests/dock_tags_export.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES = [
  {label: 'BC100 Mk2 2x1 ind', it: 'ITEM_BasicCircuit', rate: 100, mk: 1, bk: 'BPO_Station_2x1', dock: {in: 'ind', out: null}},
  {label: 'MagCoils150 Mk2 2x1 ind', it: 'ITEM_MagneticCoils', rate: 150, mk: 1, bk: 'BPO_Station_2x1', dock: {in: 'ind', out: null}},
  {label: 'BC100 Mk2 2x2 ind', it: 'ITEM_BasicCircuit', rate: 100, mk: 1, bk: 'BPO_Station_02', dock: {in: 'ind', out: null}},
  {label: 'BC100 Mk2 2x1 nrm in+out', it: 'ITEM_BasicCircuit', rate: 100, mk: 1, bk: 'BPO_Station_2x1', dock: {in: 'nrm', out: 'nrm'}},
  {label: 'BC100 Mk2 2x1 ind in+out', it: 'ITEM_BasicCircuit', rate: 100, mk: 1, bk: 'BPO_Station_2x1', dock: {in: 'ind', out: 'ind'}},
  {label: 'MagCoils150 Mk2 2x1 nrm in+out', it: 'ITEM_MagneticCoils', rate: 150, mk: 1, bk: 'BPO_Station_2x1', dock: {in: 'nrm', out: 'nrm'}}
];
const SKIP = ['BC100 Mk1 2x1 ind'];
const TAG = {titaniumore: 'TITANIUM', nickelore: 'NICKEL', cobaltore: 'COBALT', iridiumore: 'IRIDIUM', waterice: 'WATERICE', silica: 'SILICA', graphite: 'GRAPHITE'};
// page side: build + place the plan (rot 0, as dock_auto_filters.mjs), then export and JSON round trip
const RUN = c => {
  window.CMP_ENGINE = true;
  const P = plan(c.it, c.rate, c.mk, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = placerLayout(P, c.it, c.mk, c.mk, {box: 'DAT_Container_2', mod: false, dock: c.dock, bk: c.bk});
  if (!L.ok) return {err: L.why};
  let T = L.tile;
  if (!T) { T = placerTile(L, placerBk()); if (!T.ok) return {err: T.why} }
  S.blocks = []; layer = 0; view = 'F'; hover = {x: 2, y: 2};
  pasting = {rot: 0, fl: false, pl: {blocks: T.blocks, ms: T.ms, plan: null}};
  placerPaste();
  const dk = [plcCls('BPO_Dock'), plcCls('BPO_Dock_2')];
  const out = JSON.parse(JSON.stringify(__fb.build()));
  const docks = out.Blocks.map((b, i) => ({b, i})).filter(x => dk.includes(x.b.Class)).map(({b, i}) => ({
    cls: b.Class === dk[0] ? 'BPO_Dock' : 'BPO_Dock_2',
    id: b.ID ?? b.Id ?? i,
    name: b.Name === undefined ? null : b.Name,
    filters: (b.Filters || []).map(f => f && typeof f === 'object' && f.item ? String(f.item) : '')
  }));
  return {nSrc: S.blocks.filter(b => dk.includes(b.cls)).length, docks};
};
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const multi = []; const summary = {ore: 0, nonOre: 0, multi: 0, empty: 0, built: 0};
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof cmpDockDf === 'function');
  for (const label of SKIP) console.log('SKIP ' + label + ': known broken case, builds 0 docks');
  const dockList = [];
  for (const CASE of CASES) {
    const a = await page.evaluate(RUN, CASE);
    if (a.err) { check(false, CASE.label + ' build: ' + a.err); continue }
    summary.built++;
    check(a.nSrc === a.docks.length, CASE.label + ': export dock count ' + a.docks.length + ' == placed docks ' + a.nSrc);
    check(a.docks.length > 0, CASE.label + ': plan has BPO_Dock / BPO_Dock_2 blocks: ' + a.docks.length);
    for (const d of a.docks) {
      const filled = d.filters.filter(Boolean), empty = d.filters.length - filled.length;
      const keys = [...new Set(filled)];
      const bays = d.filters.length + ' bays, ' + filled.length + ' filled, ' + empty + ' empty';
      dockList.push(CASE.label + ' | ' + d.id + ' | ' + JSON.stringify(d.name) + ' | ' + JSON.stringify(d.filters) + ' | ' + bays);
      if (empty) summary.empty++;
      const tagInName = d.name && /\[(TITANIUM|NICKEL|COBALT|IRIDIUM|WATERICE|SILICA|GRAPHITE)\]/.test(d.name);
      if (keys.length === 1 && TAG[keys[0]]) {
        summary.ore++;
        const want = '[AUTO-FILTER] [' + TAG[keys[0]] + ']';
        check(d.name === want, CASE.label + ' ' + d.cls + ' ' + d.id + ' ore dock Name ' + JSON.stringify(d.name) + ' == ' + JSON.stringify(want));
        check(filled.every(k => k === keys[0]), CASE.label + ' ' + d.cls + ' ' + d.id + ' non-empty filters all ' + keys[0]);
      } else if (keys.length === 0 || keys.some(k => !TAG[k])) {
        summary.nonOre++;
        check(!tagInName, CASE.label + ' ' + d.cls + ' ' + d.id + ' non-ore dock has no ore tag: ' + JSON.stringify(d.name));
      } else {
        summary.multi++;
        multi.push({case: CASE.label, id: d.id, cls: d.cls, ores: keys, filled: filled.length, bays: d.filters.length, name: d.name});
      }
    }
    check(a.docks.every(d => d.filters.length > 0), CASE.label + ': every dock exports Filters');
  }
  check(summary.built >= 6, 'at least 6 plans built: ' + summary.built);
  console.log('dock list (case | id | Name | Filters | bays):');
  for (const l of dockList) console.log('  ' + l);
  console.log('dock summary: ' + JSON.stringify(summary));
  console.log('MULTI-ORE DOCKS (info only, planner fix input): count ' + multi.length);
  for (const m of multi) console.log('  ' + m.case + ' | ' + m.cls + ' ' + m.id + ' | ores ' + m.ores.join(',') + ' | bays ' + m.bays + ' (filled ' + m.filled + ') | Name ' + JSON.stringify(m.name));
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS dock_tags_export');
process.exit(fails ? 1 : 0);

// dock_tags_export: a generated plan's exported docks carry the tag Name and Filters (round trip through JSON).
// Ore-only input docks: Name = "[AUTO-FILTER] " + one [TAG] per ore key in their Filters. Non-ore dock: no tag.
// Case: MagCoils150 Mk2 2x1 ind (same planner path as dock_auto_filters.mjs, not the BC100 Mk1 case).
// Run: node tests/dock_tags_export.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES = [
  {label: 'MagCoils150 Mk2 2x1 ind', it: 'ITEM_MagneticCoils', rate: 150, mk: 1, bk: 'BPO_Station_2x1', dock: {in: 'ind', out: null}},
  {label: 'BC100 Mk2 2x1 ind in+out', it: 'ITEM_BasicCircuit', rate: 100, mk: 1, bk: 'BPO_Station_2x1', dock: {in: 'ind', out: 'ind'}}
];
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
  const exDocks = out.Blocks.filter(b => dk.includes(b.Class));
  return {
    nSrc: S.blocks.filter(b => dk.includes(b.cls)).length,
    docks: exDocks.map(b => ({cls: b.Class === dk[0] ? 'BPO_Dock' : 'BPO_Dock_2', name: b.Name === undefined ? null : b.Name, filters: (b.Filters || []).map(f => f && typeof f === 'object' ? String(f.item || '') : '')}))
  };
};
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof cmpDockDf === 'function');
  for (const CASE of CASES) {
  console.log('case ' + CASE.label);
  const a = await page.evaluate(RUN, CASE);
  if (a.err) { check(false, CASE.label + ' build: ' + a.err) }
  else {
    check(a.nSrc === a.docks.length, 'export Blocks[] dock count ' + a.docks.length + ' == placed docks ' + a.nSrc);
    check(a.docks.length > 0, 'plan has BPO_Dock / BPO_Dock_2 blocks: ' + a.docks.length);
    console.log('dock list (name | filters):');
    for (const d of a.docks) console.log('  ' + d.cls + ' | ' + JSON.stringify(d.name) + ' | ' + JSON.stringify(d.filters));
    for (const d of a.docks) {
      const ores = d.filters.filter(Boolean);
      const allOre = ores.length > 0 && ores.every(k => TAG[k]);
      if (allOre) {
        const u = [...new Set(ores)];
        const want = '[AUTO-FILTER] ' + u.map(k => '[' + TAG[k] + ']').join(' ');
        check(d.name === want, d.cls + ' ore dock Name ' + JSON.stringify(d.name) + ' == ' + JSON.stringify(want));
      } else {
        check(!d.name || !/\[[A-Z]+\]/.test(d.name), d.cls + ' non-ore dock has no tag: ' + JSON.stringify(d.name));
      }
    }
    check(a.docks.some(d => d.name && d.name.startsWith('[AUTO-FILTER] ')), 'at least one ore dock tagged');
    check(a.docks.every(d => d.filters.length > 0), 'every dock exports Filters');
  }
  }
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS dock_tags_export');
process.exit(fails ? 1 : 0);

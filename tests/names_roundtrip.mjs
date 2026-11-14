// Headless check: Name of elevator/teleporter machines and dock blocks survives JSON import -> build().
// Run:  node tests/names_roundtrip.mjs   (Playwright + Chrome, same setup as tests/import_roundtrip_mainbase.mjs)
// Exit code 1 on any failed check or page error.
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
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1400, height: 900}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => { d.dismiss().catch(() => {}); });
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');

  const HEX = await pg.evaluate(() => cfgEnc('named', {name: 'Lift A'}));
  const mach = (extra) => ({Class: 'BPO_Elevator_02', MachineID: 7, PaletteID: 0, Transform: {GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0}, ...extra});
  const doc = (blocks, machines) => JSON.stringify({Version: 2, DisplayName: 'names', Blocks: blocks, DefaultMachines: machines});
  const findM = (out, cls) => out.DefaultMachines.find(m => m.Class === cls);

  // (a) unmatched elevator machine with Name + ConfigHex: kept verbatim
  let ok = await pg.evaluate(t => __fb.importJson(t, true), doc([], [mach({Name: 'Lift A', ConfigHex: HEX})]));
  let out = await pg.evaluate(() => __fb.build());
  let m = findM(out, 'BPO_Elevator_02');
  chk('(a) import returns true', ok === true);
  chk('(a) build keeps Name "Lift A"', !!m && m.Name === 'Lift A', JSON.stringify(m));
  chk('(a) build keeps same ConfigHex', !!m && m.ConfigHex === HEX, m && m.ConfigHex);

  // (b) same machine without Name: no Name in output, ConfigHex kept
  ok = await pg.evaluate(t => __fb.importJson(t, true), doc([], [mach({ConfigHex: HEX})]));
  out = await pg.evaluate(() => __fb.build());
  m = findM(out, 'BPO_Elevator_02');
  chk('(b) import returns true', ok === true);
  chk('(b) build has no Name', !!m && !('Name' in m), JSON.stringify(m));

  // (c) dock block keeps Block.Name
  const dock = {Class: '/Game/Blueprints/BuildingBlocks/BPO_Dock_2.BPO_Dock_2_C', Name: 'D1', GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0};
  ok = await pg.evaluate(t => __fb.importJson(t, true), doc([dock], []));
  out = await pg.evaluate(() => __fb.build());
  chk('(c) import returns true', ok === true);
  chk('(c) build().Blocks[0].Name === "D1"', out.Blocks[0] && out.Blocks[0].Name === 'D1', JSON.stringify(out.Blocks[0]));

  // (d) catalog-matched named machine (DAT_Teleporter) with Name and no ConfigHex: ConfigHex rebuilt from Name
  const TP = await pg.evaluate(() => cfgKind('DAT_Teleporter') === 'named');
  const tpHex = await pg.evaluate(() => cfgEnc('named', {name: 'Port 1'}));
  const tp = {Class: 'BPO_Teleporter', DefaultName: 'DAT_Teleporter', MachineID: 9, PaletteID: 0, Name: 'Port 1', Transform: {GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0}};
  ok = await pg.evaluate(t => __fb.importJson(t, true), doc([], [tp]));
  out = await pg.evaluate(() => __fb.build());
  m = findM(out, 'DAT_Teleporter');
  chk('(d) DAT_Teleporter is kind named', TP === true);
  chk('(d) import returns true', ok === true);
  chk('(d) build Name "Port 1"', !!m && m.Name === 'Port 1', JSON.stringify(m));
  chk('(d) build ConfigHex == cfgEnc named "Port 1"', !!m && m.ConfigHex === tpHex, m && m.ConfigHex);

  chk('no console errors / page errors', errs.length === 0, errs.join('\n     '));
  await ctx.close();
} finally {
  await br.close();
}
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  fails.forEach(f => console.log(` - ${f.name}${f.detail ? ' :: ' + f.detail : ''}`));
}
process.exitCode = fails.length ? 1 : 0;

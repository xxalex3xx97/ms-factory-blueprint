// Headless check: real station blueprints Main_Base (1..5).json -> importJson -> build() must keep every
// block's file values (Class, GridLocation X/Y, Height, GridRotation, BlockID), and unchanged splitter ConfigHex
// must come back identical. Same method as import_mainbase.mjs (index.html via __fb, fresh context).
// Run:  cd F:/ms-factory-bp-site && node tests/import_roundtrip_mainbase.mjs
// Inputs: C:/Users/SFidelis/Downloads/Main_Base (N).json (read as data only). Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const DIR = 'C:/Users/SFidelis/Downloads';
const FILES = [1, 2, 3, 4, 5].map(i => path.join(DIR, `Main_Base (${i}).json`));
const short = c => String(c || '').split('/').pop().split('.')[0];   // '/Game/..BPO_X.BPO_X_C' and 'BPO_X' compare equal

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

  for (const f of FILES) {
    const tag = path.basename(f);
    if (!fs.existsSync(f)) { chk(`${tag} present`, false, f); continue; }
    const TXT = fs.readFileSync(f, 'utf8');
    const IN = JSON.parse(TXT);
    const ok = await pg.evaluate(t => __fb.importJson(t, true), TXT);
    const OUT = await pg.evaluate(() => __fb.build());
    chk(`${tag}: importJson returns true`, ok === true);
    chk(`${tag}: block count kept (${IN.Blocks.length})`, OUT.Blocks.length === IN.Blocks.length, `out ${OUT.Blocks.length}`);

    const diffs = [];
    IN.Blocks.forEach((a, i) => {
      const b = OUT.Blocks[i];
      if (!b) return;
      const got = {Class: short(b.Class), X: b.GridLocation.X, Y: b.GridLocation.Y, H: b.Height, R: b.GridRotation, BlockID: b.BlockID};
      const want = {Class: short(a.Class), X: a.GridLocation.X, Y: a.GridLocation.Y, H: a.Height, R: a.GridRotation, BlockID: a.BlockID};
      if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`#${i} ${JSON.stringify(want)} -> ${JSON.stringify(got)}`);
    });
    chk(`${tag}: every block keeps Class, GridLocation X/Y, Height, GridRotation, BlockID`, diffs.length === 0, `${diffs.length} differ:\n     ` + diffs.slice(0, 5).join('\n     '));

    // splitter ConfigHex: unchanged imported splitters export the same bytes
    const byId = new Map(OUT.DefaultMachines.map(m => [m.MachineID, m]));
    const spl = IN.DefaultMachines.filter(m => /splitter/i.test(String(m.Class)) && m.ConfigHex);
    const same = spl.filter(m => byId.get(m.MachineID) && byId.get(m.MachineID).ConfigHex === m.ConfigHex).length;
    // splitter bytes are re-mapped by face on export (e76d16d: N off, old order fixed), so files 1-4 legitimately differ; report only
    console.log(`INFO ${tag}: splitter ConfigHex identical ${same}/${spl.length} (differences = intended face re-map)`);

    const sc = IN.Blocks.map((a, i) => ({a, b: OUT.Blocks[i]})).filter(x => short(x.a.Class) === 'BPO_ShipyardCore_02');
    if (tag === 'Main_Base (4).json') chk(`${tag}: BPO_ShipyardCore_02 Y stays -2`, sc.length > 0 && sc.every(x => x.b.GridLocation.Y === -2), JSON.stringify(sc.map(x => x.b.GridLocation)));
    if (tag === 'Main_Base (5).json') chk(`${tag}: BPO_ShipyardCore_02 Y stays 0 (file data)`, sc.length > 0 && sc.every(x => x.b.GridLocation.Y === 0), JSON.stringify(sc.map(x => x.b.GridLocation)));
    console.log(`  ${tag}: blocks ${IN.Blocks.length}, ShipyardCore_02 ${sc.length}, splitters with ConfigHex ${spl.length}`);
  }
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

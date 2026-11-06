// Headless check: import a real player-station blueprint (site JSON from extract/import_station.py)
// into index.html, same method as harness.mjs (importJson via __fb, fresh context, no leakage).
// Run:  cd F:/MSDemoMods-public/tools/factory-blueprint && node tests/import_mainbase.mjs [path/to/station.json]
// Default path: C:/Users/SFidelis/.claude/jobs/53e7ab72/tmp/MainBase.json
// Screenshot -> tests/shots/import-mainbase-1400x900.png. Exit code 1 on any failed check or page error.
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
fs.mkdirSync(SHOTS, {recursive: true});
const SRC = process.argv[2] || 'C:/Users/SFidelis/.claude/jobs/53e7ab72/tmp/MainBase.json';
const TXT = fs.readFileSync(SRC, 'utf8');
const EXP_BLOCKS = 292, EXP_NAME = 'Main Base';
const N_MACH = JSON.parse(TXT).DefaultMachines.length;   // station machines in the JSON (2290 for MainBase.json)

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

  // cold import, timed in page (includes fit()/render inside importJson)
  const cold = await pg.evaluate(t => { const t0 = performance.now(); const ok = __fb.importJson(t); return {ok, ms: performance.now() - t0}; }, TXT);
  const toast = (await pg.locator('#toast').textContent()) || '';
  const name = await pg.inputValue('#name');
  const st = await pg.evaluate(() => {
    const S = __fb.S;
    const cnt = {};
    for (const m of S.dm) cnt[m.Class] = (cnt[m.Class] || 0) + 1;
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return {blocksAll: S.blocks.length, dmTotal: S.dm.length, dmDistinct: Object.keys(cnt).length, top, closed: S.closed.length};
  });
  // warm re-imports (JIT/cache warm) for timing only
  const warm = [];
  for (let i = 0; i < 3; i++) warm.push(await pg.evaluate(t => { const t0 = performance.now(); __fb.importJson(t, true); return performance.now() - t0; }, TXT));
  await pg.evaluate(t => __fb.importJson(t), TXT);   // re-import non-quiet so toast + fit match the cold state
  const toastFinal = (await pg.locator('#toast').textContent()) || '';

  const m = toast.match(/Imported (\d+) blocks, (\d+) buildables(?:, (\d+) other machines kept)?(?:, (\d+) unknown class)?/);
  const nBlocks = m ? +m[1] : null, nBuild = m ? +m[2] : null, nKept = m && m[3] ? +m[3] : 0, nUnk = m && m[4] ? +m[4] : 0;

  chk('importJson returns true', cold.ok === true);
  chk(`name field = "${EXP_NAME}"`, name === EXP_NAME, `name field "${name}"`);
  chk(`block count = ${EXP_BLOCKS} (toast, non-machine blocks)`, nBlocks === EXP_BLOCKS, `toast "${toast}"`);
  chk('toast reports imported buildables count', nBuild !== null, `toast "${toast}"`);
  chk('other machines kept = S.dm.length', nKept === st.dmTotal, `toast kept ${nKept} vs S.dm ${st.dmTotal}`);
  chk(`every station machine is either a buildable or kept (${st.dmTotal + nBuild} = ${N_MACH})`, nBuild + nKept === N_MACH, `buildables ${nBuild} + kept ${nKept}`);
  chk('machines imported as buildables (nm > 0): station machines show on the floor', nBuild > 0, `buildables ${nBuild}, kept ${nKept}: top kept ${st.top[0]?.[0]}`);
  chk('no console errors / page errors during import', errs.length === 0, errs.join('\n     '));

  // experiment (test-side only, index.html untouched): same station with machine Class reduced to the
  // catalog machineClass form (UE path basename, no _C). Shows whether the import path is the only blocker.
  const short = JSON.parse(TXT);
  short.DefaultMachines.forEach(m => { m.Class = m.Class.split('/').pop().split('.')[0]; });
  const exp = await pg.evaluate(t => { __fb.importJson(t, true); const b = __fb.S.blocks.length, d = __fb.S.dm.length; return {b, d}; }, JSON.stringify(short));
  console.log(`experiment short machine Class: blocks+machines on floor=${exp.b}, kept=${exp.d}`);
  await pg.evaluate(t => __fb.importJson(t), TXT);   // restore real station for the screenshot

  await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); });
  await pg.waitForTimeout(300);
  const floorOk = await pg.evaluate(() => { const c = document.getElementById('cv'); return c.width > 0 && c.height > 0 && __fb.S.blocks.length > 0; });
  chk('factory floor view renders (canvas sized, blocks present)', floorOk);
  const shot = path.join(SHOTS, 'import-mainbase-1400x900.png');
  await pg.screenshot({path: shot});
  chk('screenshot written', fs.existsSync(shot));
  chk('no console errors after floor view', errs.length === 0, errs.join('\n     '));

  console.log('\n--- numbers');
  console.log(`toast (cold): ${toast}`);
  console.log(`toast (final): ${toastFinal}`);
  console.log(`name field: ${name}`);
  console.log(`blocks(toast)=${nBlocks} buildables(toast)=${nBuild} otherMachinesKept(toast)=${nKept} unknownClass(toast)=${nUnk}`);
  console.log(`S.blocks total=${st.blocksAll} S.dm=${st.dmTotal} distinct kept classes=${st.dmDistinct} closedDoors=${st.closed}`);
  console.log('top 10 kept machine classes:');
  st.top.forEach(([c, n]) => console.log(`  ${n}\t${c}`));
  console.log(`import time ms: cold=${cold.ms.toFixed(1)} warm=${warm.map(x => x.toFixed(1)).join(', ')}`);
  console.log(`shot: ${shot}`);
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

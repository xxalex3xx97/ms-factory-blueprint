// Headless check: underground Length from the world record in a real *_S.sav (JS parseSav vs python oracle).
// Station "Starter Station" in blueprint module-Autosave_S.sav: game-built tunnels = ONE record at the entrance, exit virtual.
// Rule (raw units, 2 per cell): exit = entrance + 2*(Length-1) along rotation (rot 0 = east).
// Run:  cd F:/MSDemoMods-public/tools/factory-blueprint && node tests/import_ug.mjs [path/to/_S.sav]
// Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execFileSync} from 'child_process';
import {isDeepStrictEqual} from 'util';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SAV = process.argv[2] || 'C:/Users/SFidelis/AppData/Local/MainSequence/Saved/SaveGames/blueprint module-Autosave_S.sav';
const STN = 'Starter Station';
if (!fs.existsSync(SAV)) { console.error(`save not found: ${SAV}`); process.exit(1); }

// oracle: python reference extractor (python -I) + the python dedupe helper on synthetic records
const ORACLE = path.join(os.tmpdir(), 'import_ug_oracle.json');
execFileSync(process.env.PY || 'python', ['-I', path.join(ROOT, 'extract', 'import_station.py'), SAV, '--station', STN, '-o', ORACLE], {stdio: ['ignore', 'ignore', 'pipe']});
const oracle = JSON.parse(fs.readFileSync(ORACLE, 'utf8'));
const pyDup = JSON.parse(execFileSync(process.env.PY || 'python', ['-I', '-c',
  'import sys,json; sys.path.insert(0,sys.argv[1]); import import_station as S; ' +
  'print(json.dumps(sorted(S.ug_exit_dupes([dict(MachineID=1,X=-7,Y=1,Height=0,GridRotation=0),dict(MachineID=2,X=-3,Y=1,Height=0,GridRotation=0),dict(MachineID=3,X=-7,Y=5,Height=0,GridRotation=0)],{1:3,2:3,3:3}))))',
  path.join(ROOT, 'extract')], {encoding: 'utf8'}));
const UGS = oracle.DefaultMachines.filter(m => /Underground/.test(m.Class));
const byId = id => UGS.find(m => m.MachineID === id);

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}

// python-side expectations (raw units)
const EXP_L = {42054: 3, 42058: 3, 42377: 3, 42396: 3, 42399: 3, 42402: 3, 42411: 5, 42412: 10, 42413: 10, 42414: 10};
chk('python: 10 underground entrances, Lengths from world record', UGS.length === 10 && Object.entries(EXP_L).every(([id, L]) => byId(+id)?.Length === L),
  JSON.stringify(UGS.map(m => [m.MachineID, m.Length])));
chk('python: 42054 (-7,1) L3 -> exit (-3,1)', byId(42054)?.Transform.GridLocation.X === -7 && byId(42054)?.Transform.GridLocation.Y === 1 && byId(42054).Length === 3);
chk('python: 42058 (-7,9) L3 -> exit (-3,9)', byId(42058)?.Transform.GridLocation.X === -7 && byId(42058)?.Transform.GridLocation.Y === 9 && byId(42058).Length === 3);
chk('python: no exit record at (-3,1) or (-3,9)', !UGS.some(m => m.Transform.GridLocation.X === -3 && [1, 9].includes(m.Transform.GridLocation.Y)));
chk('python dedupe: exit record on entrance+2(L-1) dropped, others kept', isDeepStrictEqual(pyDup, [2]), JSON.stringify(pyDup));

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1400, height: 900}, acceptDownloads: true});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => { d.dismiss().catch(() => {}); });
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');

  // JS parseSav vs python oracle (whole station JSON, incl. Length); file goes through the page's own Import input
  await pg.evaluate(() => document.getElementById('impSav').click());   // menu item is hidden; its onclick opens the dialog
  await pg.setInputFiles('#savFile', SAV);
  await pg.waitForFunction(() => document.getElementById('savFile').files.length === 1, null, {timeout: 60000});
  const stations = await pg.evaluate(async () => __fb.parseSav(await document.getElementById('savFile').files[0].arrayBuffer()));
  const st = stations.find(s => s.name === STN);
  chk(`"${STN}" found by parseSav`, !!st);
  chk(`parseSav "${STN}" JSON deep-equals python oracle`, !!st && isDeepStrictEqual(st.json, oracle),
    st ? `machines ${st.json.DefaultMachines.length} vs ${oracle.DefaultMachines.length}` : 'missing');
  const jsL = st ? Object.fromEntries(st.json.DefaultMachines.filter(m => /Underground/.test(m.Class)).map(m => [m.MachineID, m.Length])) : {};
  chk('parseSav: Length from world record for all 10 undergrounds', Object.entries(EXP_L).every(([id, L]) => jsL[id] === L), JSON.stringify(jsL));

  // JS dedupe helper on the same synthetic records as the python check
  const jsDup = await pg.evaluate(() => [...__fb.ugDupes([{MID: 1, X: -7, Y: 1, H: 0, R: 0}, {MID: 2, X: -3, Y: 1, H: 0, R: 0}, {MID: 3, X: -7, Y: 5, H: 0, R: 0}], {1: 3, 2: 3, 3: 3})].sort());
  chk('JS dedupe: same result as python', isDeepStrictEqual(jsDup, pyDup), JSON.stringify(jsDup));
  // Height in the key (python side: tests/ug_dupes.mjs): other layer at same XY is not a dupe; same-layer mod exit is
  const jsH = await pg.evaluate(() => [...__fb.ugDupes([{MID: 1, X: -7, Y: 1, H: 0, R: 0}, {MID: 2, X: -3, Y: 1, H: 1, R: 0}], {1: 3, 2: 3})].sort());
  const jsH2 = await pg.evaluate(() => [...__fb.ugDupes([{MID: 3, X: -7, Y: 9, H: 0, R: 0}, {MID: 4, X: -3, Y: 9, H: 0, R: 0}], {3: 3, 4: 3})].sort());
  chk('JS dedupe: same XY other Height -> no dupe', jsH.length === 0, JSON.stringify(jsH));
  chk('JS dedupe: same-Height mod exit pair -> exit deduped', isDeepStrictEqual(jsH2, [4]), JSON.stringify(jsH2));

  // import through the page (same importJson the Import button uses) and check the tiles
  const res = await pg.evaluate(json => {
    const ok = __fb.importJson(json, true);
    const S = __fb.S;
    return {ok, ugl: S.blocks.filter(b => b.ugl !== undefined).length, ugTiles: S.blocks.filter(b => /Under/i.test(b.cls)).length, ugCls: (S.blocks.find(b => /Under/i.test(b.cls)) || {}).cls};
  }, JSON.stringify(st ? st.json : oracle));
  chk('import: 20 underground tiles (10 entrances + 10 exits)', res.ugTiles === 20, `ugTiles ${res.ugTiles} cls ${res.ugCls}`);
  chk('importJson ok', res.ok === true);
  chk('no leftover ugl on imported tiles', res.ugl === 0);
  // exit tile for every game-built tunnel: entrance cell + (L-1) cells along rot (cell = (raw - (w-14))/2 as in importJson)
  const cellsOk = await pg.evaluate(oracleUGS => {
    const S = __fb.S, ugCls = S.blocks.find(b => /Under/i.test(b.cls)).cls;
    const out = [];
    for (const m of oracleUGS) {
      const r = ((m.Transform.GridRotation % 4) + 4) % 4;
      const f = __fb.dim({cls: ugCls, rot: r});
      const ex = (m.Transform.GridLocation.X - (f.w - 14)) / 2, ey = (m.Transform.GridLocation.Y - (f.h - 14)) / 2;
      const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      const exx = ex + DIR[r][0] * (m.Length - 1), eyy = ey + DIR[r][1] * (m.Length - 1);
      out.push({id: m.MachineID, entrance: S.blocks.some(b => b.x === ex && b.y === ey && /Under/i.test(b.cls)), exit: S.blocks.some(b => b.x === exx && b.y === eyy && /Under/i.test(b.cls)), ex, ey, exx, eyy});
    }
    return out;
  }, UGS);
  const bad = cellsOk.filter(c => !c.entrance || !c.exit);
  chk('every underground: entrance tile + exit tile at entrance+(L-1) cells', cellsOk.length === 10 && bad.length === 0, JSON.stringify(bad));
  const e54 = cellsOk.find(c => c.id === 42054);
  chk('42054: entrance cell -> exit cell is 2 cells east (raw -7 -> -3)', !!e54 && e54.exx === e54.ex + 2 && e54.eyy === e54.ey, JSON.stringify(e54));
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

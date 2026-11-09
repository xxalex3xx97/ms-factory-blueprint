// Save import keeps container inventories (Contents) and they survive export. Run: node tests/sav_contents.mjs [path/to/_S.sav]
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAV = process.argv[2] || 'C:/Users/SFidelis/AppData/Local/MainSequence/Saved/SaveGames/New Game 1-Autosave_S.sav';
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext()).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  await pg.evaluate(() => document.getElementById('impSav').click()); await pg.setInputFiles('#savFile', SAV); await pg.waitForSelector('#dSav[open]', {timeout: 60000});
  const r = await pg.evaluate(async () => {
    const l = __fb.parseSav(await document.getElementById('savFile').files[0].arrayBuffer());
    const cs = s => s.json.DefaultMachines.filter(m => /^BP_ContainerObject/.test(m.Class));
    const all = l.flatMap(cs), withC = all.filter(m => m.Contents);
    const unk = withC.flatMap(m => m.Contents).filter(c => !ITEMS[c.Item]).map(c => c.Item);
    const s = l.find(x => x.name === 'Silica Station');
    // import one station, export, compare Contents
    __fb.importJson(JSON.stringify(s.json)); const b = build();
    const a0 = JSON.stringify(cs(s).map(m => [m.MachineID, m.Contents])), a1 = JSON.stringify(b.DefaultMachines.filter(m => /^BP_ContainerObject/.test(m.Class)).map(m => [m.MachineID, m.Contents]));
    return {n: all.length, w: withC.length, unk, ice: cs(s).some(m => (m.Contents || []).some(c => c.Item === 'ITEM_WaterIce' && c.Count === 9600)), same: a0 === a1, bad: withC.some(m => m.Contents.some(c => !(c.Count >= 1) || c.Infinite !== false))};
  });
  chk('containers found in the save', r.n > 0, JSON.stringify(r));
  chk('some containers carry Contents', r.w > 0);
  chk('all item names map to site item ids', r.unk.length === 0, r.unk.join(','));
  chk('counts >= 1 and Infinite false', !r.bad);
  chk('Silica Station: a container holds 9600 Water Ice', r.ice);
  chk('imported Contents survive export unchanged', r.same);
  chk('no page errors', errs.length === 0, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

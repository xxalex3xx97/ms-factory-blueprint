// Container Contents round-trip: export -> import -> export must keep Contents identical. Run: node tests/container_contents.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {isDeepStrictEqual} from 'util';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext()).newPage();
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  const r = await pg.evaluate(() => {
    const st = CATALOG.blocks.find(b => b.name === 'BPO_Station_01'), cd = CATALOG.buildables.find(m => m.machineClass === 'BP_ContainerObject');
    const blk = {Class: st.class, GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0, BlockID: 1, PaletteID: 0};
    const mk = (x, id, extra) => ({Class: cd.machineClass, Transform: {GridLocation: {X: x, Y: 0}, Height: 0, GridRotation: 0}, MachineID: id, PaletteID: 0, ...extra});
    const first = [{Item: 'ironore', Count: 120}, {Item: 'nickelore', Count: 40}];
    // 3rd entry: duplicate item in input (must be summed on export), plus a non-container machine carrying Contents (must not be exported)
    __fb.importJson(JSON.stringify({Version: 2, DisplayName: 't', Blocks: [blk], DefaultMachines: [mk(-8, 1, {Contents: first.concat([{Item: 'ironore', Count: 5}, {Item: 'warpfuel', Count: 0, Infinite: true}])}), mk(0, 2, {})]}));
    const a = JSON.parse(JSON.stringify(build())), ct = x => x.DefaultMachines.filter(m => /Container/.test(m.Class)).map(m => m.Contents);
    __fb.importJson(JSON.stringify(a));
    const b = JSON.parse(JSON.stringify(build()));
    return {a: ct(a), b: ct(b), same: JSON.stringify(a.DefaultMachines) === JSON.stringify(b.DefaultMachines), ent: a.DefaultMachines[0], n: a.DefaultMachines.length, others: a.DefaultMachines.filter(m => !/Container/.test(m.Class) && 'Contents' in m).length};
  });
  console.log(JSON.stringify(r.ent));
  chk('2 containers exported', r.n === 2);
  chk('container with items has Contents, duplicates summed', isDeepStrictEqual(r.a[0].map(x => [x.Item, x.Count]), [['ironore', 125], ['nickelore', 40]]), JSON.stringify(r.a));
  chk('empty container omits Contents', r.a[1] === undefined, JSON.stringify(r.a));
  chk('re-import + export: Contents identical', isDeepStrictEqual(r.a, r.b), JSON.stringify([r.a, r.b]));
  chk('re-import + export: DefaultMachines identical', r.same);
  chk('infinite source goes to SiteOnly, not Contents', JSON.stringify(r.ent.SiteOnly) === JSON.stringify({Infinite: [{Item: 'warpfuel', Count: 0}]}) && !JSON.stringify(r.ent.Contents).includes('warpfuel'), JSON.stringify(r.ent));
  chk('non-containers never get Contents', r.others === 0);
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

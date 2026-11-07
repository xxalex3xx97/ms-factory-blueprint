// Industrial Dock (BPO_Dock_2): doors on both long sides, none on the short ends, at every rotation. Run: node tests/dock_doors.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext()).newPage();
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  for (const rot of [0, 1, 2, 3]) {
    const r = await pg.evaluate(rot => {
      const d = CATALOG.blocks.find(b => b.name === 'BPO_Dock_2');
      __fb.importJson(JSON.stringify({Version: 1, DisplayName: 't', Blocks: [{Class: d.class, GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: rot, BlockID: 1, PaletteID: 0}], DefaultMachines: []}));
      const a = __fb.areas(0), f = a.floors[0];
      return {eds: a.doors.map(x => x.ed).sort().join(''), w: f.w, h: f.h};
    }, rot);
    const long = r.h > r.w ? '02' : '13';
    chk(`rot ${rot}: floor ${r.w}x${r.h}, 2 doors on each long side (edges ${long}), none on short ends`, r.eds === long[0] + long[0] + long[1] + long[1], r.eds);
  }
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

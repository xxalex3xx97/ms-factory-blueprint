// Layout cut/copy + paste at every rotation / mirror: a block floor is 2 units smaller than its tile, so rotated or mirrored machines must stay on the floor (was: "across a wall / off the floor" at rotation 1, 2).
// Run: node tests/layout_paste_rot.mjs    Env: JSONF (default benchmark)
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TXT = fs.readFileSync(process.env.JSONF || 'C:/Users/SFidelis/Downloads/Beta_Honor_3_Central.json', 'utf8');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await br.newPage();
pg.on('pageerror', e => console.log('ERR', e.message));
await pg.goto(pathToFileURL(path.join(HERE, '..', 'index.html')).href);
await pg.waitForFunction(() => window.__fb && typeof clipT === 'function');
const res = await pg.evaluate(t => {
  __fb.importJson(t, true);
  const out = [];
  for (const [rot, fl] of [[0, false], [1, false], [2, false], [3, false], [0, true], [1, true], [2, true], [3, true]]) {
    setView('L'); sel = new Set(S.blocks.filter(b => !isM(b)).map(b => b.id)); copy();
    const n0 = S.blocks.length; pasting = {rot, fl}; hover = {x: 300, y: 300};
    let refused = null; const orig = placeRefused; window.placeRefused = b => { refused = b.length };
    try { pasteAt() } catch (e) { refused = 'ERR ' + e.message }
    window.placeRefused = orig;
    out.push({rot, fl, refused, added: S.blocks.length - n0, clip: clip.length});
    while (S.blocks.length > n0) S.blocks.pop();
  }
  return out;
}, TXT);
let fail = 0;
for (const r of res) { const ok = r.refused === null && r.added === r.clip; if (!ok) fail++; console.log((ok ? 'PASS' : 'FAIL') + ' paste rot ' + r.rot + (r.fl ? ' mirrored' : '') + ' :: refused=' + r.refused + ' added=' + r.added + '/' + r.clip) }
await br.close();
console.log(fail ? 'FAILED ' + fail : 'PASS layout_paste_rot');
process.exit(fail ? 1 : 0);

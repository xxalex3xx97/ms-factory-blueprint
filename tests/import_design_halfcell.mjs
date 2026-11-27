// Headless check: a Designs .sav drawn in the game has blocks on a half-cell origin; after import every floor-0 machine must sit inside a block footprint.
// Run:  node tests/import_design_halfcell.mjs "<design>.sav"   (exit 1 on failure). Screenshot -> tests/import_design_halfcell.png
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAV = process.argv[2] || 'C:/Users/SFidelis/Downloads/Small Enrichment Mining Station.sav';
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 1;
try {
  const pg = await br.newPage({viewport: {width: 1400, height: 900}});
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href + '?engine=old');
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  await pg.click('#impSav');
  await pg.setInputFiles('#savFile', SAV);
  await pg.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Imported'), null, {timeout: 60000});
  const r = await pg.evaluate(() => {
    const rects = S.blocks.filter(b => !isM(b) && b.h === 0).map(b => { const f = dim(b); return [b.x * FC, b.y * FC, (b.x + f.w) * FC, (b.y + f.h) * FC]; });
    const out = S.blocks.filter(b => isM(b) && b.h === 0).filter(m => { const f = dim(m); return !rects.some(r => m.x >= r[0] && m.y >= r[1] && m.x + f.w <= r[2] && m.y + f.h <= r[3]); });
    return {n: S.blocks.filter(b => isM(b) && b.h === 0).length, out: out.length, ex: out.slice(0, 3).map(m => m.cls + ' ' + m.x + ',' + m.y)};
  });
  console.log(JSON.stringify(r), errs.join('|'));
  await pg.screenshot({path: path.join(ROOT, 'tests', 'import_design_halfcell.png')});
  bad = r.out || errs.length ? 1 : 0;
  console.log(bad ? 'FAIL' : 'PASS');
} finally { await br.close(); }
process.exit(bad);

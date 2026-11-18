// dock_tags: generated dock names carry the mining-mod tag words (cmpDockTag in js/cmp_dock.js).
// Every ore-only dock -> "[AUTO-FILTER] " + one tag per ore (first appearance, deduplicated); non-ore, mixed or none -> ''. Name survives the blueprint export.
// Run: node tests/dock_tags.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof cmpDockTag === 'function');
  const r = await page.evaluate(() => {
    S.blocks = [{id: 1, cls: plcCls('BPO_Dock'), x: 0, y: 0, h: 0, rot: 0, pid: 0, nm: cmpDockTag(['titaniumore', '', ''])}];
    return {one: cmpDockTag(['titaniumore', '']), two: cmpDockTag(['nickelore', 'waterice']), three: cmpDockTag(['titaniumore', 'nickelore', 'cobaltore']), dup: cmpDockTag(['nickelore', 'nickelore', 'waterice']), ice: cmpDockTag(['waterice']), non: cmpDockTag(['basiccircuit']), mix: cmpDockTag(['silica', 'basiccircuit']), none: cmpDockTag([]), name: __fb.build().Blocks[0].Name};
  });
  check(r.one === '[AUTO-FILTER] [TITANIUM]', 'one ore: ' + r.one);
  check(r.two === '[AUTO-FILTER] [NICKEL] [WATERICE]', 'two ores: auto-filter plus one tag per ore: ' + r.two);
  check(r.three === '[AUTO-FILTER] [TITANIUM] [NICKEL] [COBALT]', 'three ores in tag order: ' + r.three);
  check(r.dup === '[AUTO-FILTER] [NICKEL] [WATERICE]', 'duplicate ore keys deduplicated: ' + r.dup);
  check(r.ice === '[AUTO-FILTER] [WATERICE]', 'ice: ' + r.ice);
  check(r.non === '' && r.mix === '' && r.none === '', 'non-ore, mixed, none give no tag');
  check(r.name === '[AUTO-FILTER] [TITANIUM]', 'tag survives the blueprint export Name: ' + r.name);
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS dock_tags');
process.exit(fails ? 1 : 0);

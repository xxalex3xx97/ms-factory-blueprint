// Tile speed: one placerTile per layout+preview, no repeated cut of a candidate, result identical to the recorded HEAD values.
// Run: node tests/tile_speed.mjs   (env ROOT=<dir> to run against another copy, e.g. a b8dfec7 checkout; EXO=0 skips Exosuit)
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = process.env.ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext()).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerPreview === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const BASE = {'Basic Circuits 100': {blocks: 36, cols: 10, rows: 6, ms: 2377}, 'Exosuit 0.1': {blocks: 2368, cols: 138, rows: 28, ms: 285035}};   // HEAD b8dfec7, ov 0
const run = (name, rate) => pg.evaluate(async ([name, rate]) => {
  let tiles = 0, cuts = 0; const seen = new Map();
  const T0 = placerTileGen, C0 = placerCut;
  placerTileGen = (...a) => { tiles++; return T0(...a) };
  placerCut = (L, cls) => { const k = cls + '|' + L.w + 'x' + L.h + '|' + L.items.length + '|' + JSON.stringify(L.dk || 0); seen.set(k, (seen.get(k) || 0) + 1); cuts++; return C0(L, cls) };
  const t0 = performance.now();
  try {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const L = placerLayout(P, it, 1, 1, {box: $('plnBuf').value, mod: false, dock: null});
    if (!L.ok) return {err: L.why};
    plcL = L; placerPreview(L);
    while (plcT === null) await new Promise(r => setTimeout(r, 50));
    const T = plcT, dup = [...seen.values()].filter(v => v > 1).length;
    return {tiles, cuts, dup, ok: T.ok, blocks: T.blocks.length, cols: T.cols, rows: T.rows, ov: T.ov, ms: T.ms.length, secs: Math.round(performance.now() - t0) / 1000};
  } finally { placerTileGen = T0; placerCut = C0 }
}, [name, rate]);
const cases = [['Basic Circuits', 100]]; if (process.env.EXO !== '0') cases.push(['Exosuit', 0.1]);
for (const [n, r] of cases) {
  const x = await run(n, r); console.log(n, r, JSON.stringify(x));
  if (x.err) { check(false, n + ' layout: ' + x.err); continue }
  check(x.ok && !x.ov, n + ' T.ok, ov 0');
  check(x.tiles <= 1, n + ' tilings (placerTileGen) <= 1 (got ' + x.tiles + ')');
  check(x.dup === 0, n + ' no cut repeated for a candidate (dups ' + x.dup + ')');
  const b = BASE[n + ' ' + r];
  if (b) check(x.blocks === b.blocks && x.cols === b.cols && x.rows === b.rows && x.ms === b.ms, n + ' identical to HEAD ' + JSON.stringify(b));
}
check(!errs.length, 'no page errors ' + errs.join('|'));
await br.close(); process.exit(fails ? 1 : 0);

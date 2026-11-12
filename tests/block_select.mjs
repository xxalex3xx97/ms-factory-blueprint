// Block type select: each of 1x1/2x1/2x2 cuts only that type; choice persists across reload. Run: node tests/block_select.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
try {
  const pg = await (await br.newContext()).newPage();
  pg.on('pageerror', e => errs.push(e.message));
  const load = async () => { await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href); await pg.waitForFunction(() => window.__fb && typeof placerBk === 'function'); };
  await load();
  chk('default is 2x2', await pg.evaluate(() => $('plnBk').value) === 'BPO_Station_02');
  for (const cls of ['BPO_Station_01', 'BPO_Station_2x1', 'BPO_Station_02']) {
    await pg.evaluate(c => { $('plnBk').value = c; $('plnBk').dispatchEvent(new Event('change')); }, cls);
    const r = await pg.evaluate(() => {
      const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits'), P = plan(it, 100, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
      const L = placerLayout(P, it, 1, 1, {box: $('plnBuf').value, mod: false, dock: placerDock()});
      placerPreview(L);
      const T = plcT, want = plcCls($('plnBk').value);
      return {ok: !!(T && T.ok), why: T && T.why, ov: T && T.ov, n: T && T.ok ? T.blocks.length : 0, allCls: !!(T && T.ok && T.blocks.every(b => b.cls === want)), bk: placerBk()};
    });
    chk(`${cls}: tile ok`, r.ok, r.why); chk(`${cls}: ov 0`, !r.ov, String(r.ov)); chk(`${cls}: every block is ${cls}`, r.allCls && r.n > 0, JSON.stringify(r));
    chk(`${cls}: placerBk has exactly the one true`, r.bk.filter(Boolean).length === 1);
    await load();
    chk(`${cls}: persists after reload`, await pg.evaluate(() => $('plnBk').value) === cls);
  }
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

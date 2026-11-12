// pfBands step 5c: pfBandsBuild (layers, gutters, tall tile)
// Run:  node tests/pfb_build.mjs     Exit code 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof pfBandsBuild === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const r = await pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Magnetic Coils');
  const P = plan(it, 30, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const B = pfBandsBuild(P, it, 1);
  if (B.ok === false) return {refused: B.why};
  const c = pfCheck({items: B.items, w: B.w, h: B.h, ports: B.ports});
  const out = {nLayers: B.nLayers, w: B.w, h: B.h, ov: c.ov, ports: B.ports.length, south: B.ports.filter(p => p.edge === 'S').length,
    minX: Math.min(...B.items.map(q => q.x)), minY: Math.min(...B.items.map(q => q.y)), flag: PF_BANDS};
  const T = placerTile({ok: true, tall: true, items: B.items, w: B.w, h: B.h, mk: 1, pitch: B.h + 1, lanes: 1, ports: B.ports}, placerBk());
  out.tile = {ok: T.ok, why: T.ok ? '' : String(T.why), ov: T.ov, span: T.span};
  return out;
});
console.log(JSON.stringify(r));
check(!r.refused, 'pfBandsBuild ok' + (r.refused ? ' (' + r.refused + ')' : ''));
if (!r.refused) {
  check(r.ov === 0, 'pfCheck ov 0 (' + r.ov + ')');
  check(r.south === 1 && r.ports === 1, 'one S port (' + r.ports + ')');
  check(r.minX >= 1 && r.minY >= 1, 'items x,y >= 1 (' + r.minX + ',' + r.minY + ')');
  check(r.tile.ok, 'tall tile ok' + (r.tile.ok ? '' : ' (' + r.tile.why + ')'));
  check(r.tile.ov === 0, 'tile ov 0 (' + r.tile.ov + ')');
  check(r.tile.span === 0, 'tile span 0 (' + r.tile.span + ')');
  check(r.flag === false, 'PF_BANDS still false');
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

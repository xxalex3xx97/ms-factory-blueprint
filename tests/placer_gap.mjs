// gapRow fast vs old: node tests/placer_gap.mjs. Per case: modes cmp (stat.bad must be 0), old, new; results must be identical.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof nlTop === 'function' && typeof placerTile === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const run = (name, rate, mode) => pg.evaluate(([name, rate, mode]) => {
  PLC_GAP_OLD = mode === 'old'; PLC_GAP_CMP = mode === 'cmp'; PLC_GAP_STAT = {n: 0, bad: 0, tOld: 0, tNew: 0};
  const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 };
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
  const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = nlTop(P, it, 1, 0, {});
  if (!L.ok) return {refused: L.why};
  const t0 = performance.now(), T = placerTile(L, placerBk()), ms = Math.round(performance.now() - t0);
  const stat = {...PLC_GAP_STAT};
  PLC_GAP_CMP = false;
  if (!T.ok) return {tileFail: String(T.why).slice(0, 200), ms, stat};
  return {ok: T.ok, ov: T.ov, span: T.span, blocks: T.blocks.length, rc: T.rc, bh: fnv(JSON.stringify(T.blocks)), mh: fnv(JSON.stringify(T.ms.map(q => [q.cls, q.x, q.y, q.rot]))), nms: T.ms.length, ms, stat};
}, [name, rate, mode]);
for (const [name, rate] of [['Basic Circuits', 100], ['Advanced Circuits', 10], ['Exosuit', 0.1]]) {
  const tag = name + ' ' + rate, r = {};
  for (const m of ['cmp', 'old', 'new']) { r[m] = await run(name, rate, m); console.log(tag, m, JSON.stringify(r[m])) }
  if (r.cmp.refused || r.cmp.tileFail) { check(false, tag + ': ' + (r.cmp.refused || r.cmp.tileFail)); continue }
  const s = r.cmp.stat;
  check(s.bad === 0, tag + ': cmp bad ' + s.bad + ' of n ' + s.n);
  check(s.n >= 1, tag + ': gapRow called ' + s.n + 'x (tOld ' + s.tOld.toFixed(0) + ' ms, tNew ' + s.tNew.toFixed(0) + ' ms)');
  const k = ['ok', 'ov', 'span', 'rc', 'blocks', 'bh', 'mh', 'nms'];
  check(k.every(f => JSON.stringify(r.old[f]) === JSON.stringify(r.new[f])), tag + ': old == new ' + k.map(f => f + '=' + r.new[f]).join(' '));
  check(r.new.ov === 0, tag + ': ov 0');
  console.log(tag, 'tile ms old', r.old.ms, 'new', r.new.ms);
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails ? 1 : 0);

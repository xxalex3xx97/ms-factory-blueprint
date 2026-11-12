// S0 probe: Station_03 (2x2 C) + BPO_StationAdapter_01 + docks. Run: node tests/c2x2_probe.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + (c ? '' : d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext()).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href + '?engine=old');
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  const run = (bl, ok, no, rects) => pg.evaluate(([bl, ok, no, rects]) => {
    const cl = n => CATALOG.blocks.find(b => b.name === n).class;
    __fb.S.blocks = bl.map((d, i) => ({id: i + 1, cls: cl(d.n), x: d.x, y: d.y, h: 0, rot: d.r || 0, pid: 0}));
    const a = __fb.areas(0), inR = (x, y) => a.rects.some(r => x >= r.x && y >= r.y && x + 1 <= r.x + r.w && y + 1 <= r.y + r.h);
    return {ok: ok.filter(b => !inR(b[0], b[1])), no: no.filter(b => inR(b[0], b[1])),
      rects: rects.map(([x, y, w, h]) => a.rects.some(r => r.x === x && r.y === y && r.w === w && r.h === h)),
      mis: a.mis.length, dr: (a.doors || []).length,
      fl: a.floors.map(f => [f.x, f.y, f.w, f.h]), rr: a.rects.map(r => [r.x, r.y, r.w, r.h])};
  }, [bl, ok, no, rects]);
  const show = r => JSON.stringify({fl: r.fl, rr: r.rr, dr: r.dr});
  const rng = (xs, y0, y1) => xs.flatMap(x => Array.from({length: y1 - y0 + 1}, (_, i) => [x, y0 + i]));
  const S3 = {n: 'BPO_Station_03', x: 0, y: 0}, A = (x, y, r) => ({n: 'BPO_StationAdapter_01', x, y, r});
  const xs = [4, 6, 22, 24];
  let r = await run([S3, A(0, -1, 3)], [[6, -16], [7, -16], [6, -1], [4, -2], [25, -1]], [[3, -1], [26, -1]], []);
  chk('A adapter above: floor y=-16 30x14', r.fl.some(f => f[0] === 0 && f[1] === -16 && f[2] === 30 && f[3] === 14), show(r));
  chk('A mis 0', r.mis === 0, 'mis ' + r.mis + ' ' + show(r));
  chk('A belts allowed/refused', !r.ok.length && !r.no.length, 'notallowed ' + JSON.stringify(r.ok) + ' wrongly allowed ' + JSON.stringify(r.no) + ' ' + show(r));
  r = await run([S3, A(0, -1, 3), {n: 'BPO_Dock', x: 0, y: -2, r: 3}], rng([6, 7], -17, 0), [], [[4, -17, 6, 1]]);
  chk('B Dock (0,-2): belts (6,7) y -17..0, rect {4,-17,6,1}', !r.ok.length && r.rects[0], JSON.stringify(r.ok) + ' ' + show(r));
  r = await run([S3, A(0, -1, 3), {n: 'BPO_Dock', x: 1, y: -2, r: 3}], [[22, -17], [23, -17]], [], []);
  chk('B Dock (1,-2): (22,-17),(23,-17)', !r.ok.length, JSON.stringify(r.ok) + ' ' + show(r));
  r = await run([S3, A(0, -1, 3), {n: 'BPO_Dock_2', x: 0, y: -4, r: 3}], rng(xs, -19, -1), [], []);
  chk('C Dock_2 (0,-4): floor {0,-32,30,14}', r.fl.some(f => f[0] === 0 && f[1] === -32 && f[2] === 30 && f[3] === 14), show(r));
  chk('C belts x 4,6,22,24 y -19..-1', !r.ok.length, JSON.stringify(r.ok) + ' ' + show(r));
  chk('C mis 0, >=2 doors', r.mis === 0 && r.dr >= 2, 'mis ' + r.mis + ' dr ' + r.dr + ' ' + show(r));
  r = await run([S3, A(0, 2, 1)], rng([6, 7], 29, 45), [], []);
  chk('D floor {0,32,30,14}, belts (6,7) y 29..45', r.fl.some(f => f[0] === 0 && f[1] === 32 && f[2] === 30 && f[3] === 14) && !r.ok.length, JSON.stringify(r.ok) + ' ' + show(r));
  r = await run([S3, A(0, 2, 1), {n: 'BPO_Dock', x: 0, y: 3, r: 1}], [[6, 46], [7, 46]], [], []);
  chk('D+Dock belts (6,46),(7,46)', !r.ok.length, JSON.stringify(r.ok) + ' ' + show(r));
  r = await run([S3, A(0, 2, 1), {n: 'BPO_Dock_2', x: 0, y: 3, r: 1}], rng(xs, 29, 48), [], []);
  chk('E Dock_2 floor {0,48,30,14}, belts y 29..48, mis 0', r.fl.some(f => f[0] === 0 && f[1] === 48 && f[2] === 30 && f[3] === 14) && !r.ok.length && r.mis === 0, JSON.stringify(r.ok) + ' mis ' + r.mis + ' ' + show(r));
  r = await run([S3, {n: 'BPO_Station_03', x: 2, y: 0}], rng([30, 31], 4, 25), [30, 31].flatMap(x => [[x, 3], [x, 26]]), []);
  chk('F two tiles: x=30,31 y 4..25 ok, y 3/26 refused, mis 0', !r.ok.length && !r.no.length && r.mis === 0, 'notallowed ' + JSON.stringify(r.ok) + ' wrongly ' + JSON.stringify(r.no) + ' mis ' + r.mis + ' ' + show(r));
  r = await run([S3, {n: 'BPO_Dock_2', x: 0, y: -3, r: 3}], [], [], []);
  chk('G no adapter: mis>0', r.mis > 0, 'mis ' + r.mis + ' ' + show(r));
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

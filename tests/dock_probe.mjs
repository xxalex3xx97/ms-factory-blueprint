// S0 probe: dock-relative coordinates (belts allowed next to Station_02 + Dock / Industrial Dock). Run: node tests/dock_probe.mjs
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
  const run = (docks, belts, rects) => pg.evaluate(([docks, belts, rects]) => {
    const cl = n => CATALOG.blocks.find(b => b.name === n).class;
    // direct model coords (importJson converts GridLocation to footprint centre, so it would shift the dock)
    __fb.S.blocks = [{n: 'BPO_Station_02', x: 0, y: 0, r: 0}, ...docks].map((d, i) => ({id: i + 1, cls: cl(d.n), x: d.x, y: d.y, h: 0, rot: d.r, pid: 0}));
    const a = __fb.areas(0), inR = (x, y, w, h) => a.rects.some(r => x >= r.x && y >= r.y && x + w <= r.x + r.w && y + h <= r.y + r.h);
    return {belts: belts.map(([x, y]) => [x, y, inR(x, y, 1, 1)]), rects: rects.map(([x, y, w, h]) => [x, y, w, h, a.rects.some(r => r.x === x && r.y === y && r.w === w && r.h === h)]),
      fl: a.floors.map(f => [f.x, f.y, f.w, f.h]), rr: a.rects.map(r => [r.x, r.y, r.w, r.h])};
  }, [docks, belts, rects]);
  const show = r => JSON.stringify({fl: r.fl, rr: r.rr});
  let r = await run([{n: 'BPO_Dock', x: 0, y: -1, r: 3}], [[6, -1], [7, -1]], [[4, -1, 6, 1]]);
  chk('Dock (0,-1) rot3: belts (6,-1),(7,-1) allowed', r.belts.every(b => b[2]), JSON.stringify(r.belts) + ' ' + show(r));
  chk('Dock (0,-1) rot3: rects has {4,-1,6,1}', r.rects[0][4], show(r));
  r = await run([{n: 'BPO_Dock', x: 1, y: -1, r: 3}], [[22, -1], [23, -1]], []);
  chk('Dock (1,-1) rot3: belts (22,-1),(23,-1) allowed', r.belts.every(b => b[2]), JSON.stringify(r.belts) + ' ' + show(r));
  r = await run([{n: 'BPO_Dock', x: 0, y: 2, r: 1}], [[6, 30], [7, 30]], []);
  chk('Dock (0,2) rot1: belts (6,30),(7,30) allowed', r.belts.every(b => b[2]), JSON.stringify(r.belts) + ' ' + show(r));
  const xs = [4, 6, 22, 24], col = y => xs.flatMap(x => y.map(v => [x, v]));
  r = await run([{n: 'BPO_Dock_2', x: 0, y: -3, r: 3}], col([-3, -2, -1]), []);
  chk('Dock_2 (0,-3) rot3: floor 30x14 at y=-16', r.fl.some(f => f[0] === 0 && f[1] === -16 && f[2] === 30 && f[3] === 14), show(r));
  chk('Dock_2 (0,-3) rot3: belts x 4,6,22,24 y -3..-1 allowed', r.belts.every(b => b[2]), JSON.stringify(r.belts.filter(b => !b[2])));
  r = await run([{n: 'BPO_Dock_2', x: 0, y: 2, r: 1}], col([30, 31, 32]), []);
  chk('Dock_2 (0,2) rot1: floor 30x14 at y=32', r.fl.some(f => f[0] === 0 && f[1] === 32 && f[2] === 30 && f[3] === 14), show(r));
  chk('Dock_2 (0,2) rot1: belts x 4,6,22,24 y 30..32 allowed', r.belts.every(b => b[2]), JSON.stringify(r.belts.filter(b => !b[2])));
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

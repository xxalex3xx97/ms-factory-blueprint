// pfFact S3: pfFactRoute west link (w), nofeed tap, yc. Geometry only (WL, TAP2, WX, WALL).
// Run:  timeout 120 node tests/pff_route2.mjs     Exit code 1 on FAIL or page error.
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
await pg.waitForFunction(() => window.__fb && typeof pfCompose === 'function' && typeof placerLayout === 'function' && typeof placerTile === 'function' && typeof simAdvance === 'function' && typeof pfFactTree === 'function' && typeof pfFactAlloc === 'function' && typeof pfFactRoute === 'function' && typeof pfSplOff === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

// geometry cases (runs in page): returns [[ok,msg],...]
const geo = () => {
  const out = [], ok = (c, m) => out.push([!!c, m]);
  const R = links => pfFactRoute(links, 1, 1);
  const B = PLC_BELT[1], U = PLC_UG[1], SP = PLC_SPL[1];
  const at = (items, x, y) => items.filter(q => q.x === x && q.y === y);
  // world faces of the off keys of a splitter item (rot taken from the item)
  const offFaces = q => {
    const pp = portsOf({cls: q.cls, x: 0, y: 0, rot: q.rot, off: []});
    return q.off.map(k => { const p = pp.find(p => p.key === k); return p ? FN[p.wf] : '?' }).sort().join('');
  };
  const pc = items => pfCheck({items, w: 40, h: 31, ports: []});

  // WL: west link, source col 20 -> run west on row 6 -> lane col 4 south to row 19
  let r = R([{w: true, xp: 20, xd: 4, yp: 2, t: 6, yc: 20}]);
  ok(r.ok, 'WL ok' + (r.ok ? '' : ' (' + r.why + ')'));
  const WL = r.ok ? r.items : [];
  ok([2, 3, 4, 5].every(y => { const q = at(WL, 20, y)[0]; return q && q.cls === B && q.rot === 1 }), 'WL (20,2..5) rot1 belts');
  ok(at(WL, 20, 6).length === 1 && at(WL, 20, 6)[0].cls === B && at(WL, 20, 6)[0].rot === 2, 'WL (20,6) rot2 corner');
  ok(Array.from({length: 15}, (_, i) => i + 5).every(x => { const q = at(WL, x, 6)[0]; return q && q.cls === B && q.rot === 2 }), 'WL (5..19,6) rot2 belts');
  ok(at(WL, 4, 6).length === 1 && at(WL, 4, 6)[0].cls === B && at(WL, 4, 6)[0].rot === 1, 'WL (4,6) rot1 lane start');
  ok(Array.from({length: 13}, (_, i) => i + 7).every(y => { const q = at(WL, 4, y)[0]; return q && q.cls === B && q.rot === 1 }), 'WL (4,7..19) rot1 belts');
  ok(WL.length === 34, 'WL total 34 items (' + WL.length + ')');
  ok(pc(WL).ov === 0, 'WL pfCheck ov 0');

  // TAP2: two taps, first with yc, second nofeed; trunks row 6 (x4..10) and row 12 (x4..14)
  r = R([{xp: 4, heads: [4, 10], t: 6, y1: 30, yc: 12, nofeed: true}, {xp: 4, heads: [14], t: 12, y1: 30, nofeed: true}]);
  ok(r.ok, 'TAP2 ok' + (r.ok ? '' : ' (' + r.why + ')'));
  const T2 = r.ok ? r.items : [];
  const s46 = at(T2, 4, 6)[0];
  ok(s46 && s46.cls === SP && s46.rot === 1 && offFaces(s46) === 'W', 'TAP2 (4,6) SP rot1 off W (keeps S,E)');
  const s106 = at(T2, 10, 6)[0];
  ok(s106 && s106.cls === SP && s106.rot === 0 && offFaces(s106) === 'EN', 'TAP2 (10,6) SP rot0 off EN (last head keeps S)');
  ok(Array.from({length: 5}, (_, i) => i + 7).every(y => { const q = at(T2, 4, y)[0]; return q && q.cls === B && q.rot === 1 }), 'TAP2 (4,7..11) rot1 belts');
  const c412 = at(T2, 4, 12)[0];
  ok(c412 && c412.cls === B && c412.rot === 0, 'TAP2 (4,12) belt rot0 corner');
  ok(Array.from({length: 9}, (_, i) => i + 5).every(x => { const q = at(T2, x, 12)[0]; return q && q.cls === B && q.rot === 0 }), 'TAP2 (5..13,12) rot0 belts');
  const s1412 = at(T2, 14, 12)[0];
  ok(s1412 && s1412.cls === SP && s1412.rot === 0, 'TAP2 (14,12) SP rot0');
  ok(at(T2, 10, 11)[0] && at(T2, 10, 11)[0].cls === U && at(T2, 10, 13)[0] && at(T2, 10, 13)[0].cls === U, 'TAP2 UG at (10,11) and (10,13)');
  ok(at(T2, 10, 12).length === 1 && at(T2, 10, 12)[0].cls === B && at(T2, 10, 12)[0].rot === 0, 'TAP2 (10,12) belt rot0');
  const cT = pc(T2);
  ok(cT.ov === 0, 'TAP2 pfCheck ov 0 (ov ' + cT.ov + ', seamBad ' + cT.seamBad + ')');

  // WX: west link (lane col 4) + tap trunk row 10 (x2..12) passing over the lane: lane dives under it
  r = R([{w: true, xp: 20, xd: 4, yp: 2, t: 6, yc: 20}, {xp: 2, yp: 2, heads: [6, 12], y1: 30, t: 10}]);
  ok(r.ok, 'WX ok' + (r.ok ? '' : ' (' + r.why + ')'));
  const WX = r.ok ? r.items : [];
  ok(at(WX, 4, 9)[0] && at(WX, 4, 9)[0].cls === U && at(WX, 4, 11)[0] && at(WX, 4, 11)[0].cls === U, 'WX lane UG pair at (4,9) and (4,11)');
  ok(at(WX, 4, 10).length === 1 && at(WX, 4, 10)[0].cls === B && at(WX, 4, 10)[0].rot === 0, 'WX only the tap trunk belt at (4,10)');
  const cX = pc(WX);
  ok(cX.ov === 0, 'WX pfCheck ov 0 (ov ' + cX.ov + ', seamBad ' + cX.seamBad + ')');

  // WALL: west lane on col 30 must dive under a tap trunk -> refused
  r = R([{xp: 28, yp: 2, heads: [32], y1: 30, t: 10}, {w: true, xp: 40, xd: 30, yp: 2, t: 6, yc: 20}]);
  ok(!r.ok && /wall column/.test(r.why), 'WALL west UG on col 30 refused (' + (r.ok ? 'ok' : r.why) + ')');
  return out;
};

const g = await pg.evaluate(geo);
for (const [o, m] of g) check(o, m);
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

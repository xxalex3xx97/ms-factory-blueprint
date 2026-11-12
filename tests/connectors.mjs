// Connector classes: Station 2x2 C (XLarge) next to Station 1x1 (Large) = no doorway + red hint; with a Station Adapter between = connected. Run: node tests/connectors.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext()).newPage();
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  const run = list => pg.evaluate(list => {
    const bl = list.map(([n, x, y, rot], i) => ({Class: CATALOG.blocks.find(b => b.name === n).class, GridLocation: {X: x, Y: y}, Height: 0, GridRotation: rot, BlockID: i + 1, PaletteID: 0}));
    __fb.importJson(JSON.stringify({Version: 1, DisplayName: 't', Blocks: bl, DefaultMachines: []}));
    const a = __fb.areas(0);
    return {paired: a.doors.filter(d => d.paired).length + a.gaps.length, mis: a.mis.length, n: S.blocks.length};
  }, list);
  const xl = await pg.evaluate(() => ['BPO_Station_03', 'BPO_StationCorridor_02', 'BPO_ElevatorBlock_02A', 'BPO_StationAdapter_01', 'BPO_Station_01'].map(n => (CATALOG.blocks.find(b => b.name === n).xl || []).join('')));
  chk('catalog xl sides: Station_03 ESWN, Corridor_02 EW, Elevator_02A ESWN, Adapter W, Station_01 none', xl.join(',') === 'ESWN,EW,ESWN,W,', xl.join(','));
  const a = await run([['BPO_Station_01', 0, 0, 0], ['BPO_Station_01', 2, 0, 0]]);
  chk('Station 1x1 + Station 1x1: connected, no hint', a.paired > 0 && a.mis === 0, JSON.stringify(a));
  const b = await run([['BPO_Station_01', 0, 0, 0], ['BPO_Station_03', 2, 0, 0]]);
  chk('Station 1x1 next to Station 2x2 C: not connected, hint', b.n === 2 && b.paired === 0 && b.mis > 0, JSON.stringify(b));
  const c = await run([['BPO_Station_03', 0, 0, 0], ['BPO_Station_03', 4, 0, 0]]);
  chk('Station 2x2 C next to Station 2x2 C: connected, no hint', c.paired > 0 && c.mis === 0, JSON.stringify(c));
  const d = await run([['BPO_Station_03', 0, 0, 0], ['BPO_StationAdapter_01', 4, 0, 0], ['BPO_Station_01', 6, 0, 0]]);
  chk('Station 2x2 C + Adapter + Station 1x1: both joints connected, no hint', d.n === 3 && d.paired >= 2 && d.mis === 0, JSON.stringify(d));
  const e = await run([['BPO_Station_03', 0, 0, 0], ['BPO_StationAdapter_01', 4, 0, 2], ['BPO_Station_01', 6, 0, 0]]);
  chk('Adapter turned round: its XLarge side faces the 1x1, hint shown', e.mis > 0, JSON.stringify(e));
  const f = await pg.evaluate(() => {
    const bl = [['BPO_Station_03', 0, 0, 0], ['BPO_StationAdapter_01', 4, 0, 0]].map(([n, x, y, rot], i) => ({Class: CATALOG.blocks.find(b => b.name === n).class, GridLocation: {X: x, Y: y}, Height: 0, GridRotation: rot, BlockID: i + 1, PaletteID: 0}));
    __fb.importJson(JSON.stringify({Version: 1, DisplayName: 't', Blocks: bl, DefaultMachines: []}));
    const a = areas(0), s = a.strips[0], t = id => noBuild([{id, x: s.x, y: s.y, w: 1, h: 1, l: 0}]), o = noBuild([{id: 9, x: s.x, y: s.y - 3, w: 1, h: 1, l: 0}]);
    const out = a.strips.some(q => q.w === 1 || q.h === 1), none = a.doors.filter(d => d.bx === 0 && d.by === 0).length;
    return {n: a.strips.length, in: !t(9), out: o, one: out, none, title: doorTxt(S.blocks[0]), t2: doorTxt(S.blocks[1])};
  });
  chk('Station 2x2 C open strips: buildable under STRICT, refused outside, no door objects, title open sides', f.n >= 4 && f.in && f.out && f.none === 0 && f.title === 'open sides' && f.t2 === 'open side', JSON.stringify(f));
  const g = await pg.evaluate(() => {
    __fb.importJson(JSON.stringify({Version: 1, DisplayName: 't', Blocks: [{Class: CATALOG.blocks.find(b => b.name === 'BPO_StationCorridor_02').class, GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0, BlockID: 1, PaletteID: 0}], DefaultMachines: []}));
    const r = floorRect(S.blocks[0]), W = SHAPES.BPO_StationCorridor_02.walls, sl = W.filter(w => w[2] - w[0] > 20), top = sl.find(w => w[1] < 0), bot = sl.find(w => w[1] > 0);
    return {w: r.w, h: r.h, ok: r.guess, top: -top[1], bot: bot[3] - r.h, x0: top[0], x1: top[2]};
  });
  chk('Corridor 2x2 floor 30x26 verified, centred in the 30-high hull (equal margin per glass side, floor x = glass x)', g.w === 30 && g.h === 26 && !g.ok && g.top === 2 && g.bot === 2 && g.x0 === 0 && g.x1 === 30, JSON.stringify(g));
  const h = await pg.evaluate(() => {
    const sh = SHAPES.BPO_ElevatorBlock_02A, hr = hatchRects(sh, false), has = (x, y) => hr.some(r => x > r[0] && x < r[2] && y > r[1] && y < r[3]);
    return {n: has(16, 9), w: has(9.5, 16), s: has(16, 23), e: has(22.5, 16), mid: has(16, 16), ip: sh.iports.length, cat: CATALOG.blocks.find(b => b.name === 'BPO_ElevatorBlock_02A').infoPorts};
  });
  chk('Elevator 2x2: N/W/S/E interior squares all hatched, centre column not; 24 info ports flagged verified:false', h.n && h.w && h.s && h.e && !h.mid && h.ip === 24 && h.cat.verified === false && h.cat.cells.length === 24, JSON.stringify(h));
} finally { await br.close(); }
console.log(bad ? bad + ' FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);

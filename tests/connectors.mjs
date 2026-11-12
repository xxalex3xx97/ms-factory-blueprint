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
} finally { await br.close(); }
console.log(bad ? bad + ' FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);

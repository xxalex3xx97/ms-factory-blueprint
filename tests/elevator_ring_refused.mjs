// Elevator 1x1: the 1x6 inset ring strip of a door slot stays buildable next to a neighbour with no matching door
// (Corner / Corridor / Station 2x2 C / Adapter). Run: node tests/elevator_ring_refused.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html')).href;
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1400, height: 900}})).newPage();
pg.on('dialog', d => d.dismiss().catch(() => {}));
let bad = 0;
// right neighbour (nx=1) / left neighbour (nx=-1); ring cells: right x=13, left x=0, rows 4..9
for (const [n, nx, rot] of [['BPO_Station_03', 1, 0], ['BPO_StationCorner_01', 1, 2], ['BPO_StationCorridor_01', 1, 1], ['BPO_StationAdapter_01', 1, 0], ['BPO_StationCorner_01', -1, 0], ['BPO_StationCorridor_01', -1, 1], ['BPO_Station_01', 1, 0]]) {
  await pg.goto(PAGE); await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  const ok = await pg.evaluate(([n, nx, rot]) => {
    const c = x => CATALOG.blocks.find(b => b.name === x).class, B = (cl, X, r) => ({Class: c(cl), GridLocation: {X, Y: 0}, Height: 0, GridRotation: r, BlockID: 0, PaletteID: 0});
    __fb.importJson(JSON.stringify({Version: 1, DisplayName: 't', Blocks: [B('BPO_ElevatorBlock_03', 0, 0), B(n, nx * 2, rot)], DefaultMachines: []}));
    if (!$('lvW').hidden) $('lvWX').click();
    __fb.setView('F'); document.querySelector('#palList .item[data-cls="DAT_ConveyorBelt"]').click();
    const x = nx > 0 ? 13 : 0, res = [];
    for (const y of [4, 6, 9]) { const n0 = __fb.S.blocks.length; __fb.click(x, y); res.push(__fb.S.blocks.length > n0); __fb.S.blocks.length = n0; }
    return res.every(Boolean);
  }, [n, nx, rot]);
  console.log(ok ? 'PASS' : 'FAIL', n, nx > 0 ? 'right' : 'left', 'rot', rot);
  if (!ok) bad++;
}
await br.close();
process.exit(bad ? 1 : 0);

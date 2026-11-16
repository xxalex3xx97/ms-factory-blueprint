// connGen (js/conn.js): doorway pieces of a design. Checked against the game's own designs by hand (every connector of Main Base, freight, ... matched); here: shared door dropped, elevator stack pair dropped, rotation applied. Run: node tests/conn_gen.mjs
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
  await pg.waitForFunction(() => window.__fb && typeof connGen === 'function');
  const r = await pg.evaluate(() => {
    const P = n => `/Game/Blueprints/BuildingBlocks/${n}.${n}_C`, B = (n, x, y, h, rot) => ({Class: P(n), GridLocation: {X: x, Y: y}, Height: h, GridRotation: rot});
    const k = c => c.Class.split('.').pop().replace('BPO_', '').replace('_C', '') + '@' + c.GridLocation.X + ',' + c.GridLocation.Y + ',h' + c.Height + ',r' + c.GridRotation;
    return {
      one: connGen([B('BPO_Station_01', 2, 2, 0, 0)]).map(k).sort(),
      two: connGen([B('BPO_Station_01', 2, 2, 0, 0), B('BPO_Station_01', 6, 2, 0, 0)]).length,
      corner: connGen([B('BPO_StationCorner_01', 2, 2, 0, 1)]).map(k).sort(),
      stack: connGen([B('BPO_ElevatorBlock_03', 2, 2, 0, 0), B('BPO_ElevatorBlock_03', 2, 2, 2, 0)]).filter(c => /Connector_08/.test(c.Class)).map(k).sort()
    };
  });
  chk('one Station 1x1: 4 doors, rotations 0..3 at the 4 edges', JSON.stringify(r.one) === JSON.stringify(['LargeConnector@0,2,h0,r2', 'LargeConnector@2,0,h0,r3', 'LargeConnector@2,4,h0,r1', 'LargeConnector@4,2,h0,r0']), JSON.stringify(r.one));
  chk('two Station 1x1 side by side: the shared door is dropped (8 - 2 = 6)', r.two === 6, String(r.two));
  chk('Corner at rotation 1: its 2 doors turn with it', JSON.stringify(r.corner) === JSON.stringify(['LargeConnector@0,2,h0,r2', 'LargeConnector@2,0,h0,r3']), JSON.stringify(r.corner));
  chk('elevator stack of 2: only the bottom of the lower and the top of the upper remain', JSON.stringify(r.stack) === JSON.stringify(['Connector_08B@2,2,h0,r0', 'Connector_08T@2,2,h4,r0']), JSON.stringify(r.stack));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

// Design saves list BPO_LargeConnector pieces as blocks: they must not appear in the layout but must survive export. Run: node tests/hide_connectors.mjs
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
  const r = await pg.evaluate(() => {
    const cl = n => CATALOG.blocks.find(b => b.name === n).class;
    const B = (c, x, y, i) => ({Class: c, GridLocation: {X: x, Y: y}, Height: 0, GridRotation: 0, BlockID: i, PaletteID: 0});
    __fb.importJson(JSON.stringify({Version: 2, DisplayName: 't', Blocks: [B(cl('BPO_Station_01'), 2, 2, 1), B('/Game/Blueprints/BuildingBlocks/BPO_LargeConnector.BPO_LargeConnector_C', 0, 2, 2), B('/Game/Blueprints/BuildingBlocks/BPO_XLargeConnector.BPO_XLargeConnector_C', 4, 2, 3), B('/Game/Blueprints/BuildingBlocks/BPO_Connector_07B.BPO_Connector_07B_C', 6, 2, 4)], DefaultMachines: []}));
    const out = build(), n = S.blocks.length;
    __fb.importJson(JSON.stringify(out));
    const res = {n, conn: S.conn.length, out: out.Blocks.map(b => b.Class.split('.').pop()), n2: S.blocks.length, c2: S.conn.length};
    __fb.importJson(JSON.stringify({Version: 1, DisplayName: 't', Blocks: [{Class: '/Game/Blueprints/BuildingBlocks/BPO_LargeConnector.BPO_LargeConnector_C', GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0, BlockID: 1, PaletteID: 0}], DefaultMachines: []}));
    res.v1conn = S.conn.length;
    return res;
  });
  chk('connectors hidden, kept aside (incl. Connector_07B)', r.n === 1 && r.conn === 4, JSON.stringify(r));
  chk('export writes the generated doorway pieces (Station 1x1 alone: 4 open doors), not the imported ones', r.out.length === 5 && r.out.filter(c => /^BPO_LargeConnector_C$/.test(c)).length === 4, JSON.stringify(r));   // js/conn.js: connGen
  chk('round trip stable', r.n2 === 1 && r.c2 === 4, JSON.stringify(r));   // the 4 generated pieces come back as the kept-aside connectors
  chk('v1 JSON untouched (no split)', r.v1conn === 0, JSON.stringify(r));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

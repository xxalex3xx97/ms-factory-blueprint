// Inspector Ports: "All off" / "All on" buttons flip every toggleable port in one click. Run: node tests/ports_all.mjs
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
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href + '?engine=old');
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  await pg.evaluate(() => {
    const st = CATALOG.blocks.find(b => b.name === 'BPO_Station_01');
    const blk = {Class: st.class, GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0, BlockID: 1, PaletteID: 0};
    const m = {Class: 'BP_ContainerObject', Transform: {GridLocation: {X: -8, Y: 0}, Height: 0, GridRotation: 0}, MachineID: 1, PaletteID: 0};
    __fb.importJson(JSON.stringify({Version: 2, DisplayName: 't', Blocks: [blk], DefaultMachines: [m]}));
    const b = S.blocks.find(x => x.cls === 'DAT_Container'); setView('F'); setLayer(b.h); sel = new Set([b.id]); all();
    document.querySelector('details[data-sec="ports"]').open = true;
  });
  const n = () => pg.evaluate(() => { const b = S.blocks.find(x => x.cls === 'DAT_Container'); return portsOf(b).filter(p => p.tg && !p.en).length + '/' + portsOf(b).filter(p => p.tg).length; });
  chk('buttons shown', await pg.locator('button[data-pall]').count() === 2);
  await pg.click('button[data-pall="0"]'); const off = await n();
  chk('All off disables every port', off.split('/')[0] === off.split('/')[1] && off !== '0/0', off);
  await pg.click('button[data-pall="1"]'); const on = await n();
  chk('All on enables every port', on.startsWith('0/'), on);
  chk('no page errors', errs.length === 0, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

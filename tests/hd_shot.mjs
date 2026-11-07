// Throwaway: HD icon screenshot of Layout view at high zoom. Run: node tests/hd_shot.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href;
const OUT = path.join(HERE, 'shots', 'hd-icons-layout.png');

const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const errs = [];
try {
  const ctx = await br.newContext({viewport: {width: 1400, height: 900}, deviceScaleFactor: 2});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  pg.on('dialog', d => { d.dismiss().catch(() => {}); });
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  const BLK = await pg.evaluate(() => Object.fromEntries(CATALOG.blocks.map(b => [b.name, b.class])));
  const blk = (name, x, y) => ({Class: BLK[name], GridLocation: {X: x * 2, Y: y * 2}, Height: 0, GridRotation: 0, BlockID: 0, PaletteID: 0});
  const obj = {Version: 1, DisplayName: 'hd', DefaultMachines: [], Blocks: [
    blk('BPO_Station_01', 0, 0), blk('BPO_Station_02A', 3, 0), blk('BPO_ElevatorBlock_03', 7, 0),
    blk('BPO_Dock', 0, 4), blk('BPO_ShipyardCore', 4, 4)]};
  await pg.evaluate(t => __fb.importJson(t), JSON.stringify(obj));
  await pg.evaluate(() => { __fb.setView('L'); __fb.fit(); });
  await pg.waitForTimeout(300);
  console.log('zoom ' + (await pg.evaluate(() => Math.round(__fb.V.z * 100))) + '%');
  await pg.screenshot({path: OUT});
  console.log('saved ' + OUT);
  await ctx.close();
} finally {
  await br.close();
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');

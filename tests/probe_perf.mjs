// Scratch probe (tester): real paint/simStep medians on Test (8).json. Not part of harness.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href;
const txt = fs.readFileSync('C:/Users/SFidelis/Downloads/Test (8).json', 'utf8');
const med = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const ctx = await br.newContext({viewport: {width: 1400, height: 900}});
const pg = await ctx.newPage();
pg.on('pageerror', e => console.log('PAGEERROR', e.message));
await pg.goto(PAGE);
await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
await pg.evaluate(t => __fb.importJson(t, true), txt);
await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); });
const timePaint = () => pg.evaluate(() => { __fb.paint(); const t = []; for (let i = 0; i < 30; i++) { const a = performance.now(); __fb.paint(); t.push(performance.now() - a) } return t });
const idle = await timePaint();
console.log('blocks', await pg.evaluate(() => __fb.S.blocks.length));
console.log('paint idle median ms', med(idle).toFixed(2), 'max', Math.max(...idle).toFixed(2));
await pg.click('#sm');
await pg.evaluate(() => __fb.simRun(600));
const on = await timePaint();
console.log('paint sim-on median ms', med(on).toFixed(2), 'max', Math.max(...on).toFixed(2));
const st = await pg.evaluate(() => { const t = []; for (let i = 0; i < 60; i++) { const a = performance.now(); __fb.simStep(); t.push(performance.now() - a) } return t });
console.log('simStep median ms', med(st).toFixed(3));
// independent sim checks
const r = await pg.evaluate(() => {
  const s = __fb.simState(), ms = Object.values(s.M);
  const c = id => s.C[id] ? s.C[id].stock : null;
  return {working: ms.filter(m => m.st === 'working').length, n: ms.length, cycles: ms.reduce((a, m) => a + m.cycles, 0),
    c325: c(325), c326: c(326), c7: c(7), c7inf: s.C[7] && s.C[7].inf};
});
console.log(JSON.stringify(r));
// storage->storage: run more ticks, end containers must keep rising (fill)
const a = await pg.evaluate(() => __fb.simRun(300) || __fb.simState().C[325].stock.ITEM_TitaniumPlates);
const b = await pg.evaluate(() => __fb.simState().C[325].stock.ITEM_TitaniumPlates + __fb.simState().C[326].stock.ITEM_TitaniumPlates);
console.log('plates 325+326 after +300 ticks', b);
await br.close();

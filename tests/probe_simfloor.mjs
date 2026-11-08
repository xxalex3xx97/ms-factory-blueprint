// Scratch probe (coder): sim init / step / paint timing per floor, cur:false vs cur:true, on Beta_Honor_3_Central.json. Not part of harness.
// Run: node F:/ms-fb-simfloor/tests/probe_simfloor.mjs
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href;
const txt = fs.readFileSync('C:/Users/SFidelis/Downloads/Beta_Honor_3_Central.json', 'utf8');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const ctx = await br.newContext({viewport: {width: 1400, height: 900}});
const pg = await ctx.newPage();
pg.on('pageerror', e => console.log('PAGEERROR', e.message));
await pg.goto(PAGE);
await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
await pg.evaluate(t => __fb.importJson(t, true), txt);
await pg.evaluate(() => { __fb.setView('F'); __fb.fit(); });
await pg.click('#simB');   // opens the simulation modal (smSet(true)) so paint draws the sim
const floors = await pg.evaluate(() => [...new Set(__fb.S.blocks.map(b => b.h))].sort((a, b) => a - b));
console.log('blocks total', await pg.evaluate(() => __fb.S.blocks.length), 'floors', JSON.stringify(floors));
// one run per (floor, mode); h=null = all floors (cur:false only)
const probe = (h, cur) => pg.evaluate(([h, cur]) => {
  const med = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
  if (h != null) __fb.setLayer(h);
  const own = __fb.S.blocks.filter(b => h == null || b.h === h).length;
  const t0 = performance.now(); __fb.simInit({cur}); const init = performance.now() - t0;
  __fb.SIM.sig = __fb.simSig();
  __fb.simRun(60);
  const ents = __fb.SIM.M.size + __fb.SIM.C.size;
  const st = []; for (let i = 0; i < 30; i++) { const a = performance.now(); __fb.simStep(); st.push(performance.now() - a); }
  __fb.SIM.sig = __fb.simSig();
  const pt = []; for (let i = 0; i < 30; i++) { const a = performance.now(); __fb.paint(); pt.push(performance.now() - a); }
  return {own, ents, init, step: med(st), paint: med(pt)};
}, [h, cur]);
const fmt = (x) => `blocks=${x.own} simEntries=${x.ents} init=${x.init.toFixed(2)}ms step_med=${x.step.toFixed(3)}ms paint_med=${x.paint.toFixed(2)}ms`;
const out = [];
for (const h of floors) {
  const off = await probe(h, false), on = await probe(h, true);
  out.push({h, off, on});
  console.log(`floor ${h} cur:false  ${fmt(off)}`);
  console.log(`floor ${h} cur:true   ${fmt(on)}`);
}
const all = await probe(null, false);
console.log(`all   cur:false  ${fmt(all)}`);
await br.close();

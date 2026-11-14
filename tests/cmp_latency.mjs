// Production-path latency: the planner preview as the UI calls it (placerGo with the form fields set), no test harness, no mutation. Prints ms until the tile exists, per case, docks off and industrial in+out, 2x2.
// Run: node tests/cmp_latency.mjs [out.json]   (env NOMEMO=1 keeps the compose memo off; default as production). Each case timed twice: cold (first) and again after changing the rate by +1.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof plan === 'function');
if (process.env.NOMEMO) await pg.evaluate(() => { window.CMP_MEMO = false });
const run = (name, rate, ind) => pg.evaluate(async ([name, rate, ind]) => {
  const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
  $("plnItem").value = item; $("plnRate").value = rate; $("plnMk").value = 1; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
  $("plnDkI").checked = !!ind; $("plnDkO").checked = !!ind; if (ind) $("plnDk").value = 'ind'; $("plnDkOT").value = ind ? 'ind' : '';
  $("plnBk").value = 'BPO_Station_02';
  const t = performance.now(); placerGo();
  for (let i = 0; i < 6000 && !(plcL ? plcT !== null : $("plnPrevErr").textContent); i++) await new Promise(r => setTimeout(r, 5));
  return Math.round(performance.now() - t);
}, [name, rate, ind]);
const out = {};
for (const [name, rate] of [['Advanced Circuits', 5], ['Capacitor', 100], ['Basic Circuits', 100], ['Nickel Plates', 31], ['Enzyme', 30]]) for (const ind of [0, 1]) {
  const a = await run(name, rate, ind), b = await run(name, rate + 1, ind);
  out[name + ' ' + rate + (ind ? ' ind' : ' nodock')] = [a, b];
  console.log(name + ' ' + rate + (ind ? ' ind in+out' : ' no docks') + ': ' + a + ' ms, rate+1: ' + b + ' ms');
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
await br.close();

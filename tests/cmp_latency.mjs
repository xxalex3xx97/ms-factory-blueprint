// Production compute latency: placerLayout (the composer entry the preview calls) on a fresh plan, 2x2, no test harness, no mutation, compose memo OFF, 3 runs per case, prints median ms.
// Cases: Advanced Circuits 5 (no docks / industrial in+out / normal in+out / belt Mk3), Capacitor 100 (+ Mk3), Basic Circuits 99/100/101/130, Nickel 31, Enzyme 30.
// Run: node tests/cmp_latency.mjs [out.json]   (UI-level caching/debounce is not included: this is the engine cost of one recompute)
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof plan === 'function');
const IN = {in: 'ind', out: 'ind'}, NR = {in: 'nrm', out: 'nrm'};
const CASES = [['AC5 no docks', 'Advanced Circuits', 5, 1, null], ['AC5 industrial', 'Advanced Circuits', 5, 1, IN], ['AC5 normal docks', 'Advanced Circuits', 5, 1, NR], ['AC5 belt Mk3', 'Advanced Circuits', 5, 2, null],
  ['Capacitor 100', 'Capacitor', 100, 1, null], ['Capacitor 100 Mk3', 'Capacitor', 100, 2, null], ['BC 99', 'Basic Circuits', 99, 1, null], ['BC 100', 'Basic Circuits', 100, 1, null], ['BC 101', 'Basic Circuits', 101, 1, null], ['BC 130', 'Basic Circuits', 130, 1, null],
  ['Nickel 31', 'Nickel Plates', 31, 1, null], ['Enzyme 30', 'Enzyme', 30, 1, null]];
const out = {};
for (const [tag, name, rate, mk, dock] of CASES) {
  const ts = [];
  for (let k = 0; k < 3; k++) ts.push(await pg.evaluate(a => {
    window.CMP_ENGINE = true; window.CMP_MEMO = false; if (window.CMPR_MEMO) CMPR_MEMO.clear();   // cold every run
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === a.name), key = [].concat(...Object.values(RECS)).map(r => [r, rk(r)]).find(([r]) => r.o[0] === item)[1];
    const t = performance.now();
    const P = plan(item, a.rate, a.mk, {}, {[item]: key}, {proto: false, enr: false, obs: false});
    const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: 'BPO_Station_02'});
    return Math.round(performance.now() - t) + (L.ok ? 0 : 1e6);
  }, {name, rate, mk, dock}));
  ts.sort((a, b) => a - b); out[tag] = ts[1];
  console.log(tag.padEnd(18) + 'median ' + ts[1] + ' ms  (runs ' + ts.join(',') + ')');
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
await br.close();

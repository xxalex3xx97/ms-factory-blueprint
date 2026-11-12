// Observatory = no-floor block: Stellar Survey Data is an external raw input in No Limits. Run: node tests/nl_obs.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof nlPlanAll === 'function' && typeof nlFlow === 'function' && typeof nlTop === 'function');
const run = () => {
  const SSD = 'ITEM_StellarSurveyData', MSG = 'Stellar Survey Data comes from the Deep Space Observatory block (not placed)';
  const out = [], ok = (n, c, d) => out.push([n, !!c, c ? '' : String(d)]);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const pl = (it, r, o, mk = 1) => plan(it, r, mk, {sp: null, bal: null}, PLN_PICK, o || {proto: false, enr: false});
  const idOf = name => [...plnBy(false).keys()].find(i => plnNm(i) === name);
  const ids = [...new Set(Object.keys(RECS).flatMap(c => plnCb(c) ? [] : RECS[c].map(r => r.o[0])))];
  const rawOnly = ids.filter(i => !Object.keys(RECS).some(c => plnCb(c) && RECS[c].some(r => r.o[0] === i)));
  ok('A rawOnly', eq(rawOnly, [SSD]), JSON.stringify(rawOnly));
  for (const [name, rate] of [['Advanced Plate', 1]]) {
    const mk = rate > 1 ? 2 : 1, it = idOf(name), P = pl(it, rate, null, mk), t = name + ' ' + rate + ' Mk' + (mk + 1);   // 30/min: Basic Motor into Maglev Coupling is 180/min per machine, above the Mk2 belt (120) - unrelated to the Observatory
    const F = nlFlow(P, it, mk);
    ok(t + ' flow', F.ok, F.why);
    if (!F.ok) continue;
    const s = F.raws.find(x => x.item === SSD);
    ok(t + ' ssd raw', s, 'missing');
    if (s) { ok(t + ' ssd rate', Math.abs(s.rate - P.nodes[SSD].rate) < 1e-6, s.rate + ' vs ' + P.nodes[SSD].rate); ok(t + ' ssd belts', s.belts === Math.ceil(s.rate / F.cap - 1e-9), s.belts) }
    const bad = F.raws.filter(x => x.item !== SSD && !x.seed && plnBy(false).has(x.item)).map(x => x.item);
    ok(t + ' other raws', !bad.length, bad.join());
    const pa = nlPlanAll(F, mk)[0];
    ok(t + ' planAll', pa && pa.ok !== false, pa && pa.why);
    ok(t + ' nofp', eq(P.nofp, [SSD]), JSON.stringify(P.nofp));
  }
  for (const [name, rate] of [['Advanced Plate', 1], ['Exosuit', 0.1]]) {
    const it = idOf(name), P = pl(it, rate), L = nlTop(P, it, 1, 1, {}), t = name + ' ' + rate;
    ok(t + ' top', L.ok === true, L.why);
    ok(t + ' note', L.ok && L.note.join('|').includes(MSG), L.note && L.note.join('|'));
  }
  {
    const it = idOf('Advanced Plate'), P = pl(it, 1, {proto: false, enr: false, obs: true}), n = P.nodes[SSD];
    ok('planner tab SSD', n && n.crafter === 'CRAFT_DeepSpaceObservatory' && n.rec, JSON.stringify(n && n.crafter));
  }
  return out;
};
const res = await pg.evaluate('(' + run.toString() + ')()');
let fails = 0;
for (const [n, c, d] of res) { console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : ': ' + d)); if (!c) fails++ }
if (errs.length) { console.log('FAIL page errors: ' + errs.slice(0, 3).join(' | ')); fails++ }
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails ? 1 : 0);

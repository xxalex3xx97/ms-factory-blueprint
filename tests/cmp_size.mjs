// CMP C1 gate: cmpSize per sample x block (mk=1), page loads iface+bundle+registry+compose. Run: node tests/cmp_size.mjs  Exit 1 on FAIL or page error.
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof plan === 'function' && typeof plnBy === 'function');
if (!await pg.evaluate(() => typeof cmpSize === 'function')) for (const f of ['js/tpl/iface.js', 'js/tpl/bundle.js', 'js/tpl/registry.js', 'js/compose.js']) await pg.addScriptTag({path: path.join(ROOT, f)});
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
check(await pg.evaluate(() => Object.keys(TPLM).length === 10), 'bundle loads: 10 templates in one page with iface.js');
await pg.evaluate(() => { for (const r of TPL_REG) TPL_ON.add(r.id) });   // page-level enable for this gate only
const SAMPLES = [['Nickel Plates', 31], ['Nickel Plates', 480], ['Basic Circuits', 100], ['Capacitor', 100], ['Enzyme', 10], ['Advanced Circuits', 5]];
const BLOCKS = ['1x1', '1x2', '2x2', '2x2c'];
const sum = a => a.reduce((x, v) => x + v, 0);
for (const [name, rate] of SAMPLES) {
  const res = await pg.evaluate(([name, rate, BLOCKS]) => {
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    if (!item) return [{err: 'item not found'}];
    const P = plan(item, rate, 1, {}, {}, {proto: false, enr: false, obs: false});
    return BLOCKS.map(block => {
      const S = cmpSize(P, item, 1, 1, block);
      if (!S.ok) return {block, why: S.why};
      return {block, K: S.K, note: S.note, stages: S.stages.map(q => ({item: plnNm(q.item) || q.item, tpl: q.tpl, S: q.S, m: q.m, N: q.N, perStrip: q.perStrip, stripS: q.strips.map(x => x.S)}))};
    });
  }, [name, rate, BLOCKS]);
  for (const r of res) {
    const tag = `${name} ${rate} ${r.block}`;
    if (r.err) { check(false, tag + ' ' + r.err); continue }
    if (r.why) { console.log(`REFUSED ${tag}: ${r.why}`); continue }
    console.log(`OK ${tag}: K=${r.K}`);
    r.stages.forEach((q, i) => console.log(`   stage ${i} ${q.item} ${q.tpl} S=${q.S} m=${q.m} N=${q.N} n=[${q.perStrip}] stripS=[${q.stripS}]`));
    r.note.forEach(x => console.log('   note: ' + x));
    const last = r.stages[r.stages.length - 1];
    if (r.stages.length === 1) check(sum(last.perStrip) === last.N, tag + ': single stage sum n_j = planner N (' + sum(last.perStrip) + '=' + last.N + ')');
    else if (r.K === 1) check(r.stages.every(q => q.perStrip[0] === q.N), tag + ': multi-stage K=1 counts = planner N');
    else {
      check(sum(last.perStrip) === last.N, tag + ': K>1 final stage exact');
      check(r.stages.every(q => sum(q.perStrip) >= q.N && sum(q.perStrip) <= q.N + r.K - 1), tag + ': K>1 upstream within N..N+K-1');
    }
  }
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

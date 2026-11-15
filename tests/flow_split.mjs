// Demand-limited splitter split (water-filling + priority overflow). Calculator = js/model.js (flowLoad/splitShare/links1).
// Unit: 3 chained splitters, 120/min belt, consumers take 20 (or 100 with/without priority). Golden: tests/fixtures/vc_golden.json, every assembler must be supplied (no 'short').
// Run: node tests/flow_split.mjs   Exit 1 on FAIL.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href + '?engine=old';
const GOLD = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'vc_golden.json'), 'utf8')).b;
let total = 0; const fails = [], errs = [];
const chk = (n, c, d = '') => { total++; if (!c) fails.push(n + ' ' + d); console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); };
const near = (a, b) => Math.abs(a - b) < 1e-6;
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1280, height: 800}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE); await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');

  // 1) unit: splitters 100 -> 102 -> 104 -> end; outputs C1=101,C2=103,C3=105 (consumers), N1=102,N2=104,N3=106 (onward belts)
  const u = await pg.evaluate(() => {
    const sp = new Map([[100, [101, 102]], [102, [103, 104]], [104, [105, 106]]]);
    const run = (acc, pr) => {
      const A = new Map(Object.entries({101: acc, 103: 20, 105: 20, 102: Infinity, 104: Infinity, 106: Infinity}).map(([k, v]) => [+k, v]));
      const P = new Map(pr ? [[100, pr]] : []);   // priority only on the first splitter (tests 2a/2b)
      const o = __fb.flowLoad(new Map(), [{id: 100, item: 'X', rate: 120}], new Map(), sp, {acc: (id) => A.get(id), pr: P});
      const r = {}; o.forEach((e, k) => r[k] = Math.round(e.tot * 1000) / 1000); return r;
    };
    return {free: run(20, null), fairMachine: run(100, null), prioMachine: run(100, 101), prioSmall: run(20, 101)};
  });
  console.log(JSON.stringify(u));
  chk('3 chained splitters, 20/min consumers: onward 100/80/60', u.free[102] === 100 && u.free[104] === 80 && u.free[106] === 60, JSON.stringify(u.free));
  chk('3 chained splitters, 20/min consumers: each consumer 20', u.free[101] === 20 && u.free[103] === 20 && u.free[105] === 20, JSON.stringify(u.free));
  chk('no priority, machine takes 100: first output gets fair 60 (not 100)', u.fairMachine[101] === 60 && u.fairMachine[102] === 60, JSON.stringify(u.fairMachine));
  chk('priority on machine (takes 100): 100 to machine, 20 onward', u.prioMachine[101] === 100 && u.prioMachine[102] === 20, JSON.stringify(u.prioMachine));
  chk('priority on machine taking 20: same as no priority (100 onward)', u.prioSmall[101] === 20 && u.prioSmall[102] === 100, JSON.stringify(u.prioSmall));

  // 2) golden: 10-assembler template from snippets; every assembler must be supplied (no 'short')
  await pg.evaluate(g => { S.blocks = g; S.dm = []; }, GOLD);
  const g = await pg.evaluate(() => {
    const K = __fb.links();
    const asm = S.blocks.filter(b => /Assembler/.test(b.cls));
    const sup = asm.map(b => ({id: b.id, x: b.x, y: b.y, rows: __fb.supplyRows(b, K).map(r => [r.item.replace('ITEM_', ''), r.need, r.have, r.st])}));
    const loads = {}; K.load.forEach(e => e.items.forEach((v, k) => { const t = k.replace('ITEM_', '') + ' ' + (Math.round(v * 100) / 100); loads[t] = (loads[t] || 0) + 1; }));
    return {n: asm.length, sup, loads};
  });
  console.log(JSON.stringify(g.sup));
  console.log('belt loads (item load: count of belts): ' + JSON.stringify(g.loads));
  chk('golden: assemblers found', g.n >= 10, String(g.n));
  const bad = g.sup.flatMap(a => a.rows.filter(r => r[3] !== 'ok').map(r => a.id + ' ' + r.join(' ')));
  chk('golden: every assembler supplied == needed (no short / none)', g.n > 0 && bad.length === 0, bad.join('; '));
  chk('no page errors', errs.length === 0, errs.join(' | '));
} catch (e) {
  fails.push('exception ' + e.message); console.log('FAIL exception ' + e.message);
} finally {
  await br.close();
}
console.log(`${total - fails.length}/${total} passed`);
if (fails.length) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }

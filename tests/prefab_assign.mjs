// Prefab port assignment (step 2): pfAssign on real portsOf data. Plan examples as expectations; prints the real table.
// Run:  node tests/prefab_assign.mjs     Exit code 1 on any failed check or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof pfAssign === 'function' && typeof portsOf === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
// per-machine flows: k items, descending flow so the order is fixed
const flowsOf = k => Array.from({length: k}, (_, i) => ({item: 'I' + (i + 1), flow: 60 - i * 10}));
const cls = name => Object.keys(BASE).find(k => BASE[k].name === name);
const cases = [
  // [machine, k, expected {W rows, E rows, N rows, S rows, out row, pitch}]
  ['AdvancedAssembler', 4, {W: [2, 4], E: [2, 4], N: [], S: [], out: 6, pitch: 9}],
  ['Assembler', 3, {W: [1, 3], E: [1], N: [], S: [], out: 3, pitch: 5}],
  ['GrowthChamber', 3, {W: [2, 4], E: [2], N: [], S: [], out: 4, pitch: 5}],
  ['GrowthChamber', 4, {W: [2, 4], E: [2], N: [2], S: [], out: 4, pitch: 7}],
  ['Refinery', 1, {W: [1], E: [], N: [], S: [], out: 1, pitch: 3}],
  ['Refinery', 2, {W: [1], E: [], N: [1], S: [], out: 1, pitch: 5}],
];
const res = await pg.evaluate(({cases, flowsOf}) => {
  const f = {};
  const flows = k => Array.from({length: k}, (_, i) => ({item: 'I' + (i + 1), flow: 60 - i * 10}));
  const out = [];
  for (const [name, k] of cases) {
    const c = Object.keys(BASE).find(x => BASE[x].name === name);
    const a = pfAssign(c, k, flows(k));
    const b = pfAssign(c, k, flows(k));
    out.push({name, k, a, same: a === b});
  }
  const arm = pfAssign(Object.keys(BASE).find(x => BASE[x].name === 'Armoury'), 1, flows(1));
  const ref = pfAssign(Object.keys(BASE).find(x => BASE[x].name === 'Refinery'), 1, flows(1));
  const refused = pfAssign(Object.keys(BASE).find(x => BASE[x].name === 'Refinery'), 4, flows(4));
  return {rows: out, arm, refused, refMemo: pfAssign(Object.keys(BASE).find(x => BASE[x].name === 'Refinery'), 1, flows(1)) === ref};
}, {cases, flowsOf: null});
const rowsOf = a => ({W: a.W.map(p => p.row), E: a.E.map(p => p.row), N: a.N.map(p => p.row), S: a.S.map(p => p.row), out: a.out.row, pitch: a.pitch, off: a.off.join(' ')});
console.log('real table (k | machine | W | E | N | S | out E row | pitch | off):');
for (const row of res.rows) {
  const t = rowsOf(row.a);
  console.log(`${row.k} | ${row.name} | W ${t.W} | E ${t.E} | N ${t.N} | S ${t.S} | out ${t.out} | pitch ${t.pitch} | off ${t.off}`);
}
console.log('Armoury k=1: ' + JSON.stringify(res.arm));
console.log('Refinery k=4: ' + JSON.stringify(res.refused));
for (const [i, [name, k, exp]] of cases.entries()) {
  const row = res.rows[i], t = rowsOf(row.a);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  check(row.a.ok && same(t.W, exp.W) && same(t.E, exp.E) && same(t.N, exp.N) && same(t.S, exp.S) && t.out === exp.out && t.pitch === exp.pitch,
    `${name} k=${k}: W ${t.W} E ${t.E} N ${t.N} S ${t.S} out ${t.out} pitch ${t.pitch} (expect W ${exp.W} E ${exp.E} N ${exp.N} out ${exp.out} pitch ${exp.pitch})`);
  check(row.same, `${name} k=${k}: memo returns the same object`);
}
check(!res.arm.ok && res.arm.why === 'machine has no ports', 'Armoury refused: ' + res.arm.why);
check(!res.refused.ok && res.refused.why === 'not enough ports', 'Refinery k=4 refused: ' + res.refused.why);
check(res.refMemo, 'Refinery memo across calls');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

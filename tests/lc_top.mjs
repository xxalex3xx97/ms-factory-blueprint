// LC S6 lcBuild + lcTop gates. Run: node tests/lc_top.mjs   Exit 1 on FAIL or page error.
// Gates: L.ok; placerTile ok; pfCheck ov 0; tile ov 0 / span 0; machines == planner N per item (AC50 +1 max); one S out port; one sink container; no stack overflow.
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
await pg.waitForFunction(() => window.__fb && typeof lcTop === 'function' && typeof placerTile === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const cases = [['Basic Motor', 60, 0, 2, 55], ['Basic Circuits', 10, 0, 0, 0], ['Advanced Circuits', 10, 0, 0, 62], ['Advanced Circuits', 50, 1, 0, 310]];
const rows = [];
for (const [name, rate, slack, , oldBelts] of cases) {
  const r = await pg.evaluate(([name, rate]) => {
    LC_ENGINE = true;
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    let L;
    try { L = lcTop(P, it, 1, 0, {}) } catch (e) { return {thrown: e.message} }
    if (!L.ok) return {refused: L.why};
    const T = placerTile(L, placerBk());
    const chk = pfCheck({items: L.items, w: L.w, h: L.h, ports: L.ports});
    const F = lcFlow(P, it, 1);
    const cnt = {};
    for (const q of L.items) cnt[q.cls] = (cnt[q.cls] || 0) + 1;
    const mach = F.nodes.map(n => ({n: plnNm(n.item), N: n.N, got: 0, cls: n.cls}));
    const clsN = {};
    for (const n of F.nodes) clsN[n.cls] = (clsN[n.cls] || 0) + n.N;
    const clsGot = {};
    for (const c of Object.keys(clsN)) clsGot[c] = cnt[c] || 0;
    const outs = L.ports.filter(p => p.dir === 'out');
    const empty = L.items.filter(q => q.cls === PLC_BOX && q.ct && !q.ct.length && q.y + dim(q).h === L.h);
    return {note: L.note[0], prefab: L.prefab, tileOk: T.ok, tileWhy: T.ok ? '' : String(T.why).slice(0, 160), ov: chk.ov, tileOv: T.ov, tileSpan: T.span, clsN, clsGot, nOuts: outs.length, outEdges: outs.map(p => p.edge).join(','), sinks: empty.length, sinkOnOut: empty.filter(q => q.x === outs[0].off || q.x <= outs[0].off && q.x + 9 > outs[0].off).length, w: L.w, h: L.h, stat: L.stat, boxes: L.items.filter(q => q.cls === PLC_BOX).length, tileBlocks: T.blocks && T.blocks.length};
  }, [name, rate]);
  const tag = name + ' ' + rate;
  console.log(tag, JSON.stringify(r));
  if (r.thrown || r.refused) { check(false, tag + ' ' + (r.thrown ? 'threw ' + r.thrown : 'refused: ' + r.refused)); continue }
  check(/^Layout compiler/.test(r.note) && r.prefab, tag + ': ok + note');
  check(r.tileOk, tag + ': placerTile ok' + (r.tileOk ? '' : ' (' + r.tileWhy + ')'));
  check(r.ov === 0, tag + ': pfCheck ov ' + r.ov);
  check(r.tileOv === 0 && r.tileSpan === 0, tag + ': tile ov ' + r.tileOv + ' span ' + r.tileSpan);
  let mdiff = 0;
  for (const c of Object.keys(r.clsN)) mdiff += Math.abs(r.clsGot[c] - r.clsN[c]);
  const tot = Object.values(r.clsGot).reduce((a, b) => a + b, 0);
  check(mdiff <= slack, tag + ': machines ' + tot + ' vs planner ' + Object.values(r.clsN).reduce((a, b) => a + b, 0) + ' (diff ' + mdiff + ', allowed ' + slack + ')');
  check(r.nOuts === 1 && r.outEdges === 'S', tag + ': one S out port');
  check(r.sinks === 1, tag + ': single sink container (' + r.sinks + ')');
  rows.push({tag, blocks: r.stat.blocks, size: r.w + 'x' + r.h, belts: r.stat.belts, ug: r.stat.ug, spl: r.stat.spl, boxes: r.boxes, machines: r.stat.machines, bpm: (r.stat.belts / r.stat.machines).toFixed(1), old: oldBelts});
}
console.log('tag | blocks | w x h | belts | UG | spl | containers | machines | belts/machine | old belts');
for (const x of rows) console.log([x.tag, x.blocks, x.size, x.belts, x.ug, x.spl, x.boxes, x.machines, x.bpm, x.old].join(' | '));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

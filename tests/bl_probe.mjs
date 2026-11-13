// BL Z0 probe (page, no code change). Run: node tests/bl_probe.mjs   Prints facts for the block-zones plan; exit 1 only on page error or STOP condition (Container_2 without 4 N and 4 S ports).
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
await pg.waitForFunction(() => window.__fb && typeof blMachine === 'function' && typeof placerCut === 'function' && typeof plnBy === 'function' && typeof pfFactTree === 'function');
const r = await pg.evaluate(() => {
  const out = {};
  // 1. floor rects of PL_ALL
  out.floors = PL_ALL.map(nm => {const cls = plcCls(nm), f = floorRect({cls, x: 0, y: 0, h: 0, rot: 0}), d = dim({cls, rot: 0}); return {nm, cls, floor: [f.x, f.y, f.w, f.h], dim: [d.w, d.h]}});
  // 2. Large Container ports
  const C2 = 'DAT_Container_2';
  const cp = portsOf({cls: C2, x: 0, y: 0, rot: 0, off: []});
  out.container2 = {dim: dim({cls: C2, rot: 0}), ports: cp.map(p => [p.f, p.x, p.y, p.nx, p.ny, p.dir, p.key]), nN: cp.filter(p => p.f === 'N').length, nS: cp.filter(p => p.f === 'S').length};
  // 3. Refinery and Assembler dim + ports
  const mdl = nm => {const cls = plcCls(nm) || Object.keys(BASE).find(k => BASE[k].name === nm); return cls ? {cls, dim: dim({cls, rot: 0}), ports: portsOf({cls, x: 0, y: 0, rot: 0, off: []}).map(p => [p.f, p.x, p.y, p.nx, p.ny, p.dir, p.key])} : null};
  out.refinery = mdl('Refinery');
  out.assembler = mdl('Assembler');
  // 4. recipe scan: single-machine (all inputs raw), first with 3 ins and first with 4 ins
  const pb = plnBy(false);
  const rawOf = it => !pb.has(it);
  // every recipe with n inputs whose crafter is a placeable machine with >= n N-ports (direct feed); allRaw = all inputs raw (single stage)
  const scan = n => {
    const hits = [], seen = new Set();
    for (const c of Object.keys(RECS)) for (const rec of RECS[c]) {
      if (rec.i.length !== n || rec.i.some(([x]) => x === rec.o[0])) continue;
      const bd = plnCb(c), cls = bd && bd.key;
      if (!cls) continue;
      const nN = portsOf({cls, x: 0, y: 0, rot: 0, off: []}).filter(p => p.f === 'N' && p.dir !== 'out').length;
      if (nN < n) continue;
      const allRaw = rec.i.every(([x]) => rawOf(x));
      hits.push({allRaw, crafter: c, cls, rec: rk(rec), nN, blK1: blMachine(cls, 1).ok});
    }
    hits.sort((p, q) => (q.allRaw - p.allRaw) || (p.nN - q.nN));
    return {count: hits.length, first: hits.slice(0, 3)};
  };
  out.three = scan(3);
  out.four = scan(4);
  // 5. UG at a row cut: 2-row dummy, one vertical belt column crossing y=30 (rot 1 = south)
  const cls = plcCls('BPO_Station_02');
  const items = [];
  for (let y = 0; y < 60; y++) items.push({cls: PLC_BELT[1], x: 5, y, rot: 1, h: 0, pid: 0});
  const L = {items, w: 10, h: 60, pitch: 1, lanes: 1, tall: true, mk: 1};
  const P = placerCut(L, cls);
  out.cut = {ok: P.ok, why: P.why || null, rc: P.rc, ug: P.ug, ov: P.ov, span: P.span, blocks: P.blocks ? P.blocks.length : null, ugAt: P.ms ? P.ms.filter(m => PLC_UG.includes(m.cls)).map(m => [m.x, m.y, m.cls]) : null};
  return out;
});
console.log(JSON.stringify(r, null, 1));
await br.close();
let fail = 0;
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fail++ }
if (r.container2.nN < 4 || r.container2.nS < 4) { console.log('STOP Container_2 has fewer than 4 N or 4 S ports'); fail++ }
process.exit(fail ? 1 : 0);

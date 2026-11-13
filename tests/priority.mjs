// Splitter output priority: user file splitter (MachineID 86963, pr=[2,-1]) round trip, exclusivity, disable clears, rotate/copy, double-arrow shot.
// Run: node tests/priority.mjs   (file part skipped if the Downloads file is missing)
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href + '?engine=old';
const FILE = 'C:/Users/SFidelis/Downloads/Main_Base (11).json';
const FILE12 = 'C:/Users/SFidelis/Downloads/Main_Base (12).json';
const WANT = '01000300000000000000000000000000000002000000ffffffff03000000010101';
let total = 0; const fails = [], errs = [];
const chk = (n, c, d = '') => { total++; if (!c) fails.push(n + ' ' + d); console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); };
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: 1280, height: 800}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE); await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  const hex = id => pg.evaluate(id => (__fb.build().DefaultMachines.find(m => m.MachineID === id) || {}).ConfigHex, id);
  if (fs.existsSync(FILE)) {
    await pg.evaluate(t => __fb.importJson(t, true), fs.readFileSync(FILE, 'utf8'));
    chk('user splitter imports pr=[2,-1]', await pg.evaluate(() => JSON.stringify((S.blocks.find(b => b.mid === 86963) || {}).pr)) === '[2,-1]');
    chk('user splitter exports byte-identical', (await hex(86963)) === WANT, await hex(86963));
    // re-edit to the same priority: sig changes path -> re-encoded bytes must still equal
    await pg.evaluate(() => { const b = S.blocks.find(b => b.mid === 86963); delete b.cfgKeep; });
    chk('user splitter re-encoded (no cfgKeep) identical', (await hex(86963)) === WANT, await hex(86963));
  }
  await pg.evaluate(() => { S.blocks = []; S.dm = []; });
  const r = await pg.evaluate(() => {
    const o = {}, b = {id: 9001, mid: 5001, cls: 'DAT_Splitter', x: 5, y: 5, h: 0, rot: 0, pid: 0};
    S.blocks.push(b);
    const outs = () => portsOf(b).filter(p => p.dir === 'out');
    o.outs = outs().map(p => p.key + ':' + p.f);
    const [a, c] = [outs()[0], outs()[2]];
    togglePrio(b, a.key); o.p1 = JSON.stringify(b.pr);
    togglePrio(b, c.key); o.p2 = JSON.stringify(b.pr);          // exclusive
    o.dbl = outs().map(p => +p.pr).join('');
    o.hex1 = __fb.build().DefaultMachines[0].ConfigHex;
    // rotate: face-based, so the same local face keeps priority
    b.rot = 1; o.rotPr = outs().map(p => p.f + (p.pr ? '*' : '')).join(',');
    b.rot = 0;
    togglePort(b, c.key); o.cleared = b.pr === undefined;       // disabling clears
    togglePrio(b, c.key); o.disabledNoPrio = b.pr === undefined; // disabled cannot be priority
    togglePort(b, c.key); togglePrio(b, c.key);
    // round trip
    const J = JSON.stringify(__fb.build()), h0 = __fb.build().DefaultMachines[0].ConfigHex;
    __fb.importJson(J, true);
    const b2 = S.blocks.find(q => q.cls === 'DAT_Splitter');
    o.rt = JSON.stringify(b2.pr) + ' ' + (__fb.build().DefaultMachines[0].ConfigHex === h0);
    o.cfg = JSON.stringify(cfgOf(b2));
    return o;
  });
  console.log(JSON.stringify(r));
  chk('outputs are S,E,N faces', r.outs.length === 3);
  chk('priority set', r.p1 === '[2,-1]');
  chk('priority exclusive (other output replaces)', r.p2 === '[0,-1]' && r.dbl === '001', r.p2 + ' ' + r.dbl);
  chk('rotate keeps face-based priority', /S\*/.test(r.rotPr), r.rotPr);
  chk('disabling priority port clears it', r.cleared && r.disabledNoPrio);
  chk('export/import round trip keeps pr + hex', /^\[\d,-1\] true$/.test(r.rt), r.rt);
  chk('cfgOf carries pr (copy/paste)', /"pr":\[/.test(r.cfg), r.cfg);
  // belt balancers: prioA = E-face output, smaller y at rot 0 (pos 1) = 1, other = 0; local pos so it rotates with the block
  for (const cls of ['DAT_BeltBalancer_01', 'DAT_BeltBalancer_02', 'DAT_BeltBalancer_03']) {
    const o = await pg.evaluate(cls => {
      const r = {rots: []};
      S.blocks = [];
      for (let rot = 0; rot < 4; rot++) {
        const b = {id: 700 + rot, mid: 7000 + rot, cls, x: 5 + rot * 4, y: 5, h: 0, rot, pid: 0}; S.blocks.push(b);
        const outs = () => portsOf(b).filter(p => p.dir === 'out'), [u, l] = [outs().find(p => +p.pos === 1), outs().find(p => +p.pos === 2)];
        const geo = rot === 0 ? (u.y < l.y) : true;   // rot 0: pos 1 is the smaller y
        togglePrio(b, u.key); const a = JSON.stringify(b.pr), da = outs().map(p => +p.pr).join('');
        togglePrio(b, l.key); const c = JSON.stringify(b.pr), dc = outs().map(p => +p.pr).join('');
        togglePrio(b, outs()[0].key === l.key ? l.key : l.key); const cleared = b.pr === undefined;   // toggling the priority output again clears
        togglePrio(b, u.key); togglePort(b, u.key);
        const dis = b.pr === undefined; togglePort(b, u.key); togglePrio(b, l.key);
        const inp = portsOf(b).find(p => p.dir === 'in'); const before = JSON.stringify(b.pr); togglePrio(b, inp.key);
        r.rots.push({rot, geo, a, da, c, dc, cleared, dis, inpIgnored: before === JSON.stringify(b.pr), keep: JSON.stringify(b.pr)});
      }
      const J = JSON.stringify(__fb.build()); const h0 = __fb.build().DefaultMachines.map(m => m.ConfigHex).join();
      __fb.importJson(J, true);
      r.rt = S.blocks.map(b => JSON.stringify(b.pr)).join() + ' ' + (__fb.build().DefaultMachines.map(m => m.ConfigHex).join() === h0);
      return r;
    }, cls);
    console.log(cls, JSON.stringify(o));
    chk(`${cls}: pos1 -> [1,-1], pos2 -> [0,-1], exclusive, all rotations`, o.rots.every(x => x.geo && x.a === '[1,-1]' && x.da.replace(/0/g, '').length === 1 && x.c === '[0,-1]' && x.dc.replace(/0/g, '').length === 1), JSON.stringify(o.rots));
    chk(`${cls}: toggle clears, disabling clears, input port ignored`, o.rots.every(x => x.cleared && x.dis && x.inpIgnored && x.keep === '[0,-1]'));
    chk(`${cls}: export/import round trip`, o.rt === '[0,-1],[0,-1],[0,-1],[0,-1] true', o.rt);
  }
  if (fs.existsSync(FILE12)) {
    const TXT = fs.readFileSync(FILE12, 'utf8'), IN = JSON.parse(TXT);
    await pg.evaluate(t => __fb.importJson(t, true), TXT);
    const OUT = await pg.evaluate(() => __fb.build());
    const by = new Map(OUT.DefaultMachines.map(m => [m.MachineID, m]));
    const bad = IN.DefaultMachines.filter(m => /Balancer|Splitter/i.test(m.Class) && (by.get(m.MachineID) || {}).ConfigHex !== m.ConfigHex);
    chk('Main_Base (12): every balancer/splitter ConfigHex (or absence) identical', bad.length === 0, bad.map(m => m.MachineID + ':' + m.ConfigHex + ' -> ' + (by.get(m.MachineID) || {}).ConfigHex).join(' | '));
  }
  // shot: Factory view, shift+click on a port toggles priority
  await pg.evaluate(() => { __fb.importJson(JSON.stringify({Version: 1, DisplayName: 'p', DefaultMachines: [], Blocks: []})); S.blocks = [{id: 9001, cls: 'DAT_Splitter', x: 4, y: 4, h: 0, rot: 0, pid: 0}]; uid = 9100; __fb.setView('F'); all(); V.z = 6; V.ox = -100; V.oy = -100; all(); });
  const pos = await pg.evaluate(() => { const b = S.blocks[0], q = portsOf(b).filter(p => p.dir === 'out')[1], s = sc(), r = cv.getBoundingClientRect(); return [r.left + V.ox + (q.x + .5 + q.nx * .5) * s, r.top + V.oy + (q.y + .5 + q.ny * .5) * s, sc()]; });
  await pg.keyboard.down('Shift'); await pg.mouse.click(pos[0], pos[1]); await pg.keyboard.up('Shift');
  const got = await pg.evaluate(() => JSON.stringify(S.blocks[0].pr) + JSON.stringify(S.blocks[0].off) + view + JSON.stringify(S.blocks.length));
  chk('shift+click sets priority on that output', got.startsWith('[1,-1]'), got + ' zoom ' + pos);
  await pg.waitForTimeout(200);
  await pg.screenshot({path: path.join(HERE, 'shots', 'priority-arrow.png'), clip: {x: 420, y: 250, width: 520, height: 400}});
  await ctx.close();
} finally { await br.close(); }
chk('no page errors', errs.length === 0, errs.join('|'));
console.log(`${total - fails.length}/${total}`); fails.forEach(f => console.log('FAIL: ' + f));
process.exitCode = fails.length ? 1 : 0;

// H6b horizontal (zoned) normal docks, page. Run: node tests/bl_dockh.mjs   Exit 1 on FAIL or page error.
// Nickel Plates 480 (R=4, 1 container/side) and 720 (R=6, 2 containers/side), Large Container, zones engine and Auto. Cases in=nrm, out=nrm, in+out=nrm.
// Per case: L.bl.zoned, placerTile ok, ov 0, span 0, noBuild false, BPO_Dock count == containers per side, every in container has rot-0 belts on its lane rows (x-1), every out container rot-0 belts east of it, all cells x>=0.
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
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof blTop === 'function' && typeof pfCompose === 'function' && typeof placerTile === 'function' && typeof noBuild === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const cases = [['Nickel Plates', 480], ['Nickel Plates', 720]];
const docks = {in: {in: 'nrm', out: null}, out: {in: null, out: 'nrm'}, both: {in: 'nrm', out: 'nrm'}};
for (const [name, rate] of cases) for (const dk of Object.keys(docks)) for (const eng of ['zones', 'auto']) {
  const tag = `${name} ${rate} ${dk} ${eng}`;
  const r = await pg.evaluate(([name, rate, dock, eng]) => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const o = {dock, box: 'DAT_Container_2'};
    if (eng === 'zones') o.eng = 'zones';
    const L = pfCompose(P, it, 1, 0, o);
    if (!L.ok) return {refused: L.why};
    if (!L.bl || !L.bl.zoned) return {notZoned: L.note && L.note[0]};
    const T = placerTile(L, placerBk());
    if (!T.ok) return {tileFail: String(T.why).slice(0, 200), ov: T.ov, span: T.span, zoned: true, rows: L.bl.r};
    const belt = (x, y) => T.ms.find(q => PLC_BELT.includes(q.cls) && q.x === x && q.y === y);
    const ins = T.ms.filter(q => q.dk === 'in'), outs = T.ms.filter(q => q.dk === 'out');
    const inBad = ins.filter(q => ![q.y + 1, q.y + 2].every(y => { const b = belt(q.x - 1, y); return b && b.rot === 0 })).map(q => q.x + ',' + q.y);
    const outBad = outs.filter(q => ![[q.y + 1, 0], [q.y + 2, 1]].every(([y, dx]) => { const b = belt(q.x + dim(q).w + dx, y); return b && b.rot === 0 })).map(q => q.x + ',' + q.y);
    const dockN = T.blocks.filter(b => b.cls === plcCls('BPO_Dock')).length;
    const minX = Math.min(...T.ms.map(q => q.x), ...T.blocks.map(b => b.x * 16));
    return {zoned: true, rows: L.bl.r, M: L.bl.M, blocks: T.blocks.length, ov: T.ov, span: T.span, noBuild: noBuild(T.ms.filter(isM).map(mItem)),
      inN: ins.length, outN: outs.length, dockN, inBad, outBad, minX, note: L.note[0], tileBlocks: T.blocks.length};
  }, [name, rate, docks[dk], eng]);
  console.log(tag + ': ' + JSON.stringify(r));
  if (r.refused) { check(false, tag + ' refused (' + r.refused + ')'); continue }
  if (r.notZoned) { check(false, tag + ' not zoned (' + r.notZoned + ')'); continue }
  if (r.tileFail) { check(false, tag + ' placerTile (' + r.tileFail + ') ov ' + r.ov + ' span ' + r.span); continue }
  const wantIn = dk === 'out' ? 0 : (rate === 480 ? 1 : 2), wantOut = dk === 'in' ? 0 : (rate === 480 ? 1 : 2);
  check(r.ov === 0 && r.span === 0, tag + ' ov 0 span 0 (ov ' + r.ov + ', span ' + r.span + ')');
  check(!r.noBuild, tag + ' noBuild false');
  check(r.inN === wantIn && r.outN === wantOut, tag + ' containers in/out ' + r.inN + '/' + r.outN + ' (want ' + wantIn + '/' + wantOut + ')');
  check(r.dockN === r.inN + r.outN, tag + ' BPO_Dock count ' + r.dockN + ' == containers ' + (r.inN + r.outN));
  check(!r.inBad.length, tag + ' input lanes (' + r.inBad.join(' ') + ')');
  check(!r.outBad.length, tag + ' output lanes (' + r.outBad.join(' ') + ')');
  check(r.minX >= 0, tag + ' all x >= 0 (min ' + r.minX + ')');
}
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

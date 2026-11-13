// BL5 dock gates (page, ?engine=bl). Run: node tests/bl_dock.mjs   Exit 1 on FAIL or page error.
// Silicon Wafers 360 (K=2 towers): in=nrm; out=nrm; in=nrm+out=nrm; in=ind. Per case: placerTile ok, ov 0, span 0, noBuild false.
// Every dk:'in' container: belts at both M columns, rows q.y-2 and q.y-1 (nominal -1,0 after the dock shift). Every dk:'out' container: 2 belts per M column below it, one rot-1 belt per trunk column above it (count == last stage rows), each trunk column extended up (q.y-2).
// Dock blocks: BPO_Dock == K per nrm side; BPO_Dock_2 == distinct 'ie' columns (ind). out=ind refuses with a BL note.
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
const run = dock => pg.evaluate(dock => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Silicon Wafers');
  const P = plan(it, 360, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const o = dock ? {dock} : {};
  const L = pfCompose(P, it, 1, 0, o);
  if (!L.ok) return {refused: L.why, blWhy: blTop(P, it, 1, 0, o).why};
  if (!L.bl) return {notBL: L.note[0]};
  const T = placerTile(L, placerBk());
  if (!T.ok) return {tileFail: String(T.why).slice(0, 200), ov: T.ov, span: T.span};
  const TW = dim({cls: T.blocks[0].cls, rot: 0}).w * FC;
  const belt = (x, y) => T.ms.find(q => PLC_BELT.includes(q.cls) && q.x === x && q.y === y);
  const res = {K: L.bl.K, lastRows: L.bl.r[L.bl.r.length - 1], inN: 0, inBad: [], outN: 0, outBad: [], ov: T.ov, span: T.span,
    noBuild: noBuild(T.ms.filter(isM).map(mItem)), dockN: 0, dock2N: 0, ieCols: 0, ie: [], blocks: L.bl.K};
  for (const q of T.ms.filter(q => q.dk === 'in')) {
    res.inN++;
    const c = Math.floor(q.x / TW), bw = dim(q).w, k = [0, 1].find(k => { const M = c * TW + 16 * k + DOFF + 2; return q.x <= M && q.x + bw - 1 >= M + 1 });
    const M = c * TW + 16 * k + DOFF + 2;
    const ok = [M, M + 1].every(x => [q.y - 2, q.y - 1].every(y => { const b = belt(x, y); return b && b.rot === 1 }));
    if (!ok) res.inBad.push('(' + q.x + ',' + q.y + ')');
  }
  for (const q of T.ms.filter(q => q.dk === 'out')) {
    res.outN++;
    const c = Math.floor(q.x / TW), bw = dim(q).w, bh = dim(q).h, k = [0, 1].find(k => { const M = c * TW + 16 * k + DOFF + 2; return q.x <= M && q.x + bw - 1 >= M + 1 });
    const M = c * TW + 16 * k + DOFF + 2;
    const trunk = []; for (let x = q.x; x < q.x + bw; x++) { const b = belt(x, q.y - 1); if (b && b.rot === 1) trunk.push(x) }
    const extOk = trunk.every(x => { const b = belt(x, q.y - 2); return b && b.rot === 1 });
    const dockOk = [M, M + 1].every(x => T.ms.filter(b => PLC_BELT.includes(b.cls) && b.rot === 1 && b.x === x && b.y >= q.y + bh).length >= 2);
    if (trunk.length !== res.lastRows || !extOk || !dockOk) res.outBad.push('(' + q.x + ',' + q.y + ') trunk ' + trunk.length + '/' + res.lastRows + ' ext ' + extOk + ' dock ' + dockOk);
  }
  res.dockN = T.blocks.filter(b => /BPO_Dock\.BPO_Dock_C$/.test(b.cls)).length;
  res.dock2N = T.blocks.filter(b => /BPO_Dock_2\./.test(b.cls)).length;
  const ieCols = new Set(T.ms.filter(q => q.dk === 'ie').map(q => Math.floor(q.x / TW)));
  res.ieCols = ieCols.size;
  res.note = String(L.note[0]);
  res.riskNote = L.note.some(s => /240\/min/.test(s));
  return res;
}, dock);
const cases = [
  ['in=nrm', {in: 'nrm'}, {inNrm: true, outNrm: false}],
  ['out=nrm', {out: 'nrm'}, {inNrm: false, outNrm: true}],
  ['in=nrm+out=nrm', {in: 'nrm', out: 'nrm'}, {inNrm: true, outNrm: true}],
  ['in=ind', {in: 'ind'}, {ind: true}],
];
for (const [tag, dock, want] of cases) {
  const r = await run(dock);
  if (r.refused) { check(false, tag + ': refused (' + r.refused + ')'); continue }
  if (r.notBL) { check(false, tag + ': not built by BL (' + r.notBL.slice(0, 60) + ')'); continue }
  if (r.tileFail) { check(false, tag + ': placerTile failed (' + r.tileFail + ') ov ' + r.ov + ' span ' + r.span); continue }
  check(r.ov === 0 && r.span === 0, tag + ': tile ov ' + r.ov + ' span ' + r.span);
  check(r.noBuild === false, tag + ': noBuild false (' + r.noBuild + ')');
  if (want.inNrm) check(r.inN === r.K && r.inBad.length === 0, tag + ': in containers ' + r.inN + ' == K ' + r.K + ', belts at both M columns rows -1,0 (bad ' + r.inBad.join(' ') + ')');
  if (want.outNrm) check(r.outN === r.K && r.outBad.length === 0, tag + ': out containers ' + r.outN + ' == K ' + r.K + ', 2 belts per M column, trunk cols ' + r.lastRows + ' extended (bad ' + r.outBad.join(' ') + ')');
  if (want.inNrm || want.outNrm) check(r.dockN === r.K * (+want.inNrm + +want.outNrm), tag + ': BPO_Dock blocks ' + r.dockN + ' == K*' + (+want.inNrm + +want.outNrm));
  if (want.ind) check(r.dock2N === r.ieCols && r.ieCols === r.K, tag + ': BPO_Dock_2 blocks ' + r.dock2N + ' == distinct ie columns ' + r.ieCols + ' == K ' + r.K);
  check(r.riskNote === !!want.outNrm, tag + ': 240/min output risk note ' + (r.riskNote ? 'present' : 'absent') + ' (expected ' + !!want.outNrm + ')');
  console.log('     ' + tag + ' note: ' + r.note.slice(0, 120));
}
// out=ind refuses with a BL note
const refuse = await pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Silicon Wafers');
  const P = plan(it, 360, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  return blTop(P, it, 1, 0, {dock: {in: 'nrm', out: 'ind'}}).why;
});
check(/^BL: .* \(NL used\)$/.test(refuse), 'out=ind refuses with BL note (' + refuse + ')');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

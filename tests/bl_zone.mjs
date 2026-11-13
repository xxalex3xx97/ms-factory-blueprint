// BL Z1 zone geometry gates (page). Run: node tests/bl_zone.mjs   Exit 1 on FAIL or page error.
// Refinery rows R=1..5 at Large Container (IZ at Y0, FB at Y30, OZ at Y60, one canvas): cell clash 0; machines == R*M; every input column ends in exactly one manifold; every ex column ends in exactly one OZ container port; no horizontal belt on y%30 in {29,0}; placerCut ok, ov 0, span 0; blFlip of the FB keeps clash 0 and the machine count.
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
await pg.waitForFunction(() => window.__fb && typeof blZL === 'function' && typeof blFB === 'function' && typeof blIZ === 'function' && typeof blOZ === 'function' && typeof blFlip === 'function' && typeof placerCut === 'function');
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
const res = await pg.evaluate(() => {
  const mc = blMachine('DAT_Refinery');
  const CB = 'DAT_Container_2', MK = 1, SM = 1, REC = 'ITEM_Silica>ITEM_SiliconWafers';
  const cells = items => {   // cell -> item, and the clash count
    const occ = new Map(); let clash = 0;
    for (const b of items) { const d = dim(b); for (let x = b.x; x < b.x + d.w; x++) for (let y = b.y; y < b.y + d.h; y++) { const k = x + ',' + y; if (occ.has(k)) clash++; else occ.set(k, b) } }
    return {occ, clash};
  };
  const out = [];
  for (let R = 1; R <= 5; R++) {
    const L = blZL(R), g0 = Math.floor(R / 2), X0 = L.PS[R - 1] + (mc.xin === 0 ? 1 : 0), rx = L.c === 1 ? 4 : g0 + 4;
    const M = Math.floor((30 - X0 - rx) / mc.w);
    const fb = blFB({mk: MK, spMk: SM, cls: 'DAT_Refinery', rec: REC, mc, M, R, cx: 0, Y: 30});
    const iz = blIZ({mk: MK, bx: CB, cx: 0, Y: 0, R, raw: 'ITEM_Silica'});
    const oz = blOZ({mk: MK, bx: CB, Y: 60, R, E0: fb.E0});
    const g = {R, M, ok: fb.ok && iz.ok && oz.ok, why: fb.why || null, errs: []};
    if (!g.ok) { out.push(g); continue }
    const all = [...iz.items, ...fb.items, ...oz.items];
    const {occ, clash} = cells(all);
    g.clash = clash;
    g.machines = all.filter(b => b.cls === 'DAT_Refinery').length;
    g.want = R * M;
    g.wallH = all.filter(b => PLC_BELT.includes(b.cls) && (b.rot === 0 || b.rot === 2) && (b.y % 30 === 0 || b.y % 30 === 29)).length;
    g.inOk = L.PS.every((p, _) => true) && fb.yIn.every((yi, j) => {
      const col = L.PS[R - 1 - j], m = occ.get(col + ',' + yi), up = occ.get(col + ',' + (yi - 1));
      return !!m && ((PLC_BELT.includes(m.cls) && m.rot === 0) || PLC_SPL.includes(m.cls)) && !!up && up.rot === 1;
    });
    g.exOk = fb.exCols.every(ex => {
      const down = occ.get(ex + ',' + 61), cover = oz.items.filter(b => b.cls === CB && ex >= b.x && ex <= b.x + 3);
      return !!down && down.rot === 1 && cover.length === 1;
    });
    const w = Math.max(...all.map(b => b.x + dim(b).w)) + 1;
    const cut = placerCut({items: all, w, h: 90, pitch: 1, lanes: 1, tall: true, mk: MK}, plcCls('BPO_Station_02'));
    g.cut = {ok: cut.ok, ov: cut.ov, span: cut.span, why: cut.why || null, ug: cut.ug};
    const mcF = blMachine('DAT_Refinery', 1, true);
    const fl = blFlip(fb.items, 29, mcF);
    g.flip = {ok: fl.ok, clash: fl.ok ? cells(fl.items).clash : null, machines: fl.ok ? fl.items.filter(b => b.cls === 'DAT_Refinery').length : null, spl2: fl.ok ? fl.items.filter(b => PLC_SPL.includes(b.cls) && b.rot === 2).length : null};
    out.push(g);
  }
  return out;
});
for (const g of res) {
  console.log(`R=${g.R} M=${g.M} ${JSON.stringify({clash: g.clash, machines: g.machines, want: g.want, wallH: g.wallH, inOk: g.inOk, exOk: g.exOk, cut: g.cut, flip: g.flip})}`);
  check(g.ok, `R=${g.R} zones built (${g.why || 'ok'})`);
  if (!g.ok) continue;
  check(g.clash === 0, `R=${g.R} cell clash 0`);
  check(g.machines === g.want, `R=${g.R} machines == R*M (${g.machines}/${g.want})`);
  check(g.wallH === 0, `R=${g.R} no horizontal belt on wall rows`);
  check(g.inOk, `R=${g.R} every input column ends in exactly one manifold`);
  check(g.exOk, `R=${g.R} every ex column ends in exactly one OZ container port`);
  check(g.cut.ok && g.cut.ov === 0 && g.cut.span === 0, `R=${g.R} placerCut ok, ov 0, span 0 ${g.cut.why || ''}`);
  check(g.flip.ok && g.flip.clash === 0 && g.flip.machines === g.want, `R=${g.R} blFlip clash 0, machines kept`);
}
// Z3: S1 Nickel Plates 480 through pfCompose (zoned tower), tiled with placerTile
const z = await pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Nickel Plates');
  const P = plan(it, 480, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const L = pfCompose(P, it, 1, 0, {box: 'DAT_Container_2'});   // zones need the Large Container (Z3 condition)
  if (!L.ok) return {refused: L.why};
  const T = placerTile(L, placerBk());
  const bl = L.bl || {};
  return {note: String(L.note[0]), zoned: !!bl.zoned, rows: bl.r, M: bl.M, machines: L.stat.machines, belts: L.stat.belts, bpm: L.stat.belts / L.stat.machines,
    tileOk: T.ok, tileWhy: T.ok ? null : String(T.why).slice(0, 160), ov: T.ov, span: T.span, blocks: T.blocks ? T.blocks.map(b => [b.cls, b.x, b.y]) : null, cols: T.cols, tileRows: T.rows, ug: T.ug};
});
console.log('Z3 S1 Nickel Plates 480: ' + JSON.stringify(z));
if (z.refused) { console.log('FAIL Nickel 480 refused: ' + z.refused); fails++ }
else {
  check(z.zoned, 'Nickel 480 uses the zoned tower');
  check(z.machines === 24, 'Nickel 480 24 machines (' + z.machines + ')');
  check(z.rows && z.rows[0] === 4, 'Nickel 480 rows 4 (' + z.rows + ')');
  check(z.tileOk, 'Nickel 480 placerTile ok' + (z.tileOk ? '' : ' (' + z.tileWhy + ')'));
  check(z.tileOk && z.ov === 0 && z.span === 0, 'Nickel 480 tile ov 0, span 0');
  check(z.tileOk && z.blocks && z.blocks.length === 3, 'Nickel 480 3 blocks');
}
await br.close();
if (errs.length) { console.log('PAGE ERRORS ' + errs.join(' | ')); fails++ }
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

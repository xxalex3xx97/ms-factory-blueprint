// Built-plan ghost rotates with R (pasting.rot) and places rotated. Run: node tests/plan_rotate.mjs   Exit 1 on any failed check or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1400, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=old');
await pg.waitForFunction(() => window.__fb && typeof placerPaste === 'function' && typeof plT === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const r = await pg.evaluate(() => {
  const blockCls = CATALOG.blocks[0].class;
  const machCls = CATALOG.buildables.find(b => b.id === 'DAT_Container').id;
  STRICT = false; view = 'F'; layer = 0; sel = new Set(); drag = null; hoverIn = true;
  const pl = {blocks: [{cls: blockCls, x: 0, y: 0, rot: 0}, {cls: blockCls, x: 2, y: 0, rot: 0}],
    ms: [{cls: machCls, x: 0, y: 0, rot: 0}], plan: {item: 'x', rate: 1}};
  const key = P => P.blocks.map(q => [q.cls, q.x, q.y, q.rot || 0]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(a => a.join(','))
    .concat(P.ms.map(q => ['M', q.cls, q.x, q.y, q.rot || 0].join(','))).join('|');
  const p1 = plT(pl, 1), p2 = plT(p1, 1), p4 = plT(pl, 4), pz = plT(pl, 0);
  const A = p1.blocks.every(q => q.rot === 1) && key(p1) !== key(pl);
  const B = JSON.stringify(p2) === JSON.stringify(plT(pl, 2));
  const C = key(p4) === key(pl) && JSON.stringify(pz) === JSON.stringify({blocks: pl.blocks, ms: pl.ms});
  pasting = {rot: 0, fl: false, pl};
  hover = {x: 5, y: 5};
  const before = new Set(S.blocks.map(b => b.id));
  return {A, B, C, blockCls, machCls, before: [...before], sizes: [p1.blocks.length, p1.ms.length]};
});
check(r.A, 'A plT(pl,1): all blocks rot 1 and positions differ from n=0');
check(r.B, 'B plT(plT(pl,1),1) equals plT(pl,2)');
check(r.C, 'C plT(pl,4) equals pl (and n=0 is identity)');

await pg.evaluate(() => { hover = {x: 5, y: 5}; hoverIn = true; });
await pg.keyboard.press('r');
const rot = await pg.evaluate(() => pasting && pasting.rot);
check(rot === 1, 'D press r -> pasting.rot === 1 (got ' + rot + ')');
const placed = await pg.evaluate(() => {
  const before = new Set(S.blocks.map(b => b.id));
  placerPaste();
  const news = S.blocks.filter(b => !before.has(b.id));
  return {n: news.length, rots: news.filter(b => b.cls !== 'DAT_Container').map(b => b.rot), ms: news.filter(b => b.cls === 'DAT_Container').length, pasting: !!pasting};
});
check(placed.rots.length === 2 && placed.rots.every(x => x === 1), 'D placerPaste places 2 blocks, all rot 1 (' + JSON.stringify(placed) + ')');
check(placed.ms === 1, 'D placed 1 machine');
check(errs.length === 0, 'E no pageerror' + (errs.length ? ': ' + errs.join(' | ') : ''));
// ---- real keyboard/mouse on the default engine: Build plan -> ghost -> R x1/x2/x3 -> click place
const SH = path.join(ROOT, 'tests', 'shots') + '/';
const pg2 = await (await br.newContext({viewport: {width: 1400, height: 900}})).newPage();
const errs2 = [];
pg2.on('pageerror', e => errs2.push(e.message));
await pg2.goto(pathToFileURL(ROOT + '/index.html').href);
await pg2.waitForFunction(() => window.__fb && typeof placerGo === 'function');
const build = async item => {
  await pg2.evaluate(() => { S.blocks = []; S.closed = []; S.conn = []; sel = new Set(); clip = []; pasting = null; STRICT = false; if (view !== 'L') setView('L'); all(); });
  await pg2.evaluate(i => { $('plnItem').value = i; $('plnItem').dispatchEvent(new Event('change')); placerGo(); }, item);
  await pg2.waitForFunction(() => !$('plnPlace').disabled, null, {timeout: 90000});
  await pg2.click('#plnPlace');
};
// yellow floor rects drawn by the ghost, collected from one paint
const ghost = () => pg2.evaluate(() => {
  const rects = [], yel = (c => { c.fillStyle = 'hsla(45,95%,62%,.8)'; return c.fillStyle; })(document.createElement('canvas').getContext('2d')), fr = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) { if (this.fillStyle === yel) rects.push([x, y, w, h]); return fr.call(this, x, y, w, h); };
  try { paint0(); } finally { CanvasRenderingContext2D.prototype.fillRect = fr; }
  const s = sc(), pT = plT(pasting.pl, pasting.rot, pasting.fl), box = pT.blocks.map(q => { const f = fcell({...q, h: 0, id: -1}), a = V.ox + (hover.x + f.cx) * s, b = V.oy + (hover.y + f.cy) * s; return [a, b, f.cw * s, f.ch * s]; });
  const inside = r => box.some(f => r[0] >= f[0] - 1 && r[1] >= f[1] - 1 && r[0] + r[2] <= f[0] + f[2] + 1 && r[1] + r[3] <= f[1] + f[3] + 1);
  const dataIn = pT.ms.every(m => pT.blocks.some(q => { const f = fcell({...q, h: 0, id: -1}); return m.x >= f.cx * FC && m.x < (f.cx + f.cw) * FC && m.y >= f.cy * FC && m.y < (f.cy + f.ch) * FC; }));
  return {n: rects.length, out: rects.filter(r => !inside(r)).length, dataIn, ms: pT.ms.length, rot: pasting.rot};
});
await build('ITEM_BasicCircuit');
await pg2.mouse.move(300, 330); await pg2.mouse.move(310, 340);
const ms0 = await pg2.evaluate(() => pasting.pl.ms.length);
for (let k = 1; k <= 3; k++) {
  await pg2.keyboard.press('r'); await pg2.mouse.move(310 + k, 340 + k);
  const g = await ghost();
  check(g.rot === k && g.n > 0 && g.out === 0 && g.dataIn && g.ms === ms0, `F ghost R x${k}: ${g.n} yellow rects all inside a ghost block floor, data inside, ${g.ms}/${ms0} machines (${JSON.stringify(g)})`);
  await pg2.screenshot({path: SH + `rot-plan-ghost-r${k}.png`});
}
const links = async n => { await build('ITEM_BasicCircuit'); await pg2.mouse.move(300, 330); await pg2.mouse.move(310, 340); for (let i = 0; i < n; i++) await pg2.keyboard.press('r'); await pg2.mouse.click(310, 340);
  return pg2.evaluate(() => { const ms = S.blocks.filter(isM), bs = S.blocks.filter(b => !isM(b)), cov = floorOn(bs); return {pasting: !!pasting, b: bs.length, m: ms.length, cov: ms.filter(m => cov.has(m)).length, lk: Object.values(links(0)).reduce((a, v) => a + ((v && (v.length || v.size)) || 0), 0), rots: [...new Set(bs.map(b => b.rot))].join()}; }); };
const L0 = await links(0);
for (let k = 1; k <= 3; k++) {
  const Lk = await links(k);
  if (k === 1) await pg2.screenshot({path: SH + 'rot-plan-placed.png'});
  check(!Lk.pasting && Lk.b === L0.b && Lk.m === L0.m && Lk.cov === Lk.m, `G placed rot ${k}: ${Lk.b} blocks ${Lk.m} floor items all inside block floors (rot0: ${L0.b}/${L0.m})`);
  check(Lk.lk === L0.lk, `G placed rot ${k}: ${Lk.lk} links, same as unrotated ${L0.lk}`);
}
// ---- user repro: imported Starter_Station.json (STRICT on, default), Build factory BasicCircuit 150/min, Mk2, 2x1 blocks, raw inputs from industrial docks, Place -> R x0..3 and V -> click east of the station
const pg3 = await (await br.newContext({viewport: {width: 1400, height: 900}})).newPage();
const errs3 = [];
pg3.on('pageerror', e => errs3.push(e.message));
await pg3.goto(pathToFileURL(ROOT + '/index.html').href);
await pg3.waitForFunction(() => window.__fb && typeof placerGo === 'function');
await pg3.click('#imp'); await pg3.setInputFiles('#impFile', path.join(ROOT, 'tests', 'fixtures', 'Starter_Station.json'));
await pg3.waitForFunction(() => $('impTa').value.length > 100); await pg3.click('#impGo');
await pg3.evaluate(() => { $('plnItem').value = 'ITEM_BasicCircuit'; $('plnItem').dispatchEvent(new Event('change')); if ($('plnB').getAttribute('aria-pressed') !== 'true') $('plnB').click(); });
await pg3.fill('#plnRate', '150'); await pg3.click('#plnBuild');
await pg3.selectOption('#pvMk', '1'); await pg3.selectOption('#plnBk', 'BPO_Station_2x1'); await pg3.check('#plnDkI'); await pg3.selectOption('#plnDk', 'ind');
await pg3.waitForFunction(() => !$('plnPlace').disabled, null, {timeout: 120000});
await pg3.click('#plnPlace'); await pg3.waitForTimeout(500);
if ((await pg3.textContent('#plnPlace')) === 'Build it') await pg3.click('#plnPlace');
await pg3.waitForFunction(() => pasting, null, {timeout: 60000});
const strict0 = await pg3.evaluate(() => { window.__pl = pasting.pl; window.__snap = S.blocks.slice(); STRICT = true; return STRICT; });
const stat = () => pg3.evaluate(() => { const ms = S.blocks.filter(isM), bs = S.blocks.filter(b => !isM(b)), cov = floorOn(bs); return {b: bs.length, m: ms.length, cov: ms.filter(m => cov.has(m)).length, pasting: !!pasting, lk: Object.values(links(0)).reduce((a, v) => a + ((v && (v.length || v.size)) || 0), 0), toast: ($('toast') || {}).textContent}; });
const base = await stat();
const sres = {};
for (const [rot, fl] of [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1]]) {
  await pg3.evaluate(() => { S.blocks = window.__snap.slice(); pasting = {rot: 0, fl: false, pl: window.__pl}; sel = new Set(); all();
    const bs = S.blocks.filter(b => !isM(b)); V.ox = 250 - Math.max(...bs.map(b => b.x + dim(b).w)) * sc(); all(); });
  const pos = await pg3.evaluate(() => { const bs = S.blocks.filter(b => !isM(b)), x = Math.max(...bs.map(b => b.x + dim(b).w)) + 8, y = Math.min(...bs.map(b => b.y)), s = sc(), r = cv.getBoundingClientRect(); return {x: r.left + V.ox + (x + .5) * s, y: r.top + V.oy + (y + .5) * s}; });
  await pg3.mouse.move(pos.x - 5, pos.y - 5); await pg3.mouse.move(pos.x, pos.y);
  for (let i = 0; i < rot; i++) await pg3.keyboard.press('r');
  if (fl) await pg3.keyboard.press('v');
  await pg3.mouse.move(pos.x + 1, pos.y + 1); await pg3.mouse.move(pos.x, pos.y);
  const g = await pg3.evaluate(() => ({rot: pasting.rot, fl: pasting.fl}));
  await pg3.mouse.click(pos.x, pos.y);
  const s = await stat(); sres[rot + '/' + fl] = s;
  if (rot === 0 && !fl) { sres.nb = s.b - base.b; sres.nm = s.m - base.m; sres.lk = s.lk - base.lk; }
  check(g.rot === rot && g.fl === !!fl && !s.pasting && s.b - base.b === sres.nb && s.m - base.m === sres.nm && s.cov - base.cov === s.m - base.m,
    `J Starter_Station BasicCircuit R${rot}${fl ? '+V' : ''}: placed ${s.b - base.b} blocks ${s.m - base.m} buildables (R0: ${sres.nb}/${sres.nm}), all inside block floors, no refusal (${s.toast})`);
  check(s.lk - base.lk === sres.lk, `J R${rot}${fl ? '+V' : ''}: ${s.lk - base.lk} links, same as unrotated ${sres.lk}`);
  if (rot === 1 && !fl) { await pg3.evaluate(() => { const bs = S.blocks.filter(b => !isM(b)); V.ox = 120 - Math.max(...bs.map(b => b.x)) * sc() + 600; all(); }); await pg3.screenshot({path: SH + 'rot-starter-placed-r1.png'}); }
}
check(strict0 === true && errs3.length === 0, 'K STRICT on, no pageerror' + (errs3.length ? ': ' + errs3.join(' | ') : ''));
// big plan: plT must not overflow the stack (2391 blocks / 128k machines)
await build('ITEM_AdvancedPlates');
await pg2.mouse.move(300, 330); await pg2.mouse.move(310, 340);
for (let k = 0; k < 3; k++) { await pg2.keyboard.press('r'); await pg2.mouse.move(311 + k, 341); }
const big = await pg2.evaluate(() => ({rot: pasting && pasting.rot, b: pasting && pasting.pl.blocks.length}));
check(big.rot === 3 && big.b > 1000, 'H big plan R x3 works (' + JSON.stringify(big) + ')');
check(errs2.length === 0, 'I no pageerror on the default engine' + (errs2.length ? ': ' + errs2.join(' | ') : ''));
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
await br.close();
process.exit(fails ? 1 : 0);

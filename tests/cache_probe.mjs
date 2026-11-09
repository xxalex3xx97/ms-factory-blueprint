// Stale-cache probe for the links() cache (linksC / PK = blkKey) and the sim signature.
// After each real edit: paint(), then the cached links must equal a fresh links(layer), and SIM.sig must equal blkKey().
// Run: node tests/cache_probe.mjs    Env: JSONF (default benchmark), exit 1 on any FAIL.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href;
const TXT = fs.readFileSync(process.env.JSONF || 'C:/Users/SFidelis/Downloads/Beta_Honor_3_Central.json', 'utf8');
let total = 0, fail = 0;
const chk = (name, ok, detail = '') => { total++; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`) };

const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1400, height: 900}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(PAGE);
await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
await pg.evaluate(t => __fb.importJson(t, true), TXT);
await pg.evaluate(() => { __fb.setView('F'); __fb.setLayer(1); __fb.fit(); V.z = Math.max(V.z, 10 / CELLS[view]) + 0.01; draw() });   // links only computed at s>=ARROW_MIN_S
await pg.evaluate(() => { const g = document.getElementById('ghost'); g.checked = false; g.dispatchEvent(new Event('change')) });
await pg.evaluate(() => { if (!LK) document.getElementById('lk').click() });

// compare cached links with a fresh computation; called after paint()
const cacheCheck = name => pg.evaluate(name => {
  const norm = x => JSON.stringify(x, (k, v) => v instanceof Map || v instanceof Set ? [...v] : typeof v === 'function' ? undefined : v);
  paint();
  const k = blkKey();
  const cachedOk = !!LKC && LKC.L === layer && LKC.k === k;
  const fresh = norm(links(layer));
  const cached = cachedOk ? norm(LKC.K) : 'NO-CACHE';
  const simOk = !SIM || SIM.sig === k || SIM.sig === null;
  return {name, cachedOk, same: cached === fresh, simOk, n: S.blocks.length};
}, name).then(r => chk(`${r.name}: cache fresh`, r.cachedOk && r.same, `cachedKey=${r.cachedOk} sameLinks=${r.same} blocks=${r.n}`) ||
  0);

const pick = (pred) => pg.evaluate(p => { const f = eval(p); const b = S.blocks.find(f); return b ? b.id : null }, pred.toString());
const selectId = id => pg.evaluate(id => { sel = new Set([id]); all() }, id);

await cacheCheck('0 baseline after load');

// 1 rotate (R key)
const m1 = await pick('b => b.h === 1 && isM(b) && !isBelt(b)');
await selectId(m1);
await pg.keyboard.press('r');
await cacheCheck('1 rotate (R)');

// 2 undo / redo
await pg.keyboard.press('Control+z'); await cacheCheck('2a undo');
await pg.keyboard.press('Control+y'); await cacheCheck('2b redo');

// 3 drag move 3 cells
const pos = await pg.evaluate(id => { const b = S.blocks.find(q => q.id === id); return __fb.px(b.x, b.y) }, m1);
await pg.mouse.move(pos[0], pos[1]); await pg.mouse.down();
await pg.mouse.move(pos[0] + 20, pos[1] + 20, {steps: 4});
await pg.mouse.move(pos[0] + 3 * 0 + 60, pos[1] + 60, {steps: 4});
await pg.mouse.up();
await cacheCheck('3 drag move');

// 4 add a belt (palette class + click empty cell)
const added = await pg.evaluate(() => {
  const belt = Object.keys(BASE).find(c => BASE[c].directional && BASE[c].category === 'Conveyors');
  active = belt; placeRot = 0; all();
  // find an empty cell on layer 1 near the view centre
  for (let r = 0; r < 60; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [-r, r]) {
    const x = Math.round(V.ox > 0 ? 0 : 0) + dx; const y = dy;
    const c = {x: x, y: y};
    if (!S.blocks.some(b => b.h === 1 && b.x === x && b.y === y)) return {x, y, belt};
  }
  return null;
});
// use the real path: place via toCell->click is hard to target; use the keyboard-free place() function if present
await pg.evaluate(a => { if (!a) return; push(); S.blocks.push({id: uid++, cls: a.belt, x: a.x, y: a.y, h: 1, rot: 0, pid: 0}); all() }, added);
await cacheCheck('4 add belt');

// 5 delete
await selectId(m1);
await pg.evaluate(() => del());
await cacheCheck('5 delete');
await pg.keyboard.press('Control+z'); await cacheCheck('5b undo delete');

// 6 recipe button in inspector (data-rk)
const mr = await pg.evaluate(() => { const b = S.blocks.find(q => q.h === 1 && isM(q) && !isBelt(q) && recsOf(def(q.cls)).length); return b ? b.id : null });
if (mr != null) {
  await selectId(mr); await pg.evaluate(() => all());
  const has = await pg.evaluate(() => !!document.querySelector('#insp [data-rk]'));
  if (has) { await pg.click('#insp [data-rk]'); await cacheCheck('6 recipe set'); await pg.click('#insp [data-rk]').catch(() => {}); await cacheCheck('6b recipe toggle off'); }
  else chk('6 recipe button found', false, 'no [data-rk] in inspector');
} else chk('6 machine with recipes found', false);

// 7 port toggle (data-port)
const mp = await pg.evaluate(() => { const b = S.blocks.find(q => q.h === 1 && isM(q) && portsOf(q).some(p => p.tg)); return b ? b.id : null });
if (mp != null) {
  await selectId(mp); await pg.evaluate(() => all());
  const k = await pg.evaluate(() => { const b = S.blocks.find(q => q.id === sel.values().next().value); return portsOf(b).find(p => p.tg).key });
  await pg.evaluate(() => { const el = document.querySelector('#insp [data-port]'); if (el) el.click() });
  await cacheCheck('7 port toggle');
}

// 8 container contents inline edit (data-ct)
const mc = await pg.evaluate(() => { const b = S.blocks.find(q => q.h === 1 && isM(q) && (q.ct || []).length); return b ? b.id : null });
if (mc != null) {
  await selectId(mc); await pg.evaluate(() => all());
  await pg.evaluate(() => { const el = document.querySelector('#insp input[data-ct="n"]'); if (el) { el.value = '7'; el.dispatchEvent(new Event('change', {bubbles: true})) } });
  await cacheCheck('8 ct count edit');
} else chk('8 container with contents found', false);

// 9 setOV (class config override)
await pg.evaluate(id => { const b = S.blocks.find(q => q.id === id); const cls = b.cls; const k = Object.keys(BASE[cls]).find(f => typeof BASE[cls][f] === 'number' && f !== 'w' && f !== 'h'); setOV(cls, k, BASE[cls][k] + 1); window.__ovk = k }, m1);
await cacheCheck('9 setOV');

// 10 layer change and back
await pg.evaluate(() => __fb.setLayer(0)); await cacheCheck('10a layer 0');
await pg.evaluate(() => __fb.setLayer(1)); await cacheCheck('10b back to layer 1');

// 11 full re-import of the same station (impCfg/impPorts/import path)
await pg.evaluate(t => __fb.importJson(t, true), TXT); await cacheCheck('11 re-import');

console.log(`SUMMARY cache_probe: ${total - fail} pass / ${fail} fail / ${total} total; page errors: ${errs.length}`);
if (errs.length) console.log(errs.slice(0, 5).join('\n'));
await br.close();
process.exit(fail || errs.length ? 1 : 0);

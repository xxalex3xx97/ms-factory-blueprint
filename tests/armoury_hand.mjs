// Hand-fed Armoury gate: every Armoury gallery card builds the hand-fed layout (one Armoury, one large container per input touching it, no belts/UG/splitters, no overlaps).
// Run: node tests/armoury_hand.mjs   Exit 1 on FAIL or page error.
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof galInit === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
await pg.evaluate(async () => { $("plnB").click(); await engineReady(); $("galOpen").click(); });
const rows = await pg.evaluate(() => {
  galInit();
  const arm = GAL.cards.filter(k => k.grp === 'Armoury');
  const beltSet = new Set([...PLC_BELT, ...PLC_UG, ...PLC_SPL]);
  const box = m => { const d = dim({cls: m.cls, rot: 0}); return {x: m.x, y: m.y, w: d.w, h: d.h} };
  const touch = (A, B) => {
    const xo = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), yo = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
    return ((A.x + A.w === B.x || B.x + B.w === A.x) && yo > 0) || ((A.y + A.h === B.y || B.y + B.h === A.y) && xo > 0);
  };
  const overlap = (A, B) => Math.min(A.x + A.w, B.x + B.w) > Math.max(A.x, B.x) && Math.min(A.y + A.h, B.y + B.h) > Math.max(A.y, B.y);
  return arm.map(k => {
    const out = {name: k.name, errs: [], chip: ''};
    try { galStep(k) } catch (e) { out.errs.push('galStep threw: ' + e.message); return out }
    out.chip = (k.el && k.el.querySelector('.stat') || {}).textContent || '';
    const r = k.res;
    if (!r || !r.ok) { out.errs.push('not built: ' + (r && r.why)); return out }
    if (!/Hand-fed/.test(out.chip)) out.errs.push('chip "' + out.chip + '"');
    const ms = r.T.ms, ins = [...new Set(k.r.i.map(([x]) => x))];
    const arms = ms.filter(m => m.cls === 'DAT_Armoury'), cons = ms.filter(m => m.cls === 'DAT_Container_2');
    const belts = ms.filter(m => beltSet.has(m.cls));
    if (arms.length !== 1) out.errs.push('DAT_Armoury count ' + arms.length + ' (want 1)');
    if (cons.length !== ins.length) out.errs.push('DAT_Container_2 count ' + cons.length + ' vs distinct inputs ' + ins.length);
    if (ms.length !== 1 + ins.length) out.errs.push('total pieces ' + ms.length + ' (want ' + (1 + ins.length) + ')');
    if (belts.length) out.errs.push('belts/UG/splitters: ' + belts.length);
    const ctItems = cons.map(c => (c.ct || []).map(q => q.item).sort().join('|')).sort().join(',');
    if (ctItems !== ins.slice().sort().join(',')) out.errs.push('container items ' + ctItems + ' vs inputs ' + ins.join(','));
    if (arms.length === 1) {
      const A = box(arms[0]);
      cons.forEach((c, i) => { if (!touch(box(c), A)) out.errs.push('container ' + i + ' not touching Armoury') });
    }
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++)
      if (overlap(box(ms[i]), box(ms[j]))) { out.errs.push('overlap ' + ms[i].cls + '/' + ms[j].cls); break }
    return out;
  });
});
check(rows.length === 7, 'Armoury cards: ' + rows.length + ' (plan 7)');
for (const r of rows) check(r.errs.length === 0, r.name + ': ' + (r.errs.join('; ') || 'layout ok, chip "' + r.chip + '"'));
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

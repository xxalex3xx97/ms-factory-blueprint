// 2x2 C (BPO_Station_03) tiling: placerTile with the select on 2x2 C. Run: node tests/c2x2_tile.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + (c ? '' : d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext()).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(ROOT + '/index.html').href);
  await pg.waitForFunction(() => window.__fb && typeof nlTop === 'function' && typeof placerTile === 'function');
  for (const [name, rate] of [['Basic Circuits', 100], ['Enzyme', 10]]) {
    const r = await pg.evaluate(([name, rate]) => {
      $('plnBk').value = 'BPO_Station_03';
      const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
      const P = plan(it, rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
      const L = nlTop(P, it, 1, 0, {}), T = placerTile(L, placerBk());
      if (!T.ok) return {fail: String(T.why).slice(0, 200)};
      const c3 = plcCls('BPO_Station_03');
      S.blocks = T.blocks.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: 0, pid: 0}));
      const a = areas(0), ids = T.ms.map((q, i) => ({...q, id: 100000 + i}));
      const nb = noBuild(ids.map(q => { const d = dim(q); return {id: q.id, x: q.x, y: q.y, w: d.w, h: d.h, l: 0, belt: PLC_BELT.includes(q.cls)} }));
      return {ov: T.ov, span: T.span, n: T.blocks.length, all3: T.blocks.every(b => b.cls === c3), mis: a.mis.length, nb, sample: JSON.stringify(T.blocks[0])};
    }, [name, rate]);
    const t = name + ' ' + rate;
    if (r.fail) { chk(t + ': placerTile ok', false, r.fail); continue }
    console.log(t, r.n, 'blocks', r.sample);
    chk(t + ': ov 0 span 0', r.ov === 0 && r.span === 0, `ov ${r.ov} span ${r.span}`);
    chk(t + ': all Station_03', r.all3);
    chk(t + ': areas mis 0', r.mis === 0, 'mis ' + r.mis);
    chk(t + ': noBuild false', r.nb === false);
  }
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

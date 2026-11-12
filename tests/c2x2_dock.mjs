// nlDockApply on 2x2 C: one adapter per tile column, dock stack one cell out. Run: node tests/c2x2_dock.mjs
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
  await pg.waitForFunction(() => window.__fb && typeof nlDockApply === 'function');
  for (const kind of ['in', 'ie', 'out', 'oe']) {
    const r = await pg.evaluate(kind => {
      const cls = plcCls('BPO_Station_03'), bc = PLC_BELT[0], M = DOFF + 2;
      const ms = [];
      if (kind === 'in') ms.push({cls: PLC_BOX, x: M, y: 1, h: 0, rot: 0, pid: 0, ct: [], dk: 'in'});
      if (kind === 'out') ms.push({cls: PLC_BOX, x: M, y: 1, h: 0, rot: 0, pid: 0, ct: [], dk: 'out'});
      if (kind === 'ie' || kind === 'oe') ms.push({cls: bc, x: 4, y: 1, h: 0, rot: 1, pid: 0, dk: kind});
      const T = {ok: true, ms, blocks: [{cls, x: 0, y: 0, rot: 0}], ov: 0, span: 0};
      const R = nlDockApply({mk: 0, dk: {}}, T, cls);
      if (R.ok === false) return {why: R.why};
      const ad = plcCls('BPO_StationAdapter_01'), ads = R.blocks.filter(b => b.cls === ad);
      S.blocks = R.blocks.map((b, i) => ({id: i + 1, cls: b.cls, x: b.x, y: b.y, h: 0, rot: b.rot || 0, pid: 0}));
      const a = areas(0), ids = R.ms.map((q, i) => ({...q, id: 100000 + i}));
      const nb = noBuild(ids.map(q => { const d = dim(q); return {id: q.id, x: q.x, y: q.y, w: d.w, h: d.h, l: 0, belt: PLC_BELT.includes(q.cls)} }));
      const ys = R.ms.filter(q => q.dk === 'p' && q.x === M).map(q => q.y).sort((p, q) => p - q);
      return {ov: R.ov, ads: ads.map(b => [b.x, b.y, b.rot]), blocks: R.blocks.map(b => b.cls.split('.').pop() + '@' + b.x + ',' + b.y + 'r' + (b.rot || 0)), mis: a.mis.length, nb, ys: ys.length ? [ys[0], ys[ys.length - 1], ys.length] : []};
    }, kind);
    if (r.why) { chk(kind + ': ok', false, r.why); continue }
    console.log(kind, JSON.stringify(r));
    const up = kind === 'in' || kind === 'ie';
    chk(kind + ': one adapter, rot ' + (up ? 3 : 1), r.ads.length === 1 && r.ads[0][2] === (up ? 3 : 1), JSON.stringify(r.ads));
    chk(kind + ': ov 0', r.ov === 0, 'ov ' + r.ov);
    chk(kind + ': areas mis 0', r.mis === 0, 'mis ' + r.mis);
    chk(kind + ': noBuild false', r.nb === false);
    if (kind === 'in') chk('in: belts at x=M contiguous 18 rows', r.ys.length === 3 && r.ys[2] === 18 && r.ys[1] - r.ys[0] === 17, JSON.stringify(r.ys));
  }
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

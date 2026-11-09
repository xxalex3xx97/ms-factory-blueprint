// Checks for ghost levels (+-1 default, "show all levels" = #ghostAll), sim ring zoom cull (s<6),
// belt item cull parity vs pre-fix build, and paint perf before/after.
// Run:  node tests/ghost_lag_verify.mjs verify   (BEFORE=<pre-fix page dir> for pixel parity)
//       node tests/ghost_lag_verify.mjs perf     (BEFORE=..., PERF_EXTRA=<dir> optional third target)
// Env: SRC (page under test, default this repo), BEFORE (pre-fix page dir), SHOTS, JSONF.
// Exit code 1 on any FAIL.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = process.env.SRC || ROOT;
const SHOTS = process.env.SHOTS || path.join(ROOT, 'tests', 'shots');
const BEFORE = process.env.BEFORE;
const JSONF = process.env.JSONF || 'C:/Users/SFidelis/Downloads/Beta_Honor_3_Central.json';
const MODE = process.argv[2] || 'verify';
const TXT = fs.readFileSync(JSONF, 'utf8');

let total = 0, fail = 0;
const chk = (name, ok, detail = '') => { total++; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };

const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pageErrs = [];
async function open(dir) {
  const pg = await (await br.newContext({viewport: {width: 1400, height: 900}})).newPage();
  pg.on('pageerror', e => pageErrs.push(dir + ': ' + e.message));
  await pg.goto(pathToFileURL(dir + '/index.html').href);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  await pg.evaluate(t => __fb.importJson(t, true), TXT);
  return pg;
}
const levelCounts = pg => pg.evaluate(() => { const c = {}; __fb.S.blocks.forEach(b => c[b.h] = (c[b.h] || 0) + 1); return c });

async function verify() {
  const pg = await open(SRC);
  const cnt = await levelCounts(pg);
  const levels = Object.keys(cnt).map(Number).sort((a, b) => a - b);
  const L = levels.find((h, i) => i > 0 && i < levels.length - 1 && levels[i - 1] === h - 1 && levels[i + 1] === h + 1) ?? levels[1];
  chk('0 file is multi-level', levels.length >= 3, `levels ${levels.join(',')}, testing layer ${L}`);
  await pg.evaluate(L => { __fb.setView('F'); __fb.setLayer(L); __fb.fit(); }, L);
  await pg.click('#lvB');   // open Level window (ghost checkboxes live inside it, hidden by default)
  await pg.evaluate(() => {
    window.__gh = [];
    const o = window.drawBlock;
    window.drawBlock = function (b, a, ...r) { if (b.h !== layer) __gh.push(b.h); return o.call(this, b, a, ...r) };
  });
  const ghostLevels = () => pg.evaluate(() => { const v = [...new Set(__gh)].sort((a, b) => a - b); __gh = []; return v });

  // ---- 1 ghost
  const dflt = await pg.evaluate(() => ({g: document.getElementById('ghost').checked, a: document.getElementById('ghostAll')?.checked ?? 'missing'}));
  chk('1a ghost checkbox default checked', dflt.g === true, JSON.stringify(dflt));
  chk('1b #ghostAll exists and default off', dflt.a === false, String(dflt.a));
  await pg.evaluate(() => paint());
  const one = await ghostLevels();
  const expOne = levels.filter(h => Math.abs(h - L) === 1);
  chk('1c default: only level below+above ghosted', JSON.stringify(one) === JSON.stringify(expOne), `got [${one}] expected [${expOne}]`);
  await pg.screenshot({path: path.join(SHOTS, 'ghost-pm1.png')});
  await pg.click('#ghostAll'); await pg.waitForTimeout(150);
  const all = await ghostLevels();
  // every other level that has a block inside the viewport (ghost loop is viewport-culled, so off-screen levels are not expected)
  const expAll = await pg.evaluate(L => [...new Set(S.blocks.filter(b => b.h !== L && inView(b)).map(b => b.h))].sort((a, b) => a - b), L);
  chk('1d show-all ON: every other level with blocks in view ghosted', JSON.stringify(all) === JSON.stringify(expAll), `got [${all}] expected [${expAll}] (all levels in file: ${levels.length})`);
  await pg.screenshot({path: path.join(SHOTS, 'ghost-all.png')});
  await pg.click('#ghostAll'); await pg.waitForTimeout(150);
  const back = await ghostLevels();
  chk('1e show-all OFF again: back to +-1', JSON.stringify(back) === JSON.stringify(expOne), `got [${back}]`);

  // ---- 2 per-belt status rings
  await pg.click('#simB');
  // find a level where the sim has full belts (sim is current-floor only, so it differs per level)
  let fb = null;
  for (const h of levels) {
    await pg.evaluate(h => { __fb.setLayer(h); paint(); __fb.simRun(30) }, h);
    fb = await pg.evaluate(() => { const id = [...smS().full][0]; const b = id === undefined ? null : __fb.S.blocks.find(q => q.id === id); return b ? {x: b.x, y: b.y, h: b.h, n: smS().full.size} : null });
    if (fb) break;
  }
  chk('2a sim has full belts to ring', !!fb, fb ? `${fb.n} full belts` : 'none');
  if (fb) {
    await pg.evaluate(h => { __fb.setLayer(h); paint(); __fb.simRun(30) }, fb.h);   // setLayer resets sim: re-run it so full belts exist again
    await pg.evaluate(() => {
      window.__ring = [];
      if (window.__ringWrapped) return;
      const of = window.drawSimFull;
      window.drawSimFull = function (s) {
        const p = CanvasRenderingContext2D.prototype, oa = p.arc; let k = 0;
        p.arc = function (...a) { k++; return oa.apply(this, a) };
        try { return of.call(this, s) } finally { p.arc = oa; __ring.push([+s.toFixed(2), k]) }
      };
      window.__ringWrapped = true;
    });
    await pg.evaluate(() => { V.z = 4 / CELLS[view]; __ring = []; paint() });
    const out = await pg.evaluate(() => __ring);
    const nfull = await pg.evaluate(() => smS().full.size);
    chk('2b zoomed out (s=4): drawSimFull draws no rings', nfull > 0 && out.length > 0 && out.every(([s, k]) => k === 0), `full belts ${nfull}, calls ${JSON.stringify(out)}`);
    await pg.screenshot({path: path.join(SHOTS, 'status-zoomout.png')});
    await pg.evaluate(fb => { V.z = 12 / CELLS[view]; V.ox = W / 2 - (fb.x + .5) * 12; V.oy = H / 2 - (fb.y + .5) * 12; __ring = []; paint() }, fb);
    const inn = await pg.evaluate(() => __ring);
    const arcs = inn.reduce((a, [, k]) => a + k, 0);
    chk('2c zoomed in (s=12) on a full belt: rings drawn', arcs > 0, `arc calls ${arcs}`);
    await pg.screenshot({path: path.join(SHOTS, 'status-zoomin.png')});
  }
  await pg.close();

  // ---- 3 belt items + links at viewport edges: pixel parity vs pre-fix build (no culling)
  if (!BEFORE) { chk('3 BEFORE env not set: parity skipped', false, 'set BEFORE=<pre-fix dir>'); return }
  const runViews = async (dir, shotTag) => {
    const pg2 = await open(dir);
    await pg2.evaluate(() => { __fb.setView('F'); document.getElementById('ghost').checked = false; });
    // pre-fix build has no ring gate: emulate the s<6 gate there so the rest of the pixels can be compared exactly
    // same for flow links: pre-fix draws them at every zoom, so emulate the ARROW_MIN_S gate (links absent at fit now expected)
    if (dir === BEFORE) await pg2.evaluate(() => { const of = window.drawSimFull; window.drawSimFull = function (s) { if (s < 6) return; return of.call(this, s) }; const ol = window.drawLinks; window.drawLinks = function (s) { if (s < ARROW_MIN_S) return; return ol.call(this, s) } });
    const fbLayer = fb ? fb.h : 0;
    await pg2.evaluate(h => __fb.setLayer(h), fbLayer);
    await pg2.click('#simB'); await pg2.evaluate(() => __fb.simRun(30));
    const bel = await pg2.evaluate(() => {
      const ids = [...smK().load.keys()];
      for (const id of ids) { const b = __fb.S.blocks.find(q => q.id === id); if (b && b.h === layer) return {x: b.x, y: b.y} }
      return null;
    });
    const views = {
      fitSimOn: null,
      L: {ox: 'L', oy: 'mid'}, R: {ox: 'R', oy: 'mid'}, T: {ox: 'mid', oy: 'T'}, B: {ox: 'mid', oy: 'B'},
    };
    const res = {};
    const grabNow = async () => { await pg2.evaluate(() => paint()); const r = await pg2.evaluate(() => { const d = cx.getImageData(0, 0, cv.width, cv.height).data; let h = 2166136261, nz = 0; for (let i = 0; i < d.length; i += 4) { const v = ((d[i] << 24) ^ (d[i + 1] << 16) ^ (d[i + 2] << 8) ^ d[i + 3]) >>> 0; if (v) nz++; h = Math.imul(h ^ v, 16777619) } return {h: h >>> 0, nz} }); r.url = await pg2.evaluate(() => cv.toDataURL('image/png')); return r };
    res.fitSimOn = await (async () => { await pg2.evaluate(() => __fb.fit()); return grabNow() })();
    for (const k of ['L', 'R', 'T', 'B']) {
      if (!bel) break;
      await pg2.evaluate(([k, bel]) => {
        V.z = 12 / CELLS[view]; const s = 12;
        if (k === 'L') { V.ox = -(bel.x + .5) * s; V.oy = H / 2 - (bel.y + .5) * s }
        if (k === 'R') { V.ox = W - (bel.x + .5) * s; V.oy = H / 2 - (bel.y + .5) * s }
        if (k === 'T') { V.ox = W / 2 - (bel.x + .5) * s; V.oy = -(bel.y + .5) * s }
        if (k === 'B') { V.ox = W / 2 - (bel.x + .5) * s; V.oy = H - (bel.y + .5) * s }
      }, [k, bel]);
      res[k] = await grabNow();
      if (k === 'L' && shotTag) await pg2.screenshot({path: path.join(SHOTS, `items-edge-L-${shotTag}.png`)});
    }
    // sim off, fit: links / arrows
    await pg2.click('#simB');
    await pg2.evaluate(() => __fb.fit());
    res.fitSimOff = await grabNow();
    await pg2.close();
    return {res, bel};
  };
  const after = await runViews(SRC, 'after');
  const before = await runViews(BEFORE, 'before');
  console.log('after belt', JSON.stringify(after.bel), 'before belt', JSON.stringify(before.bel));
  chk('3a belt with items found in view set', !!after.bel, JSON.stringify(after.bel));
  const dp = await br.newContext().then(c => c.newPage());
  const diffUrls = (ua, ub) => dp.evaluate(async ([ua, ub]) => {
    const load = async u => { const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height) };
    const A = await load(ua), B = await load(ub);
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < A.data.length; i += 4) if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2] || A.data[i + 3] !== B.data[i + 3]) { n++; const p = i >> 2, x = p % A.width, y = (p / A.width) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    return {n, box: n ? [x0, y0, x1, y1] : null};
  }, [ua, ub]);
  for (const k of Object.keys(after.res)) {
    const a = after.res[k], b = before.res[k];
    const d = b ? await diffUrls(a.url, b.url) : {n: -1};
    chk(`3b parity ${k} (${k === 'fitSimOn' ? 'fit, sim on, pre-fix ring gate emulated' : k === 'fitSimOff' ? 'fit, sim off (links/arrows)' : 'edge s=12, sim on'})`, d.n === 0, `differing px ${d.n}${d.box ? ' box ' + d.box.join(',') : ''}; after nz=${a.nz} before nz=${b && b.nz}`);
  }
  await dp.context().close();
  chk('3c links/arrows drawn at fit (sim off, nonblank)', after.res.fitSimOff.nz > 0, `nz=${after.res.fitSimOff.nz}`);
}

async function perf() {
  const targets = [];
  if (BEFORE) targets.push(['pre-fix 65be809', BEFORE]);
  if (process.env.MAIN_CO) targets.push(['main checkout (MAIN_CO)', process.env.MAIN_CO]);
  targets.push(['after 9442aa3', SRC]);
  for (const [name, dir] of targets) {
    for (let rep = 1; rep <= 2; rep++) {
      const pg = await open(dir);
      const cnt = await levelCounts(pg);
      const levels = Object.keys(cnt).map(Number).sort((a, b) => a - b);
      const L = process.env.PERF_LAYER !== undefined ? +process.env.PERF_LAYER : levels.find((h, i) => i > 0 && i < levels.length - 1 && levels[i - 1] === h - 1 && levels[i + 1] === h + 1) ?? levels[1];
      await pg.evaluate(L => { __fb.setView('F'); __fb.setLayer(L); __fb.fit() }, L);
      const med = (N = 15) => pg.evaluate(N => { const t = []; for (let i = 0; i < N; i++) { const a = performance.now(); __fb.paint(); t.push(performance.now() - a) } t.sort((x, y) => x - y); return +t[t.length >> 1].toFixed(1) }, N);
      const r = {};
      r.simOff_fit = await med();
      await pg.click('#simB'); await pg.evaluate(() => __fb.simRun(30));
      r.simOn_t30_fit = await med();
      await pg.evaluate(L => { const b = __fb.S.blocks.find(q => q.h === L); V.z = 12 / CELLS[view]; V.ox = W / 2 - (b.x + .5) * 12; V.oy = H / 2 - (b.y + .5) * 12 }, L);
      r.simOn_t30_s12 = await med();
      await pg.click('#simB');
      await pg.evaluate(() => __fb.fit());
      r.simOff_fit_again = await med();
      console.log(`PERF ${name} run${rep} layer ${L} blocks ${cnt[L]} :: ${JSON.stringify(r)}`);
      await pg.context().close();
    }
  }
}

try {
  if (MODE === 'perf') await perf(); else await verify();
} finally {
  await br.close();
}
console.log(`SUMMARY ${MODE}: ${total - fail} pass / ${fail} fail / ${total} total; page errors: ${pageErrs.length}${pageErrs.length ? ' ' + pageErrs.slice(0, 3).join(' | ') : ''}`);
process.exit(fail ? 1 : 0);

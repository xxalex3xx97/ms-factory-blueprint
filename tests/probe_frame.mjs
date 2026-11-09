// Frame-time probe on the benchmark station (default Beta_Honor_3_Central.json, env BENCH overrides).
// Per layer x zoom x mode: rAF frame delta, paints per frame, paint ms per frame, direct paint median.
// Run: node tests/probe_frame.mjs   (prints 24 lines; PAGEERROR lines only on page errors)
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href;
const txt = fs.readFileSync(process.env.BENCH || 'C:/Users/SFidelis/Downloads/Beta_Honor_3_Central.json', 'utf8');
const N = 90;
const med = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1] };
const p95 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(0.95 * (b.length - 1))] };
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1400, height: 900}})).newPage();
pg.on('pageerror', e => console.log('PAGEERROR', e.message));
await pg.goto(PAGE);
await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
await pg.evaluate(t => __fb.importJson(t, true), txt);
await pg.evaluate(() => {
  __fb.setView('F');
  // count paint() calls and ms; global function binding, so internal calls (draw rAF, smFrame) hit the wrapper
  const orig = window.paint;
  window.__P = {n: 0, ms: 0};
  window.paint = function () { const t = performance.now(); try { return orig.apply(this, arguments) } finally { __P.n++; __P.ms += performance.now() - t } };
});
// ghost off for the probe (links stay on)
await pg.evaluate(() => { const g = document.getElementById('ghost'); g.checked = false; g.dispatchEvent(new Event('change')) });
const MODES = [['idle', false, false], ['play', true, false], ['pan', false, true], ['play-pan', true, true]];
for (const L of [0, 1]) {
  await pg.evaluate(l => __fb.setLayer(l), L);
  if (!(await pg.evaluate(() => __fb.SM))) await pg.click('#simB');
  for (const z of [0.14, 1, 3.2]) {
    // centre view on median machine position of this layer
    await pg.evaluate(([l, zz]) => {
      const ms = S.blocks.filter(b => b.h === l && isM(b));
      const pool = ms.length ? ms : S.blocks.filter(b => b.h === l);
      const md = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1] };
      const mx = md(pool.map(b => b.x)), my = md(pool.map(b => b.y));
      V.z = zz; const s = sc();
      V.ox = W / 2 - (mx + .5) * s; V.oy = H / 2 - (my + .5) * s;
      draw();
    }, [L, z]);
    await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    for (const [mode, play, pan] of MODES) {
      if (play) { await pg.click('#sm1'); await pg.click('#smPlay') }
      const r = await pg.evaluate(([pan, N]) => new Promise(res => {
        const ts = []; __P.n = 0; __P.ms = 0;
        const f = t => {
          ts.push(t);
          if (pan) { V.ox += 6; draw() }
          if (ts.length <= N) requestAnimationFrame(f);
          else res({ts, n: __P.n, ms: __P.ms});
        };
        requestAnimationFrame(f);
      }), [pan, N]);
      if (play) await pg.click('#smPlay');   // pause again
      const pm = await pg.evaluate(() => { const t = []; for (let i = 0; i < 15; i++) { const a = performance.now(); __fb.paint(); t.push(performance.now() - a) } return t });
      const d = r.ts.slice(1).map((t, i) => t - r.ts[i]);
      console.log(`L${L} z${z} ${mode}: frame med/p95 ${med(d).toFixed(1)}/${p95(d).toFixed(1)} ms, paints/frame ${(r.n / N).toFixed(2)}, paintMs/frame ${(r.ms / N).toFixed(1)}, paint_med ${med(pm).toFixed(1)}`);
    }
  }
}
await br.close();

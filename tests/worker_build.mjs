// worker_build: layout compute runs in a Blob worker (file://). Gates: main thread not frozen (max tick gap < 300 ms), result == sync placerLayout,
// fallbacks (plcNoWorker, worker error) give the same result, cancel keeps the latest rate, plcNoWorker stays false after a normal build (structuredClone of L worked).
// Run: node tests/worker_build.mjs   Exit 1 on FAIL.
import {createRequire} from 'module';
import crypto from 'crypto';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0;
const ck = (name, ok, info) => { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' (' + info + ')' : '')) };
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
for (const eng of ['rb', 'cmp']) {
  const page = await (await br.newContext({viewport: {width: 1400, height: 900}})).newPage();
  page.on('pageerror', e => { console.log('PAGEERR', e.message); bad++ });
  await page.addInitScript(() => { window.__sig = () => JSON.stringify(plcL && plcL.tile ? [plcL.tile.blocks.map(b => [b.cls, b.x, b.y, b.rot || 0]), plcL.tile.ms.map(m => [m.cls, m.x, m.y, m.rot || 0, m.rec || '', m.dd ? 1 : 0]), plcL.note, plcL.stat] : plcL) });
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=' + eng);
  await page.waitForFunction(() => window.__fb && typeof placerGo === 'function');
  await page.evaluate(() => {
    const s = $('plnItem'); s.value = [...s.options].find(o => o.textContent.trim() === 'Advanced Circuits').value; s.dispatchEvent(new Event('change'));
    $('plnBk').value = 'BPO_Station_02'; $('plnDkI').checked = false; $('plnDkO').checked = false;
    $('plnRate').value = 5; $('plnRate').dispatchEvent(new Event('change'));
  });
  const idle = () => page.waitForFunction(() => $('pvLine').textContent !== 'Building...' && !plcBusyF, null, {timeout: 120000});
  const go = async (rate) => { await page.evaluate(r => { if (r) { $('plnRate').value = r; $('plnRate').dispatchEvent(new Event('change')) } placerGo() }, rate); };
  // worker build + tick gap
  await page.evaluate(() => { window.__ticks = []; setInterval(() => __ticks.push(performance.now()), 50) });
  await page.evaluate(() => placerGo());
  await idle();
  const gap = await page.evaluate(() => { const t = __ticks; let m = 0; for (let i = 1; i < t.length; i++) m = Math.max(m, t[i] - t[i - 1]); return Math.round(m) });
  const wk = await page.evaluate(() => ({ok: plcL && plcL.ok, nw: plcNoWorker, sig: __sig(), why: plcL ? plcL.why : $('plnPrevErr').textContent}));
  console.log(eng, 'why:', wk.why);
  ck(eng + ' built ok', wk.ok); ck(eng + ' max tick gap < 300ms', gap < 300, gap + ' ms');
  ck(eng + ' plcNoWorker stays false (clone ok)', wk.nw === false);
  // sync reference in the same page
  const ref = await page.evaluate(() => {
    window.plcNoWorker = true; plcLC.clear();
    const x = placerPlan(); const L = placerLayout(x.P, x.it, x.mk, x.sp ?? x.mk, {box: $('plnBuf').value, mod: false, dock: placerDock()});
    plcL = L; return __sig();
  });
  ck(eng + ' worker result == sync result', hash(wk.sig) === hash(ref), hash(wk.sig) + ' / ' + hash(ref));
  // fallback: plcNoWorker=true
  await page.evaluate(() => { plcL = null; plcLC.clear(); window.plcNoWorker = true; placerGo() }); await idle();
  ck(eng + ' fallback (no worker) equal', hash(await page.evaluate(() => __sig())) === hash(ref));
  // worker error path
  await page.evaluate(() => { plcL = null; plcLC.clear(); window.plcNoWorker = false; plcNoWorker = false; window.FB_WORKER_SRC = 'throw 1'; placerGo() }); await idle();
  const er = await page.evaluate(() => ({sig: __sig(), nw: plcNoWorker}));
  ck(eng + ' worker error falls back, equal', hash(er.sig) === hash(ref) && er.nw === true);
  // cancel: go at rate A, change to B before done, final = B
  await page.reload(); await page.waitForFunction(() => window.__fb && typeof placerGo === 'function');
  await page.evaluate(() => {
    const s = $('plnItem'); s.value = [...s.options].find(o => o.textContent.trim() === 'Advanced Circuits').value; s.dispatchEvent(new Event('change'));
    $('plnBk').value = 'BPO_Station_02'; $('plnDkI').checked = false; $('plnDkO').checked = false;
    $('plnRate').value = 7; $('plnRate').dispatchEvent(new Event('change')); placerGo();
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => { $('plnRate').value = 5; $('plnRate').dispatchEvent(new Event('change')); placerGo() }); await idle();
  const c1 = await page.evaluate(() => __sig());
  const c2 = await page.evaluate(() => { window.plcNoWorker = true; plcLC.clear(); const x = placerPlan(); plcL = placerLayout(x.P, x.it, x.mk, x.sp ?? x.mk, {box: $('plnBuf').value, mod: false, dock: placerDock()}); return __sig() });
  const rate = await page.evaluate(() => $('pvRate').value);
  ck(eng + ' cancel: final == rate 5 result', rate === '5' && hash(c1) === hash(c2), 'rate ' + rate);
  if (eng !== 'rb') continue;
  // progress events + status UI (fresh page state after the reload above)
  await page.evaluate(() => { window.__progLog = []; window.plcNoWorker = false; plcNoWorker = false; plcLC.clear(); placerGo() });
  await page.waitForFunction(() => __progLog.length >= 2 || !plcBusyF, null, {timeout: 120000});
  const mid = await page.evaluate(() => { const e = document.getElementById('plcProg'); return {vis: !!e && e.style.display === 'block', txt: e ? e.lastChild.textContent : ''} });
  if (process.env.SHOT) await page.screenshot({path: process.env.SHOT});
  await idle();
  const pg = await page.evaluate(() => ({log: __progLog, hid: document.getElementById('plcProg').style.display === 'none'}));
  const phases = new Set(pg.log.map(p => p.phase)), att = {};
  for (const p of pg.log) if (p.phase === 'Placing modules') (att[(p.detail.match(/attempt \d+/) || [''])[0]] ||= []).push(p.frac);
  const mono = Object.values(att).every(a => a.every((f, i) => !i || f >= a[i - 1]));
  ck('progress: >= 3 distinct phases', phases.size >= 3, [...phases].join(','));
  ck('progress: frac monotonic within an attempt', mono && Object.keys(att).length > 0);
  ck('progress: bar visible mid-build with status text', mid.vis || pg.log.length < 2, mid.txt);
  ck('progress: bar hidden when done', pg.hid);
  // forced rb refusal -> strips fallback shows the reason
  await page.evaluate(() => { window.RB_FORCE_REFUSE = true; plcL = null; plcLC.clear(); placerGo() }); await idle();
  const fb = await page.evaluate(() => ({ok: plcL && plcL.ok, why: plcL && plcL.rbWhy, badge: $('plnEngBadge').textContent, title: $('plnEngBadge').title, nw: plcNoWorker}));
  ck('forced refusal: L.rbWhy survives worker clone', fb.ok && fb.why === 'forced' && fb.nw === false, JSON.stringify(fb.why));
  ck('forced refusal: badge shows Strips fallback line', /Strips fallback: forced/.test(fb.badge) && fb.title === 'forced', fb.badge);
}
await br.close(); console.log(bad ? 'FAIL' : 'OK'); process.exit(bad ? 1 : 0);

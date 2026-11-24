// Mobile touch mode (class "mob" on <html>): 1-finger drag on empty pans, Select mode box-selects, long-press on empty opens #ctx. Run: node tests/touch_mode.mjs
import {createRequire} from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// serve the site over http and mark <html> as mobile (what m.html does), so MOB is true when input.js runs
const srv = http.createServer((q, s) => {
  const p = q.url.split('?')[0], f = path.join(ROOT, p === '/' ? 'index.html' : decodeURIComponent(p));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f);
  if (p === '/' || p.endsWith('index.html')) body = Buffer.from(body.toString().replace('<html lang="en">', '<html lang="en" class="mob">'));
  s.writeHead(200, {'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'}); s.end(body);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/index.html`;
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
try {
  const pg = await (await br.newContext({hasTouch: true, viewport: {width: 430, height: 932}})).newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL0);
  await pg.waitForFunction(() => window.__fb && typeof setTouchSel === 'function');
  const cdp = await pg.context().newCDPSession(pg);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map((p, i) => ({x: p[0], y: p[1], id: i}))});
  const rect = await pg.evaluate(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return [r.left, r.top]; });
  const P = (x, y) => [rect[0] + x, rect[1] + y];   // canvas-relative -> viewport
  const E = P(40, 450);   // empty space
  const st = () => pg.evaluate(() => ({ox: __fb.V.ox, oy: __fb.V.oy, sel: [...__fb.sel], ctx: !!document.querySelector("#ctx")}));
  // 1) 1-finger drag on empty space pans
  const s0 = await st();
  await T("touchStart", [E]); await T("touchMove", [[E[0] + 30, E[1] + 10]]); await T("touchMove", [[E[0] + 80, E[1] + 20]]); await T("touchEnd", []);
  const s1 = await st();
  chk("1-finger drag on empty pans", s1.ox !== s0.ox || s1.oy !== s0.oy, JSON.stringify({s0, s1}));
  chk("pan leaves selection empty", s1.sel.length === 0, JSON.stringify(s1.sel));
  await pg.evaluate(() => { const c = toCell(220, 300); S.blocks.push({id: 9001, cls: "BPO_Station_02", x: c.x, y: c.y, h: 0, rot: 0, pid: 0}); all(); });
  const B = await pg.evaluate(() => { const c = toCell(220, 300), r = document.querySelector("canvas").getBoundingClientRect(); return [r.left + V.ox + (c.x + .5) * sc(), r.top + V.oy + (c.y + .5) * sc()]; });
  // 2) Select mode (setTouchSel true): 1-finger drag box-selects the block
  await pg.evaluate(() => setTouchSel(true));
  await T("touchStart", [P(120, 200)]); await T("touchMove", [P(300, 380)]); await T("touchMove", [P(300, 380)]); await T("touchEnd", []);
  const s2 = await st();
  chk("Select mode box-selects the block", s2.sel.includes(9001), JSON.stringify(s2.sel));
  await pg.evaluate(() => setTouchSel(false));
  // 3) long-press (>=500 ms, no move) on empty space opens the right-click menu
  await T("touchStart", [E]); await new Promise(r => setTimeout(r, 700)); await T("touchEnd", []);
  const s3 = await st();
  chk("long-press on empty opens #ctx", s3.ctx, JSON.stringify(s3));
  await pg.evaluate(() => { const c = document.querySelector("#ctx"); if (c) c.remove(); });
  // 4) long-press on a block only selects it (no delete)
  await pg.evaluate(() => sel = new Set());
  await T("touchStart", [B]); await new Promise(r => setTimeout(r, 700)); await T("touchEnd", []);
  const s4 = await st(), n4 = await pg.evaluate(() => __fb.S.blocks.some(b => b.id === 9001));
  chk("long-press on block selects, does not delete", n4 && s4.sel.includes(9001) && !s4.ctx, JSON.stringify({s4, n4}));
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); srv.close(); }
process.exit(bad ? 1 : 0);

// Floor plan PNG/SVG export: whole plan rendered, live canvas restored. Run: node tests/floor_export.mjs [path/to/_S.sav]
import {createRequire} from 'module';
import path from 'path';
import fs from 'fs';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAV = process.argv[2] || 'C:/Users/SFidelis/AppData/Local/MainSequence/Saved/SaveGames/New Game 1-Autosave_S.sav';
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext({viewport: {width: 1500, height: 900}, acceptDownloads: true})).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  await pg.evaluate(() => document.getElementById('imp').click()); await pg.setInputFiles('#impFile', SAV); await pg.waitForSelector('#impSt:not([hidden])', {timeout: 60000});
  await pg.selectOption('#impSt', {label: /Main Base/}.test ? undefined : undefined).catch(() => {});
  const idx = await pg.$$eval('#impSt option', o => o.findIndex(x => /^Main Base/.test(x.textContent)));
  await pg.selectOption('#impSt', String(Math.max(0, idx))); await pg.evaluate(() => document.getElementById('impGo').click());
  const st = () => pg.evaluate(() => JSON.stringify({z: V.z, ox: V.ox, oy: V.oy, W, H, cw: cv.width, ch: cv.height, view}));
  for (const v of ['L', 'F']) {
    await pg.evaluate(v => { __fb.setView(v); __fb.fit(); }, v);
    const before = await st();
    for (const [id, ext] of [['shPng', 'png'], ['shSvg', 'svg']]) {
      const [dl] = await Promise.all([pg.waitForEvent('download'), pg.evaluate(id => document.getElementById(id).click(), id)]);
      const f = await dl.path(), buf = fs.readFileSync(f);
      fs.copyFileSync(f, path.join(ROOT, `tests/shots/fp-${v}.${ext}`));
      chk(`${v} ${ext}: file name`, dl.suggestedFilename().endsWith(v === 'L' ? `-layout.${ext}` : `-floor-plan.${ext}`), dl.suggestedFilename());
      if (ext === 'png') { chk(`${v} png: signature + size`, buf.slice(1, 4).toString() === 'PNG' && buf.length > 5000, String(buf.length)); chk(`${v} png: dimensions sane`, buf.readUInt32BE(16) > 200 && buf.readUInt32BE(20) > 200 && buf.readUInt32BE(16) <= 16000 && buf.readUInt32BE(20) <= 16000, `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`); }
      if (ext === 'png') chk(`${v} png: opaque dark background (corner pixel alpha 255, dark)`, await pg.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, 1, 1).data; return d[3] === 255 && d[2] > d[0]; }, buf.toString('base64')));
      else chk(`${v} svg: parses, embeds image`, await pg.evaluate(t => { const d = new DOMParser().parseFromString(t, 'image/svg+xml'); return !d.querySelector('parsererror') && !!d.querySelector('image'); }, buf.toString('utf8')));
    }
    chk(`${v}: live view/canvas restored`, (await st()) === before, before + ' vs ' + await st());
  }
  // quality slider: preview text matches the export, 50% is about half the side
  await pg.evaluate(() => { document.getElementById('shB').click(); __fb.setView('L'); document.getElementById('shQ').value = 100; document.getElementById('shQ').dispatchEvent(new Event('input')); });
  const full = await pg.evaluate(() => document.getElementById('shPrev').textContent), fw = +full.match(/^(\d+) × (\d+)/)[1];
  await pg.evaluate(() => { document.getElementById('shQ').value = 50; document.getElementById('shQ').dispatchEvent(new Event('input')); });
  const half = await pg.evaluate(() => document.getElementById('shPrev').textContent), hw = +half.match(/^(\d+) × (\d+)/)[1];
  chk('screenshot panel: 50% preview is about half the side of 100%', Math.abs(hw / fw - 0.5) < 0.02, full + ' | ' + half);
  const [dq] = await Promise.all([pg.waitForEvent('download'), pg.evaluate(() => document.getElementById('shPng').click())]);
  const qb = fs.readFileSync(await dq.path());
  chk('screenshot panel: exported PNG size equals the preview', qb.readUInt32BE(16) === hw && qb.readUInt32BE(20) === hw, `${qb.readUInt32BE(16)} vs ${hw}`);
  chk('no page errors', errs.length === 0, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

// Mobile UI: m.html at phone + tablet size. Run: node tests/mobile_ui.mjs
import {createRequire} from 'module';
import path from 'path';
import fs from 'fs';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'shots'); fs.mkdirSync(SHOTS, {recursive: true});
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
try {
  for (const [w, h] of [[430, 932], [820, 1180]]) {
    const tag = w + 'x' + h;
    const pg = await (await br.newContext({hasTouch: true, isMobile: true, deviceScaleFactor: 2, viewport: {width: w, height: h}})).newPage();
    pg.on('pageerror', e => errs.push(tag + ' ' + e.message));
    await pg.goto(pathToFileURL(path.join(ROOT, 'm.html')).href);
    await pg.waitForFunction(() => window.__fb && document.getElementById('mSel'));
    const m = await pg.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const small = [...document.querySelectorAll('header button,header input,header select,#mtb button,#mSel,#mFit')].filter(e => e.offsetParent !== null && (e.getBoundingClientRect().height < 43.5 || e.getBoundingClientRect().width < 43.5)).map(e => e.id || e.textContent.trim());
      const hd = document.querySelector('header');
      return {sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, hdr: hd.scrollWidth - hd.clientWidth,
        sel: r('mSel'), selVis: getComputedStyle(document.getElementById('mSel')).visibility, stage: r('stage'), vh: innerHeight, small, txt: document.querySelector('#mSel b').textContent};
    });
    chk(tag + ' no horizontal page overflow', m.sw <= m.cw, JSON.stringify([m.sw, m.cw]));
    chk(tag + ' header needs no scroll', m.hdr <= 0, 'overflow ' + m.hdr);
    chk(tag + ' toggle visible >=44px', m.selVis === 'visible' && m.sel.width >= 44 && m.sel.height >= 44 && m.sel.bottom <= m.vh, JSON.stringify(m.sel));
    chk(tag + ' toggle shows mode', m.txt === 'Pan');
    chk(tag + ' header/toolbar targets >=44px', !m.small.length, m.small.join(','));
    chk(tag + ' canvas fills width', m.stage.width >= w - 1, JSON.stringify(m.stage));
    await pg.tap('#mSel');
    chk(tag + ' toggle flips to Select', await pg.evaluate(() => document.querySelector('#mSel b').textContent === 'Select' && document.getElementById('mSel').getAttribute('aria-pressed') === 'true'));
    await pg.tap('#mSel');
    await pg.screenshot({path: path.join(SHOTS, `mobile_${tag}_base.png`)});
    for (const [id, name] of [['pal', 'Palette'], ['dock', 'Inspect'], ['mTools', 'Tools'], ['mMenu', 'Menu']]) {
      await pg.tap(`#mtb [data-s=${id}]`);
      await pg.waitForTimeout(400);
      const o = await pg.evaluate(id => { const e = document.getElementById(id), b = e.getBoundingClientRect(); return {vis: getComputedStyle(e).visibility, top: b.top, bot: b.bottom, w: b.width, tbTop: document.getElementById('mtb').getBoundingClientRect().top}; }, id);
      chk(`${tag} ${name} sheet opens`, o.vis === 'visible' && o.top >= 0 && o.bot <= o.tbTop + 2 && o.w <= w, JSON.stringify(o));
      await pg.screenshot({path: path.join(SHOTS, `mobile_${tag}_${id}.png`)});
      await pg.tap(`#${id} .mgrab .mx`);
      await pg.waitForTimeout(400);
      chk(`${tag} ${name} sheet closes`, await pg.evaluate(id => getComputedStyle(document.getElementById(id)).visibility === 'hidden', id));
    }
    // a Tools proxy opens a floating window as a sheet
    await pg.tap('#mtb [data-s=mTools]'); await pg.waitForTimeout(300);
    await pg.tap('#mTools [data-p=stB]'); await pg.waitForTimeout(400);
    const fw = await pg.evaluate(() => { const e = document.getElementById('stW'), b = e.getBoundingClientRect(); return {hidden: e.hidden, bot: b.bottom, tb: document.getElementById('mtb').getBoundingClientRect().top, w: b.width}; });
    chk(tag + ' Settings window shows above toolbar', !fw.hidden && fw.bot <= fw.tb + 2 && fw.w <= w, JSON.stringify(fw));
    await pg.screenshot({path: path.join(SHOTS, `mobile_${tag}_settings.png`)});
    await pg.tap('#stWX');
    chk(tag + ' Settings window closes', await pg.evaluate(() => document.getElementById('stW').hidden));
    await pg.close();
  }
} finally { await br.close(); }
chk('no page errors', !errs.length, errs.join('|'));
process.exit(bad ? 1 : 0);

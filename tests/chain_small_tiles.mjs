// chain engine: 1x1 / 2x1 tiles build or refuse with a reason (never a silent 2x2); output dock kind follows Output dock. Run: node tests/chain_small_tiles.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
const wait = async p => {
  await p.waitForTimeout(1500);
  await p.waitForFunction(() => $('pvLine').textContent !== 'Building...', null, {timeout: 120000});
  await p.waitForTimeout(500);
};
try {
  const p = await (await br.newContext()).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await p.waitForFunction(() => window.__fb && typeof placerGo === 'function');

  // Part 1: BPO_Station_02 with docks off, then output dock kind follows Output dock
  await p.evaluate(() => {
    $('plnItem').value = [...plnBy(false).keys()].find(i => plnNm(i) === 'Nickel Plates');
    $('plnRate').value = 31; $('plnMk').value = 1;
    $('plnDkI').checked = false; $('plnDkO').checked = false;
    $('plnBk').value = 'BPO_Station_02';
    placerGo();
  });
  await wait(p);
  const p1 = await p.evaluate(() => ({enabled: !$('plnPlace').disabled, err: $('plnPrevErr').textContent}));
  chk('02 Nickel Plates 31 docks off: Place enabled', p1.enabled, p1.err);
  for (const [OT, want] of [['nrm', 'normal dock'], ['ind', 'industrial dock']]) {
    await p.evaluate(OT => {
      $('plnDkO').checked = true; $('plnDkOT').value = OT;
      placerGo();
    }, OT);
    await wait(p);
    const io = await p.evaluate(() => $('pvIO').textContent);
    chk('output dock ' + OT + ' -> pvIO contains "' + want + '"', io.includes(want), io);
  }

  // Part 2: 1x1 / 2x1 tiles
  const tiles = ['BPO_Station_01', 'BPO_Station_2x1'];
  const items = [['Basic Circuits', 100], ['Nickel Plates', 31], ['Enzyme', 100]];
  for (const tile of tiles) for (const [name, rate] of items) {
    const tag = tile + ' | ' + name + ' ' + rate;
    const found = await p.evaluate(({name, rate, tile}) => {
      const it = [...plnBy(false).keys()].find(i => plnNm(i) === name);
      if (!it) return false;
      $('plnItem').value = it; $('plnRate').value = rate; $('plnMk').value = 1;
      $('plnBk').value = tile;
      placerGo();
      return true;
    }, {name, rate, tile});
    chk(tag + ': item found', found);
    if (!found) continue;
    await wait(p);
    const r = await p.evaluate(() => {
      const opt = v => $('plnBk').querySelector('option[value="' + v + '"]');
      const ok = !!(plcT && plcT.ok);
      const cls02 = ok ? plcT.blocks.filter(b => b.cls === plcCls('BPO_Station_02') || b.cls === plcCls('BPO_Station_03')).length : 0;
      return {
        o01: !!opt('BPO_Station_01') && opt('BPO_Station_01').disabled,
        o2x1: !!opt('BPO_Station_2x1') && opt('BPO_Station_2x1').disabled,
        sel: $('plnBk').value, ok, cls02,
        enabled: !$('plnPlace').disabled, err: $('plnPrevErr').textContent
      };
    });
    chk(tag + ': options 01 and 2x1 not disabled', !r.o01 && !r.o2x1, JSON.stringify({o01: r.o01, o2x1: r.o2x1}));
    chk(tag + ': tile kept', r.sel === tile, r.sel);
    console.log(tile + '|' + name + '|' + (r.ok ? 'ok machines/blocks built' : 'err: ' + r.err.slice(0, 100)));
    if (r.ok && r.cls02 > 0) {
      console.log('NEEDS-THINKING: ' + tag + ' built with ' + r.cls02 + ' 2x2 block(s) (silent 2x2 fallback)');
      bad++;
      continue;
    }
    const pass = (r.ok && r.cls02 === 0 && r.enabled) || (!r.enabled && r.err !== '');
    chk(tag + ': built without 2x2 with Place enabled, or refused with Place disabled + reason', pass, JSON.stringify(r).slice(0, 300));
  }
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

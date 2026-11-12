// Dock settings UI: defaults, persistence across reload, dock options off = layout unchanged. Run: node tests/dock_ui.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
try {
  const pg = await (await br.newContext()).newPage();
  pg.on('pageerror', e => errs.push(e.message));
  const load = async () => { await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href); await pg.waitForFunction(() => window.__fb && typeof placerDock === 'function'); };
  await load();
  const vals = () => pg.evaluate(() => ({i: $('plnDkI').checked, o: $('plnDkO').checked, t: $('plnDk').value, ot: $('plnDkOT').value}));
  let v = await vals();
  chk('defaults: both off, ind, same-as-input', !v.i && !v.o && v.t === 'ind' && v.ot === '', JSON.stringify(v));
  chk('placerDock() null when both off', await pg.evaluate(() => placerDock() === null));
  const cnt = () => pg.evaluate(() => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits'), P = plan(it, 100, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const a = placerLayout(P, it, 1, 1, {box: $('plnBuf').value, mod: false}), b = placerLayout(P, it, 1, 1, {box: $('plnBuf').value, mod: false, dock: placerDock()});
    return {a: a.ok && a.items.length, b: b.ok && b.items.length};
  });
  const c = await cnt();
  chk('docks off: layout identical with or without the dock option', c.a && c.a === c.b, JSON.stringify(c));
  await pg.evaluate(() => { $('plnDkI').checked = true; $('plnDkI').dispatchEvent(new Event('change')); $('plnDkO').checked = true; $('plnDk').value = 'nrm'; $('plnDk').dispatchEvent(new Event('change')); $('plnDkOT').value = 'ind'; $('plnDkOT').dispatchEvent(new Event('change')); });
  await load();
  v = await vals();
  chk('persist after reload: on, on, nrm, ind', v.i && v.o && v.t === 'nrm' && v.ot === 'ind', JSON.stringify(v));
  chk('placerDock() reflects the selectors', JSON.stringify(await pg.evaluate(() => placerDock())) === JSON.stringify({in: 'nrm', out: 'ind'}));
  await pg.evaluate(() => { $('plnDkI').checked = false; $('plnDkO').checked = false; $('plnDkO').dispatchEvent(new Event('change')); $('plnDkOT').value = ''; $('plnDkOT').dispatchEvent(new Event('change')); });
  await load();
  v = await vals();
  chk('persist after reload: both off, ot ""', !v.i && !v.o && v.ot === '', JSON.stringify(v));
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

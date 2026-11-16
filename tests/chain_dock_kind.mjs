// chain engine: input dock kind follows Dock, output dock kind follows Output dock (independent). Run: node tests/chain_dock_kind.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
const errs = [];
const combos = [['ind', 'nrm'], ['nrm', 'ind'], ['nrm', 'nrm'], ['ind', 'ind']];
try {
  const p = await (await br.newContext()).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await p.waitForFunction(() => window.__fb && typeof placerGo === 'function');
  for (const [IN, OUT] of combos) {
    const tag = `IN=${IN} OUT=${OUT}`;
    await p.evaluate(({IN, OUT}) => {
      $('plnItem').value = [...plnBy(false).keys()].find(i => plnNm(i) === 'Nickel Plates');
      $('plnRate').value = 31; $('plnMk').value = 1;
      $('plnDkI').checked = true; $('plnDkO').checked = true;
      $('plnDk').value = IN; $('plnDkOT').value = OUT;
      placerGo();
    }, {IN, OUT});
    await p.waitForTimeout(1500);
    await p.waitForFunction(() => $('pvLine').textContent !== 'Building...', null, {timeout: 120000});
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const N = plcCls('BPO_Dock'), I = plcCls('BPO_Dock_2');
      const outs = plcT.blocks.filter(b => /^Output dock/.test(b.nm || '')).map(b => b.cls);
      const ins = plcT.blocks.filter(b => /^Dock:/.test(b.nm || '')).map(b => b.cls);
      return {N, I, outs, ins, enabled: !$('plnPlace').disabled, err: $('plnPrevErr').textContent};
    });
    console.log(tag, 'counts outs=' + r.outs.length, 'ins=' + r.ins.length, 'N=' + r.N, 'I=' + r.I, 'outCls=' + JSON.stringify([...new Set(r.outs)]), 'inCls=' + JSON.stringify([...new Set(r.ins)]));
    chk(tag + ': output dock blocks exist', r.outs.length > 0, JSON.stringify(r));
    chk(tag + ': output dock kind = ' + OUT, r.outs.length > 0 && r.outs.every(c => c === (OUT === 'nrm' ? r.N : r.I)), JSON.stringify([...new Set(r.outs)]));
    chk(tag + ': input dock blocks exist', r.ins.length > 0, JSON.stringify(r));
    chk(tag + ': input dock kind = ' + IN, r.ins.length > 0 && r.ins.every(c => c === (IN === 'nrm' ? r.N : r.I)), JSON.stringify([...new Set(r.ins)]));
    chk(tag + ': place button enabled', r.enabled);
    chk(tag + ': no preview error', r.err === '', r.err);
  }
  chk('no page errors', !errs.length, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

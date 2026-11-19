// Container port toggles reach ConfigHex (game bytes) and survive import/export, imported filters are kept. Run: node tests/container_ports.mjs
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
let bad = 0; const chk = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
try {
  const pg = await (await br.newContext()).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(pathToFileURL(path.join(ROOT, 'index.html')).href + '?engine=old');
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  const r = await pg.evaluate(() => {
    const st = CATALOG.blocks.find(b => b.name === 'BPO_Station_01');
    const blk = {Class: st.class, GridLocation: {X: 0, Y: 0}, Height: 0, GridRotation: 0, BlockID: 1, PaletteID: 0};
    const mk = (cls, x, id, extra) => ({Class: cls, Transform: {GridLocation: {X: x, Y: 0}, Height: 0, GridRotation: 0}, MachineID: id, PaletteID: 0, ...extra});
    const run = ms => { __fb.importJson(JSON.stringify({Version: 2, DisplayName: 't', Blocks: [blk], DefaultMachines: ms})); return JSON.parse(JSON.stringify(build())).DefaultMachines; };
    const out = {};
    // 1) untouched container: no config bytes
    out.plain = run([mk('BP_ContainerObject', -8, 1, {})])[0].ConfigHex;
    // 2) toggle one port on the site, export
    const b = S.blocks.find(x => x.cls === 'DAT_Container'); togglePort(b, portsOf(b)[2].key);
    const e = JSON.parse(JSON.stringify(build())).DefaultMachines[0]; out.hex = e.ConfigHex; out.unv = e.PortOrderUnverified; out.ports = (e.Ports || []).filter(p => p.Enabled === false).length;
    out.dec = cfgDec('DAT_Container', e.ConfigHex);
    // 3) import that export: same port off, same bytes back
    const m2 = run([e])[0]; out.back = m2.ConfigHex; out.off2 = (S.blocks.find(x => x.cls === 'DAT_Container').off || []).length;
    // 4) real large-container bytes with a filter: kept, and a port change keeps the filter
    const real = cfgEnc('container', {filters: [{item: 'titaniumore', amount: 9000, flag: 0}], ports: Array.from({length: 16}, (_, i) => i !== 8)});
    const m3 = run([mk('BP_ContainerObject_2', -8, 1, {ConfigHex: real})])[0]; out.keep = m3.ConfigHex === real;
    const lb = S.blocks.find(x => x.cls === 'DAT_Container_2'); out.off3 = (lb.off || []).length;
    togglePort(lb, portsOf(lb)[0].key);
    const d3 = cfgDec('DAT_Container_2', JSON.parse(JSON.stringify(build())).DefaultMachines[0].ConfigHex); out.d3 = d3 && {f: d3.filters, off: d3.ports.filter(x => !x).length};
    out.bFl = lb.fl === undefined;
    return out;
  });
  chk('untouched container exports no config', r.plain === undefined, String(r.plain));
  chk('toggled port -> ConfigHex, 8 ports, exactly one off', r.dec && r.dec.ports.length === 8 && r.dec.ports.filter(x => !x).length === 1 && r.dec.filters.length === 0, JSON.stringify(r.dec));
  chk('port order flagged unverified', r.unv === true);
  chk('site Ports field lists the disabled port', r.ports === 1);
  chk('import -> export keeps the bytes and the disabled port', r.back === r.hex && r.off2 === 1, r.back + ' vs ' + r.hex);
  chk('real-style config imported: bytes kept bit-for-bit, 1 port off', r.keep && r.off3 === 1);
  chk('port change keeps the imported filter (2 ports off now)', r.d3 && r.d3.f.length === 1 && r.d3.f[0].item === 'titaniumore' && r.d3.f[0].amount === 9000 && r.d3.off === 2, JSON.stringify(r.d3));
  chk('container filters are not copied to the splitter filter field', r.bFl);
  chk('no page errors', errs.length === 0, errs.join('|'));
} finally { await br.close(); }
process.exit(bad ? 1 : 0);

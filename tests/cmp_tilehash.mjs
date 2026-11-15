// Tile identity proof: composes 12 cases, hashes tile blocks + machine/belt items + notes (sha1). Run before and after an engine speed-up and diff the output.
// Run: node tests/cmp_tilehash.mjs [out.json]  (env NOMEMO=1 turns the page compose memo off, default memo ON as in the runners). Prints 'hash case'; with out.json also writes it. Exit 0.
import {createRequire} from 'module';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof placerLayout === 'function' && typeof plan === 'function');
if (!process.env.NOMEMO) await pg.evaluate(() => { window.CMP_MEMO = true });
const BK = {'1x1': 'BPO_Station_01', '1x2': 'BPO_Station_2x1', '2x2': 'BPO_Station_02', '2x2c': 'BPO_Station_03', auto: 'auto'}, NR = {in: 'nrm', out: 'nrm'}, IN = {in: 'ind', out: 'ind'};
const CASES = [['Nickel 31 1x1', /^ITEM_NickelOre>ITEM_NickelPlates$/, 31, 0, '1x1'], ['Nickel 480 2x2', /^ITEM_NickelOre>ITEM_NickelPlates$/, 480, 1, '2x2'], ['Nickel 480 auto', /^ITEM_NickelOre>ITEM_NickelPlates$/, 480, 1, 'auto'],
  ['Basic Motor 100 2x2', />ITEM_BasicMotor$/, 100, 1, '2x2'], ['Capacitor 100 2x2', />ITEM_Capacitor$/, 100, 1, '2x2'], ['Capacitor 100 2x2 nrm', />ITEM_Capacitor$/, 100, 1, '2x2', NR],
  ['BC 100 2x2c ind', />ITEM_BasicCircuit$/, 100, 1, '2x2c', IN], ['Enzyme 30 2x2', />ITEM_Enzyme$/, 30, 1, '2x2'], ['Enzyme 30 2x2c nrm', />ITEM_Enzyme$/, 30, 1, '2x2c', NR],
  ['Nutrients 400 1x2', />ITEM_Nutrients$/, 400, 1, '1x2'], ['HullRepairKit 5 2x2', /^NAME:Hull Repair Kit$/, 5, 1, '2x2'], ['Backpack Mk1 auto', />ITEM_BackpackMk1$/, 1, 1, 'auto'], ['Capacitor 1000 2x2', />ITEM_Capacitor$/, 1000, 1, '2x2'],
  ['BC 101 2x2', />ITEM_BasicCircuit$/, 101, 1, '2x2'], ['BC 130 2x2', />ITEM_BasicCircuit$/, 130, 1, '2x2'], ['BC 99 2x2', />ITEM_BasicCircuit$/, 99, 1, '2x2'], ['AC 5 2x2', />ITEM_AdvancedCircuits$/, 5, 1, '2x2'], ['AC 5 2x2 ind', />ITEM_AdvancedCircuits$/, 5, 1, '2x2', IN], ['AC 5 2x2 Mk3', />ITEM_AdvancedCircuits$/, 5, 2, '2x2'], ['Capacitor 100 2x2 Mk3', />ITEM_Capacitor$/, 100, 2, '2x2']];
const out = {};
for (const [name, re, rate, mk, b, dock] of CASES) {
  const r = await pg.evaluate(a => {
    window.CMP_ENGINE = true;
    const nm = /^\^NAME:(.*)\$$/.exec(a.re) || /^NAME:(.*)$/.exec(a.re.replace(/^\^|\$$/g, '')), key = [].concat(...Object.values(RECS)).filter(r => !nm || plnNm(r.o[0]) === nm[1]).map(rk).find(k => nm || new RegExp(a.re).test(k)); if (!key) return {err: 'no key'};
    const item = [].concat(...Object.values(RECS)).find(r => rk(r) === key).o[0];
    const P = plan(item, a.rate, a.mk, {}, {[item]: key}, {proto: false, enr: false, obs: false});
    const L = placerLayout(P, item, a.mk, a.mk, {box: 'DAT_Container_2', mod: false, dock: a.dock, bk: a.bk});
    if (!L.ok) return {err: 'refused: ' + L.why};
    const T = L.tile;
    return {s: JSON.stringify([T.blocks.map(b => [b.cls, b.x, b.y, b.rot || 0]), T.ms.map(m => [m.cls, m.x, m.y, m.rot || 0, m.rec || '', m.dd ? 1 : 0]), L.note, L.stat])};
  }, {re: re.source, rate, mk, bk: BK[b], dock: dock || null});
  out[name] = r.err ? r.err : crypto.createHash('sha1').update(r.s).digest('hex').slice(0, 12);
  console.log(out[name] + ' ' + name);
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
await br.close();

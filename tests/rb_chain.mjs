// RB S2: recursive builder (?engine=rb) on single chains. Run: node tests/rb_chain.mjs   Exit 1 on FAIL or page error.
// checkCompose (tests/cmp_plan.mjs, strict): ok layout, machines per recipe == planner N, ov 0, span 0, no item in a wall / outside blocks, flood clean (every belt connected, no dead stub), stage-wise flow >= 0.99 x rate.
// Extra: every module with B=1 is ONE block, the stacked case has B>=2, T.blocks = every item inside a block (holes), blocks per module + ASCII block map printed.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkCompose} from './cmp_plan.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NICKEL = 'ITEM_NickelOre>ITEM_NickelPlates', MOTOR = 'ITEM_TitaniumPlates>ITEM_BasicMotor';
// [name, key, rate, block class, stacked expected]
const CASES = [['Basic Motor 60 2x2', MOTOR, 60, 'BPO_Station_02', false, true], ['Nickel Plates 480 2x2', NICKEL, 480, 'BPO_Station_02', false], ['Nickel Plates 480 1x2 (stacked)', NICKEL, 480, 'BPO_Station_2x1', true]];
const pageInfo = () => {
  const cmp = window.__cmpL.bl.cmp, T = window.__cmpL.tile, rb = cmp.rb;
  const dB = b => dim({cls: b.cls, rot: b.rot === 1 || b.rot === 3 ? b.rot : 0}), inB = (x, y) => T.blocks.some(b => { const d = dB(b); return x >= b.x * FC && x < b.x * FC + d.w * FC && y >= b.y * FC && y < b.y * FC + d.h * FC });
  const cols = {}; T.blocks.forEach(b => { (cols[b.x] = cols[b.x] || []).push(b.y) });
  let holes = 0; Object.values(cols).forEach(ys0 => { const ys = [...new Set(ys0)].sort((p, q) => p - q); ys.slice(1).forEach((y, i) => { holes += Math.round((y - ys[i]) / dB(T.blocks[0]).h) - 1 }) });
  return {rb, itemsOut: T.ms.filter(b => !inB(b.x, b.y)).length, holes, blocks: T.blocks.length, nodes: cmp.nodes.map(q => q.item + ' ' + q.N)};
};
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
let fails = 0; const pageErrs = [];
const check = (ok, msg) => { if (!ok) { console.log('FAIL ' + msg); fails++ } else console.log('ok   ' + msg) };
try {
  const page = await (await br.newContext()).newPage();
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=rb');
  await page.waitForFunction(() => window.__fb && typeof rbRun === 'function' && typeof placerLayout === 'function');
  check(await page.evaluate(() => globalThis.RB_ENGINE === true), 'RB_ENGINE on with ?engine=rb');
  for (const [name, key, rate, bk, stacked, small] of CASES) {
    const t0 = Date.now(), r = await checkCompose(page, key, rate, 1, bk, {strict: true, mutate: 'any', exactN: true});
    check(r.ok, name + ': checkCompose strict (planner N exact, ov 0, span 0, flood clean, stage flow)' + (r.ok ? '' : ' -> ' + r.errs.slice(0, 4).join(' | ')));
    if (!r.ok) continue;
    const i = await page.evaluate(pageInfo), tm = Date.now() - t0;
    console.log('   ' + name + ': ' + tm + ' ms, blocks ' + i.blocks + ', machines/node: ' + i.nodes.join('; '));
    i.rb.mods.forEach(m => console.log('   module ' + m.letter + ' ' + m.item + ' N=' + m.N + ': B=' + m.B + ' nPhys=' + m.nPhys + ' blocks=' + m.blocks + ' at c' + m.c + ' r' + m.r));
    console.log(i.rb.ascii.map(s => '      ' + s).join('\n'));
    check(i.itemsOut === 0 && i.holes === 0, name + ': every item inside a block, no holes (' + i.itemsOut + ' out, ' + i.holes + ' holes)');
    check(i.rb.mods.filter(m => m.B === 1).every(m => m.blocks === m.nPhys), name + ': B=1 modules claim exactly nPhys blocks (no extra cells)');
    if (small) check(i.rb.mods.every(m => m.blocks === 1), name + ': every module is ONE block (pieces fit one floor)');
    check(stacked ? i.rb.mods.some(m => m.B >= 2) : true, name + (stacked ? ': stacked group B>=2' : ': no stacking needed'));
  }
} catch (e) { fails++; console.log('FAIL exception ' + e.stack) } finally { await br.close() }
if (pageErrs.length) { console.log('page errors: ' + pageErrs.join(' | ')); fails++ }
console.log(fails ? 'FAIL ' + fails : 'PASS rb_chain');
process.exit(fails ? 1 : 0);

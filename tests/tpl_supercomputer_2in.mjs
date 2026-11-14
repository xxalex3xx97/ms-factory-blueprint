// TPL supercomputer_2in gates (page). Run: node tests/tpl_supercomputer_2in.mjs   Exit 1 on FAIL.
// DAT_Supercomputer, k=2, blocks 1x1 1x2 2x2 2x2c, n in {1,nMax-1,nMax}, nMax+1 refused; checkIface on each.
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {checkIface} from './tpl_iface.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=bl');
await pg.waitForFunction(() => window.__fb && typeof placerCut === 'function' && typeof pfSplOff === 'function');
await pg.addScriptTag({content: fs.readFileSync(path.join(ROOT, 'js/tpl/supercomputer_2in.js'), 'utf8').replace(/^const (TPLG_\w+)=/gm, 'var $1=')});
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++ };
const REC = 'ITEM_EmptySimulationMatrix+ITEM_StellarSurveyData>ITEM_EncodedSimulationMatrix';
for (const block of ['1x1', '1x2', '2x2', '2x2c']) for (const mk of [0, 1]) {
  const r = await pg.evaluate(([block, mk, REC]) => {
    const spec = {block, cls: 'DAT_Supercomputer', rec: REC, mk, spMk: mk, n: 1}, nMax = tplMax(spec);
    const ns = [...new Set([1, nMax - 1, nMax].filter(n => n >= 1 && n <= nMax))];
    const runs = ns.map(n => { const T = tplBuild({...spec, n}); return {n, ok: T.ok, why: T.why, machines: T.ok ? T.items.filter(b => b.rec).length : 0, T: T.ok ? {ok: T.ok, items: T.items, w: T.w, h: T.h, ports: T.ports, iface: T.iface} : null} });
    const neg = tplBuild({...spec, n: nMax + 1});
    return {nMax, runs, negRefused: !neg.ok, why: neg.why};
  }, [block, mk, REC]);
  const tag = `${block} mk${mk}`;
  console.log(`INFO ${tag} nMax=${r.nMax}`);
  check(r.nMax >= 1, tag + ' nMax>=1');
  for (const g of r.runs) {
    check(g.ok && g.machines === g.n, `${tag} n=${g.n} built ${g.machines} machines ${g.why || ''}`);
    if (g.ok) { const I = await checkIface(pg, g.T, block, r.runs[0].T); check(I.ok, `${tag} n=${g.n} checkIface ${I.errs.slice(0, 3).join('; ')}`) }
  }
  {const I = await checkIface(pg, {ok: false}, block); check(!I.ok && r.negRefused, `${tag} n=${r.nMax + 1} refused (${r.why})`)}
}
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);

// Recipe key uniqueness gate: no two recipes share rk(); Reinforced Plate shows both recipes (Assembler 6+3 t180, AdvancedAssembler 3+3 t90); planner N/util for the placed machine class match the composer's placed machines; legacy base key still resolves.
// Run: node tests/plan_rk.mjs   Exit 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await pg.waitForFunction(() => window.__fb && typeof cmpCompose === 'function' && typeof placerLayout === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
const R = await pg.evaluate(() => {
  const out = {dups: [], rp: [], comp: []};
  // (1) every recipe has a unique rk
  const seen = new Map();
  Object.keys(RECS).forEach(c => RECS[c].forEach(r => { const k = rk(r), p = seen.get(k); if (p) out.dups.push(k + ' ' + p + ' / ' + c); else seen.set(k, c) }));
  // (2) planner lists every recipe of an item (no dedupe loss), proto on
  const by = plnBy(true), want = new Map();
  Object.keys(RECS).forEach(c => RECS[c].forEach(r => want.set(r.o[0], (want.get(r.o[0]) || 0) + 1)));
  out.lost = [...want].filter(([it, n]) => (by.get(it) || []).length !== n).map(([it, n]) => it + ' ' + n + ' vs ' + (by.get(it) || []).length);
  const RPI = 'ITEM_ReinforcedPlates';
  const l = plnBy(false).get(RPI) || [];
  out.rpCount = l.length;
  for (const {c, r} of l) {
    const key = rk(r);
    const P = plan(RPI, 120, 1, {}, {[RPI]: key}, {proto: false, enr: false, obs: false});
    const n = P.nodes[RPI];
    const row = {c, key, t: r.t, inQ: r.i.map(x => x[1]), planCrafter: n.crafter, planRec: n.rec && rk(n.rec), N: n.machines, util: n.util};
    const L = placerLayout(P, RPI, 1, 1, {box: 'DAT_Container_2', mod: false, dock: null, bk: PL_ALL[0]});
    row.ok = L.ok; row.why = L.why;
    if (L.ok) {
      let T = L.tile; if (!T) T = placerTile(L, placerBk());
      const cls = 'DAT_' + c.replace('CRAFT_', '');
      const ms = (T.ms || []).filter(b => b.rec === key);row.clsOk = ms.every(b => b.cls === cls);
      row.placed = ms.length; row.placedRecs = ms.length;
      row.resolved = [...new Set(ms.map(b => { const q = recOf(b); return q && q.t }))];
    }
    out.rp.push(row);
  }
  // (3) legacy base key still resolves inside a crafter, and exports under the game recipe name
  const base = 'ITEM_HullPlates+ITEM_Superalloy>ITEM_ReinforcedPlates';
  out.legacy = ['DAT_Assembler', 'DAT_AdvancedAssembler'].map(cl => { const q = recOf({cls: cl, rec: base}); return q && q.t });
  out.recName = [recName(base), recName(rk(l[0].r))];
  const P0 = plan(RPI, 60, 1, {}, {[RPI]: base}, {proto: false, enr: false, obs: false});
  out.legacyPick = P0.nodes[RPI].rec && P0.nodes[RPI].rec.t;
  return out;
});
check(R.dups.length === 0, 'no two recipes share rk (' + R.dups.join('; ') + ')');
check(R.lost.length === 0, 'plnBy keeps every recipe of every item (' + R.lost.slice(0, 3).join('; ') + ')');
check(R.rpCount === 2, 'planner lists 2 Reinforced Plate recipes, got ' + R.rpCount);
check(new Set(R.rp.map(r => r.key)).size === 2, 'the two Reinforced Plate keys differ: ' + R.rp.map(r => r.key).join(' | '));
for (const r of R.rp) {
  console.log('  ', JSON.stringify(r));
  check(r.planRec === r.key, r.c + ': plan() runs the picked recipe');
  check(r.ok === true, r.c + ': composer builds (' + r.why + ')');
  check(r.clsOk && r.placed >= r.N, r.c + ': placed ' + r.placed + ' machines of the picked recipe, all in the planner crafter, >= planner N ' + r.N);
  check(r.resolved && r.resolved.length === 1 && r.resolved[0] === r.t, r.c + ': placed machines run recipe t=' + r.t + ', got ' + JSON.stringify(r.resolved));
}
check(R.legacy[0] === 180 && R.legacy[1] === 90, 'legacy base key resolves per crafter: ' + JSON.stringify(R.legacy));
check(R.recName[0] === R.recName[1] && R.recName[0] === 'reinforcedplate', 'export recipe name unchanged: ' + JSON.stringify(R.recName));
check(R.legacyPick === 90 || R.legacyPick === 180, 'legacy base key as planner pick still plans');
check(errs.length === 0, 'no page errors ' + errs.join('; '));
await br.close();
process.exit(fails ? 1 : 0);

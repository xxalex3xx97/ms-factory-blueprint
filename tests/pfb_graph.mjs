// pfBands step 3: pfBandGraph
// Run:  node tests/pfb_graph.mjs     Exit code 1 on FAIL or page error.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof pfBandGraph === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };

const cases = [{name: 'Advanced Circuits', rate: 5}, {name: 'Magnetic Coils', rate: 30}];
for (const c of cases) {
  const r = await pg.evaluate(c => {
    const it = [...plnBy(false).keys()].find(i => plnNm(i) === c.name);
    const P = plan(it, c.rate, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
    const G = pfBandGraph(P, it, 1);
    if (G.ok === false) return {refused: G.why};
    const L = new Map(); [...G.nodes, ...G.dummies].forEach(n => L.set(n.id, n.layer));
    const bad = G.edges.filter(e => L.get(e.to) - L.get(e.from) !== 1).length;
    const want = G.oedges.reduce((a, e) => a + e.span - 1, 0);
    const inLayers = G.layers.reduce((a, l) => a + l.length, 0);
    const raws = G.nodes.filter(n => n.kind === 'raw'), hubs = G.nodes.filter(n => n.kind === 'hub');
    const fin = G.nodes.filter(n => n.kind === 'grp' && n.item === it);
    const finHub = hubs.some(h => h.item === it);
    const wide = G.layers.map(l => l.reduce((a, d) => a + [...G.nodes, ...G.dummies].find(n => n.id === d).w, 0) + PF_GAP * (l.length - 1));
    const H0 = pfHubNode().h;
    const grpBad = G.nodes.filter(n => n.kind === 'grp' && (n.cls === undefined || n.k === undefined || !n.flows || !n.rec || n.h === undefined)).length;
    const hubBad = G.nodes.filter(n => (n.kind === 'hub' || n.kind === 'raw') && n.h !== H0).length;
    return {grpBad, hubBad, name: c.name, nodes: G.nodes.length, dummies: G.dummies.length, edges: G.edges.length, oedges: G.oedges.length, bad, want, inLayers, nLayers: G.layers.length, raws: raws.length, hubs: hubs.length, fin: fin.length, finHub, rawLayer0: raws.every(n => n.layer === 0), maxW: Math.max(...wide)};
  }, c);
  console.log(c.name, c.rate, JSON.stringify(r));
  if (r.refused) { check(false, c.name + ' refused: ' + r.refused); continue }
  check(r.bad === 0, c.name + ': every edge joins adjacent layers (bad ' + r.bad + ')');
  check(r.dummies === r.want, c.name + ': dummies ' + r.dummies + ' = sum(span-1) ' + r.want);
  check(r.edges === r.oedges + r.dummies, c.name + ': split edges ' + r.edges + ' = orig ' + r.oedges + ' + dummies');
  check(r.inLayers === r.nodes + r.dummies, c.name + ': layers list every node + dummy once');
  check(r.raws >= 1 && r.rawLayer0, c.name + ': raw hubs exist, all layer 0');
  check(r.fin >= 1 && !r.finHub, c.name + ': final item has group node(s), no hub');
  check(r.nLayers >= 2, c.name + ': at least 2 layers (' + r.nLayers + ')');
  check(r.grpBad === 0, c.name + ': every grp node has cls/k/flows/rec/h (bad ' + r.grpBad + ')');
  check(r.hubBad === 0, c.name + ': every hub and raw node has h = pfHubNode().h (bad ' + r.hubBad + ')');
}
check(await pg.evaluate(() => PF_WRAP) === 120, 'PF_WRAP = 120');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails || errs.length ? 1 : 0);

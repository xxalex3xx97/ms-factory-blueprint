// VC0 measure (no engine change). Decodes snippets (8).json [4] '2x2 10x assembler' (golden), diffs it against the planner's
// parametric rule (right column X=24,Y=132,n=5,g=3; left = mirror x'=29-x), prints a lane table, then runs blTop/pfCompose for Basic Circuits 100.
// Run: node tests/vc_probe.mjs   (prints tables only, no assertions). Needs Chrome + index.html for part 4.
import {createRequire} from 'module';
import path from 'path';
import fs from 'fs';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNIP = 'C:/Users/SFidelis/Downloads/snippets (8).json';

const sn = JSON.parse(fs.readFileSync(SNIP, 'utf8')).snippets[4];   // data only, never executed
if (sn.n !== '2x2 10x assembler') throw new Error('snippets[4] is ' + sn.n);
const B = sn.b;
const BELT = 'DAT_ConveyorBelt2', UG = 'DAT_UndergroundBelt_2', SPL = 'DAT_Splitter_2', ASM = 'DAT_Assembler', C2 = 'DAT_Container_2', C1 = 'DAT_Container';
const SIZE = {[ASM]: [5, 5], [C2]: [4, 4], [C1]: [2, 2]};
const dim = cls => SIZE[cls] || [1, 1];
const ARW = ['>', 'v', '<', '^'];
const chr = b => ({[ASM]: 'M', [C2]: 'K', [C1]: 'k', [SPL]: 'S', [UG]: 'U'})[b.cls] || (b.cls === BELT ? ARW[b.rot] : '?');
const cells = list => {
  const m = new Map(); let dup = 0;
  for (const b of list) { const [w, h] = dim(b.cls); for (let x = b.x; x < b.x + w; x++) for (let y = b.y; y < b.y + h; y++) { const k = x + ',' + y; if (m.has(k)) dup++; else m.set(k, b) } }
  m.dup = dup; return m;
};
const cnt = list => { const c = {}; for (const b of list) c[b.cls] = (c[b.cls] || 0) + 1; return c };
const lanes = (list, xs, y0, y1, cls) => list.filter(b => b.cls === cls && xs.includes(b.x) && b.y >= y0 && b.y <= y1).length;

// ---- 1. decode golden
console.log('== 1. golden "' + sn.n + '" items ' + B.length + ' ' + JSON.stringify(cnt(B)));
const xs0 = Math.min(...B.map(b => b.x)), xs1 = Math.max(...B.map(b => b.x + dim(b.cls)[0])), ys0 = Math.min(...B.map(b => b.y)), ys1 = Math.max(...B.map(b => b.y + dim(b.cls)[1]));
console.log(`bbox x ${xs0}..${xs1 - 1} y ${ys0}..${ys1 - 1} = ${xs1 - xs0}x${ys1 - ys0} = ${(xs1 - xs0) * (ys1 - ys0)} cells`);
console.log('containers: ' + B.filter(b => b.cls.startsWith('DAT_Container')).map(b => `${b.cls === C2 ? 'C2' : 'C1'}(${b.x},${b.y})`).join(' '));
for (const x of [24, 1]) console.log(`machines x=${x}: ` + B.filter(b => b.cls === ASM && b.x === x).sort((a, b) => a.y - b.y).map(b => `y${b.y} r${b.rot} off${JSON.stringify(b.off || [])}`).join(' | '));
console.log('machine rec set: ' + JSON.stringify([...new Set(B.filter(b => b.cls === ASM).map(b => b.rec))]));
console.log('splitters: ' + B.filter(b => b.cls === SPL).sort((a, b) => a.x - b.x || a.y - b.y).map(b => `(${b.x},${b.y})r${b.rot}${b.off ? JSON.stringify(b.off) : ''}`).join(' '));
console.log('bottom run y=157: ' + B.filter(b => b.y === 157 && b.cls !== ASM).sort((a, b) => a.x - b.x).map(b => `${b.x}:${chr(b)}`).join(' '));
console.log('lane counts y121..164 (belt/UG/spl):');
for (const xs of [[20], [21], [22], [23], [6], [7], [8], [9], [29], [0]]) console.log(`  x${xs[0]}: belt ${lanes(B, xs, 121, 164, BELT)} UG ${lanes(B, xs, 121, 164, UG)} spl ${lanes(B, xs, 121, 164, SPL)}`);

// ---- 2. planner rule (right column X=24 Y=132 n=5 g=3 P=5), left = mirror x'=29-x-(w-1)
const X = 24, Y = 132, n = 5, g = 3;
const RT = [], CEN = [];
const put = (cls, x, y, rot, off) => RT.push({cls, x, y, rot, off});
for (let i = 0; i < n; i++) put(ASM, X, Y + 5 * i, 3, i === 0 ? ['N0', 'N1'] : i === n - 1 ? ['S4', 'S5'] : []);
for (let i = 0; i < n; i++) { put(SPL, X - 1, Y + 1 + 5 * i); put(SPL, X - 3, Y + 3 + 5 * i) }   // A splitter x=23 (W7 feed), B splitter x=21 (E out via 22,23)
put(BELT, 23, Y, 1);                                                                             // A upper chain head
for (let i = 0; i < n; i++) { put(UG, 23, Y + 5 * i + 2); put(UG, 23, Y + 5 * i + 4); put(BELT, 23, Y + 5 * i + 5, i < n - 1 ? 1 : 2) }
for (let i = 0; i < n; i++) put(BELT, 23, Y + 3 + 5 * i, 0);                                     // crossover row (A lane hops under)
put(BELT, 22, Y, 1); put(BELT, 22, Y + 1, 1);                                                    // A feeder x=22
for (let i = 0; i < g; i++) { put(UG, 22, Y + 5 * i + 2); put(UG, 22, Y + 5 * i + 4); if (i < g - 1) { put(BELT, 22, Y + 5 * i + 5, 1); put(BELT, 22, Y + 5 * i + 6, 1) } }
put(BELT, 22, Y + 5 * g, 0);                                                                     // turn east into lane 23 head
for (let i = 0; i < n; i++) put(BELT, 22, Y + 3 + 5 * i, 0);                                     // crossover x=22
for (let j = 0; j < 3; j++) put(BELT, 21, Y + j, 1);                                             // B upper chain x=21
put(BELT, 21, Y + 5 * g + 2, 1);                                                                 // B lower head
for (let j = 0; j < 4; j++) put(BELT, 20, Y + j, 1);                                             // B feeder x=20
for (let i = 0; i < g; i++) { put(UG, 20, Y + 5 * i + 4); put(UG, 20, Y + 5 * i + 6); if (i < g - 1) { put(BELT, 20, Y + 5 * i + 7, 1); put(BELT, 20, Y + 5 * i + 8, 1) } }
put(BELT, 20, Y + 5 * g + 2, 0);                                                                 // turn east into lane 21 lower head
for (let y = Y + 1; y <= Y + 5 * n - 1; y++) put(BELT, 29, y, 1);                                // collector x=29
put(BELT, 29, Y + 5 * n, 2);
for (let x = 21; x <= 28; x++) put(BELT, x, Y + 5 * n, 2);                                       // bottom run y=157 west
put(BELT, 20, Y + 5 * n, 3);
put(C2, 22, 121); put(C2, 18, 121); put(C1, 22, 130); put(C1, 20, 130);
CEN.push({cls: C2, x: 13, y: 153}, {cls: C2, x: 13, y: 161});
const mir = b => ({...b, x: 29 - b.x - (dim(b.cls)[0] - 1), rot: b.rot === 0 ? 2 : b.rot === 2 ? 0 : b.rot, off: b.off && b.off.map(p => ({W6: 'E2', W7: 'E3', E2: 'W6', E3: 'W7'})[p] || p)});
const RULE = [...RT, ...RT.map(mir), ...CEN];
console.log('== 2. rule vs golden: rule ' + RULE.length + ' objs ' + JSON.stringify(cnt(RULE)));
const EM = cells(RULE), AM = cells(B);
const anchor = (o, k) => o.x + ',' + o.y === k;
const multi = o => dim(o.cls)[0] * dim(o.cls)[1] > 1;
const diff = [];
for (const k of [...new Set([...EM.keys(), ...AM.keys()])].sort((p, q) => { const [a, b] = p.split(',').map(Number), [c, d] = q.split(',').map(Number); return b - d || a - c })) {
  const e = EM.get(k), a = AM.get(k);
  if (e && a && multi(e) && multi(a) && !anchor(e, k) && !anchor(a, k)) continue;
  if (e && multi(e) && !anchor(e, k) && (!a || multi(a) && !anchor(a, k))) continue;
  if (a && multi(a) && !anchor(a, k) && (!e || multi(e) && !anchor(e, k))) continue;
  if (e && !a) diff.push(`MISSING ${k} rule ${e.cls.slice(4)}${e.rot !== undefined ? ' r' + e.rot : ''}`);
  else if (!e && a) diff.push(`EXTRA ${k} snippet ${a.cls.slice(4)}${a.cls === BELT ? ' r' + a.rot : ''}`);
  else if (e.cls !== a.cls) diff.push(`TYPE ${k} rule ${e.cls.slice(4)} snippet ${a.cls.slice(4)}`);
  else if (e.rot !== undefined && e.rot !== a.rot) diff.push(`ROT ${k} rule r${e.rot} snippet r${a.rot}`);
  else if (e.cls === ASM && anchor(e, k) && JSON.stringify([...(e.off || [])].sort()) !== JSON.stringify([...(a.off || [])].sort())) diff.push(`OFF ${k} rule ${JSON.stringify(e.off || [])} snippet ${JSON.stringify(a.off || [])}`);
}
console.log(`discrepancies: ${diff.length} (rule-only cells ${diff.filter(s => s.startsWith('MISSING')).length}, snippet-only ${diff.filter(s => s.startsWith('EXTRA')).length})`);
for (const s of diff) console.log('  ' + s);
console.log('splitter off in golden (not in rule compare): ' + B.filter(b => b.cls === SPL && b.off).map(b => `(${b.x},${b.y})${JSON.stringify(b.off)}`).join(' '));

// ---- 3. lane table y121..164 (R = right lanes x20..23, x24 machine col, x29 collector; L = x0, x5 machine col, x6..9 left lanes)
console.log('== 3. golden cell table (belts as > v < ^, U=UG, S=splitter, M=assembler, K=C2, k=C1, .=empty)');
const cols = [20, 21, 22, 23, 24, 29, 0, 5, 6, 7, 8, 9];
console.log('y    ' + cols.map(c => String(c).padStart(2)).join(' ').replace(/^(.{ 0,0})/, '') + '   (cols: R20 R21 R22 R23 M24 C29 | C0 M5 L6 L7 L8 L9)');
for (let y = 121; y <= 164; y++) console.log(String(y).padEnd(5) + cols.map(c => { const b = AM.get(c + ',' + y); return (b ? chr(b) : '.').padStart(2) }).join(' '));

// ---- 4. page: blTop / pfCompose for Basic Circuits 100
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext()).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof blTop === 'function' && typeof pfCompose === 'function' && typeof plan === 'function' && typeof plnBy === 'function' && typeof PLC_UG !== 'undefined' && typeof PLC_SPL !== 'undefined');
const r = await pg.evaluate(() => {
  const it = [...plnBy(false).keys()].find(i => /^Basic Circuit/i.test(plnNm(i)));
  if (!it) return {err: 'no Basic Circuits item'};
  const P = plan(it, 100, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false});
  const sum = items => { const c = f => items.filter(b => f(b.cls)).length; return {belts: c(k => k === 'DAT_ConveyorBelt2'), ug: c(k => PLC_UG.includes(k)), spl: c(k => PLC_SPL.includes(k)), mach: c(k => k === 'DAT_Assembler'), cont: c(k => k.startsWith('DAT_Container'))} };
  const run = (name, L) => (L && L.ok) ? {name, ok: true, eng: L.eng || (L.bl && L.bl.eng) || null, w: L.w, h: L.h, area: L.w * L.h, sum: sum(L.items), stat: L.stat || null} : {name, ok: false, why: String(L && L.why).slice(0, 160)};
  return [
    run('pfCompose default', pfCompose(P, it, 1, 0, {box: 'DAT_Container_2'})),
    run('pfCompose tower', pfCompose(P, it, 1, 0, {box: 'DAT_Container_2', eng: 'tower'})),
    run('blTop default', blTop(P, it, 1, 0, {box: 'DAT_Container_2'})),
  ];
});
console.log('== 4. Basic Circuits 100 (current engine)');
if (r.err) console.log('FAIL ' + r.err); else for (const x of r) console.log(JSON.stringify(x));
console.log('golden: belts ' + cnt(B)[BELT] + ' UG ' + cnt(B)[UG] + ' spl ' + cnt(B)[SPL] + ' machines ' + cnt(B)[ASM] + ' bbox ' + (xs1 - xs0) * (ys1 - ys0) + ' cells');
console.log('page errors: ' + (errs.length ? errs.join(' | ') : 'none'));
await br.close();

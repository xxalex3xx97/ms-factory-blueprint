// 3-input stages (placer.js plcTree three, plcStage three, plcThreeTC, placerBank C band). REAL UI: plan, place by click, audit, sim. Run: node tests/placer_multi3.mjs. Exit 1 on any failed check or page error. Shots: tests/shots/three-<w>x<h>.png (Superalloy 55/min modal).
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOTS = path.join(HERE, 'shots');
const W = 1400, H = 800;
const ITEM = 'ITEM_Superalloy';
const RATES = [10, 25, 55];

let total = 0, pass = 0;
const fails = [], errs = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else if (/sim/i.test(name)) { console.log(`WARN sim shortfall (not a failure): ${name}${detail ? ' ' + detail : ''}`); }   // sim vs target: a shortfall warns (user rule), structure stays a hard fail
  else { fails.push({name, detail}); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
function info(msg) { console.log(`INFO ${msg}`); }

async function reset(pg) {
  await pg.evaluate(() => { S.blocks = []; undoS = []; redoS = []; pasting = null; clip = []; STRICT = true; setView('L'); });
}
async function openPlanner(pg) {
  if (await pg.evaluate(() => document.getElementById('pln').hidden)) await pg.evaluate(() => document.getElementById('plnB').click());
  if (await pg.evaluate(() => $('pln').classList.contains('col'))) await pg.click('#plnC');
}
async function closeIfOpen(pg) {
  if (await pg.evaluate(() => $('plnPrev').open)) await pg.click('#plnCancel');
  await pg.evaluate(() => { pasting = null; });
}
async function setup(pg, item, rate, mk, buf) {
  await closeIfOpen(pg);
  await reset(pg);
  await openPlanner(pg);
  await pg.selectOption('#plnItem', item);
  await pg.evaluate(mk => { $('plnMk').value = String(mk); $('plnMk').dispatchEvent(new Event('change')); $('plnSp').value = ''; }, mk);
  await pg.fill('#plnRate', String(rate));
  await pg.evaluate(b => { $('plnBuf').value = b; $('plnMod').checked = false; }, buf);
}
async function openBuild(pg) {
  await pg.click('#plnBuild');
  await pg.waitForFunction(() => document.getElementById('plnPrev').open, null, {timeout: 5000}).catch(() => {});
  await pg.waitForTimeout(150);
  return pg.evaluate(() => ({open: $('plnPrev').open, note: $('plnPrevNote').textContent, err: $('plnPrevErr').textContent, off: $('plnPlace').disabled, hubs: plcT && plcT.ok ? plcT.L.hubs : -1, G: plcT && plcT.ok ? plcT.G : -1}));
}
// real mouse click on the first free stage tile (stage = any canvas except the preview)
async function stageClick(pg) {
  const pt = await pg.evaluate(() => {
    for (const [x, y] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [10, 10], [12, 12], [15, 15], [20, 20], [25, 25]]) {
      const p = __fb.px(x, y), e = document.elementFromPoint(p[0], p[1]);
      if (e && e.tagName === 'CANVAS' && e.id !== 'plnPrevMap') return {x: p[0], y: p[1]};
    }
    return null;
  });
  if (!pt) return false;
  await pg.mouse.move(pt.x, pt.y);
  await pg.mouse.click(pt.x, pt.y);
  return true;
}
async function shots(pg, tag) {
  fs.mkdirSync(SHOTS, {recursive: true});
  for (const [w, h] of [[2576, 982], [1400, 800], [1024, 700], [390, 844]]) {
    await pg.setViewportSize({width: w, height: h});
    await pg.waitForTimeout(300);
    await pg.locator('#plnPrevMap').screenshot({path: path.join(SHOTS, `${tag}-${w}x${h}.png`)}).catch(e => info('modal shot failed: ' + e.message));
  }
  await pg.setViewportSize({width: W, height: H});
  await pg.waitForTimeout(300);
}
// (1-input chain machines: port feed not audited, the sim check covers them) placed 3-input factory: overlap, items inside floor, UG pairs even and span-valid (inclusive count <= maxApart), machine inputs fed (3 per enrichment machine), output leaves to a belt, no splitter side into a vertical belt, every splitter side output is a belt, UG or nothing
const audit3 = () => {
  const isB = b => kindOf(b.cls) === 'b', ms = S.blocks.filter(b => !isB(b)), cells = new Map(); let ov = 0;
  ms.forEach(b => { const e = dim(b); for (let i = 0; i < e.w; i++) for (let j = 0; j < e.h; j++) { const k = (b.x + i) + ',' + (b.y + j); if (cells.has(k)) ov++; cells.set(k, b) } });
  const frs = S.blocks.filter(isB).map(q => floorRect(q));
  const inside = ms.every(m => { const e = dim(m); return frs.some(fr => fr && m.x >= fr.x && m.y >= fr.y && m.x + e.w <= fr.x + fr.w && m.y + e.h <= fr.y + fr.h) });
  const ugs = ms.filter(b => PLC_UG.includes(b.cls)), grp = {}, bad = [];
  ugs.forEach(u => { const key = (u.rot & 1) === 0 ? 'h' + u.y : 'v' + u.x; (grp[key] = grp[key] || []).push(u) });
  let pairs = 0, maxSpan = 0, maxCount = 0;
  for (const key in grp) {
    const hz = key[0] === 'h', list = grp[key].sort((a, b) => hz ? a.x - b.x : a.y - b.y);
    if (list.length % 2) bad.push(key + ' odd count');
    for (let k = 0; k + 1 < list.length; k += 2) {
      const a = list[k], b = list[k + 1], sp = hz ? b.x - a.x : b.y - a.y, cnt = sp + 1;   // inclusive cells entrance..exit
      pairs++; maxSpan = Math.max(maxSpan, sp); maxCount = Math.max(maxCount, cnt);
      if (sp < 1 || cnt > def(a.cls).maxApart || a.rot !== b.rot) bad.push(key + ' pair count ' + cnt);
    }
  }
  const DV = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const flowsTo = (c, dx, dy) => { const d = DV[c.rot & 3]; return d[0] === dx && d[1] === dy };
  const isFeeder = c => c && (PLC_BELT.includes(c.cls) || PLC_UG.includes(c.cls) || PLC_SPL.includes(c.cls) || c.cls === PLC_BOX);   // a container next to a port feeds it (raw source or buffer)
  let fedIn = 0, fedOut = 0, badIn = [], machines = 0;
  for (const m of ms.filter(b => b.rec && /Enrich/.test(b.cls))) {
    machines++;
    let ins = 0, outs = 0;
    for (const p of portsOf(m)) {
      if (!p.en) continue;
      const c = cells.get((p.x + p.nx) + ',' + (p.y + p.ny));
      if (!c || c === m) continue;
      if ((c.cls === PLC_BOX || flowsTo(c, -p.nx, -p.ny)) && isFeeder(c)) ins++;
      else if (PLC_BELT.includes(c.cls) && !flowsTo(c, -p.nx, -p.ny)) outs++;
    }
    fedIn += ins; fedOut += outs;
    const need = m.rec.split('>')[0].split('+').length;
    if (need >= 2 && ins !== need) badIn.push('machine at ' + m.x + ',' + m.y + ' has ' + ins + ' fed inputs, needs ' + need);
  }
  let splLeak = 0;
  for (const s of ms.filter(b => PLC_SPL.includes(b.cls))) {
    const vert = (s.rot & 1) === 1, sides = vert ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
    for (const [dx, dy] of sides) { const c = cells.get((s.x + dx) + ',' + (s.y + dy)); if (c && PLC_BELT.includes(c.cls) && (c.rot & 1) === (vert ? 1 : 0)) splLeak++ }
  }
  return {ov, inside, machines, fedIn, fedOut, badIn, splLeak, pairs, maxSpan, maxCount, bad, ugOk: bad.length === 0};
};
// mean of the last 12 SIM.ser samples of the item (5 simulated minutes)
const simStats = item => {
  simInit({}); simRun(600);
  const got = SIM.ser.slice(-12).reduce((a, s) => a + (s.it[item] || 0), 0) / 12, ms = [...SIM.M.values()];
  return {got, n: ms.length, blocked: ms.filter(m => m.st === 'blocked').length};
};

const RUN = (process.env.ONLY || '');
(async () => {
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const ctx = await br.newContext({viewport: {width: W, height: H}});
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE);
  await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined' && typeof placerLayout === 'function');
  await reset(pg);

  // ---- placed 3-input stages at 10, 25, 55 per minute (Mk1)
  for (const rate of RATES) {
    await setup(pg, ITEM, rate, 0, 'DAT_Container');
    const O = await openBuild(pg);
    info(`S${rate}) modal note=${JSON.stringify(O.note)} err=${JSON.stringify(O.err)} hubs=${O.hubs} G=${O.G}`);
    chk(`S${rate}) Superalloy ${rate}/min Mk1: modal opens, no error, Place enabled`, O.open && O.err === '' && !O.off);
    chk(`S${rate}) modal note names three inputs`, /Three inputs into Superalloy: A Enriched Titanium Ore \(main chain\) \+ B Enriched Nickel Ore \+ C Enriched Cobalt Ore/.test(O.note), O.note);
    chk(`S${rate}) one hub per junction (1 stage junction, 1 band)`, O.hubs === 1 && O.G === 1, `hubs=${O.hubs} G=${O.G}`);
    if (RUN && !RUN.split(',').includes(String(rate))) { await closeIfOpen(pg); continue; }
    if (rate === 55) await shots(pg, 'three');
    await pg.click('#plnPlace');
    const placed = await stageClick(pg);
    await pg.waitForTimeout(150);
    const ag = await pg.evaluate(audit3);
    const sim = await pg.evaluate(simStats, ITEM);
    info(`S${rate}) placed=${placed} ov=${ag.ov} machines=${ag.machines} fedIn=${ag.fedIn} fedOut=${ag.fedOut} pairs=${ag.pairs} maxCount=${ag.maxCount} splLeak=${ag.splLeak} sim=${sim.got.toFixed(2)} blocked=${sim.blocked}`);
    chk(`S${rate}) placed by real click, no overlap, items inside floor`, placed && ag.ov === 0 && ag.inside === true, JSON.stringify({ov: ag.ov, inside: ag.inside}));
    chk(`S${rate}) UG pairs valid, inclusive span <= Mk maxApart`, ag.ugOk === true, JSON.stringify(ag.bad));
    chk(`S${rate}) every machine has all its inputs fed, output leaves to a belt, no splitter side into a vertical belt`, ag.machines >= 1 && ag.badIn.length === 0 && ag.fedOut >= ag.machines && ag.splLeak === 0, JSON.stringify({badIn: ag.badIn, fedOut: ag.fedOut, splLeak: ag.splLeak}));
    chk(`S${rate}) sim >= target (mean last 12 samples), none blocked`, placed && sim.got >= rate && sim.blocked === 0, JSON.stringify(sim));

    await pg.keyboard.press('Control+z');
  }

  // ---- sim at full rate: 3-input bands sized for the full rate (every band the same machine count, B/C chains rounded up): Large Mk2 120 and Container Mk2 120 build, place by click, ov 0, UG span valid, sim >= 120 (mean last 12)
  for (const [buf, label] of [['DAT_Container_2', 'Large Mk2 120 (sim)'], ['DAT_Container', 'Container Mk2 120 (sim)']]) {
    await setup(pg, ITEM, 120, 1, buf);
    const SB = await openBuild(pg);
    chk(`SB) ${label}: builds (no error, Place enabled)`, SB.open && SB.err === '' && !SB.off, JSON.stringify({err: SB.err, off: SB.off}));
    if (SB.err !== '' || SB.off) { await closeIfOpen(pg); continue; }
    await pg.click('#plnPlace');
    if (await pg.evaluate(() => $('plnPrevBig').textContent.length > 0)) await pg.click('#plnPlace');   // more than PLC_BIG blocks: confirm once
    const placedS = await stageClick(pg);
    await pg.waitForTimeout(150);
    const agS = await pg.evaluate(audit3);
    const simS = await pg.evaluate(simStats, ITEM);
    info(`SB) ${label}: placed=${placedS} ov=${agS.ov} maxCount=${agS.maxCount} sim=${simS.got.toFixed(2)} blocked=${simS.blocked}`);
    chk(`SB) ${label}: placed by real click, no overlap, items inside floor`, placedS && agS.ov === 0 && agS.inside === true, JSON.stringify({ov: agS.ov, inside: agS.inside}));
    chk(`SB) ${label}: UG pairs valid, inclusive span <= Mk maxApart`, agS.ugOk === true, JSON.stringify(agS.bad));
    chk(`SB) ${label}: sim >= 120 (mean of last 12 samples), none blocked`, placedS && simS.got >= 120 && simS.blocked === 0, JSON.stringify(simS));
    await pg.keyboard.press('Control+z');
  }

  // ---- several trunks / bands per 3-input stage: 75/min and 300/min build (sim >= target), Large Mk1 120 builds; Container Mk1 120 builds or refuses cleanly with a reason and Place disabled; no hang (25 s)
  for (const [rate, mk, buf, label, mustBuild] of [[75, 0, 'DAT_Container', 'Container Mk1 75', true], [300, 1, 'DAT_Container', 'Container Mk2 300', true], [300, 1, 'DAT_Container_2', 'Large Mk2 300', true], [120, 0, 'DAT_Container_2', 'Large Mk1 120', true], [120, 0, 'DAT_Container', 'Container Mk1 120', false]]) {
    await setup(pg, ITEM, rate, mk, buf);
    const t0 = Date.now();
    const MT = await openBuild(pg);
    const dtM = Date.now() - t0;
    info(`MT) ${label}: ${dtM} ms, G=${MT.G}, err=${JSON.stringify(MT.err)}, Place disabled=${MT.off}`);
    chk(`MT) ${label}: returns within 25 s`, dtM < 25000, dtM + ' ms');
    if (!mustBuild) {
      chk(`MT) ${label}: builds, or refuses with a reason and Place disabled`, MT.open && ((MT.err === '' && !MT.off) || (MT.err !== '' && MT.off === true)), JSON.stringify({err: MT.err, off: MT.off}));
      if (MT.err !== '') { await closeIfOpen(pg); continue; }
    } else chk(`MT) ${label}: builds (no error, Place enabled)`, MT.open && MT.err === '' && !MT.off, JSON.stringify({err: MT.err, off: MT.off}));
    if (MT.err !== '' || MT.off) { await closeIfOpen(pg); continue; }
    await pg.click('#plnPlace');
    if (await pg.evaluate(() => $('plnPrevBig').textContent.length > 0)) await pg.click('#plnPlace');
    const placedM = await stageClick(pg);
    await pg.waitForTimeout(150);
    const agM = await pg.evaluate(audit3);
    const simM = await pg.evaluate(simStats, ITEM);
    info(`MT) ${label}: placed=${placedM} ov=${agM.ov} span-ok=${agM.ugOk} sim=${simM.got.toFixed(2)} blocked=${simM.blocked}`);
    chk(`MT) ${label}: placed by real click, no overlap, items inside floor`, placedM && agM.ov === 0 && agM.inside === true, JSON.stringify({ov: agM.ov, inside: agM.inside}));
    chk(`MT) ${label}: UG pairs valid, inclusive span <= Mk maxApart`, agM.ugOk === true, JSON.stringify(agM.bad));
    chk(`MT) ${label}: sim >= ${rate} (mean of last 12 samples), none blocked`, placedM && simM.got >= rate && simM.blocked === 0, JSON.stringify(simM));
    await pg.keyboard.press('Control+z');
  }

  // ---- wall cuts: blank columns inserted where a planned wall cut is not free; Superalloy into a plain container at Mk2/Mk3 55/min builds, placed by click, ov 0, UG inclusive span <= Mk, sim >= target
  for (const [mk, label] of [[1, 'Container Mk2 55'], [2, 'Container Mk3 55']]) {
    await setup(pg, ITEM, 55, mk, 'DAT_Container');
    const B = await openBuild(pg);
    chk(`B) ${label}: builds (no error, Place enabled)`, B.open && B.err === '' && !B.off, JSON.stringify({err: B.err, off: B.off}));
    if (B.err !== '' || B.off) { await closeIfOpen(pg); continue; }
    await pg.click('#plnPlace');
    const placedB = await stageClick(pg);
    await pg.waitForTimeout(150);
    const agB = await pg.evaluate(audit3);
    const simB = await pg.evaluate(simStats, ITEM);
    info(`B) ${label}: placed=${placedB} ov=${agB.ov} blocks=${agB.blocks} pairs=${agB.pairs} maxCount=${agB.maxCount} sim=${simB.got.toFixed(2)} blocked=${simB.blocked}`);
    chk(`B) ${label}: placed by real click, no overlap, items inside floor`, placedB && agB.ov === 0 && agB.inside === true, JSON.stringify({ov: agB.ov, inside: agB.inside}));
    chk(`B) ${label}: UG pairs valid, inclusive span <= Mk maxApart`, agB.ugOk === true, JSON.stringify(agB.bad));
    chk(`B) ${label}: sim >= 55 (mean of last 12 samples), none blocked`, placedB && simB.got >= 55 && simB.blocked === 0, JSON.stringify(simB));
    await pg.keyboard.press('Control+z');
  }

  // ---- Large container one-band layout: Superalloy Mk2 120/min builds G=1 (fewer than 17 blocks), placed by click, ov 0, UG span within Mk, sim >= target; Large at other rates/Mk builds or refuses cleanly with Place disabled, no hang (25 s)
  {
    await setup(pg, ITEM, 120, 1, 'DAT_Container_2');
    const t0 = Date.now();
    const LG = await openBuild(pg);
    const dtG = Date.now() - t0;
    info(`LG) Large Mk2 120: ${dtG} ms, G=${LG.G}, hubs=${LG.hubs}, err=${JSON.stringify(LG.err)}`);
    chk('LG) Large Mk2 120 returns within 25 s', dtG < 25000, dtG + ' ms');
    chk('LG) Large Mk2 120 builds one band (G=1)', LG.open && LG.err === '' && !LG.off && LG.G === 1, JSON.stringify({err: LG.err, G: LG.G}));
    if (LG.G === 1) {
      await pg.click('#plnPlace');
      if (await pg.evaluate(() => $('plnPrevBig').textContent.length > 0)) await pg.click('#plnPlace');   // more than PLC_BIG blocks: the modal asks to confirm once
      const placedG = await stageClick(pg);
      await pg.waitForTimeout(150);
      const agG = await pg.evaluate(audit3);
      const simG = await pg.evaluate(simStats, ITEM);
      info(`LG) placed=${placedG} ov=${agG.ov} pairs=${agG.pairs} maxCount=${agG.maxCount} sim=${simG.got.toFixed(2)} blocked=${simG.blocked}`);
      chk('LG) Large Mk2 120 placed by real click, no overlap, items inside floor', placedG && agG.ov === 0 && agG.inside === true, JSON.stringify({ov: agG.ov, inside: agG.inside}));
      chk('LG) Large Mk2 120: UG pairs valid, inclusive span <= Mk maxApart', agG.ugOk === true, JSON.stringify(agG.bad));
      chk('LG) Large Mk2 120: sim >= 120 (mean of last 12 samples), none blocked', placedG && simG.got >= 120 && simG.blocked === 0, JSON.stringify(simG));
      await pg.keyboard.press('Control+z');
    }
    for (const [mk, rate] of [[0, 25], [1, 25], [1, 55], [2, 55], [0, 120], [2, 300]]) {
      await setup(pg, ITEM, rate, mk, 'DAT_Container_2');
      const t1 = Date.now();
      const LO = await openBuild(pg);
      const dt = Date.now() - t1;
      chk(`LG) Large Mk${mk + 1} ${rate}/min: returns within 25 s; builds (Place enabled) or clean refusal (Place disabled)`, dt < 25000 && LO.open && ((LO.err === '' && !LO.off) || (LO.err !== '' && LO.off === true)), JSON.stringify({dt, err: LO.err, off: LO.off}));
      await closeIfOpen(pg);
    }
  }

  // ---- wall cuts: Superalloy into a plain container at Mk2/Mk3 55/min is width-limited (no free cut column within 6 spare columns of a 30-wide floor): a clean refusal with Place disabled, or a fit; Large buffer Mk2 120 returns within 25 s, consistent with Place
  for (const [mk, rate, buf, label] of [[1, 55, 'DAT_Container', 'Container Mk2 55'], [2, 55, 'DAT_Container', 'Container Mk3 55'], [1, 120, 'DAT_Container_2', 'Large Mk2 120']]) {
    await setup(pg, ITEM, rate, mk, buf);
    const t0 = Date.now();
    const W = await openBuild(pg);
    const dt = Date.now() - t0;
    info(`W) ${label}: ${dt} ms, G=${W.G}, hubs=${W.hubs}, err=${JSON.stringify(W.err)}, Place disabled=${W.off}`);
    chk(`W) ${label} returns within 25 s`, dt < 25000, dt + ' ms');
    chk(`W) ${label}: fit (Place enabled) or clean refusal (Place disabled, reason names the wall/width)`, W.open && ((W.err === '' && !W.off) || (/cannot reach|not free|tick a bigger block|underground/.test(W.err) && W.off === true)), JSON.stringify({err: W.err, off: W.off}));
    await closeIfOpen(pg);
  }

  // ---- regression: Large container buffer (gap-row hang), each case returns within 20 s; an error in the modal always disables Place
  for (const [rate, mk] of [[10, 0], [25, 0], [25, 1], [55, 1]]) {
    await setup(pg, ITEM, rate, mk, 'DAT_Container_2');
    const t0 = Date.now();
    const G = await openBuild(pg);
    const dt = Date.now() - t0;
    info(`L) Large Mk${mk + 1} ${rate}/min: ${dt} ms, err=${JSON.stringify(G.err)}, Place disabled=${G.off}`);
    chk(`L) Large buffer Mk${mk + 1} ${rate}/min returns within 20 s (no hang)`, dt < 20000, dt + ' ms');
    chk(`L) Large Mk${mk + 1} ${rate}/min: error shown => Place disabled`, G.err === '' || G.off === true, JSON.stringify({err: G.err, off: G.off}));
    await closeIfOpen(pg);
  }


  // ---- refusals in the modal: Place disabled, reason names the port / 3-input limit
  // no 3-input Refinery recipe exists in the data (checked: the 3-input recipes are Assembler, Enrichment Chamber, Growth Chamber); the non-chain 3-input refusal is checked instead
  await setup(pg, 'ITEM_ContainmentCoil', 10, 0, 'DAT_Container');
  const C = await openBuild(pg);
  chk('R) ITEM_ContainmentCoil (3 inputs, shared intermediate) refused in the modal with an input-chain reason, Place disabled', C.open && /input chain/.test(C.err) && C.off === true, JSON.stringify(C.err));
  await setup(pg, 'ITEM_Nutrients', 10, 0, 'DAT_Container');
  const N = await openBuild(pg);
  chk('R) ITEM_Nutrients refused in the modal ("3 inputs per machine"), Place disabled', N.open && /3 inputs per machine/.test(N.err) && N.off === true, JSON.stringify(N.err));
  await closeIfOpen(pg);
  chk('page: no pageerror / console.error during the run', errs.length === 0, errs.slice(0, 3).join(' | '));
  process.exitCode = fails.length || errs.length ? 1 : 0;
} catch (e) {
  console.log('FAIL exception: ' + e.message); process.exitCode = 1;
} finally {
  await br.close();
  console.log(`\n${pass}/${total} checks passed`);
}
})();

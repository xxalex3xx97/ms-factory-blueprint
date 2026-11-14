// Headless check of js/sav_export.js: template round-trip, export of tests/fixtures/sav_sample.json,
// re-parse in JS, and cross-check with tools/sav_counts.py (Python writer helper).
// Run: node tests/sav_export.mjs
// Writes only C:/Users/SFidelis/rea_work/out/site-sample.sav. Exit code 1 on any failed check.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import {execFileSync} from 'child_process';
import {fileURLToPath} from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['config', 'sav_template', 'sav_export'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), f + '.js');

let total = 0, pass = 0;
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`);
}

// Re-parse helpers (raw sub-props are little-endian int32 or FString).
const i32 = (u8, off = 0) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getInt32(off, true);
const raw = (e, n) => savFind(e, n).val[1];
const xf = e => {
  const t = raw(e, 'Transform'), g = savFind(t, 'GridLocation').val[1];
  return {X: i32(g, 0), Y: i32(g, 4), H: i32(savFind(t, 'Height').val[1]), R: i32(savFind(t, 'GridRotation').val[1])};
};
const clsOf = e => savFstrR(raw(e, 'Class'), 0)[0];
const cfgHex = e => Buffer.from(raw(e, 'SerializedMachineConfig').slice(4)).toString('hex');
const cfgLenOk = e => i32(raw(e, 'SerializedMachineConfig')) === raw(e, 'SerializedMachineConfig').length - 4;

// 1. Template round-trip.
const tpl = Uint8Array.from(Buffer.from(SAV_TPL, 'base64'));
chk('template round-trips byte-identical', Buffer.compare(Buffer.from(savDump(savLoad(tpl))), Buffer.from(tpl)) === 0);

// 2. Export fixture.
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/sav_sample.json'), 'utf8'));
const r = savExport(fx);
const bytes = Buffer.from(r.bytes);
chk('export produces bytes', bytes.length > 0, `len ${bytes.length}`);
const re = savLoad(new Uint8Array(bytes));
chk('re-dump identical to export', Buffer.compare(Buffer.from(savDump(re)), bytes) === 0);
chk('no warnings for fixture classes', Array.isArray(r.warn) && r.warn.length === 0, JSON.stringify(r.warn));

const bpRe = savFind(re.props, 'Blueprint').val[1];
const blkRe = savFind(bpRe, 'Blocks').val[1], conRe = savFind(bpRe, 'Connectors').val[1], macRe = savFind(bpRe, 'Machines').val[1];
const dnRe = savFstrR(savFind(bpRe, 'DisplayName').val[1].slice(9), 0)[0];
chk('DisplayName parses back', dnRe === 'Site Sample', `got "${dnRe}"`);

const isConn = s => SAV_CONN.includes(s);
const pathOf = c => (c.startsWith('/Game/') ? c : SAV_PATHS[c.split('/').pop().split('.')[0]]);
// IDs interleave with in-block machines, so match blocks by order within Blocks / Connectors.
const rotv = (dx, dy, r) => { for (let i = 0; i < ((r % 4) + 4) % 4; i++) [dx, dy] = [-dy, dx]; return [dx, dy]; };
// Flat fixture machines that the export must emit in-block only (their key is produced by an in-block machine).
const DEDUPED = ['BPO_Elevator_02|16000|0|0', 'BPO_IndustrialDock|19264|0|0'];
let blkOk = true, blkDetail = [], inOk = true, inDetail = [], inTotal = 0, zeroOk = true, dockOk = false, elevOk = false;
let kb = 0, kc = 0;
fx.Blocks.forEach(b => {
  const short = b.Class.split('/').pop().split('.')[0];
  const e = isConn(short) ? conRe[kc++] : blkRe[kb++];
  const ok = !!e && clsOf(e) === pathOf(b.Class) &&
    JSON.stringify(xf(e)) === JSON.stringify({X: b.GridLocation.X, Y: b.GridLocation.Y, H: b.Height, R: b.GridRotation}) &&
    i32(raw(e, 'PaletteID')) === (b.PaletteID || 0);
  if (!ok) blkDetail.push(`block ${b.Class}`);
  blkOk = blkOk && ok;

  // In-block default machines vs SAV_DEFM (FIX-1: pos = 8*block + rotated offset, Height = 8*block H + dh, rot = block rot + dr).
  const dm = e ? savFind(e, 'DefaultMachines').val[1] : [], want = SAV_DEFM[short] || [];
  inTotal += dm.length;
  if (!want.length && dm.length) zeroOk = false;
  if (dm.length !== want.length) { inOk = false; inDetail.push(`${short}: ${dm.length} in-block, want ${want.length}`); }
  const br = ((b.GridRotation % 4) + 4) % 4;
  dm.forEach((me, k) => {
    const d = want[k], [dx, dy] = rotv(d.dx, d.dy, br);
    const exp = {X: 8 * b.GridLocation.X + dx, Y: 8 * b.GridLocation.Y + dy, H: 8 * b.Height + d.dh, R: (d.dr + br) & 3};
    const good = clsOf(me) === d.c && JSON.stringify(xf(me)) === JSON.stringify(exp);
    if (!good) { inOk = false; inDetail.push(`${short} machine ${k}`); }
    if (short === 'BPO_Dock_2' && b.GridRotation === 2) dockOk = good && exp.X === 8 * b.GridLocation.X - 64 && exp.R === 0;
    if (short === 'BPO_ElevatorBlock_03') elevOk = good && clsOf(me).includes('BPO_Elevator_02');
  });
});
chk('blocks and connectors match fixture', blkOk, blkDetail.join('; '));
chk('in-block default machines match SAV_DEFM (FIX-1 offsets)', inOk, inDetail.join('; '));
chk('in-block machine count == 4 (Dock, Dock_2 rot 2, ElevatorBlock_03, Dock_2 rot 0)', inTotal === 4, `got ${inTotal}`);
chk('Dock_2 block (rot 2): dock at 8*block + (-64,0), rot 0', dockOk);
chk('ElevatorBlock_03 block: BPO_Elevator_02 at 8*block', elevOk);
chk('block class without SAV_DEFM gets 0 in-block machines', zeroOk);
chk('block count (Blocks + Connectors) == fixture', blkRe.length + conRe.length === fx.Blocks.length,
  `${blkRe.length}+${conRe.length} vs ${fx.Blocks.length}`);

// Config and name checks on in-block machines. Blocks found by X (fixture X values are unique among blocks).
const inBlk = x => savFind(blkRe.find(e => xf(e).X === x), 'DefaultMachines').val[1];
const dockTpl = cfgDec('BPO_IndustrialDock', SAV_DEFM.BPO_Dock_2[0].hex);
const d1600 = cfgDec('BPO_IndustrialDock', cfgHex(inBlk(1600)[0]));
chk('in-block dock (Dock_2 Name "Test Dock") decodes name "Test Dock"', !!d1600 && d1600.name === 'Test Dock', JSON.stringify(d1600));
chk('in-block dock keeps template filter count', !!d1600 && d1600.filters.length === dockTpl.filters.length,
  `${d1600 && d1600.filters.length} vs ${dockTpl.filters.length}`);
chk('in-block dock filters all empty (template items reset)', !!d1600 && d1600.filters.every(f => f.item === '' && f.bLoading === 0));
const dNoName = cfgDec('BPO_IndustrialDock', savInCfg('BPO_IndustrialDock', SAV_DEFM.BPO_Dock_2[0].hex, undefined, ''));
chk('dock without name and without flat match decodes name "" (not "TEST")', !!dNoName && dNoName.name === '' && dNoName.filters.length === dockTpl.filters.length,
  JSON.stringify(dNoName));
chk('in-block elevator hex == cfgEnc named "Lift A"', cfgHex(inBlk(2000)[0]) === cfgEnc('named', {name: 'Lift A'}), cfgHex(inBlk(2000)[0]));
const dOld = cfgDec('BPO_IndustrialDock', cfgHex(inBlk(2400)[0]));
chk('in-block dock from flat match decodes name "Old" with one filter warpfuel',
  !!dOld && dOld.name === 'Old' && dOld.filters.length === 1 && dOld.filters[0].item === 'warpfuel', JSON.stringify(dOld));

// Top-level Machines == fixture DefaultMachines minus the deduped ones, same order.
const flatWant = fx.DefaultMachines.filter(m => !DEDUPED.includes(savKey(savShort(m.Class), m.Transform.GridLocation.X, m.Transform.GridLocation.Y, m.Transform.Height)));
chk('Machines count == fixture DefaultMachines minus 2 deduped', macRe.length === flatWant.length && flatWant.length === fx.DefaultMachines.length - 2,
  `${macRe.length} vs ${flatWant.length}`);
chk('deduped flat machines not emitted top-level', !macRe.some(e => /BPO_Elevator_02|BPO_IndustrialDock/.test(clsOf(e))));
let macOk = true, macDetail = [];
flatWant.forEach((m, i) => {
  const e = macRe[i], s = m.Class;
  const t = m.Transform;
  const wantCfg = m.ConfigHex || SAV_DEFCFG[s] || '';
  const ok = e && clsOf(e) === pathOf(s) && cfgLenOk(e) && cfgHex(e) === wantCfg &&
    JSON.stringify(xf(e)) === JSON.stringify({X: t.GridLocation.X, Y: t.GridLocation.Y, H: t.Height, R: t.GridRotation});
  if (!ok) macDetail.push(`machine ${i} ${s}`);
  macOk = macOk && !!ok;
});
chk('machines match fixture (path, transform, config)', macOk, macDetail.join('; '));
const refIdx = flatWant.findIndex(m => m.Class === 'BP_RefineryObject');
const refE = macRe[refIdx];
chk('refinery SerializedMachineConfig == ConfigHex', !!refE && cfgHex(refE) === flatWant[refIdx].ConfigHex.slice(0), '');
const spIdx = flatWant.findIndex(m => m.Class === 'BP_SplitterObject_2');
chk('splitter config is 33 bytes', flatWant[spIdx].ConfigHex.length === 66);

const allIds = [...blkRe, ...conRe].map(e => i32(raw(e, 'BlockID'))).concat(macRe.map(e => i32(raw(e, 'MachineID'))));
chk('BlockID and MachineID all unique', new Set(allIds).size === allIds.length, `${allIds.length} ids`);

// 3. Write the file and cross-check with Python.
const out = 'C:/Users/SFidelis/rea_work/out/site-sample.sav';
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, bytes);
chk('site-sample.sav written', fs.existsSync(out) && fs.statSync(out).size === bytes.length);
const pyLine = execFileSync('python', ['-I', path.join(ROOT, 'tools/sav_counts.py'), out], {encoding: 'utf8'}).trim().split('\n').pop();
console.log('PY ' + pyLine);
const py = JSON.parse(pyLine);
chk('python: ids_unique', py.ids_unique === true);
chk('python: Blocks/Connectors/Machines == JS', py.Blocks === blkRe.length && py.Connectors === conRe.length && py.Machines === macRe.length,
  `py ${py.Blocks}/${py.Connectors}/${py.Machines} js ${blkRe.length}/${conRe.length}/${macRe.length}`);
chk('python: DisplayName == JS', py.DisplayName === dnRe, `py "${py.DisplayName}"`);
chk('python: Type contains STATION', String(py.Type).includes('STATION'), String(py.Type));

console.log(`${pass === total ? 'PASS' : 'FAIL'} ${pass}/${total}`);
process.exitCode = pass === total ? 0 : 1;

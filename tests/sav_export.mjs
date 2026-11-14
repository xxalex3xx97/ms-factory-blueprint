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
const byId = (list, idName) => new Map(list.map(e => [i32(raw(e, idName)), e]));
const blkById = byId([...blkRe, ...conRe], 'BlockID');
let blkOk = true, blkDetail = [];
fx.Blocks.forEach((b, i) => {
  const id = i + 1, e = blkById.get(id), short = b.Class.split('/').pop().split('.')[0];
  const wantList = isConn(short) ? conRe : blkRe;
  const ok = e && wantList.includes(e) && clsOf(e) === pathOf(b.Class) &&
    JSON.stringify(xf(e)) === JSON.stringify({X: b.GridLocation.X, Y: b.GridLocation.Y, H: b.Height, R: b.GridRotation}) &&
    i32(raw(e, 'PaletteID')) === (b.PaletteID || 0);
  if (!ok) blkDetail.push(`block ${id} ${b.Class}`);
  blkOk = blkOk && !!ok;
});
chk('blocks and connectors match fixture', blkOk, blkDetail.join('; '));
chk('block count (Blocks + Connectors) == fixture', blkRe.length + conRe.length === fx.Blocks.length,
  `${blkRe.length}+${conRe.length} vs ${fx.Blocks.length}`);

// Expected: no in-block DefaultMachines, so Machines == fixture DefaultMachines.
chk('Machines count == fixture DefaultMachines', macRe.length === fx.DefaultMachines.length,
  `${macRe.length} vs ${fx.DefaultMachines.length}`);
const macById = byId(macRe, 'MachineID');
let macOk = true, macDetail = [];
fx.DefaultMachines.forEach((m, i) => {
  const id = fx.Blocks.length + i + 1, e = macById.get(id), s = m.Class;
  const t = m.Transform;
  const wantCfg = m.ConfigHex || SAV_DEFCFG[s] || '';
  const ok = e && clsOf(e) === pathOf(s) && cfgLenOk(e) && cfgHex(e) === wantCfg &&
    JSON.stringify(xf(e)) === JSON.stringify({X: t.GridLocation.X, Y: t.GridLocation.Y, H: t.Height, R: t.GridRotation});
  if (!ok) macDetail.push(`machine ${id} ${s}`);
  macOk = macOk && !!ok;
});
chk('machines match fixture (path, transform, config)', macOk, macDetail.join('; '));
const refIdx = fx.DefaultMachines.findIndex(m => m.Class === 'BP_RefineryObject');
const refE = macById.get(fx.Blocks.length + refIdx + 1);
chk('refinery SerializedMachineConfig == ConfigHex', !!refE && cfgHex(refE) === fx.DefaultMachines[refIdx].ConfigHex.slice(0), '');
const spIdx = fx.DefaultMachines.findIndex(m => m.Class === 'BP_SplitterObject_2');
chk('splitter config is 33 bytes', fx.DefaultMachines[spIdx].ConfigHex.length === 66);

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

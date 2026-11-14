// Headless check of the named (elevator/teleporter) and dock name codec in js/config.js.
// Run: node tests/cfg_names.mjs    Exit code 1 on any failed check.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import {fileURLToPath} from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'), 'config.js');

let total = 0, pass = 0;
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`);
}
const i32hex = v => [0, 1, 2, 3].map(i => ((v >> (8 * i)) & 255).toString(16).padStart(2, '0')).join('');
const fshex = s => s ? i32hex(s.length + 1) + Buffer.from(s, 'latin1').toString('hex') + '00' : i32hex(0);

// kinds
chk('kind named BPO_Elevator_02', cfgKind('BPO_Elevator_02') === 'named');
chk('kind named BPO_ElevatorFiller', cfgKind('BPO_ElevatorFiller') === 'named');
chk('kind named BPO_ShipElevator', cfgKind('BPO_ShipElevator') === 'named');
chk('kind named BPO_Teleporter', cfgKind('BPO_Teleporter') === 'named');
chk('kind null BP_ItemElevatorObject', cfgKind('BP_ItemElevatorObject') === null);

// empty form
const EMPTY = '010000000000ff00000000';
chk('dec empty elevator name ""', cfgDec('BPO_Elevator_02', EMPTY)?.name === '');
chk('enc empty named == empty hex', cfgEnc('named', {name: ''}) === EMPTY, cfgEnc('named', {name: ''}));

// named form
const LIFT = cfgEnc('named', {name: 'Lift A'});
chk('enc "Lift A" header', LIFT.startsWith('0100' + '02000000' + 'ff' + '01000000' + '07000000'), LIFT);
chk('dec "Lift A" round-trip', cfgDec('BPO_Teleporter', LIFT)?.name === 'Lift A');
const UNI = 'Lift Ä ☃';
chk('non-ASCII round-trip', cfgDec('BPO_Elevator_02', cfgEnc('named', {name: UNI}))?.name === UNI);

// history form 0: u32 flags | i8 0 | FString ns | FString key | FString source
const HIST = '0100' + '00000000' + '00' + fshex('') + fshex('') + fshex('X');
chk('history-0 decodes source as name', cfgDec('BPO_Elevator_02', HIST)?.name === 'X', String(JSON.stringify(cfgDec('BPO_Elevator_02', HIST))));

// real dock "TEST" with 8 empty filters: byte-identical round-trip
const DOCK = '0100' + '05000000' + '5445535400' + '08000000' + '0000000000000000'.repeat(8);
const dd = cfgDec('BPO_Dock_2', DOCK);
chk('dock TEST decodes name and 8 filters', dd?.name === 'TEST' && dd.filters.length === 8);
chk('dock TEST re-encodes byte-identical', cfgEnc('dock', dd) === DOCK);

// cfgWithName keeps dock filters; named gets the name
const DOCK2 = cfgWithName('BPO_Dock_2', DOCK, 'Q');
const dd2 = cfgDec('BPO_Dock_2', DOCK2);
chk('cfgWithName dock sets name and keeps filters', dd2?.name === 'Q' && dd2.filters.length === 8);
chk('cfgWithName named sets name', cfgDec('BPO_Elevator_02', cfgWithName('BPO_Elevator_02', EMPTY, 'Lift A'))?.name === 'Lift A');
chk('cfgWithName other kind unchanged', cfgWithName('DAT_Splitter', '0100', 'Z') === '0100');

// cfgView exposes Name only when non-empty
chk('cfgView Name for named', cfgView('BPO_Teleporter', LIFT).Name === 'Lift A');
chk('cfgView no Name for empty', !('Name' in cfgView('BPO_Elevator_02', EMPTY)));

const ok = pass === total;
console.log(ok ? `ALL PASS (${pass}/${total})` : `FAILED ${total - pass} of ${total}`);
process.exitCode = ok ? 0 : 1;

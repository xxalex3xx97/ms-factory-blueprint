// Headless check: underground exit-dupe rule (import_station.py ug_exit_dupes) keys on (X,Y,Height).
// 1) synthetic: same XY + same Length on another Height is NOT a dupe; mod-built exit pair on the same Height IS (42043/44 shape).
// 2) real save (skipped when absent): Discovery Next 20261108-2121_S.sav, station "Beta Honor 3 Central":
//    no dupes, 121858 keeps Length 5, 121987 keeps Length 4, 1048 underground entrances with Length.
// Run:  cd F:/ms-fb-ugfix && node tests/ug_dupes.mjs [path/to/_S.sav]
// Exit code 1 on any failed check. No browser needed (JS parity of ugDupes is in import_ug.mjs).
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execFileSync} from 'child_process';
import {isDeepStrictEqual} from 'util';
import {fileURLToPath} from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PY = process.env.PY || 'python';
const SAV = process.argv[2] || 'C:/Users/SFidelis/Downloads/Discovery Next 20261108-2121_S.sav';
const STN = 'Beta Honor 3 Central';

let total = 0, pass = 0;
const fails = [];
function chk(name, cond, detail = '') {
  total++;
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fails.push(name); console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`); }
}
const py = (code, args = []) => execFileSync(PY, ['-I', '-c', code, path.join(ROOT, 'extract'), ...args], {encoding: 'utf8'});

// 1) synthetic dupe rule (python oracle; the JS mirror is checked in import_ug.mjs with the same records)
const SYN = `import sys,json; sys.path.insert(0,sys.argv[1]); import import_station as S
def M(i,x,y,h,r=0): return dict(MachineID=i,X=x,Y=y,Height=h,GridRotation=r)
a=S.ug_exit_dupes([M(1,-7,1,0),M(2,-3,1,1)],{1:3,2:3})          # same XY, other Height: not a pair
b=S.ug_exit_dupes([M(3,-7,9,0),M(4,-3,9,0)],{3:3,4:3})          # mod exit on same Height: deduped
print(json.dumps([sorted(a),sorted(b)]))`;
const [synA, synB] = JSON.parse(py(SYN));
chk('synthetic: same XY different Height, same Length -> no dupe', synA.length === 0, JSON.stringify(synA));
chk('synthetic: mod exit pair on same Height -> exit (id 4) deduped', isDeepStrictEqual(synB, [4]), JSON.stringify(synB));

// 2) real save
if (!fs.existsSync(SAV)) {
  console.log(`SKIP real save: not found: ${SAV}`);
} else {
  const out = path.join(os.tmpdir(), 'ug_dupes_discovery.json');
  const SAVE = `import sys,json; sys.path.insert(0,sys.argv[1]); import import_station as S
d,I=S.load(sys.argv[2]); ug=S.underground_lengths(d)
A=[s for s in S.stations(sys.argv[2]) if s['A'] and s['A']['name'].lower()==sys.argv[3].lower()][0]['A']
machs=list(A['machines'])+[m for _,ms in A['blocks'] for m in ms]
dup=S.ug_exit_dupes(machs,ug)
print(json.dumps(dict(dup=sorted(dup), L={str(k):v for k,v in ug.items() if k in (121858,121987,76517)})))`;
  const r = JSON.parse(py(SAVE, [SAV, STN]));
  chk('real save: no underground dupes (Discovery, Beta Honor 3 Central)', r.dup.length === 0, `dupes ${r.dup.length}: ${r.dup.slice(0, 10)}`);
  chk('real save: rec 121858 Length 5, 121987 Length 4', r.L['121858'] === 5 && r.L['121987'] === 4, JSON.stringify(r.L));
  execFileSync(PY, ['-I', path.join(ROOT, 'extract', 'import_station.py'), SAV, '--station', STN, '-o', out], {stdio: ['ignore', 'ignore', 'pipe']});
  const j = JSON.parse(fs.readFileSync(out, 'utf8'));
  const ent = j.DefaultMachines.filter(m => /Underground/.test(m.Class) && m.Length !== undefined);
  chk('real save: 1048 underground entrances with Length', ent.length === 1048, `count ${ent.length}`);
  fs.rmSync(out, {force: true});
}

console.log(`\nPASS ${pass}/${total}`);
if (fails.length) { console.log(`FAILED ${fails.length}: ${fails.join(' | ')}`); }
process.exitCode = fails.length ? 1 : 0;

// Underground export check: one game record per pair (entrance + Length), tier class _2/_3, no exit records.
// Run: node tests/ug_export.mjs  (fixture = real site export: 3 Mk3 pairs + 2 Mk2 pairs)
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import {fileURLToPath} from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['config', 'sav_template', 'sav_icon', 'sav_export'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), f + '.js');
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/ug_pairs.json'), 'utf8'));
const r = savExport(fx);
const o = savLoad(r.bytes), bp = o.props.find(p => p.name === 'Blueprint').val[1];
const ms = savFind(bp, 'Machines').val[1];
const cnt = {};
ms.forEach(e => { const c = savFstrR(savFind(e, 'Class').val[1], 0)[0].split('/').pop().split('.')[0]; if (c.includes('Underground')) cnt[c] = (cnt[c] || 0) + 1; });
const ok = cnt.BP_UndergroundBeltObject_3 === 3 && cnt.BP_UndergroundBeltObject_2 === 2 && Object.keys(cnt).length === 2;
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(cnt), JSON.stringify(r.warn));
process.exit(ok ? 0 : 1);

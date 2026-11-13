// Regenerates the template bundle in memory and compares it to the committed js/tpl/bundle.js.
// Run: node tests/tpl_bundle_fresh.mjs   Exit 1 on mismatch.
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {buildBundle} from '../tools/tpl_bundle.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fresh = buildBundle();
const cur = fs.readFileSync(path.join(ROOT, 'js', 'tpl', 'bundle.js'), 'utf8');
const ok = fresh === cur;
console.log((ok ? 'PASS' : 'FAIL') + ' js/tpl/bundle.js matches tools/tpl_bundle.mjs output (' + cur.length + ' bytes)' + (ok ? '' : ' - run: node tools/tpl_bundle.mjs'));
process.exit(ok ? 0 : 1);

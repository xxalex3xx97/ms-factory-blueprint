// Save import reads the LIVE splitter/balancer priority (world-tree machine record) and overrides the blueprint ConfigHex.
// Run: node tests/sav_priority.mjs   Input: a COPY of the user's save (data only); skipped if missing.
import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href + '?engine=old';
const SAV = process.env.SAV || 'C:/Users/SFidelis/.claude/jobs/ddd9eda4/tmp/save.sav';
if (!fs.existsSync(SAV)) { console.log('SKIP no save copy at ' + SAV); process.exit(0); }
// machine id -> expected priority output index (-1 = none)
const WANT = {86955: 2, 86956: 1, 86957: 0, 86958: 1, 86959: 0, 86960: -1, 86963: -1};
let total = 0; const fails = [], errs = [];
const chk = (n, c, d = '') => { total++; if (!c) fails.push(n + ' ' + d); console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + d)); };
const br = await chromium.launch({executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(PAGE); await pg.waitForFunction(() => window.__fb && typeof CATALOG !== 'undefined');
  const r = await pg.evaluate(async b64 => {
    const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), st = __fb.parseSav(u.buffer);
    const s = st.find(x => x.name === 'Main Base') || st[0];
    __fb.importJson(JSON.stringify(s.json), true);
    return S.blocks.filter(b => b.mid || /Splitter/.test(b.cls)).map(b => ({mid: b.mid, cls: b.cls, y: b.y, pr: b.pr || null, off: b.off || null}));
  }, fs.readFileSync(SAV).toString('base64'));
  for (const [mid, c] of Object.entries(WANT)) {
    const b = r.find(x => x.mid === +mid);
    chk(`machine ${mid}: priority ${c}`, !!b && (c === -1 ? !b.pr : b.pr && b.pr[0] === c && b.pr[1] === -1), JSON.stringify(b));
  }
  console.log(JSON.stringify(r.filter(x => WANT[x.mid] !== undefined)));
} finally { await br.close(); }
chk('no page errors', errs.length === 0, errs.join('|'));
console.log(`${total - fails.length}/${total}`);
process.exitCode = fails.length ? 1 : 0;

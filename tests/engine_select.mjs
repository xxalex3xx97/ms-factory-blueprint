// Engine select (page): Auto/Zones/Tower/No Limits via the #plnEng select + badge #plnEngBadge. Screenshot tests/shots/engine-select.png (1280x800, full frame).
// Run: node tests/engine_select.mjs   Exit 1 on FAIL or page error.
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await (await br.newContext({viewport: {width: 1280, height: 800}})).newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(pathToFileURL(ROOT + '/index.html').href);
await pg.waitForFunction(() => window.__fb && typeof placerGo === 'function' && typeof placerShot === 'function');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ };
// pin the engine through the select, run the preview, wait for it to settle
async function run(name, rate, eng) {
  return pg.evaluate(async ([name, rate, eng]) => {
    const item = [...plnBy(false).keys()].find(i => plnNm(i) === name);
    $("plnItem").value = item; $("plnRate").value = rate; $("plnMk").value = 1; $("plnBuf").value = 'DAT_Container_2'; $("plnMod").checked = false;
    $("plnDkI").checked = false; $("plnDkO").checked = false;
    $("plnEng").value = eng; $("plnEng").dispatchEvent(new Event('change'));
    placerGo();
    for (let i = 0; i < 3000 && !(plcL ? plcT !== null : $("plnPrevErr").textContent); i++) await new Promise(r => setTimeout(r, 100));
    return {eng: plcL ? plcL.eng : null, ok: !!plcL, badge: $("plnEngBadge").textContent, tip: $("plnEngBadge").title, err: $("plnPrevErr").textContent,
      place: $("plnPlace").disabled, sig: plcL ? plcL.items.length + ':' + plcL.w + 'x' + plcL.h : null, note: plcL ? String(plcL.note[0]) : ''};
  }, [name, rate, eng]);
}
const a = await run('Nickel Plates', 480, 'auto');
check(a.eng === 'zones' && /Zones/.test(a.badge), 'Nickel 480 auto -> zones: ' + a.badge);
fs.mkdirSync(ROOT + '/tests/shots', {recursive: true});
await pg.screenshot({path: ROOT + '/tests/shots/engine-select.png', fullPage: false});
const t = await run('Nickel Plates', 480, 'tower');
check(t.eng === 'tower' && /Tower/.test(t.badge) && t.sig !== a.sig, 'Nickel 480 pinned Tower -> tower, layout differs (' + a.sig + ' vs ' + t.sig + ')');
const n = await run('Nickel Plates', 480, 'nl');
check(n.eng === 'nl' && /No Limits/.test(n.badge), 'Nickel 480 pinned No Limits -> nl: ' + n.badge);
const z = await run('Basic Circuits', 100, 'zones');
check(!z.ok && z.err.length > 0 && z.place && /Zones/.test(z.badge), 'Basic Circuits 100 pinned Zones -> refusal + Place disabled: ' + z.err);
const m = await run('Basic Circuits', 100, 'auto');
const mc = await pg.evaluate(() => { const it = [...plnBy(false).keys()].find(i => plnNm(i) === 'Basic Circuits'); const P = plan(it, 100, 1, {sp: null, bal: null}, PLN_PICK, {proto: false, enr: false}); return pfCompose(P, it, 1, 0, {box: 'DAT_Container_2'}).eng });
check(mc === 'tower-multi', 'Basic Circuits 100 auto compose -> tower-multi (' + mc + ')');
check(m.eng === 'tower-multi' ? /multi/.test(m.badge) : /fallback: .*tower-multi|Tower \(multi-input\) built a layout/i.test(m.badge) || /Tower \(multi-input\)/.test(m.badge), 'Basic Circuits 100 auto UI badge names tower-multi or its tile fallback: ' + m.badge);
const e = await run('Enzyme', 10, 'auto');
check(e.eng === 'nl' && /fallback: .+/.test(e.badge) && e.tip.length > 0, 'Enzyme 10 auto -> nl with reason: ' + e.badge);
const s = await pg.evaluate(() => { $("plnEng").value = 'tower'; $("plnEng").dispatchEvent(new Event('change')); return localStorage.getItem('msfb.engine') });
check(s === 'tower', 'select persisted in localStorage');
await pg.evaluate(() => { $("plnEng").value = 'auto'; $("plnEng").dispatchEvent(new Event('change')) });
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await br.close();
process.exit(fails || errs.length ? 1 : 0);

// ux_latency: preview UI speed gate. Counts placerLayout calls (one per compose) while driving the real page.
// (1) Build opens + computes once; (2) typing a rate (3 input events) computes once, after the debounce; (3) revisiting a seen state computes 0 times;
// (4) two change events in the same tick compute once; (5) zoom/fit/labels compute 0 times; (6) "Building..." is painted before the compute.
// Run: node tests/ux_latency.mjs   Exit 1 on FAIL.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PW || 'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const page = await (await br.newContext({viewport: {width: 1400, height: 900}})).newPage();
let bad = 0; page.on('pageerror', e => { console.log('PAGEERR', e.message); bad++ });
await page.goto(pathToFileURL(ROOT + '/index.html').href + '?engine=cmp');
await page.evaluate(() => {
  window.__n = 0; const f = placerLayout; placerLayout = function () { window.__n++; return f.apply(this, arguments) };
  const s = $('plnItem'); s.value = [...s.options].find(o => o.textContent.trim() === 'Nickel Plates').value; s.dispatchEvent(new Event('change'));
  $('plnRate').value = 31; $('plnRate').dispatchEvent(new Event('change')); $('plnDkI').checked = false; $('plnDkO').checked = false;
});
const wait = ms => page.waitForTimeout(ms), n = () => page.evaluate(() => window.__n), reset = () => page.evaluate(() => { window.__n = 0 });
const ck = (name, got, want) => { const ok = got === want; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ' (' + got + ', want ' + want + ')') };
const run = async (name, fn, want, w = 700) => { await reset(); await page.evaluate("("+fn+")()"); await wait(w); ck(name, await n(), want) };
const rate = v => `()=>{const r=$('pvRate');r.value=${v};r.dispatchEvent(new Event('input'))}`;
// (6) busy paint: right after the click the text reads Building... (compute is deferred)
await reset();
const busy = await page.evaluate(() => { $('plnBuild').click(); return $('pvLine').textContent });
ck('busy text painted first', busy, 'Building...'); await wait(700); ck('open computes once', await n(), 1);
await run('typing 3 inputs -> 1 compute after debounce', `()=>{for(const v of [40,41,42]){const r=$('pvRate');r.value=v;r.dispatchEvent(new Event('input'))}}`, 1, 900);
await run('no compute before debounce elapsed', `()=>{const r=$('pvRate');r.value=50;r.dispatchEvent(new Event('input'))}`, 0, 100); await wait(800);
await run('Enter/blur (change) applies at once', `()=>{const r=$('pvRate');r.value=31;r.dispatchEvent(new Event('change'))}`, 0, 600);   // 31 was seen at open: cache
await run('revisit seen rate = 0 computes', `()=>{const r=$('pvRate');r.value=42;r.dispatchEvent(new Event('change'))}`, 0, 600);
await run('same-tick double change -> 1 compute', `()=>{for(const i of ['plnDkI','plnDkO']){const r=$(i);r.checked=true;r.dispatchEvent(new Event('change'))}}`, 1, 700);
await run('docks off again (seen) = 0', `()=>{for(const i of ['plnDkI','plnDkO']){const r=$(i);r.checked=false;r.dispatchEvent(new Event('change'))}}`, 0, 600);
await run('zoom + fit + labels = 0', `()=>{$('plnPrevMap').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:200,clientY:200,cancelable:true}));$('plnZf').click();$('plnLbl').click()}`, 0, 600);
const st = await page.evaluate(() => ({err: $('plnPrevErr').textContent, place: $('plnPlace').disabled, busy: $('plnPrevMap').style.opacity}));
ck('Place enabled, no error, not dimmed', JSON.stringify(st), JSON.stringify({err: '', place: false, busy: ''}));
await br.close(); console.log(bad ? 'FAIL' : 'OK'); process.exit(bad ? 1 : 0);

// Chain-engine gate (the 2x2 Planner preview, tools/hand/fchain.js): build real chains headless and fail on belt U-turns, extra blocks, unrouted belts or machines != planner N.
// waste = sum over belt segments of (path length - manhattan distance). Ceilings = what the 2026-11-18 redesign (entries off the first cell line when a producer is above) reached; lower when it improves.
// Run: node tests/chain_detours.mjs   (~15 s)
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href;
const CASES = [   // [item, rate, machines (planner N), max blocks, max waste]; fails also counts HAND.check() problems (a layout with a foreign underground pair is not placeable)
  ['Servomotor', 150, 80, 26, 0], ['Servomotor', 180, 96, 27, 96], ['Servomotor', 60, 32, 26, 0], ['Servomotor', 300, 160, 44, 224], ['Superalloy', 120, 17, 23, 102],
  ['BasicCircuit', 200, 74, 26, 120], ['Capacitor', 100, 22, 13, 0], ['MagneticCoils', 300, 25, 8, 0],
  ['Enzyme', 20, 3, 24, 144], ['AdvancedCircuits', 60, 220, 188, 1084],
  ['Servomotor', 150, 80, 24, 0, true], ['Servomotor', 180, 96, 25, 96, true], ['Superalloy', 120, 17, 20, 102, true], ['Capacitor', 100, 22, 11, 0, true]];   // 6th = raw inputs from industrial docks
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const pg = await br.newPage();
pg.on('pageerror', e => console.log('ERR', e.message));
await pg.goto(PAGE);
await pg.waitForFunction(() => window.__fb && typeof engineReady === 'function');
await pg.evaluate(() => engineReady());
await pg.waitForFunction(() => typeof chainBuild === 'function');
const run = async (item, rate, docks) => pg.evaluate(([item, rate, docks]) => {
  const metric=(T)=>{ const ms=T.ms,ids=ms.map((b,i)=>({...b,h:0,id:i+1}));
 const isB=b=>PLC_BELT.includes(b.cls),isU=b=>PLC_UG.includes(b.cls),isP=b=>PLC_SPL.includes(b.cls),isL=b=>isB(b)||isU(b)||isP(b);
 const occ=new Map();ids.forEach(b=>{const d=dim(b);for(let x=b.x;x<b.x+d.w;x++)for(let y=b.y;y<b.y+d.h;y++)occ.set(x+','+y,b)});
 const D=[[1,0],[0,1],[-1,0],[0,-1]];
 const ugp=ugPairs(ids.filter(isU));const exitOf=new Map(ugp.map(p=>[p.u,p.t])),isExit=new Set(exitOf.values());
 const lanes=ids.filter(b=>isB(b)||isU(b));
 // successor cell(s) of a lane item
 const nxt=b=>{ if(isU(b)){ if(isExit.has(b)){return [b.x+D[b.rot][0],b.y+D[b.rot][1]]} const t=exitOf.get(b); return t?[t.x,t.y,'hop']:null } return [b.x+D[b.rot][0],b.y+D[b.rot][1]] };
 // predecessor set: cells pointed at by lane items
 const pointed=new Set();lanes.forEach(b=>{const n=nxt(b);if(n)pointed.add(n[0]+','+n[1])});
 const segs=[];const seen=new Set();
 const heads=lanes.filter(b=>!pointed.has(b.x+','+b.y)&&!isExit.has(b));
 for(const h of heads){
  let b=h,steps=[],cells=0,x0=h.x,y0=h.y,guard=0,end='?';
  const mv={px:0,nx:0,py:0,ny:0};let cx=h.x,cy=h.y;const path=[[h.x,h.y]];
  while(b&&guard++<5000){
   if(seen.has(b)){end='merge';break} seen.add(b);cells++;
   if(isU(b)&&!isExit.has(b)){const t=exitOf.get(b);if(!t){end='ug?';break}const dx=t.x-b.x,dy=t.y-b.y;steps.push([cx,cy]);
     if(dx>0)mv.px+=dx;if(dx<0)mv.nx-=dx;if(dy>0)mv.py+=dy;if(dy<0)mv.ny-=dy;cx=t.x;cy=t.y;path.push([cx,cy,"U"]);b=t;seen.add(t);cells++;
     // continue from exit
     const n2=[t.x+D[t.rot][0],t.y+D[t.rot][1]];const m2=occ.get(n2[0]+','+n2[1]);
     const d2=D[t.rot];if(d2[0]>0)mv.px++;if(d2[0]<0)mv.nx++;if(d2[1]>0)mv.py++;if(d2[1]<0)mv.ny++;cx=n2[0];cy=n2[1];path.push([cx,cy]);
     if(!m2){end='void';break} if(isL(m2)&&!isP(m2)){b=m2;continue} end=isP(m2)?'spl':'mach:'+m2.cls.replace('DAT_','');b=null;break}
   const d=D[b.rot];if(d[0]>0)mv.px++;if(d[0]<0)mv.nx++;if(d[1]>0)mv.py++;if(d[1]<0)mv.ny++;
   const n=[b.x+d[0],b.y+d[1]];const m=occ.get(n[0]+','+n[1]);cx=n[0];cy=n[1];path.push([cx,cy]);
   if(!m){end='void';break}
   if(isL(m)&&!isP(m)){ if(isB(m)&&D[m.rot][0]===-d[0]&&D[m.rot][1]===-d[1]){end='headon';break} b=m;continue}
   end=isP(m)?'spl':'mach:'+(m.cls.replace('DAT_',''));b=null;break;
  }
  const total=mv.px+mv.nx+mv.py+mv.ny,man=Math.abs(cx-x0)+Math.abs(cy-y0);
  const back=2*Math.min(mv.px,mv.nx)+2*Math.min(mv.py,mv.ny);
  segs.push({path:path.length<400?path:null,x0,y0,x1:cx,y1:cy,len:total,man,back,cells,end});
 }
 const waste=segs.reduce((s,q)=>s+Math.max(0,q.len-q.man),0),backT=segs.reduce((s,q)=>s+q.back,0);
 return {waste,backT};};
  const T = chainBuild({item, rate, mk: 1, tile: 'BPO_Station_02', dockType: 'ind', outDockType: 'ind', docks: !!docks, outDock: false, maxStates: 60000, hw: 3});
  const mm = metric(T);
  return {mach: T.ms.filter(m => m.rec).length, blocks: T.blocks.length, fails: T.fails.length + (T.report.failed || 0) + HAND.check().bad.length, waste: mm.waste};
}, [item, rate, docks]);
let fail = 0;
for (const [item, rate, mach, maxB, maxW, docks] of CASES) {
  const r = await run(item, rate, docks), errs = [];
  if (r.mach !== mach) errs.push('machines ' + r.mach + ' != ' + mach);
  if (r.fails) errs.push(r.fails + ' unrouted/failed');
  if (r.blocks > maxB) errs.push('blocks ' + r.blocks + ' > ' + maxB);
  if (r.waste > maxW) errs.push('waste ' + r.waste + ' > ' + maxW);
  console.log((errs.length ? 'FAIL ' : 'PASS ') + item + ' ' + rate + (docks ? ' +docks' : '') + ' machines ' + r.mach + ' blocks ' + r.blocks + ' waste ' + r.waste + (errs.length ? ' :: ' + errs.join('; ') : ''));
  fail += errs.length ? 1 : 0;
}
await br.close();
console.log(fail ? 'FAILED ' + fail : 'PASS chain_detours');
process.exit(fail ? 1 : 0);

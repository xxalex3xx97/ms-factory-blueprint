// Detour gate: build real layouts (rb engine) and fail when belts backtrack more than the ceiling, or machines != planner N.
// waste = sum over belt segments of (path length - manhattan distance); detour = segment that backtracks >= 4 cells (U-turn).
// Run: node tests/rb_detours.mjs   (~40 s). Ceilings = what the S1/S2/S3 fixes reached on 2026-11-18; lower them when routing improves.
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, '..', 'index.html')).href + '?engine=rb';
const CASES = [   // [item, rate, max waste cells, machines (planner N)]
  ['Superalloy', 60, 56, 10], ['Enzyme', 10, 38, 3], ['Basic Circuits', 100, 44, 37], ['Basic Motor', 60, 8, 3], ['Servomotor', 150, 242, 80]];
const br = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--js-flags=--max-old-space-size=8192']});
const pg = await br.newPage();
pg.on('pageerror', e => console.log('ERR', e.message));
await pg.goto(PAGE);
await pg.waitForFunction(() => window.__fb && typeof rbRun === 'function' && typeof placerLayout === 'function');
const analyze = (a) => {
 if(a.tries)globalThis.CMPR_TRIES=a.tries;const rec=[].concat(...Object.values(RECS)).find(r=>plnNm(r.o[0])===a.nm||rk(r)===a.nm);if(!rec)return{err:'no rec '+a.nm};
 const item=rec.o[0],key=rk(rec);
 const P=plan(item,a.rate,a.mk,{},{[item]:key},{proto:false,enr:false,obs:false});
 const t0=Date.now();
 const L=placerLayout(P,item,a.mk,a.mk,{box:'DAT_Container_2',mod:false,dock:(a.din||a.dout)?{in:a.din,out:a.dout}:null,bk:a.bk});
 if(!L.ok)return{err:'refused '+L.why,item};
 const T=L.tile||placerTile(L,placerBk());if(!T.ok)return{err:'tile '+T.why,item};
 const ms=T.ms,ids=ms.map((b,i)=>({...b,h:0,id:i+1}));
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
 const cls={};segs.forEach(q=>{if(q.back>=4){const k=/Container/.test(q.end)?"toContainer":q.end=="spl"?"toSplitter":q.end.slice(0,12);cls[k]=cls[k]||{n:0,back:0};cls[k].n++;cls[k].back+=q.back}});const detours=segs.filter(q=>q.back>=4);
 const rbI=L.bl&&L.bl.cmp&&L.bl.cmp.rb;const cnt=f=>ms.filter(f).length;
 return {item,key,ms:Date.now()-t0,eng:L.eng,rb:!!(L.bl&&L.bl.cmp&&L.bl.cmp.rb),blocks:T.blocks.length,machines:cnt(b=>b.rec),
  belts:cnt(isB),ug:cnt(isU),spl:cnt(isP),segs:segs.length,totalLen:segs.reduce((s,q)=>s+q.len,0),waste,backT,cls,detours:detours.length,
  top:detours.sort((a,b)=>b.back-a.back).slice(0,5),ascii:rbI?rbI.ascii:null,mods:rbI?rbI.mods:null,bw:T.blocks.length&&dim({cls:T.blocks[0].cls,rot:0}),rbWhy:L.rbWhy||null,notes:(L.note||[]).slice(0,4),planN:Object.values(P.nodes).filter(n=>n.rec&&n.crafter).map(n=>[n.rec&&rk(n.rec).split('>').pop(),n.machines])};
};
let fail = 0;
for (const [nm, rate, maxW, mach] of CASES) {
  const r = await pg.evaluate(analyze, {nm, rate, mk: 1, bk: 'BPO_Station_02', din: 'ind', dout: 'ind', tries: 0});
  const planN = r.planN ? r.planN.reduce((a, q) => a + q[1], 0) : null;
  const errs = [];
  if (r.err) errs.push(r.err);
  else {
    if (!r.rb) errs.push('fell back from rb engine: ' + r.rbWhy);
    if (r.machines !== mach) errs.push('machines ' + r.machines + ' != ' + mach);
    if (planN != null && r.machines !== planN) errs.push('machines ' + r.machines + ' != planner N ' + planN);
    if (r.waste > maxW) errs.push('waste ' + r.waste + ' > ' + maxW + ' (detours ' + r.detours + ')');
  }
  console.log((errs.length ? 'FAIL ' : 'PASS ') + nm + ' ' + rate + (r.err ? '' : ' machines ' + r.machines + ' waste ' + r.waste + '/' + maxW + ' detours ' + r.detours + ' ' + r.ms + 'ms') + (errs.length ? ' :: ' + errs.join('; ') : ''));
  fail += errs.length ? 1 : 0;
}
await br.close();
console.log(fail ? 'FAILED ' + fail : 'PASS rb_detours');
process.exit(fail ? 1 : 0);

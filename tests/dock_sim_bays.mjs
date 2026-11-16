// dock bays in sim: belt into bay = void sink (filter), belt beside bay with filter = infinite source (Z.pull). Run: node tests/dock_sim_bays.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const b=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),p=await b.newPage();const errs=[];p.on("pageerror",e=>{errs.push(String(e));console.log("PAGEERR",e)});
await p.goto(PAGE);let bad=0;const ok=(n,c)=>{if(!c)bad++;console.log((c?'PASS ':'FAIL ')+n)};
await p.waitForFunction(()=>typeof simInit==='function'&&typeof simRoute==='function');
const R=await p.evaluate(()=>{
  const out={};
  const water=FITEMS.find(id=>ITEMS[id].n.toLowerCase().includes("water")),other=FITEMS.find(id=>id!==water);
  const wk=fkey(water);
  const DIR_=[[1,0],[0,1],[-1,0],[0,-1]];
  // bay index bi: belt cell next to bay, outside every bay; into=true points into bay
  const run=(bi,into,key)=>{
    S.blocks=[];
    const dock={id:1,cls:CATALOG.blocks.find(q=>q.name==="BPO_Dock_2").class,x:4,y:4,h:0,rot:0,pid:0,mid:0};
    dock.df=Array.from({length:8},()=>({item:"",bLoading:0}));dock.df[bi].item=key;
    S.blocks.push(dock);
    const rs=bayRects(dock),q=rs.find(r=>r.i===bi);if(!q)return{err:"no bay "+bi};
    const inBay=(x,y)=>rs.some(r=>x>=Math.round(r.x)&&x<Math.round(r.x+r.w)&&y>=Math.round(r.y)&&y<Math.round(r.y+r.h));
    let cell=null;
    for(let x=Math.round(q.x);x<Math.round(q.x+q.w)&&!cell;x++)for(let y=Math.round(q.y);y<Math.round(q.y+q.h)&&!cell;y++)
      DIR_.forEach((d,di)=>{if(!cell&&!inBay(x-d[0],y-d[1]))cell={x:x-d[0],y:y-d[1],di}});
    if(!cell)return{err:"no free cell"};
    S.blocks.push({id:2,cls:'DAT_ConveyorBelt3',x:cell.x,y:cell.y,h:0,rot:into?cell.di:(cell.di+2)&3,pid:0,mid:0});
    simInit({});const Z=SIM;
    const r={pull:Z.pull.length,inf:Z.pull.length?[...Z.pull[0].cn.st.values()].some(x=>x.inf===true):null,hasWater:Z.pull.length?Z.pull[0].cn.st.has(water):null,dS:Z.dS.size};
    const c=[...Z.dS.keys()][0];
    if(c!==undefined){Z.cr.set(c,1);r.rw=!!simRoute(c,water,2,null,new Set());r.ro=!!simRoute(c,other,2,null,new Set())}
    return r};
  [0,7].forEach(bi=>{out["in"+bi]=run(bi,true,wk);out["inNone"+bi]=run(bi,true,"");out["away"+bi]=run(bi,false,wk);out["awayNone"+bi]=run(bi,false,"")});
  return out});
console.log(JSON.stringify(R));
for(const bi of [0,7]){
  const a=R["in"+bi],n=R["inNone"+bi],w=R["away"+bi],x=R["awayNone"+bi];
  if(a.err){ok("bay"+bi+" setup: "+a.err,false);continue}
  ok("bay"+bi+" a) void accepts filtered item",a.rw===true);
  ok("bay"+bi+" b) void refuses other item",a.ro===false);
  ok("bay"+bi+" c) no filter accepts any item",n.rw===true&&n.ro===true);
  ok("bay"+bi+" d) belt away+filter: 1 infinite source with item",w.pull===1&&w.inf===true&&w.hasWater===true);
  ok("bay"+bi+" d) belt away, no filter: pull empty",x.pull===0);
}
ok("no page errors",errs.length===0);
await b.close();console.log(bad||errs.length?bad+" FAIL":"ALL PASS");process.exit(bad||errs.length?1:0);

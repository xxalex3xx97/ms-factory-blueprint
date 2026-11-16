// drone bay with a selected ore = constant source on its 2 output ports (sim + theoretical); picker button lists only the ores. Run: node tests/dronebay_source.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const b=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),p=await b.newPage();const errs=[];p.on("pageerror",e=>{errs.push(e.message)});
await p.goto(PAGE);let bad=0;const ok=(n,c)=>{if(!c)bad++;console.log((c?'PASS ':'FAIL ')+n)};
await p.waitForFunction(()=>typeof simInit==='function'&&typeof dockBelts==='function');
const R=await p.evaluate(()=>{
  const out={},cls=CATALOG.blocks.find(q=>q.name==="BPO_MiningDroneBayBlock").class;
  // belt beside port pi (0/1), pointing away (away=true) or into the port
  const run=(rot,pi,away,rs)=>{
    const bay={id:1,cls,x:4,y:4,h:0,rot};if(rs)bay.rs=rs;S.blocks=[bay];
    const t=shapeTf(bay),d=DIR[(2+rot)&3],[px,py]=t.f(t.sh.ports[pi][1],t.sh.ports[pi][2]);
    const cx=Math.floor(px+d[0]*.5),cy=Math.floor(py+d[1]*.5);   // outside cell next to the port
    S.blocks.push({id:2,cls:'DAT_ConveyorBelt3',x:cx,y:cy,h:0,rot:away?(2+rot)&3:rot,pid:0,mid:0});
    simInit({});const Z=SIM,K=links1(0),r={pull:Z.pull.length,item:Z.pull.length?[...Z.pull[0].cn.st.keys()][0]:null,dS:Z.dS.size,th:K.pull.length,thItem:K.pull.length?K.pull[0].item:null};return r};
  const si=ITEMS&&Object.keys(ITEMS).find(k=>k==="ITEM_Silica");out.si=si;
  [0,1].forEach(rot=>[0,1].forEach(pi=>{out["a"+rot+pi]=run(rot,pi,true,"silica");out["n"+rot+pi]=run(rot,pi,true,"");out["i"+rot+pi]=run(rot,pi,false,"silica")}));
  return out});
console.log(JSON.stringify(R));
for(const rot of [0,1])for(const pi of [0,1]){
  const a=R["a"+rot+pi],n=R["n"+rot+pi],i=R["i"+rot+pi],t=`rot${rot} port${pi} `;
  ok(t+"away + ore: sim source of silica",a.pull===1&&a.item===R.si);
  ok(t+"away + ore: theoretical pull of silica",a.th===1&&a.thItem===R.si);
  ok(t+"no ore: nothing",n.pull===0&&n.th===0);
  ok(t+"belt into port: no source, no sink",i.pull===0&&i.dS===0&&i.th===0);
}
// picker: button, lists only the 6 ores + (not set), icons, pick sets b.rs
const P=await p.evaluate(()=>{const bay={id:1,cls:CATALOG.blocks.find(q=>q.name==="BPO_MiningDroneBayBlock").class,x:4,y:4,h:0,rot:0};S.blocks=[bay];sel=new Set([1]);all();
  const btn=document.getElementById("frs");btn.click();const li=[...document.querySelectorAll("#ipop li")];
  const r={tag:btn.tagName,n:li.length,txt:li.map(x=>x.textContent),ics:li.slice(1).every(x=>x.querySelector("img.ic"))};
  li.find(x=>/silica/i.test(x.textContent)).click();r.rs=S.blocks[0].rs;r.btn=document.getElementById("frs").textContent;return r});
console.log(JSON.stringify(P));
ok("picker: button, 11 rows (not set + 10 mineables), ore icons",P.tag==="BUTTON"&&P.n===11&&P.ics);
ok("picker: pick sets b.rs and the button shows the ore",P.rs==="silica"&&/silica/i.test(P.btn));
// factory floor: one square over both ports, click opens the same picker, pick sets b.rs for both ports
const F=await p.evaluate(async()=>{const bay={id:1,cls:CATALOG.blocks.find(q=>q.name==="BPO_MiningDroneBayBlock").class,x:4,y:4,h:0,rot:0};S.blocks=[bay];sel=new Set();view="F";all();
  const rr=bayRects(bay),r={n:rr.length,i:rr[0]&&rr[0].i,w:rr[0]&&rr[0].w,h:rr[0]&&rr[0].h};
  await new Promise(q=>requestAnimationFrame(()=>requestAnimationFrame(q)));r.hit=BAYHIT.filter(q=>q.b===bay).length;
  bayFilter(bay,-1);const li=[...document.querySelectorAll("#bayL li")];r.rows=li.length;li.find(x=>/nickel/i.test(x.textContent)).click();r.rs=bay.rs;
  const none=S.blocks[0].rs;bayFilter(bay,-1);[...document.querySelectorAll("#bayL li")][0].click();r.cleared=bay.rs===undefined;return r});
console.log(JSON.stringify(F));
ok("floor: one bay square over both ports (i -1) drawn and hittable",F.n===1&&F.i===-1&&F.hit===1);
ok("floor: picker lists (not set) + 10 mineables, pick sets rs, (not set) clears",F.rows===11&&F.rs==="nickelore"&&F.cleared);
ok("no page errors",errs.length===0);
await b.close();console.log(bad||errs.length?bad+" FAIL":"ALL PASS");process.exit(bad||errs.length?1:0);

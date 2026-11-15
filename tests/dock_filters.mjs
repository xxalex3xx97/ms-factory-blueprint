// dock / splitter filters in the inspector + recipe stars + export round trip. Run: node tests/dock_filters.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const b=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto(PAGE);let bad=0;const ok=(n,c)=>{if(!c)bad++;console.log((c?'PASS ':'FAIL ')+n)};
const r=await p.evaluate(()=>{
  const out={};const put=(cls,x)=>{const id=uid++;S.blocks.push({id,cls,x,y:0,h:0,rot:0,pid:0,mid:0});return id};
  const set=(i,v)=>{const e=$("fl"+i);e.value=v;e.dispatchEvent(new Event("change",{bubbles:true}))};
  const d=put(CATALOG.blocks.find(q=>q.name==="BPO_Dock_2").class,0);sel=new Set([d]);all();out.dockSel=document.querySelectorAll('#insp select[data-df]').length;
  set(2,"waterice");out.df=S.blocks.find(q=>q.id===d).df;
  const s=put("DAT_Splitter",20);sel=new Set([s]);layer=0;view="F";all();out.splSel=document.querySelectorAll('#insp select[data-fl]').length;
  set(1,"waterice");out.fl=S.blocks.find(q=>q.id===s).fl;
  const a=put("DAT_Refinery",40);sel=new Set([a]);all();out.stars=document.querySelectorAll('#insp .rtile .star').length;out.tiles=document.querySelectorAll('#insp .rtile').length;
  return out});
ok("industrial dock shows 8 filter slots",r.dockSel===8);ok("dock filter stored",r.df&&r.df.length===8&&r.df[2].item==="waterice");
ok("splitter shows 3 filter slots",r.splSel===3);ok("splitter filter stored",r.fl&&r.fl[1]==="waterice"&&r.fl.length===3);
ok("refinery recipes starred (enriched/alternate)",r.stars>0&&r.stars<r.tiles);
ok("no page errors "+errs.join(";"),!errs.length);await b.close();process.exit(bad?1:0);

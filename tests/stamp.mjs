// Copy = stamp: paste stays active after each click until Esc. Run: node tests/stamp.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const br=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const pg=await (await br.newContext({viewport:{width:1400,height:900}})).newPage();
await pg.goto(PAGE);await pg.waitForFunction(()=>window.__fb&&typeof CATALOG!=='undefined');
const r=await pg.evaluate(()=>{
  STRICT=false;view='F';
  const c=CATALOG.buildables.find(b=>b.id==='DAT_Container').id;
  S.blocks.push({id:9001,cls:c,x:0,y:0,h:0,rot:0,pid:0,off:[]});
  sel=new Set([9001]);copy();
  const on1=!!pasting;
  hover={x:10,y:0};pasteAt();const n1=S.blocks.filter(isM).length,on2=!!pasting;
  hover={x:20,y:0};pasteAt();const n2=S.blocks.filter(isM).length,on3=!!pasting;
  return {on1,n1,on2,n2,on3};
});
console.log(JSON.stringify(r));
const ok=r.on1&&r.n1===2&&r.on2&&r.n2===3&&r.on3;
console.log(ok?'PASS paste stays active (stamp) after each click':'FAIL');
await br.close();process.exit(ok?0:1);

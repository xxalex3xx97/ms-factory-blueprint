// Deleting a station block also deletes the machines/belts on its floor; undo restores both. Run: node tests/delete_floor.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const br=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const pg=await (await br.newContext({viewport:{width:1400,height:900}})).newPage();
await pg.goto(PAGE);await pg.waitForFunction(()=>window.__fb&&typeof CATALOG!=='undefined');
const r=await pg.evaluate(()=>{
  const cls=n=>CATALOG.blocks.find(b=>b.name===n).class;
  const mk=CATALOG.buildables.find(b=>/Container$/.test(b.id)||b.id==='DAT_Container');
  const b1=S.blocks.length;
  __fb.importJson(JSON.stringify({Version:1,DisplayName:'t',DefaultMachines:[],Blocks:[0,1].map(i=>({Class:cls('BPO_Station_01'),GridLocation:{X:i*4,Y:0},Height:0,GridRotation:0,BlockID:0,PaletteID:0}))}));
  const blocks=S.blocks.filter(b=>!isM(b));
  const put=(x,y)=>{S.blocks.push({id:9000+x,cls:mk.id,x,y,h:0,rot:0,pid:0,off:[]})};
  const c0=fcell(blocks[0]),c1=fcell(blocks[1]);put(c0.cx*FC+2,c0.cy*FC+2);put(c1.cx*FC+2,c1.cy*FC+2);  // one machine on each block's floor
  const inside=S.blocks.filter(isM).length;
  sel=new Set([blocks[0].id]);del();
  const after=S.blocks.filter(isM).length, blAfter=S.blocks.filter(b=>!isM(b)).length;
  undo();
  return {inside,after,blAfter,restoredM:S.blocks.filter(isM).length,restoredB:S.blocks.filter(b=>!isM(b)).length};
});
console.log(JSON.stringify(r));
const ok=r.inside===2&&r.after===1&&r.blAfter===1&&r.restoredM===r.inside&&r.restoredB===2;
console.log(ok?'PASS delete block removes its floor machines, undo restores':'FAIL');
await br.close();process.exit(ok?0:1);

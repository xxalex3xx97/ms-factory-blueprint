// Underground belts: deleting one end deletes its pair; copying one end brings its partner and ghosts both; pasting that would re-pair existing undergrounds is refused. Run: node tests/ug_delete_paste.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const br=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const pg=await (await br.newContext({viewport:{width:1400,height:900}})).newPage();
await pg.goto(PAGE);await pg.waitForFunction(()=>window.__fb&&typeof CATALOG!=='undefined');
const r=await pg.evaluate(()=>{
  const ug=CATALOG.buildables.find(b=>b.id==='DAT_UndergroundBelt').id;
  const mk=(id,x)=>({id,cls:ug,x,y:3,h:0,rot:0,pid:0});
  const ms=()=>S.blocks.filter(isM).length;
  S.blocks.push(mk(9001,2),mk(9002,8),mk(9003,9),mk(9004,12));   // two pairs on row y=3
  STRICT=false;
  const before=ms();
  sel=new Set([9001]);del();
  const afterDel=S.blocks.filter(isM).map(b=>b.id).sort().join();
  undo();
  const afterUndo=ms();
  view='F';sel=new Set([9003]);copy();   // only the entrance selected
  const clipN=clip.length,ghost=!!pasting;
  const n0=ms();hover={x:0,y:10};pasteAt();const okPaste=ms()===n0+2;   // free row: places both ends
  hover={x:3,y:3};const n1=ms();pasteAt();const refused=ms()===n1;     // lands inside the 9001/9002 pair row: must be refused
  return {before,afterDel,afterUndo,clipN,ghost,okPaste,refused};
});
console.log(JSON.stringify(r));
const ok=r.before===4&&r.afterDel==='9003,9004'&&r.afterUndo===4&&r.clipN===2&&r.ghost&&r.okPaste&&r.refused;
console.log(ok?'PASS ug pair delete, copy brings partner + ghost, re-pairing paste refused':'FAIL');
await br.close();process.exit(ok?0:1);

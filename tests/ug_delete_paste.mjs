// Underground belts: deleting one end deletes its pair; pasting a copied underground uses the click-entrance / click-exit flow. Run: node tests/ug_delete_paste.mjs
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
  S.blocks.push(mk(9001,2),mk(9002,6),mk(9003,9),mk(9004,12));   // two pairs on one row
  const before=ms();
  sel=new Set([9001]);del();
  const afterDel=S.blocks.filter(isM).map(b=>b.id).sort().join();
  undo();
  const afterUndo=ms();
  view='F';sel=new Set([9003,9004]);copy();
  return {before,afterDel,afterUndo,active,pasting,activeIsUg:active===ug};
});
console.log(JSON.stringify(r));
const ok=r.before===4&&r.afterDel==='9003,9004'&&r.afterUndo===4&&r.activeIsUg&&r.pasting===null;
console.log(ok?'PASS ug pair delete + paste starts entrance/exit flow':'FAIL');
await br.close();process.exit(ok?0:1);

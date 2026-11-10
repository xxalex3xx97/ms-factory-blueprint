// Ctrl+X: copies the selection (stamp ghost) and deletes the originals; Ctrl+Z restores. Run: node tests/cut.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const br=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const pg=await (await br.newContext({viewport:{width:1400,height:900}})).newPage();
await pg.goto(PAGE);await pg.waitForFunction(()=>window.__fb&&typeof CATALOG!=='undefined');
const r=await pg.evaluate(async()=>{
  STRICT=false;view='F';
  const c=CATALOG.buildables.find(b=>b.id==='DAT_Container').id,n=()=>S.blocks.filter(isM).length;
  S.blocks.push({id:9001,cls:c,x:0,y:0,h:0,rot:0,pid:0,off:[]});
  sel=new Set([9001]);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'x',ctrlKey:true,bubbles:true}));
  const afterCut=n(),ghost=!!pasting;
  hover={x:10,y:0};pasteAt();const afterPaste=n();
  undo();const afterUndo=n();
  return {afterCut,ghost,afterPaste,afterUndo};
});
console.log(JSON.stringify(r));
const ok=r.afterCut===0&&r.ghost&&r.afterPaste===1&&r.afterUndo===0;
console.log(ok?'PASS ctrl+x cuts and pastes':'FAIL');
await br.close();process.exit(ok?0:1);

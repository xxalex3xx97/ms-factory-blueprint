// Layout copy/cut/duplicate carry the floor items like move. Run: node tests/layout_copy_blocks.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const br=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let bad=0;const chk=(n,c,d='')=>{console.log((c?'PASS ':'FAIL ')+n+(c?'':' '+d));if(!c)bad++};
const errs=[];
try{
  const pg=await (await br.newContext({viewport:{width:1400,height:900}})).newPage();
  pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(PAGE);await pg.waitForFunction(()=>window.__fb&&typeof CATALOG!=='undefined');
  const r=await pg.evaluate(()=>{
    const o={};STRICT=false;setView("L");
    const mc=CATALOG.buildables.find(b=>b.id==='DAT_Container').id;
    const inBox=(m,b)=>{const d=fcell(b);return m.x>=d.cx*FC&&m.x<(d.cx+d.cw)*FC&&m.y>=d.cy*FC&&m.y<(d.cy+d.ch)*FC};
    const mk=()=>{S.blocks=[];S.closed=[];S.conn=[];sel=new Set();clip=[];pasting=null;
      S.blocks.push({id:9001,cls:'BPO_Station_02',x:50,y:50,h:0,rot:0,pid:0,off:[]});
      const d=fcell(S.blocks[0]);o.cell=[d.cx,d.cy,d.cw,d.ch];
      S.blocks.push({id:9002,cls:mc,x:d.cx*FC+3,y:d.cy*FC+3,h:0,rot:0,pid:0,off:[]},{id:9003,cls:mc,x:d.cx*FC+6,y:d.cy*FC+3,h:0,rot:0,pid:0,off:[]},{id:9004,cls:mc,x:10*FC,y:10*FC,h:0,rot:0,pid:0,off:[]});uid=9100};
    const cnt=()=>({b:S.blocks.filter(b=>!isM(b)).length,m:S.blocks.filter(isM).length});
    mk();sel=new Set([9001]);o.carry=floorOn([S.blocks[0]]).size;
    copy();o.clipIds=clip.map(b=>b.id);o.blocksFirst=!isM(clip[0]);
    o.t0=clipT(0,false).filter(isM).map(b=>[b.x,b.y]);
    hover={x:70,y:70};pasteAt();o.c1=cnt();
    const nb=S.blocks.find(b=>!isM(b)&&b.id!==9001),nm=S.blocks.filter(b=>isM(b)&&b.id>=9100);
    o.p0=nm.map(b=>[b.x,b.y]);o.nbxy=[nb.x,nb.y];
    // rot 1
    pasting.rot=1;hover={x:90,y:70};pasteAt();
    const nb2=S.blocks.find(b=>!isM(b)&&b.x===90&&b.y===70),m2=S.blocks.filter(b=>isM(b)&&b.id>=9100&&inBox(b,nb2));
    o.r1=m2.length;o.r1rot=m2.every(b=>b.rot===1);
    // mirror
    pasting.rot=0;pasting.fl=true;hover={x:110,y:70};pasteAt();
    const nb3=S.blocks.find(b=>!isM(b)&&b.x===110&&b.y===70);
    o.mir=S.blocks.filter(b=>isM(b)&&b.id>=9100&&inBox(b,nb3)).length;
    // cut
    mk();sel=new Set([9001]);cut();o.cut=cnt();o.cutClip=clip.length;o.cutCtl=S.blocks.some(b=>b.id===9004);
    pasting&&(pasting.rot=0);hover={x:50,y:50};pasteAt();o.cutBack=cnt();
    // dup
    mk();sel=new Set([9001]);all();document.getElementById('bDup').click();o.d=cnt();
    const db=S.blocks.find(b=>!isM(b)&&b.id!==9001);o.dbxy=[db.x,db.y];
    const dm=S.blocks.filter(b=>isM(b)&&b.id>=9100);o.dm=dm.map(b=>[b.x,b.y]);
    return o;
  });
  console.log(JSON.stringify(r));
  const F=await pg.evaluate(()=>FC),c0=r.cell[0]*F,c1=r.cell[1]*F;
  chk('floorOn (move rule) finds 2',r.carry===2,String(r.carry));
  chk('copy carries block + 2 machines, not control',JSON.stringify(r.clipIds)==='[9001,9002,9003]'&&r.blocksFirst,JSON.stringify(r.clipIds));
  chk('clipT rel machines',JSON.stringify(r.t0)==='[[3,3],[6,3]]',JSON.stringify(r.t0));
  chk('paste adds 1 block + 2 machines',r.c1.b===2&&r.c1.m===5,JSON.stringify(r.c1));
  chk('paste machine offset',JSON.stringify(r.p0)===JSON.stringify([[70*F+3,70*F+3],[70*F+6,70*F+3]]),JSON.stringify(r.p0));
  chk('rot1 paste machines inside new block and rot 1',r.r1===2&&r.r1rot,r.r1+' '+r.r1rot);
  chk('mirror paste machines inside new block',r.mir===2,String(r.mir));
  chk('cut removes block + floor, keeps control',r.cut.b===0&&r.cut.m===1&&r.cutCtl&&r.cutClip===3,JSON.stringify([r.cut,r.cutClip]));
  chk('paste after cut restores',r.cutBack.b===1&&r.cutBack.m===3,JSON.stringify(r.cutBack));
  chk('duplicate adds block + 2 machines',r.d.b===2&&r.d.m===5,JSON.stringify(r.d));
  chk('duplicate offsets +1 cell / +FC',r.dbxy[0]===51&&r.dbxy[1]===51&&JSON.stringify(r.dm)===JSON.stringify([[c0+3+F,c1+3+F],[c0+6+F,c1+3+F]]),JSON.stringify([r.dbxy,r.dm]));
  const L=await pg.evaluate(()=>{
    const o={};STRICT=true;setView("L");S.blocks=[];S.closed=[];S.conn=[];sel=new Set();clip=[];pasting=null;uid=9000;
    const mc=CATALOG.buildables.find(b=>b.id==='DAT_Container').id,bc=PLC_BELT[0],st=plcCls('BPO_Station_02');
    const cells=[];for(let i=0;i<8;i++)cells.push([2*i,0],[2*i,10]);for(let j=1;j<5;j++)cells.push([0,2*j],[14,2*j]);
    cells.forEach(([x,y])=>{const b={id:uid++,cls:st,x:50+x,y:50+y,h:0,rot:0,pid:0,off:[]};S.blocks.push(b);const f=fcell(b);
      S.blocks.push({id:uid++,cls:mc,x:f.cx*FC+3,y:f.cy*FC+3,h:0,rot:0,pid:0,off:[]});
      for(let k=0;k<6;k++)S.blocks.push({id:uid++,cls:bc,x:f.cx*FC+8+k*3,y:f.cy*FC+7,h:0,rot:0,pid:0,off:[]})});
    const n0=S.blocks.length;o.n0=n0;
    sel=new Set(S.blocks.filter(b=>!isM(b)&&floorRect(b)).map(b=>b.id));copy();o.clip=clip.length;
    hover={x:150,y:150};pasteAt();o.far=S.blocks.length-n0;
    hover={x:52,y:52};const n1=S.blocks.length;pasteAt();o.over=S.blocks.length-n1;
    return o});
  chk('large paste on free space adds everything',L.far===L.n0,JSON.stringify(L));
  chk('large paste overlapping another factory is refused',L.over===0,JSON.stringify(L));
  chk('no page errors',!errs.length,errs.join('|'));
}finally{await br.close()}
process.exit(bad?1:0);

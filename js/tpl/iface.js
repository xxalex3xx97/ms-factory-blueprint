// Edge Interface v1: standard lane slots shared by all js/tpl/*.js templates. Spec: vault main-sequence/tasks/2026-11-13-edge-interface-v1.md
// Global script (page) and node-loadable (tests/tpl_iface.mjs). Needs BL (js/bl_plan.js) for tplDerate.
// TPL_IF_SETS[block][S] = set origin rows o_s (top row of each set). Only these S are allowed.
const TPL_IF_SETS={'1x1':{1:[0],2:[0,7]},'1x2':{1:[0],2:[0,7]},'2x2':{1:[0],2:[0,15],3:[0,10,20],4:[0,8,16,23],6:[0,5,10,15,20,25]},'2x2c':{1:[4],2:[4,15],3:[4,12,19],4:[4,9,14,19]}};
const TPL_IF_H={'1x1':14,'1x2':14,'2x2':30,'2x2c':30};
// {ok,o:[origins],hs:[rows owned by each set: next origin minus origin, last set runs to block bottom]}
function tplIfSets(block,S){
  const T=TPL_IF_SETS[block],o=T&&T[S];
  if(!o)return{ok:false,why:'S '+S+' not allowed for '+block,o:[],hs:[]};
  const H=TPL_IF_H[block];
  return{ok:true,o:o.slice(),hs:o.map((v,i)=>(i+1<o.length?o[i+1]:H)-v)};
}
// slot rows of set s: slot i copy c at o_s+i*M+c (i<k items, c<M). out = o_s.
function tplIfRows(block,S,s,k,M){
  const t=tplIfSets(block,S);
  if(!t.ok)return{in:[],out:null,why:t.why};
  const o=t.o[s],rows=[];
  for(let i=0;i<k;i++)for(let c=0;c<M;c++)rows.push(o+i*M+c);
  return{in:rows,out:o};
}
// East tail jog: collector row yc ends at W-3 (caller builds it). Appends belts: (W-2,yc) rot3 .. (W-2,yo+1) rot3, (W-2,yo) rot0, (W-1,yo) rot0. yc==yo: straight.
function tplOutTail(items,o){
  const {bc,W,yc,yo}=o,b=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0});
  if(yc===yo){b(W-2,yo,0);b(W-1,yo,0);return items}
  b(W-2,yc,3);
  for(let y=yc-1;y>yo;y--)b(W-2,y,3);
  b(W-2,yo,0);b(W-1,yo,0);
  return items;
}
// the one derate knob (BL.DERATE). Default 1.0 (flow calc is demand-limited).
function tplDerate(){return typeof BL!=='undefined'&&BL.DERATE!=null?BL.DERATE:1.0}
// side-native lane rows (not standard): growth k=3 o+8; growth k=4 o+7,o+8; adv_4in item 3 at o+12; enr sandwich bottom group yM+9+(k-1-j) for j<k
const TPL_IF_SIDE={growth_k3:[8],growth_k4:[7,8],adv_4in_item3:[12],asm_3in:[],enr_sandwich_bottom:(yM,k)=>Array.from({length:k},(_,j)=>yM+9+(k-1-j))};

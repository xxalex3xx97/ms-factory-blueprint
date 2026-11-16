// Connectors of a design (what the game's Designer stores): every block contributes its class's connector pieces (rotated by the block, moved to its centre); a piece two blocks share (same class and spot) is a connected doorway and is dropped, and so is a vertical top/bottom pair (elevator stack: Connector_NNT on top of one block meets Connector_NNB under the next). What is left are the doorways to nothing.
// blocks: exported JSON block entries {Class, GridLocation{X,Y} (centre, 4 units per cell), Height, GridRotation}. Returns entries without BlockID.
const CONN_PATH=n=>"/Game/Blueprints/BuildingBlocks/"+n+"."+n+"_C";
function connGen(blocks){
  const rot=(x,y,r)=>{for(let i=0;i<(r&3);i++)[x,y]=[-y,x];return[x,y]},g=new Map();
  blocks.forEach(b=>{
    const short=String(b.Class).split(".").pop().replace(/_C$/,""),list=BLOCK_CONN[short]||BLOCK_CONN[short.replace("BPO_BlueprintUnit","BPO_CommandModule")];   // the Blueprint Unit is a Command Module clone
    if(!list)return;
    const r=((b.GridRotation%4)+4)%4;
    list.forEach(([c,x,y,h,cr])=>{const[rx,ry]=rot(x,y,r),X=b.GridLocation.X+rx,Y=b.GridLocation.Y+ry,H=b.Height+h,v=/^BPO_Connector_\d+[TB]$/.test(c),k=(v?c.slice(0,-1):c)+"|"+X+"|"+Y+"|"+H;
      let e=g.get(k);if(!e)g.set(k,e={v,X,Y,H,items:[]});e.items.push({c,r:(cr+r)&3})})});
  const out=[];
  g.forEach(e=>{
    if(e.v){if(e.items.some(i=>i.c.endsWith("T"))&&e.items.some(i=>i.c.endsWith("B")))return}   // vertical: top meets bottom = joined
    else if(e.items.length>1)return;   // horizontal: shared by two blocks = joined
    e.items.forEach(i=>out.push({Class:CONN_PATH(i.c),GridLocation:{X:e.X,Y:e.Y},Height:e.H,GridRotation:i.r,PaletteID:0}))});
  return out;
}

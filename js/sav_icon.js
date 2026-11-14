// Icon for the Screenshot GreyscaleValues: 256x256 Uint8 (0..255), bg 0, floor 20, edges 255, never 0 inside a shape.
// Block GridLocation = footprint centre, 4 raw units per cell => half extent 2*cells. Y is not flipped (UNVERIFIED orientation).
function savIcon(j,size){
  const px=new Uint8Array(65536),R=[];
  for(const b of j.Blocks||[]){let w=3,h=3;try{if(size){const s=size(b);w=s[0];h=s[1]}}catch(e){}
    const cx=b.GridLocation.X,cy=b.GridLocation.Y;R.push([cx-2*w,cy-2*h,cx+2*w,cy+2*h])}
  if(!R.length)return px;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const r of R){x0=Math.min(x0,r[0]);y0=Math.min(y0,r[1]);x1=Math.max(x1,r[2]);y1=Math.max(y1,r[3])}
  const s=255/Math.max(x1-x0,y1-y0,1),ox=(255-(x1-x0)*s)/2,oy=(255-(y1-y0)*s)/2,cl=v=>Math.max(0,Math.min(255,v));
  for(const r of R){const a=cl(Math.round((r[0]-x0)*s+ox)),b=cl(Math.round((r[1]-y0)*s+oy)),c=cl(Math.round((r[2]-x0)*s+ox)),d=cl(Math.round((r[3]-y0)*s+oy));
    for(let y=b;y<=d;y++)for(let x=a;x<=c;x++)px[y*256+x]=(x===a||x===c||y===b||y===d)?255:20}
  return px}

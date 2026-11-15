// RB recursive builder: block grid occupancy + spot search. Pure data, no DOM (node-testable: module.exports below).
// occ  Map('gx,gy' -> {mod,dx,dy})   cells claimed by a module (dx,dy = cell offset inside the module)
// cor  Map('gx,gy' -> Set(localY))   lane rows crossing a block that no module owns (corridor)
// g=rbGrid(): g.claim(mod,cells) false if any cell is occupied or carries a corridor lane (then nothing is claimed); g.release(mod); g.free(cells,own?); g.reserve(gx0,gy,id,gx1=gx0+40) / g.unreserve(id): east lane reservation (free() false on a cell reserved by an id not in own);
//   g.laneFree(gx0,gx1,gy,y) lane row y free over the blocks strictly between gx0 and gx1 in block row gy (not module cells, y not used); g.laneClaim / g.laneRelease same args.
//   cells = [{gx,gy,dx?,dy?}]
// rbCandidates(c0,rowWant,max=24,nr=6): spot order [{c,r}], columns dc=0..3 outer, rows dr=0,+1,-1,+2,-2,+3 inner (nr rows per column), capped at max.
function rbGrid(){
  const occ=new Map(),cor=new Map(),res=new Map(),k=(gx,gy)=>gx+','+gy;
  const g={occ,cor,res,
    free:(cells,own)=>cells.every(q=>{const key=k(q.gx,q.gy),r=res.get(key);return !occ.has(key)&&!(cor.get(key)||{size:0}).size&&!(r&&[...r].some(i=>!own||!own.has(i)))}),
    reserve(gx0,gy,id,gx1=gx0+40){for(let x=gx0+1;x<=gx1;x++){const key=k(x,gy);if(!res.has(key))res.set(key,new Set());res.get(key).add(id)}},
    unreserve(id){for(const [key,s] of [...res]){s.delete(id);if(!s.size)res.delete(key)}},
    claim(mod,cells,own){
      if(!g.free(cells,own))return false;
      cells.forEach(q=>occ.set(k(q.gx,q.gy),{mod,dx:q.dx|0,dy:q.dy|0}));return true;
    },
    release(mod){for(const [key,v] of [...occ])if(v.mod===mod)occ.delete(key)},
    laneFree(gx0,gx1,gy,y){for(let x=gx0+1;x<gx1;x++){const key=k(x,gy);if(occ.has(key)||(cor.get(key)&&cor.get(key).has(y)))return false}return true},
    laneClaim(gx0,gx1,gy,y){for(let x=gx0+1;x<gx1;x++){const key=k(x,gy);if(!cor.has(key))cor.set(key,new Set());cor.get(key).add(y)}},
    laneRelease(gx0,gx1,gy,y){for(let x=gx0+1;x<gx1;x++){const key=k(x,gy),s=cor.get(key);if(s){s.delete(y);if(!s.size)cor.delete(key)}}}
  };
  return g;
}
function rbCandidates(c0,rowWant,max=24,nr=6){
  const out=[];
  for(let dc=0;dc<4;dc++)for(let i=0;i<nr&&out.length<max;i++)out.push({c:c0+dc,r:rowWant+(i===0?0:i%2?(i+1)/2:-i/2)});
  return out;
}
if(typeof module!=='undefined')module.exports={rbGrid,rbCandidates};

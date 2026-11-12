// NL2 nlAssign(lanes[{id,s}],heads[{id,d}],cap): sweep. Lane j adds supply s; takes next heads while cumD+d<=cumS. spill[j]=cumS-cumD after lane j (flows on to lane j+1 by splitter + side belt). Leftover heads (float dust, supply<demand) go to the last lane.
function nlAssign(lanes,heads,cap){
  const of=new Map(),spill=[];let cS=0,cD=0,p=0;
  lanes.forEach((l,j)=>{cS+=l.s;while(p<heads.length&&cD+heads[p].d<=cS+1e-9){of.set(heads[p].id,l.id);cD+=heads[p].d;p++}spill.push(cS-cD)});
  while(p<heads.length&&lanes.length){of.set(heads[p].id,lanes[lanes.length-1].id);cD+=heads[p].d;p++}
  if(lanes.length)spill[lanes.length-1]=cS-cD;
  return{of,spill};
}

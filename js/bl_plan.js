// BL1 pure planner (node-tested). Filled in BL1.
const BL={TW:25,ROWS:3};
const blM=(fi,fo,w,cap,bw,R)=>Math.min(Math.floor(cap/fi+1e-9),Math.floor(cap/fo+1e-9),Math.floor((BL.TW-bw-R)/w));
function blNK(Ns,Ms,Rm){for(let K=1;;K++){const n=Ns.map(N=>Math.ceil(N/K)),r=n.map((v,i)=>Math.ceil(v/Ms[i]));if(r.every((v,i)=>v<=Rm[i]))return{K,n,r}}}
const blRowsM=(n,M)=>{const a=[];for(let r=n;r>0;r-=M)a.push(Math.min(M,r));return a};

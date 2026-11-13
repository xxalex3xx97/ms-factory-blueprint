// BL1 pure planner (node-tested). Filled in BL1. Z2: 30-cell zone width (BL.W). H2: rows per block = floor(30/P) (row belts reuse wall rows, H0).
const BL={TW:25,ROWS:3,DERATE:0.5,W:30,FH:30,RB:P=>Math.floor(30/P)};   // RB(P): rows per block, P = machine h+2
// blRW(R,w): horizontal zone layout (H1). ncol = jog columns per side = ceil(R/2); M = machines per row in the 28-cell interior (between the input columns and the sink columns).
const blRW=(R,w,Rn=0)=>{const ncol=Math.ceil(R/2);return{M:Math.floor((28-ncol-5-(Rn?Math.ceil(Rn/2)+1:0))/w),ncol}};   // H4: Rn = next stage rows (its input columns + 1 reserved)
const blM=(fi,fo,w,cap,bw,R,Rn=0)=>Math.min(Math.floor(cap/fi+1e-9),Math.floor(cap/fo+1e-9),blRW(R,w,Rn).M);
function blNK(Ns,Ms,Rm0){const Rm=Rm0;for(let K=1;;K++){const n=Ns.map(N=>Math.ceil(N/K)),r=n.map((v,i)=>Math.ceil(v/Ms[i]));if(r.every((v,i)=>v<=Rm[i]))return{K,n,r}}}   // Rm0 passed through (callers cap rows)
const blRowsM=(n,M)=>{const a=[];for(let r=n;r>0;r-=M)a.push(Math.min(M,r));return a};

// BL1 pure planner (node-tested). Filled in BL1. Z2: 30-cell zone width (BL.W), rows per zone capped at 4.
const BL={TW:25,ROWS:3,W:30,FH:30,RB:P=>Math.floor((30-2)/P)};   // RB(P): rows that fit one zone (walls y%30 in {29,0}), P = machine h+2
// blRW(R,w,xin): zone column layout for R rows (Large Container). X0 = first machine x offset, rx = OZ footprint right of E0, M = machines per row that fit BL.W.
const blRW=(R,w,xin=1)=>{const c=Math.ceil(R/3),PSmax=c===1?R-1:3+R-Math.floor(R/2),X0=PSmax+(xin===0?1:0),rx=c===1?4:Math.floor(R/2)+4;return{X0,rx,M:Math.floor((BL.W-X0-rx)/w)}};
const blM=(fi,fo,w,cap,bw,R)=>Math.min(Math.floor(cap/fi+1e-9),Math.floor(cap/fo+1e-9),blRW(R,w).M);
function blNK(Ns,Ms,Rm0){const Rm=Rm0.map(v=>Math.min(v,4));for(let K=1;;K++){const n=Ns.map(N=>Math.ceil(N/K)),r=n.map((v,i)=>Math.ceil(v/Ms[i]));if(r.every((v,i)=>v<=Rm[i]))return{K,n,r}}}
const blRowsM=(n,M)=>{const a=[];for(let r=n;r>0;r-=M)a.push(Math.min(M,r));return a};

// ---- simulation UI (play/pause/reset/speed/clock, overlay, inspector). Engine above is pure; SIM is null while Simulate is off.
let SM=false,SMP=false,SPD=1,smPh=0,smRaf=0,smLast=0,smLv=0;
let TH=null;   // Theoretical snapshot {byItem,byType,count} while the theoretical window is open; null = closed
const smOn=()=>SM&&view==="F"&&!!SIM&&!!SIM.stat;
const smK=()=>simView();
const SMC={idle:"hsl(220,10%,58%)",working:"hsl(140,60%,48%)",starved:"hsl(48,95%,55%)",blocked:"hsl(0,75%,58%)"},SML={idle:"I",working:"W",starved:"S",blocked:"B"};
const smOne=()=>{const l=S.blocks.filter(b=>sel.has(b.id));return l.length===1?l[0]:null};
function smClkUp(){const t=SIM?SIM.t:0,p=n=>String(n).padStart(2,"0");$("smClk").textContent=p(Math.floor(t/3600))+":"+p(Math.floor(t/60)%60)+":"+p(t%60)}
const PRC=i=>`hsl(${Math.round((i*137.5+200)%360)},70%,62%)`,prT=t=>Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0");
function thDraw(){
  if(!TH)return;
  const ks=Object.keys(TH.byItem),has=ks.length>0;
  $("thEmpty").style.display=has?"none":"";$("thBody").style.display=has?"":"none";if(!has)return;
  const now=ks.map(k=>[k,TH.byItem[k]]).sort((a,b)=>b[1]-a[1]),nx=Math.max(1,...now.map(x=>x[1]));
  $("thNow").innerHTML=now.map(([k,v],i)=>`<div class="prr"><span class="n">${itemHtml(k)}</span><span class="bar"><i style="width:${Math.round(v/nx*100)}%;background:${PRC(i)}"></i></span><b>${v}</b></div>`).join("");
  const mt=Object.keys(TH.count).sort((a,b)=>(TH.byType[b]||0)-(TH.byType[a]||0));
  $("thMt").innerHTML=`<div class="prr t2 hd"><span>Machine</span><span>/min</span><span>Count</span></div>`+mt.map(k=>{const f=def(k);return`<div class="prr t2"><span class="n">${esc(f?lab(f):k)}</span><b>${TH.byType[k]||0}</b><b>${TH.count[k]}</b></div>`}).join("");
}
function prodDraw(){
  const d=$("dProd");if(d.hidden||d.classList.contains("col"))return;
  const P=simProd(),ser=P?P.series:[],tot=P?[...P.totals].filter(([,n])=>n>0):[],keys=[];
  ser.forEach(s=>Object.keys(s.it).forEach(k=>{if(!keys.includes(k))keys.push(k)}));tot.forEach(([k])=>{if(!keys.includes(k))keys.push(k)});
  plcWarn(ser);const has=keys.length>0;$("prEmpty").style.display=has?"none":"";$("prBody").style.display=has?"":"none";if(!has)return;
  const col=k=>PRC(keys.indexOf(k)),c=$("prCv"),w=Math.max(180,c.parentNode.clientWidth-2),h=170,r=window.devicePixelRatio||1;
  c.width=Math.round(w*r);c.height=Math.round(h*r);c.style.height=h+"px";
  const g=c.getContext("2d");g.setTransform(r,0,0,r,0,0);g.clearRect(0,0,w,h);
  const L=34,R=8,T=8,B=20,pw=w-L-R,ph=h-T-B;let mx=0;ser.forEach(s=>keys.forEach(k=>{mx=Math.max(mx,s.it[k]||0)}));mx=mx||1;
  const mag=Math.pow(10,Math.floor(Math.log10(mx/4))),stp=[1,2,5,10].map(m=>m*mag).find(v=>v>=mx/4),top=stp*Math.ceil(mx/stp);
  const t0=ser.length?ser[0].t:0,t1=Math.max(ser.length?ser[ser.length-1].t:0,t0+10),X=t=>L+(t-t0)/(t1-t0)*pw,Y=v=>T+ph-v/top*ph;
  g.font="10px system-ui,sans-serif";g.lineWidth=1;g.strokeStyle="rgba(255,255,255,.12)";g.fillStyle="rgba(200,210,220,.8)";g.textAlign="right";g.textBaseline="middle";
  for(let v=0;v<=top+1e-9;v+=stp){g.beginPath();g.moveTo(L,Math.round(Y(v))+.5);g.lineTo(L+pw,Math.round(Y(v))+.5);g.stroke();g.fillText(String(Math.round(v*100)/100),L-4,Y(v))}
  g.textAlign="center";g.textBaseline="top";for(let i=0;i<=4;i++){const t=t0+(t1-t0)*i/4;g.fillText(prT(t),X(t),T+ph+5)}
  g.lineJoin="round";g.lineWidth=2;
  keys.forEach(k=>{g.strokeStyle=g.fillStyle=col(k);g.beginPath();ser.forEach((s,i)=>{const x=X(s.t),y=Y(s.it[k]||0);i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();
    if(ser.length<3)ser.forEach(s=>{g.beginPath();g.arc(X(s.t),Y(s.it[k]||0),2.5,0,7);g.fill()})});
  $("prLeg").innerHTML=keys.map(k=>`<span><i class="sw" style="background:${col(k)}"></i>${itemHtml(k)}</span>`).join("");
  const now=keys.map(k=>[k,P.byItem[k]||0]).sort((a,b)=>b[1]-a[1]),nx=Math.max(1,...now.map(x=>x[1]));
  $("prNow").innerHTML=now.map(([k,v])=>`<div class="prr"><span class="n">${itemHtml(k)}</span><span class="bar"><i style="width:${Math.round(v/nx*100)}%;background:${col(k)}"></i></span><b>${v}</b></div>`).join("");
  const mt=Object.keys(P.totalsByType).map(k=>{const f=def(k);return[f?lab(f):k,P.byType[k]||0,P.totalsByType[k]]}).sort((a,b)=>b[2]-a[2]);
  $("prMt").innerHTML=`<div class="prr t2 hd"><span>Machine</span><span>/min</span><span>Total</span></div>`+mt.map(([n,a,t])=>`<div class="prr t2"><span class="n">${esc(n)}</span><b>${a}</b><b>${Math.round(t)}</b></div>`).join("");
  $("prTot").innerHTML=tot.sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<div class="prr t1"><span class="n">${itemHtml(k)}</span><b>${Math.round(n)}</b></div>`).join("");
}

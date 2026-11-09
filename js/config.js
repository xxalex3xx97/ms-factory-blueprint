// ---- SerializedMachineConfig codec (little endian). Literal mirror of extract/config_codec.py (keep in sync); layouts: vault rea-machine-config.md s2.
// recipe (Assembler/Refinery/Enrichment/...): 01 00, FString recipe NAME, i32 n, n*u8 portEnabled
// splitter/balancer: 01 00, i32 n, n*FString filter, i32 -1, i32 -1, i32 n, n*u8 portEnabled
// dock: 01 00, FString name, i32 n, n*{FString item, i32 bLoading}   dronebay: 01 00, FString resource
// underground: 01 00, i32 Length (cells entrance..exit inclusive; ONE machine at the entrance in the game)
// FString = i32 len incl NUL (0 = empty; <0 = UTF-16) + ascii + NUL. Recipe names: js/recnames.js (generated, replaceable).
function cfgKind(cls){
  const c=String(cls||"").toLowerCase();
  if(c.includes("splitter")||c.includes("beltbalancer"))return"splitter";
  if(c.includes("underground"))return"underground";
  if(c.includes("miningdronebay"))return"dronebay";
  if(c.includes("dock")&&!c.includes("docking"))return"dock";
  if(["assembler","refinery","enrichment","growth","supercomputer","relicsynth"].some(k=>c.includes(k)))return"recipe";
  return null;
}
// game splitter (DAT_Splitter, _2, _3): 1 input (back) face, never a game port; 3 controllable outputs = config bytes [right, front, left] at rot 0 (N=left confirmed in game; byte0=right S, byte1=front E from Main_Base (6) test; rot 1-3 inferred) (local faces, see io.js SPL_FACES). Balancers keep the generic 4-port model.
const isSplitterCls=c=>/^DAT_Splitter(_\d+)?$/.test(String(c||""));
function cfgEnc(k,d){
  const o=[1,0],i32=v=>{for(let i=0;i<4;i++)o.push((v>>(8*i))&255)},fs=s=>{if(!s)return i32(0);if(/[^\x00-\xff]/.test(s)){i32(-(s.length+1));for(let i=0;i<s.length;i++)o.push(s.charCodeAt(i)&255,s.charCodeAt(i)>>8);o.push(0,0);return}i32(s.length+1);for(let i=0;i<s.length;i++)o.push(s.charCodeAt(i)&255);o.push(0)},bl=a=>{i32(a.length);a.forEach(p=>o.push(p?1:0))};
  if(k==="recipe"){fs(d.recipe||"");bl(d.ports)}
  else if(k==="splitter"){i32(d.filters.length);d.filters.forEach(fs);i32(d.prioA==null?-1:d.prioA);i32(d.prioB==null?-1:d.prioB);bl(d.ports)}
  else if(k==="dock"){fs(d.name||"");i32(d.filters.length);d.filters.forEach(f=>{fs(f.item);i32(f.bLoading)})}
  else if(k==="dronebay")fs(d.resource||"");
  else if(k==="underground")i32(d.length);
  else throw new Error("no config layout for "+k);
  return o.map(v=>v.toString(16).padStart(2,"0")).join("");
}
// hex -> {layout,...} or null (empty, unknown, malformed or trailing bytes; never throws)
function cfgDec(cls,hex){
  const k=cfgKind(cls);if(!k||typeof hex!=="string"||!hex||hex.length%2||/[^0-9a-f]/i.test(hex))return null;
  const b=hex.match(/../g).map(h=>parseInt(h,16));let p=0;
  const take=n=>{if(n<0||p+n>b.length)throw 0;const v=b.slice(p,p+n);p+=n;return v},i32=()=>{const v=take(4);return(v[0]|(v[1]<<8)|(v[2]<<16)|(v[3]<<24))},
    fstr=()=>{const n=i32();if(n===0)return"";if(n>0)return String.fromCharCode(...take(n).slice(0,-1));const v=take(-n*2).slice(0,-2);let s="";for(let i=0;i<v.length;i+=2)s+=String.fromCharCode(v[i]|(v[i+1]<<8));return s},
    bools=()=>take(i32()).map(x=>!!x);
  try{
    const ver=take(2);if(ver[0]!==1||ver[1]!==0)return null;
    const d={layout:k},cnt=f=>{const n=i32();if(n<0||n>10000)throw 0;const a=[];for(let i=0;i<n;i++)a.push(f());return a};
    if(k==="recipe"){d.recipe=fstr();d.ports=bools()}
    else if(k==="splitter"){d.filters=cnt(fstr);d.prioA=i32();d.prioB=i32();d.ports=bools()}
    else if(k==="dock"){d.name=fstr();d.filters=cnt(()=>({item:fstr(),bLoading:i32()}))}
    else if(k==="dronebay")d.resource=fstr();
    else d.length=i32();
    return p===b.length?d:null;
  }catch(e){return null}
}
// decoded view fields shared by the python extractor and parseSav (human readable; ConfigHex stays authoritative)
function cfgView(cls,hex){
  const o={ConfigHex:hex},d=cfgDec(cls,hex);
  if(d){if("recipe"in d)o.RecipeName=d.recipe;if("ports"in d)o.PortsEnabled=d.ports;if("filters"in d)o.Filters=d.filters;if("length"in d)o.Length=d.length}
  return o;
}
// ---- game port order (js/port_order.js, from bpu_port_data.lua): config byte g = game cell g. Site port matched by position (half cells, centre origin, y down); rotation (x,y)->(-y,x) per step (unverified for rot!=0).
// gamePortMap(b) -> site port index per game byte, or null (no table, elevator, or positions do not match)
function gamePortMap(b){
  const t=PORT_ORDER[b.cls],d=def(b.cls);if(!t||!d||d.elevator)return null;
  const ps=portsOf(b),odd=b.rot&1,Wr=odd?d.h:d.w,Hr=odd?d.w:d.h,pos=ps.map(p=>[2*(p.x-b.x)-(Wr-1)+p.nx,2*(p.y-b.y)-(Hr-1)+p.ny]);
  const m=t.cells.map(([x0,y0])=>{let x=x0,y=y0;for(let r=0;r<(b.rot&3);r++)[x,y]=[-y,x];return pos.findIndex(q=>q[0]===x&&q[1]===y)});
  return m.length===ps.length&&!m.includes(-1)?m:null;
}
// site enabled flags in game byte order, or null
const gameFlags=b=>{const m=gamePortMap(b);if(!m)return null;const ps=portsOf(b);return m.map(s=>ps[s].en)};
const PO_WARNED=new Set();
function poWarn(cls){const t=PORT_ORDER[cls];if(!t||t.verified||PO_WARNED.has(cls))return;PO_WARNED.add(cls);console.warn("port order unverified for "+cls)}
// what the exported bytes depend on (imported ConfigHex is kept bit-for-bit while this is unchanged)
const cfgSig=b=>JSON.stringify([b.rec||"",b.recn||"",(b.off||[]).slice().sort(),b.fl||null,b.pr||null]);
// site recipe key (inputs>output, see inspector.js rk) <-> game Recipe.Name
const recName=key=>RECNAMES[key]||(key?String(key).split(">").pop().replace(/^ITEM_/,"").toLowerCase():"");
const recKeyOf=(()=>{let m=null;return name=>{if(!m){m=new Map();Object.keys(RECNAMES).forEach(k=>m.set(RECNAMES[k].toLowerCase(),k))}return m.get(String(name).toLowerCase())}})();

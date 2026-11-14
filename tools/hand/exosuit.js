// Exosuit factory, hand-designed (not the auto-builder): 1 Exosuit/hour = leaves 30,20,20,20,20 per minute / 60.
// Needs tools/hand/hand.js (HAND) and tools/hand/exosuit_spec.js (EXO_SPEC, from the planner). exoBuild(opts) -> {ok,blocks,ms,fails,...}
// Design rules (what a player would do):
//  * every product with several producers, several consumers, a self feed (growth seed) or that is a leaf output gets ONE hub container (the storage street);
//    simple one-to-one products go machine to machine on a single belt
//  * a raw source container (infinite) sits in each group that eats that raw item
//  * machines are grouped by family into blocks, groups kept together, belts are routed one connection at a time
//  * Nutrients get two hubs (3 machines each) because one hub has only 16 ports (planner says 5 machines, this builds 6)
window.exoBuild=function(opts){
  opts=opts||{};
  HAND.reset();
  const SP={};EXO_SPEC.forEach(s=>SP[s.item.replace('ITEM_','')]=s);
  const LEAF=new Set(['AdvancedPlates','SuperalloyFrame','Biolattice','ChitinComposite','ChromaticAlloy']);
  const cons={};EXO_SPEC.forEach(s=>s.ins.forEach(i=>{const k=i.replace('ITEM_','');(cons[k]=cons[k]||[]).push(s.item.replace('ITEM_',''))}));
  const consN={};EXO_SPEC.forEach(s=>s.ins.forEach(i=>{const k=i.replace('ITEM_','');consN[k]=(consN[k]||0)+s.n}));   // consumer MACHINES per product (one output port feeds one belt)
  const hubOf=p=>{const s=SP[p];return s.n>1||(consN[p]||0)>1||LEAF.has(p)||s.ins.includes(s.item)};
  const SEED=new Set(EXO_SPEC.filter(s=>s.ins.includes(s.item)).map(s=>s.item.replace('ITEM_','')));
  const BASEGAP=opts.gap||5;let GAP=BASEGAP;   // growth chambers (7x7, up to 5 belts each) get a wider gap
  // ---- block snake (4 columns); shelf packing per block
  const snake=[];for(let gy=0;gy<7;gy++){const row=[0,1,2,3];if(gy%2)row.reverse();row.forEach(gx=>snake.push([gx,gy]))}
  let bi=0;const shelf={};
  const sh=i=>{const [gx,gy]=snake[i];return shelf[i]||(shelf[i]={gx,gy,x:2,y:2,rh:0})};   // 2-cell margin: ports facing the block edge need a doorway cell inside the floor
  const sizeOf=cls=>{const d=dim({cls,rot:0});return[d.w,d.h]};
  const tryPlace=(st,w,h)=>{let x=st.x,y=st.y,rh=st.rh;if(x+w>28){x=2;y+=rh+GAP;rh=0}if(y+h>28)return null;return{x,y,nx:x+w+GAP,rh:Math.max(rh,h)}};
  function packGroup(items){   // items: [{cls,...}] kept together in one block when possible
    for(let j=bi;j<snake.length;j++){
      const st=sh(j),sim={x:st.x,y:st.y,rh:st.rh},pos=[];let ok=true;
      for(const it of items){const [w,h]=sizeOf(it.cls);const p=tryPlace(sim,w,h);if(!p){ok=false;break}pos.push(p);sim.x=p.nx;sim.y=p.y;sim.rh=p.rh}
      if(ok){HAND.block(st.gx,st.gy);const out=[];items.forEach((it,i)=>{const m=HAND.put({...it,gx:st.gx,gy:st.gy,lx:pos[i].x,ly:pos[i].y});out.push(m);if(!m)throw new Error('put failed '+it.name)});st.x=sim.x;st.y=sim.y;st.rh=sim.rh;bi=j;return out}
    }
    // too big for one block: continue item by item over the following blocks (a player carries on into the next block)
    const out=[];
    for(const it of items){
      let placedIt=false;
      for(;bi<snake.length&&!placedIt;){
        const st=sh(bi),[w,h]=sizeOf(it.cls),p=tryPlace(st,w,h);
        if(!p){bi++;continue}
        HAND.block(st.gx,st.gy);const m=HAND.put({...it,gx:st.gx,gy:st.gy,lx:p.x,ly:p.y});if(!m)throw new Error('put failed '+it.name);
        st.x=p.nx;st.y=p.y;st.rh=p.rh;out.push(m);placedIt=true;
      }
      if(!placedIt)throw new Error('out of blocks at '+it.name);
    }
    return out;
  }
  const MA={},HUB={},RAW={},home={};   // machines by product, hubs by product, raw containers by group+item
  const mk=(p,i)=>({cls:SP[p].cls,rec:SP[p].rec,name:p+'#'+i});
  const hub=(p,ct)=>({cls:'DAT_Container_2',name:'hub '+p,ct:ct||[]});
  const raw=(it,g)=>({cls:'DAT_Container_2',name:'raw '+it+' ['+g+']',ct:[{item:'ITEM_'+it,n:0,inf:true}],_raw:it,_g:g});
  const seed=p=>[{item:'ITEM_'+p,n:300,inf:false}];
  const G=[];   // groups: {id,items:[spec],products:[names]}
  const add=(id,prods,list)=>G.push({id,prods,list});
  const nut=n=>Array.from({length:n},(_,i)=>mk('Nutrients',i));
  add('nA',['Nutrients'],[...nut(3).map((m,i)=>({...m,name:'Nutrients#A'+i,_p:'Nutrients',_h:'A'})),hub('NutA'),raw('Graphite','nA'),raw('Silica','nA'),raw('WaterIce','nA')]);
  add('nB',['Nutrients'],[...nut(3).map((m,i)=>({...m,name:'Nutrients#B'+i,_p:'Nutrients',_h:'B'})),hub('NutB'),raw('Graphite','nB'),raw('Silica','nB'),raw('WaterIce','nB')]);
  const many=(p,g)=>Array.from({length:SP[p].n},(_,i)=>({...mk(p,i),_p:p,_g:g}));
  add('xb',['Xenobacteria'],[...many('Xenobacteria','xb'),{...hub('Xenobacteria',seed('Xenobacteria')),_hub:'Xenobacteria'},raw('Biomass','xb')]);
  add('en',['Enzyme'],[...many('Enzyme','en'),{...hub('Enzyme'),_hub:'Enzyme'},raw('Biomass','en')]);
  add('xe',['Xenoeukarya','Xenoarchaea'],[...many('Xenoeukarya','xe'),...many('Xenoarchaea','xe'),{...hub('Xenoeukarya',seed('Xenoeukarya')),_hub:'Xenoeukarya'},{...hub('Xenoarchaea',seed('Xenoarchaea')),_hub:'Xenoarchaea'},raw('Biomass','xe')]);
  add('ab',['AlphaProtein','BetaProtein'],[...many('AlphaProtein','ab'),...many('BetaProtein','ab'),{...hub('AlphaProtein'),_hub:'AlphaProtein'},{...hub('BetaProtein'),_hub:'BetaProtein'},raw('Biomass','ab')]);
  add('bc',['Biolattice','ChitinComposite'],[...many('Biolattice','bc'),{...hub('Biolattice'),_hub:'Biolattice'},...many('ChitinComposite','bc'),{...hub('ChitinComposite'),_hub:'ChitinComposite'}]);
  const ref=(p,g)=>many(p,g);
  add('r1',['TitaniumPlates','NickelPlates','CobaltPlates','SiliconWafers'],[...ref('TitaniumPlates','r1'),...ref('NickelPlates','r1'),...ref('CobaltPlates','r1'),...ref('SiliconWafers','r1'),{...hub('TitaniumPlates'),_hub:'TitaniumPlates'},{...hub('NickelPlates'),_hub:'NickelPlates'},raw('TitaniumOre','r1'),raw('NickelOre','r1'),raw('CobaltOre','r1'),raw('Silica','r1')]);
  add('r2',['IridiumPlates','Graphene','ReinforcedGlass'],[...ref('IridiumPlates','r2'),...ref('Graphene','r2'),...ref('ReinforcedGlass','r2'),{...hub('IridiumPlates'),_hub:'IridiumPlates'},{...hub('Graphene'),_hub:'Graphene'},raw('IridiumOre','r2'),raw('Graphite','r2'),raw('Silica','r2')]);
  add('e1',['EnrichedTitaniumOre','EnrichedNickelOre','EnrichedCobaltOre'],[...many('EnrichedTitaniumOre','e1'),...many('EnrichedNickelOre','e1'),...many('EnrichedCobaltOre','e1'),{...hub('EnrichedTitaniumOre'),_hub:'EnrichedTitaniumOre'},{...hub('EnrichedNickelOre'),_hub:'EnrichedNickelOre'},{...hub('EnrichedCobaltOre'),_hub:'EnrichedCobaltOre'},raw('TitaniumOre','e1'),raw('NickelOre','e1'),raw('CobaltOre','e1')]);
  add('e2',['Superalloy','ChromaticAlloy'],[...many('Superalloy','e2'),{...hub('Superalloy'),_hub:'Superalloy'},...many('ChromaticAlloy','e2'),{...hub('ChromaticAlloy'),_hub:'ChromaticAlloy'}]);
  add('e3',['Coolant'],[...many('Coolant','e3'),{...hub('Coolant'),_hub:'Coolant'},raw('NitrogenGas','e3')]);
  add('a1',['MagneticCoils','BasicCircuit','DetectorArray','HullPlates'],[...many('MagneticCoils','a1'),...many('BasicCircuit','a1'),...many('DetectorArray','a1'),...many('HullPlates','a1'),{...hub('MagneticCoils'),_hub:'MagneticCoils'},{...hub('BasicCircuit'),_hub:'BasicCircuit'}]);
  add('a2',['BasicMotor','Capacitor','ContainmentCoil','SuperconductorCoil'],[...many('BasicMotor','a2'),...many('Capacitor','a2'),...many('ContainmentCoil','a2'),...many('SuperconductorCoil','a2')]);
  add('s1',['AdvancedCircuits','EmptySimulationMatrix','Multisensor','EncodedSimulationMatrix'],[...many('AdvancedCircuits','s1'),...many('EmptySimulationMatrix','s1'),...many('Multisensor','s1'),...many('EncodedSimulationMatrix','s1'),raw('Lonsdaleite','s1'),raw('StellarSurveyData','s1')]);
  add('s2',['AdvancedPlates','SuperalloyFrame','ReinforcedPlates','MaglevCoupling'],[...many('AdvancedPlates','s2'),{...hub('AdvancedPlates'),_hub:'AdvancedPlates'},...many('SuperalloyFrame','s2'),{...hub('SuperalloyFrame'),_hub:'SuperalloyFrame'},...many('ReinforcedPlates','s2'),...many('MaglevCoupling','s2')]);
  const placed=[];
  for(const g of G){
    GAP=['nA','nB','xb','en','xe','ab','bc'].includes(g.id)?(opts.ggap||8):BASEGAP;
    const ms=packGroup(g.list);
    g.list.forEach((it,i)=>{const m=ms[i];m._p=it._p;m._g=g.id;m._hub=it._hub;m._raw=it._raw;m._nh=it._h;placed.push(m);
      if(it._p){(MA[it._p]=MA[it._p]||[]).push(m)}
      if(it._hub)HUB[it._hub]=m;
      if(it.name==='hub NutA')HUB.NutA=m;if(it.name==='hub NutB')HUB.NutB=m;
      if(it._raw)RAW[g.id+'|'+it._raw]=m})}
  // ---- connections, one at a time
  const nutHub={Enzyme:'NutA',AlphaProtein:'NutB',BetaProtein:'NutB',Biolattice:'NutB'};
  const srcFor=(it,prod,machine)=>{
    const p=it.replace('ITEM_','');
    if(p==='Nutrients')return HUB[nutHub[prod]];
    if(SP[p]){if(hubOf(p))return HUB[p];return MA[p][0]}
    const r=RAW[machine._g+'|'+p];if(!r)throw new Error('no raw '+p+' in group '+machine._g+' for '+prod);return r;
  };
  const order=['xb','en','xe','ab','bc','nA','nB','r1','r2','e1','e2','e3','a1','a2','s1','s2'];
  const links=[];
  for(const gid of order){
    const grp=G.find(x=>x.id===gid);
    for(const m of placed.filter(q=>q._g===gid&&q._p)){
      const prod=m._p,s=SP[prod];
      if(prod==='Nutrients'){const raws=['Graphite','Silica','WaterIce'];raws.forEach(r=>links.push([RAW[gid+'|'+r],m,'raw '+r+'>'+m.name]));links.push([m,HUB[m._nh==='A'?'NutA':'NutB'],'Nutrients>hub']);continue}
      for(const it of s.ins){const src=srcFor(it,prod,m);links.push([src,m,it.replace('ITEM_','')+'>'+m.name])}
      if(hubOf(prod)&&HUB[prod])links.push([m,HUB[prod],prod+'>hub']);
    }
  }
  let ok=0;const results=[];
  const outs=links.filter(l=>/>hub$/.test(l[2])),ins=links.filter(l=>!/>hub$/.test(l[2]));   // outputs first: a machine must never lose its output port to its inputs
  for(const [a,b,label] of [...outs,...ins]){const n=HAND.link(a,b,label);if(n)ok++;results.push(n)}
  const T=HAND.result();
  T.links=links.length;T.linksOk=ok;T.blocksUsed=T.blocks.length;
  return T;
};

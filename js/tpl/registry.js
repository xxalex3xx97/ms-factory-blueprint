// Composer template registry (CMP C1). TPL_REG = the 10 template files. TPL_ON = ids tplPick may use (empty until a slice's checkIface/checkPlan tests are green; tests enable ids locally).
const TPL_REG=[{id:'refinery_1in',cls:['DAT_Refinery'],k:[1]},{id:'assembler_1in',cls:['DAT_Assembler'],k:[1]},{id:'assembler_2in',cls:['DAT_Assembler'],k:[2]},{id:'assembler_3in',cls:['DAT_Assembler'],k:[3]},{id:'enrichment_1in',cls:['DAT_EnrichmentChamber'],k:[1]},{id:'enrichment_2_3in',cls:['DAT_EnrichmentChamber'],k:[2,3]},{id:'advassembler_1_2in',cls:['DAT_AdvancedAssembler'],k:[1,2]},{id:'advassembler_4in',cls:['DAT_AdvancedAssembler'],k:[4]},{id:'growth_2_3_4in',cls:['DAT_GrowthChamber'],k:[2,3,4],growth:true},{id:'special_machines',kBy:{DAT_Supercomputer:[2],DAT_RelicSynthesizer:[0,1]}}];
const TPL_ON=new Set(['refinery_1in','assembler_1in','assembler_2in','enrichment_1in','advassembler_1_2in','growth_2_3_4in']);
// tplPick(cls,k,block) -> {ok:true,id,t:TPLM[id]} | {ok:false,why}
function tplPick(cls,k,block){
  const e=TPL_REG.find(r=>{const ks=r.cls?(r.cls.includes(cls)?r.k:null):(r.kBy&&r.kBy[cls]);return !!ks&&ks.includes(k)});
  if(!e||!TPL_ON.has(e.id))return{ok:false,why:String(cls).replace(/^DAT_/,'')+' with '+k+' input(s) has no template (or not enabled for '+block+')'};
  return{ok:true,id:e.id,t:TPLM[e.id]};
}

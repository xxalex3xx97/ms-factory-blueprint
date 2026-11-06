import {createRequire} from 'module';
const require=createRequire('file:///F:/ms-factory-bp-site/tests/x.mjs');
const {chromium}=require('C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const br=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
for(const [w,h] of [[1400,900],[1024,700],[390,800]]){
 const pg=await br.newPage({viewport:{width:w,height:h}});
 pg.on('pageerror',e=>console.log('ERR',e.message));
 await pg.goto('file:///F:/ms-factory-bp-site/index.html');
 await pg.evaluate(()=>{document.getElementById('plnB').click()});
 if(w==1400)await pg.screenshot({path:`F:/ms-factory-bp-site/tests/shots/pln-${w}-empty.png`});
 await pg.selectOption('#plnItem','ITEM_CobaltPlates');
 await pg.fill('#plnRate',process.argv[2]||'400');
 await pg.selectOption('#plnOut select.plnAlt[data-item="ITEM_CobaltPlates"]',{index:1}).catch(()=>{});
 await pg.screenshot({path:`F:/ms-factory-bp-site/tests/shots/pln-${w}x${h}.png`});await pg.evaluate(()=>{const o=document.getElementById('plnOut');o.scrollLeft=1e5});await pg.screenshot({path:`F:/ms-factory-bp-site/tests/shots/pln-${w}x${h}-end.png`});
}
await br.close();

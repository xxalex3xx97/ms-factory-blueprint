import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
for(const [w,h] of [[1600,800],[1400,900],[1024,700],[390,800],[1200,400]]){
 for(const view of ['L','F']){
  const pg=await b.newPage({viewport:{width:w,height:h}});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('file:///F:/ms-factory-bp-site/index.html');
  if(view==='F'){await pg.click('#vwF');}
  const m=async()=>pg.evaluate(()=>({h:document.querySelector('header').getBoundingClientRect().height,sw:document.querySelector('header').scrollWidth,cw:document.querySelector('header').clientWidth,stage:Math.round(document.querySelector('#stage').getBoundingClientRect().height)}));
  console.log(w,h,view,JSON.stringify(await m()),errs.join('|'));
  await pg.screenshot({path:`tests/shots/r4-${w}x${h}-${view}.png`});
  await pg.click(view==='F'&&w<1800?'#simM':'#fileM');
  await pg.screenshot({path:`tests/shots/r4-${w}x${h}-${view}-menu.png`});
  await pg.close();
 }}
await b.close();

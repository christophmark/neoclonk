import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {writeFile} from 'node:fs/promises';
const engine=process.env.BROWSER||'chromium';
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}:{executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={engine,checks:[],errors:[]};
try{
 for(const german of [true,false]){
  const context=await browser.newContext({locale:german?'de-DE':'en-US',hasTouch:true,viewport:{width:896,height:414}});
  // Load genuine original control settings before main(), without modifying gameplay.
  await context.addInitScript(({german})=>{
   let engineModule;
   Object.defineProperty(window,'Module',{configurable:true,get:()=>engineModule,set(value){if(value===engineModule)return;engineModule=value;const init=value.onRuntimeInitialized;value.onRuntimeInitialized=()=>{init();const fs=value.FS,path='/data/home/browser.cfg';const cfg=fs.readFile(path,{encoding:'utf8'}).replace('[Controls]',`[Controls]\nKbd1Key7=${german?121:122}\nKbd1Key10=${german?60:114}`);fs.writeFile(path,cfg);};}});
  },{german});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto('http://127.0.0.1:3000/rage/index.html?touch=1');await page.locator('#start').tap();
  await page.waitForFunction(()=>window.__rageBrowser?.getState().phase==='playing',null,{timeout:90000});
  await page.waitForFunction(()=>JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).players.some(p=>p.cursor));
  const call=(name,args=[])=>page.evaluate(({name,args})=>window.Module.ccall('nc_browser_'+name,'number',args.map(()=> 'number'),args),{name,args});
  const state=()=>page.evaluate(()=>JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])));
  const tap=async code=>{await page.locator(`[data-code="Key${code}"]`).tap();await page.waitForTimeout(120);};
  await call('pause',[1]);await call('step',[40]);await tap('C');await call('step',[28]);
  const movements=[];
  for(const key of ['touch','y','z']){
   await tap('X');await call('step',[4]);const before=(await state()).players[0].cursor;
   if(key==='touch')await tap('Z');
   else {await page.locator('#canvas').focus();await page.keyboard.press(key);await page.waitForTimeout(120);}
   await call('step',[5]);const after=(await state()).players[0].cursor;
   assert.equal(after.commandDirection,7,`${german?'DE':'US'} ${key} commands original Left`);
   movements.push({input:key,dx:after.x-before.x,action:after.action});
  }
  assert.ok(movements.some(m=>m.dx<0),'Left produces actual movement');
  await page.evaluate(()=>window.__rageBrowser.tap('KeyR'));await page.waitForTimeout(120);await call('step',[1]);
  assert.equal((await state()).players[0].menu,true,'Menu follows the original locale binding');
  report.checks.push({layout:german?'QWERTZ / Y':'QWERTY / Z',movements,menu:true});
  console.log('PASS',JSON.stringify(report.checks.at(-1)));
  await context.close();
 }
 assert.deepEqual(report.errors,[]);
} catch(error){report.failure=String(error);throw error;}
finally{await writeFile(`outputs/keyboard-layout-${engine}.json`,JSON.stringify(report,null,2));await browser.close();}

import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='rage-port/outputs/touch-menus';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});const report={trace:[],errors:[]};page.on('pageerror',e=>report.errors.push(String(e)));
const call=(name,result='number',args=[])=>page.evaluate(({name,result,args})=>Module.ccall('nc_browser_'+name,result,args.map(()=>'number'),args),{name,result,args});
const state=()=>call('state','string').then(JSON.parse),menus=()=>call('menus','string').then(JSON.parse);
const step=n=>call('step','number',[n]);
const tap=async index=>{await call('control','number',[0,index,1,0]);await call('control','number',[0,index,0,0]);await step(3);};
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:3902');await page.waitForFunction(()=>window.__scenarioLibrary?.catalog);
 await page.evaluate(()=>window.__rageBrowser.startScenario('worlds.c4f/goldmine.c4s'));
 await page.waitForFunction(()=>window.__rageBrowser?.getState().ready&&JSON.parse(Module.ccall('nc_browser_state','string',[],[])).players.some(p=>p.local&&p.cursor),null,{timeout:90000});
 await call('pause','number',[1]);await step(16);await page.waitForFunction(()=>document.querySelector('[data-code=KeyQ]').hidden);report.initialTouch=JSON.parse(await call('touch','string'));assert.equal(report.initialTouch.crewCount,1);assert.equal(report.initialTouch.menu,false);assert.ok(report.initialTouch.extras.some(e=>e.control===11),'Standard Clonk Menu special discovered');
 const objects=JSON.parse(await call('objects','string',[0,0,0])),hut=objects.find(o=>o.id==='HUT2'&&o.owner===0);assert.ok(hut);
 await call('command','number',[0,3,hut.number,0,0,0,0,0]);
 for(let i=0;i<16&&(await state()).players[0].cursor.contained!==hut.number;++i)await step(16);
 assert.equal((await state()).players[0].cursor.contained,hut.number);
 await tap(4);await page.waitForTimeout(250);
 for(const [name,width,height] of [['portrait',390,844],['landscape',896,414]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>window.__rageBrowser.showTouch(true));await page.waitForTimeout(500);await step(1);await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-code=KeyQ]').isVisible(),true,'Crew controls remain available in a native menu');
  let menu=(await menus()).find(m=>m.objectMenu);assert.ok(menu,`Native shop missing in ${name}`);
  const pad=await page.locator('#touchpad').boundingBox();report.trace.push({name,menu,pad,state:await state()});
  assert.ok(menu.x>=0&&menu.y>=64&&menu.x+menu.width<=width&&menu.y+menu.height<=height,'Menu fits visible game viewport');assert.ok(menu.x<=8,'Native menu anchored at left');assert.ok(!intersects(menu,pad),'Native menu remains clear of touchpad');
  await page.screenshot({path:`${out}/${name}.png`});
  const flint=menu.items.find(i=>i.id==='FLNT');assert.ok(flint,'Original buy-menu Flint item');
  const before=(await state()).players[0].wealth;
  await page.touchscreen.tap(flint.x+flint.width/2,flint.y+flint.height/2);await page.waitForTimeout(180);await step(20);
  const after=(await state()).players[0].wealth;report.trace.push({name:name+'-tap',before,after,flint});assert.equal(after,before-5,'Real canvas tap buys original Flint through moved GUI hit region');
 }
 const shop=(await menus()).find(m=>m.objectMenu), recruit=shop.items.find(i=>i.id==='CLNK');assert.ok(recruit);
 await page.touchscreen.tap(recruit.x+recruit.width/2,recruit.y+recruit.height/2);await page.waitForTimeout(180);await step(20);
 report.recruitedTouch=JSON.parse(await call('touch','string'));assert.equal(report.recruitedTouch.crewCount,2,'Actual shop purchase recruits a second crew member');
 // Close the native shop with its original close icon.
 const open=(await menus()).find(m=>m.objectMenu);await page.touchscreen.tap(open.x+open.width-10,open.y+10);await page.waitForTimeout(180);await step(3);
 assert.equal(JSON.parse(await call('touch','string')).menu,false);
 await page.waitForTimeout(300);assert.equal(await page.locator('[data-code=KeyQ]').isVisible(),true);
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error);report.stack=error.stack;console.error(error);process.exitCode=1;try{report.state=await state();report.menus=await menus();await page.screenshot({path:out+'/failure.png'});}catch{}}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.passed,failure:report.failure}));

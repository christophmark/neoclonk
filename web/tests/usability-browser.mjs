/** Original-artwork UI, responsive world-only zoom, touch-safe camera and original saves. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const engine=process.env.BROWSER||'chromium';
const base=process.env.NEOCLONK_URL||'http://127.0.0.1:3000/';
const report={engine,url:base,checks:[],errors:[]};
await mkdir('outputs/usability',{recursive:true});
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}:{executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
let activePage;
function check(name,data={}){report.checks.push({name,...data});console.log('PASS',name,JSON.stringify(data));}
async function frame(page){if(await page.locator('iframe').count())return(await page.locator('iframe').elementHandle()).contentFrame();return page.mainFrame();}
const call=(g,name,args=[],type='number')=>g.evaluate(({name,args,type})=>window.Module.ccall('nc_browser_'+name,type,args.map(()=> 'number'),args),{name,args,type});
const state=async g=>JSON.parse(await call(g,'state',[],'string'));
async function start(g,button='#start'){
 await g.locator(button).click();await g.waitForFunction(()=>['playing','error'].includes(window.__rageBrowser?.getState().phase),null,{timeout:120000});
 assert.equal(await g.evaluate(()=>window.__rageBrowser.getState().phase),'playing');
 await g.waitForFunction(()=>JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).players.some(p=>p.cursor));
 await call(g,'pause',[1]);await call(g,'step',[40]);
 await g.waitForFunction(()=>{const v=JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).viewport,p=document.querySelector('#touchpad');return v&&v.zoom>=v.minZoom&&Math.abs(v.zoom-Number(document.querySelector('#zoom').value))<.001&&(p.hidden||(v.occlusion.width===Math.ceil(p.getBoundingClientRect().width)&&v.occlusion.x===Math.round(p.getBoundingClientRect().x)&&v.occlusion.y===Math.round(p.getBoundingClientRect().y)));},null,{timeout:15000});
}
async function fullViewport(g,width,height){const box=await g.locator('#canvas').boundingBox();assert.equal(Math.round(box.width),width);assert.equal(Math.round(box.height),height);await g.waitForFunction(({width,height})=>window.Module.canvas.width===width&&window.Module.canvas.height===height,{width,height},{timeout:20000});const b=await g.locator('#game-header').boundingBox();assert.equal(Math.round(b.height),64);}
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();activePage=page;page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(base);let g=await frame(page);
 assert.equal(await g.evaluate(()=>typeof window.Module),'undefined','Original menu appears before engine downloads');
 await g.waitForFunction(()=>document.querySelector('.menu-logo').complete&&document.querySelector('.menu-logo').naturalWidth>0);
 await page.screenshot({path:`outputs/usability/${engine}-menu.png`});check('Original-artwork start menu appears without booting game');
 await start(g);await fullViewport(g,1280,800);assert.equal(await g.locator('#touchpad').isVisible(),false);
 const visibleButtons=await g.locator('button:visible').evaluateAll(bs=>bs.map(b=>b.id));assert.deepEqual(visibleButtons.sort(),['game-save','main-menu']);check('Desktop fills viewport with only original header additions',{visibleButtons});
 const before=await state(g),world=before.players[0].cursor;
 const slider=g.locator('#zoom');const box=await slider.boundingBox();await page.mouse.click(box.x+box.width*.8,box.y+box.height/2);
 await g.waitForFunction(()=>JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).viewport.zoom>2);
 const after=await state(g);assert.ok(after.viewport.worldWidth<before.viewport.worldWidth);assert.equal(after.viewport.headerHeight,64);assert.equal(after.frame,before.frame);assert.equal(after.players[0].cursor.fixedX,world.fixedX);assert.equal(after.players[0].cursor.fixedY,world.fixedY);
 check('Zoom changes world view while HUD size and simulation stay unchanged',{from:before.viewport.zoom,to:after.viewport.zoom});
 await g.locator('#game-save').click();await g.waitForFunction(()=>!!window.__rageBrowser.getState().lastSaved,null,{timeout:60000});
 const path=await g.evaluate(()=>window.__rageBrowser.getState().lastSaved);assert.match(await g.locator('#save-feedback').textContent(),/Game saved/);const originalBytes=await g.evaluate(path=>window.Module.FS.readFile(path).length,path);
 await page.reload();g=await frame(page);const relative=path.replace('/data/home/Savegames.c4f/','');
 await g.waitForFunction(relative=>[...document.querySelector('#saved-games').options].some(o=>o.value===relative),relative);
 assert.equal(await g.evaluate(()=>typeof window.Module),'undefined');await g.locator('#saved-games').selectOption(relative);await page.screenshot({path:`outputs/usability/${engine}-load-menu.png`});await start(g,'#load-save');
 assert.ok((await state(g)).scenario.endsWith(relative));assert.equal(await g.evaluate(path=>window.Module.FS.readFile(path).length,path),originalBytes);
 check('Header Save persists original round and startup Load resumes it',{path,bytes:originalBytes});
 await g.locator('#main-menu').click();assert.equal(await g.locator('#cover').isVisible(),true);assert.equal((await state(g)).paused,true);await g.locator('#start').click();assert.equal(await g.locator('#cover').isVisible(),false);check('Original logo opens menu and Resume returns to the round');
 await page.screenshot({path:`outputs/usability/${engine}-desktop.png`});await context.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const phone=await mobile.newPage();activePage=phone;phone.on('pageerror',e=>report.errors.push(String(e)));await phone.goto(base);g=await frame(phone);await phone.screenshot({path:`outputs/usability/${engine}-portrait-menu.png`});await start(g);await fullViewport(g,390,844);assert.ok(await g.locator('#touchpad').isVisible());
 for(const [width,height,label]of [[390,844,'portrait'],[896,414,'landscape']]){
  await phone.setViewportSize({width,height});await fullViewport(g,width,height);
  await g.waitForFunction(()=>{const v=JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).viewport;const r=document.querySelector('#touchpad').getBoundingClientRect();return v&&v.clonkScreenX>0&&v.clonkScreenY>=64&&!(v.clonkScreenX>=r.left&&v.clonkScreenX<=r.right&&v.clonkScreenY>=r.top&&v.clonkScreenY<=r.bottom);},null,{timeout:20000});
  const view=(await state(g)).viewport,pad=await g.locator('#touchpad').boundingBox();assert.equal(view.occlusion.x,Math.round(pad.x));assert.equal(view.occlusion.y,Math.round(pad.y));assert.equal(view.occlusion.width,Math.ceil(pad.width));assert.equal(view.occlusion.height,Math.ceil(pad.height));assert.ok(view.zoom>=view.minZoom);
  await phone.screenshot({path:`outputs/usability/${engine}-${label}.png`});check(`Touch ${label} fills screen and keeps Clonk outside controls`,{viewport:view});
 }
 const mobileBefore=await state(g),mobileSlider=await g.locator('#zoom').boundingBox();await phone.touchscreen.tap(mobileSlider.x+mobileSlider.width*.55,mobileSlider.y+mobileSlider.height/2);
 await g.waitForFunction(()=>JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).viewport.zoom>3);
 const mobileAfter=await state(g),pad=await g.locator('#touchpad').boundingBox(),v=mobileAfter.viewport;
 assert.equal(mobileBefore.frame,mobileAfter.frame);assert.ok(!(v.clonkScreenX>=pad.x&&v.clonkScreenX<=pad.x+pad.width&&v.clonkScreenY>=pad.y&&v.clonkScreenY<=pad.y+pad.height));
 await g.locator('[data-code="KeyZ"]').tap();await phone.waitForTimeout(100);await call(g,'step',[5]);assert.equal((await state(g)).players[0].cursor.commandDirection,7);check('Touch zoom preserves simulation and clearance; touch Left reaches original control');
 await mobile.close();assert.deepEqual(report.errors,[]);
}catch(error){report.failure=String(error);console.error(error);process.exitCode=1;try{await activePage.screenshot({path:`outputs/usability/${engine}-failure.png`});}catch{/* Page may have closed. */}}
finally{await writeFile(`outputs/usability/${engine}-report.json`,JSON.stringify(report,null,2));await browser.close();}

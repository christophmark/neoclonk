import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const kind=process.env.BROWSER||'chromium',base=process.env.GAME_URL||'http://127.0.0.1:3906',out=`rage-port/outputs/touch-movement-${kind}`;await mkdir(out,{recursive:true});
const browser=kind==='webkit'?await webkit.launch({headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}):await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const report={browser:kind,engines:[]};
try {const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
for(const engine of ['rage','planet']){
 const page=await context.newPage(),r={engine,errors:[]};report.engines.push(r);page.on('pageerror',e=>r.errors.push(String(e)));
 await page.goto(base+(engine==='rage'?'/rage/index.html?scenario=worlds.c4f/goldmine.c4s&play=1&touch=1':'/planet/index.html?scenario=planet-official/easy.c4f/goldmine.c4s'));
 await page.waitForFunction(e=>e==='rage'?window.__rageBrowser?.getState().ready:window.__planetBrowser?.state().ready,engine,{timeout:90000});
 const call=(name,args=[])=>page.evaluate(({name,args})=>Module.ccall(name,'number',args.map(()=>'number'),args),{name:(engine==='rage'?'nc_browser_':'nc_planet_')+name,args});
 const state=()=>page.evaluate(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])));const cursor=async()=>(await state()).players.find(p=>p.local).cursor;
 await call('pause',[1]);await call('step',[65]);
 const mode=page.getByRole('switch',{name:'Hold to move'});assert.equal(await mode.isChecked(),engine==='planet','Preference is shared between engines');
 if(await mode.isChecked())await mode.uncheck();
 assert.equal(await page.locator('#touchpad [data-code=KeyZ] b').textContent(),'Z');
 const point=await page.locator('#touchpad [data-code=KeyC]').boundingBox();await page.mouse.move(point.x+point.width/2,point.y+point.height/2);
 await page.mouse.down();await call('step',[12]);await page.mouse.up();r.tapReleased=await cursor();await call('step',[12]);r.tapLater=await cursor();assert.notEqual(r.tapLater.x,r.tapReleased.x,'Tap keeps moving after release');
 await mode.check();await call('step',[16]);
 const left=await page.locator('#touchpad [data-code=KeyZ]').boundingBox();await page.mouse.move(left.x+left.width/2,left.y+left.height/2);r.holdBefore=await cursor();await page.mouse.down();await call('step',[12]);r.holdDuring=await cursor();assert.notEqual(r.holdDuring.x,r.holdBefore.x,'Held direction moves the real crew');await page.mouse.up();await call('step',[10]);r.holdStopped=await cursor();await call('step',[15]);r.holdLater=await cursor();assert.equal(r.holdLater.x,r.holdStopped.x,'Hold release stops native horizontal movement');
 await page.screenshot({path:out+'/'+engine+'-portrait.png'});await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);const pad=await page.locator('#touchpad').boundingBox();assert(pad.y>=0&&pad.y+pad.height<=390);await page.screenshot({path:out+'/'+engine+'-landscape.png'});assert.deepEqual(r.errors,[]);await page.close();
}report.passed=true;}catch(e){report.failure=String(e.stack||e);process.exitCode=1;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}

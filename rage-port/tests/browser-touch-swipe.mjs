import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const kind=process.env.BROWSER||'chromium',base=process.env.GAME_URL||'http://127.0.0.1:3906',out=`rage-port/outputs/touch-swipe-${kind}`;await mkdir(out,{recursive:true});
const browser=await(kind==='webkit'?webkit:chromium).launch(kind==='webkit'?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}:{headless:true,executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let activePage;const report={browser:kind,input:kind==='chromium'?'CDP real touch':'PointerEvent touch with capture stub',engines:[]};
try{const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
for(const engine of (process.env.ENGINE?[process.env.ENGINE]:['rage','planet'])){
 const page=activePage=await context.newPage(),r={engine,errors:[]};report.engines.push(r);page.on('pageerror',e=>r.errors.push(String(e)));
 await page.addInitScript(()=>{Date.now=()=>1770000000000;});
 await page.goto(base+(engine==='rage'?'/rage/index.html?scenario=worlds.c4f/goldmine.c4s&play=1&touch=1':'/planet/index.html?scenario=planet-official/easy.c4f/goldmine.c4s'));
 await page.waitForFunction(e=>e==='rage'?window.__rageBrowser?.getState().ready:window.__planetBrowser?.state().ready,engine,{timeout:90000});
 await page.evaluate(()=>{const base=Date.now(),start=performance.now();Date.now=()=>base+performance.now()-start;});
 await page.waitForFunction(()=>JSON.parse(Module.ccall('nc_browser_touch','string',[],[]))?.aimValid,null,{timeout:20000});
 await page.waitForTimeout(100);
 const info=()=>page.evaluate(()=>JSON.parse(Module.ccall('nc_browser_touch','string',[],[])));
 const state=()=>page.evaluate(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])));
 const crew=async()=>(await state()).players.find(p=>p.local).cursor;
 const mode=page.getByRole('radio',{name:'Swipe',exact:true});if(engine==='planet'&&!process.env.ENGINE)assert(await mode.isChecked(),'Swipe preference follows the player to Planet');else await mode.check();
 await page.evaluate(()=>{window.__touchCommands=[];const call=Module.ccall;Module.ccall=function(name,type,types,args){if(name.endsWith('_control'))__touchCommands.push({args,time:performance.now()});return call.call(this,name,type,types,args);};});
 const cdp=kind==='chromium'?await context.newCDPSession(page):null;
 if(!cdp)await page.locator('canvas').evaluate(c=>{c.setPointerCapture=()=>{};c.hasPointerCapture=()=>false;});
 let x=0,y=0;
 const send=async(type,nx=x,ny=y)=>{x=nx;y=ny;if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:({down:'touchStart',move:'touchMove',up:'touchEnd',cancel:'touchCancel'})[type],touchPoints:['up','cancel'].includes(type)?[]:[{x,y,id:1}]});else await page.locator('canvas').dispatchEvent('pointer'+type,{pointerType:'touch',pointerId:1,clientX:x,clientY:y,bubbles:true,cancelable:true});};
 // Prescribe physical event times so software rendering cannot turn a fast
 // gesture into a slow drag while the automation waits for acknowledgments.
 const timed=async events=>{
  if(cdp){const start=Date.now()/1000;await Promise.all(events.map(([type,nx,ny,ms])=>{x=nx;y=ny;return cdp.send('Input.dispatchTouchEvent',{type:({down:'touchStart',move:'touchMove',up:'touchEnd'})[type],timestamp:start+ms/1000,touchPoints:type==='up'?[]:[{x:nx,y:ny,id:1}]});}));}
  else await page.locator('canvas').evaluate((canvas,events)=>{const start=performance.now();for(const [type,x,y,ms]of events){const e=new PointerEvent('pointer'+type,{pointerType:'touch',pointerId:1,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(e,'timeStamp',{value:start+ms});canvas.dispatchEvent(e);}},events);
 };
 const position=async()=>{const i=await info(),c=await page.locator('canvas').boundingBox();return{x:c.x+i.aimX*c.width,y:c.y+i.aimY*c.height,canvas:c};};
 let p=await position();r.start=await crew();r.screenStart=p;
 const walkTarget=p.x+95;await send('down',walkTarget,p.canvas.y+220);await page.waitForFunction(x=>{const i=JSON.parse(Module.ccall('nc_browser_touch','string',[],[])),r=document.querySelector('canvas').getBoundingClientRect();return i&&Math.abs(r.left+i.aimX*r.width-x)<=34&&i.commandDirection===0;},walkTarget,{timeout:6000});await page.waitForTimeout(250);r.rightArrival=await info();r.right=await crew();assert(r.right.x>r.start.x+10,'Holding right moves the original clonk');
 p=await position();await send('move',Math.max(20,p.x-95),p.canvas.y+220);await page.waitForFunction(x=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])).players.find(p=>p.local).cursor.x<x,r.right.x,{timeout:5000});r.left=await crew();assert(r.left.x<r.right.x,'Crossing the clonk reverses movement while held');
 await send('up');await page.waitForTimeout(220);r.released=await crew();assert.equal((await info()).commandDirection,0,'Release stops movement');
 // Another sustained right hold clears the original hut foundation before digging.
 p=await position();await send('down',p.x+95,p.canvas.y+220);await page.waitForTimeout(700);await send('up');await page.waitForTimeout(250);
 // Fast downward swipe goes through the original Throw slot (5), not a mouse command.
 p=await position();await timed([['down',p.x+70,p.canvas.y+220,0],['move',p.x+70,p.canvas.y+305,65]]);await page.waitForFunction(()=>((JSON.parse(Module.ccall('nc_browser_state','string',[],[])).players.find(p=>p.local).lastCommand)&15)===5,null,{timeout:2000});r.throwCommand=(await state()).players.find(p=>p.local).lastCommand;assert.equal(r.throwCommand&15,5,'Down flick dispatches original Throw');await send('up');await page.waitForTimeout(250);
 p=await position();const digX=p.x+85,digY=Math.min(p.canvas.y+p.canvas.height-100,p.y+100);
 await timed([['down',digX,digY,0],['up',digX,digY,35],['down',digX,digY,110]]);
 await page.waitForFunction(()=>JSON.parse(Module.ccall('nc_browser_touch','string',[],[])).digging,null,{timeout:5000});r.digRight=await info();assert(r.digRight.digging,'Second tap and hold digs');
 p=await position();await send('move',Math.max(20,p.x-85),digY);
 await page.waitForFunction(dir=>{const t=JSON.parse(Module.ccall('nc_browser_touch','string',[],[]));return t.digging&&t.commandDirection>dir;},r.digRight.commandDirection,{timeout:3000});r.digLeft=await info();
 // Bring the held target onto the clonk and check the native arrival stop.
 p=await position();await send('move',p.x,p.y);await page.waitForFunction(()=>!JSON.parse(Module.ccall('nc_browser_touch','string',[],[])).digging,null,{timeout:2000});r.digArrived=await info();await page.waitForTimeout(350);assert.equal((await info()).digging,false,'Dig arrival stays stopped while the finger remains down');
 await send('up');await page.waitForTimeout(250);r.digReleased=await info();assert.equal(r.digReleased.digging,false,'Releasing the dig gesture stops digging');
 // Use a fresh landscape for jumping: the digging check has altered the ground.
 await page.reload();await page.waitForFunction(e=>e==='rage'?window.__rageBrowser?.getState().ready:window.__planetBrowser?.state().ready,engine,{timeout:90000});
 await page.evaluate(()=>{const base=Date.now(),start=performance.now();Date.now=()=>base+performance.now()-start;});
 await page.waitForFunction(()=>JSON.parse(Module.ccall('nc_browser_touch','string',[],[]))?.aimValid,null,{timeout:20000});
 if(!cdp)await page.locator('canvas').evaluate(c=>{c.setPointerCapture=()=>{};c.hasPointerCapture=()=>false;});
 p=await position();await send('down',p.x+125,p.canvas.y+220);await page.waitForTimeout(1800);await send('up');await page.waitForTimeout(250);
 // A real upward flick must lift the character off the ground.
 const beforeJump=await crew();p=await position();await timed([['down',p.x+70,p.canvas.y+300,0],['move',p.x+70,p.canvas.y+210,65],['up',p.x+70,p.canvas.y+210,75]]);
 r.jump=[];for(let i=0;i<10;i++){await page.waitForTimeout(50);r.jump.push(await crew());}assert(r.jump.some(c=>c.y<beforeJump.y-3),'Up flick makes the original clonk jump');await page.evaluate(()=>{const base=Date.now(),start=performance.now();Date.now=()=>base+performance.now()-start;});
 await page.waitForFunction(()=>JSON.parse(Module.ccall('nc_browser_touch','string',[],[]))?.aimValid,null,{timeout:20000});
 await page.waitForTimeout(100);
 for(const [name,width,height]of [['portrait',390,844],['landscape',844,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(350);const pad=await page.locator('#touchpad').boundingBox();assert(pad.y>=0&&pad.x>=0&&pad.y+pad.height<=height,'Swipe pad fits screen');await page.screenshot({path:out+'/'+engine+'-'+name+'.png'});}
 assert.deepEqual(r.errors,[]);await page.close();
}report.passed=true;}catch(e){report.failure=String(e.stack||e);process.exitCode=1;if(activePage){report.page=await activePage.locator('body').innerText();report.diagnostics=await activePage.evaluate(()=>({controls:window.__touchCommands,touch:JSON.parse(Module.ccall('nc_browser_touch','string',[],[])),state:JSON.parse(Module.ccall('nc_browser_state','string',[],[]))}));await activePage.screenshot({path:out+'/failure.png'});}}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}

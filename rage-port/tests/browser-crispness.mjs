// Verify real magnification filters and high-DPI canvas presentation without ticking gameplay.
import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const engine=process.env.BROWSER||'chromium',out=`rage-port/outputs/crispness-${engine}`;
await mkdir(out,{recursive:true});
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}:{headless:true,executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true}),report={engine,checks:[],errors:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
await page.addInitScript(()=>{
 localStorage.setItem('neoclonk.zoom','1.5');
 window.__filterCounts={nearest:0,linear:0,minLinear:0};
 const original=WebGLRenderingContext.prototype.texParameteri;
 WebGLRenderingContext.prototype.texParameteri=function(target,pname,param){
  if(pname===this.TEXTURE_MAG_FILTER){if(param===this.NEAREST)window.__filterCounts.nearest++;if(param===this.LINEAR)window.__filterCounts.linear++;}
  if(pname===this.TEXTURE_MIN_FILTER&&param===this.LINEAR)window.__filterCounts.minLinear++;
  return original.call(this,target,pname,param);
 };
});
try{
 const url=new URL(process.env.GAME_URL||'http://127.0.0.1:3902/rage/index.html');url.searchParams.set('play','1');url.searchParams.set('scenario','worlds.c4f/goldmine.c4s');await page.goto(url.href);
 await page.waitForFunction(()=>window.__rageBrowser?.getState().ready,null,{timeout:120000});
 await page.waitForFunction(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])).viewport.zoom===2);
 assert.equal(await page.locator('input[type=range]').count(),0);
 await page.evaluate(()=>{Module.ccall('nc_browser_pause','number',['number'],[1]);Module.ccall('nc_browser_step','number',['number'],[20]);});
 const simulation=()=>page.evaluate(()=>{const s=JSON.parse(Module.ccall('nc_browser_state','string',[],[]));return {frame:s.frame,randomHold:s.randomHold,randomCount:s.randomCount,cursor:s.players[0].cursor,terrain:Module.ccall('nc_browser_landscape_hash','number',[],[])};});
 const before=await simulation();
 assert.equal(await page.locator('#canvas').evaluate(c=>getComputedStyle(c).imageRendering),'pixelated');
 for(const zoom of [.25,.5,1,2,3,4,8]){
  await page.evaluate(zoom=>{window.__filterCounts={nearest:0,linear:0,minLinear:0};window.__rageBrowser.setZoom(zoom);},zoom);
  await page.waitForFunction(zoom=>Math.abs(JSON.parse(Module.ccall('nc_browser_state','string',[],[])).viewport.zoom-zoom)<.001,zoom);
  await page.waitForFunction(()=>window.__filterCounts.nearest>0);
  const filters=await page.evaluate(()=>window.__filterCounts);assert.equal(filters.linear,0,'Magnified sprites must not use bilinear filtering');
  assert.deepEqual(await simulation(),before,'Zoom changes presentation only');
  await page.screenshot({path:`${out}/${zoom}x.png`});report.checks.push({zoom,filters});
 }

 // Actual buttons, not just the presentation API, must reach both limits.
 for(const target of [7,6,5,4,3,2,1,.5,.25]){
  await page.locator('#zoom-out').tap();
  await page.waitForFunction(target=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])).viewport.zoom===target,target);
 }
 assert.equal(await page.locator('#zoom-out').isDisabled(),true);
 for(const target of [.5,1,2,3,4,5,6,7,8]){
  await page.locator('#zoom-in').tap();
  await page.waitForFunction(target=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])).viewport.zoom===target,target);
 }
 assert.equal(await page.locator('#zoom-in').isDisabled(),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('neoclonk.zoom')),'8');
 assert.deepEqual(await simulation(),before,'Zoom buttons leave simulation and terrain unchanged');
 report.checks.push({buttons:'All steps, both limits, touch input and preference persistence passed'});
 await page.evaluate(()=>window.__rageBrowser.setZoom(2));
 for(const [width,height]of [[320,700],[390,844],[896,414],[1440,900]]){
  await page.setViewportSize({width,height});
  await page.waitForFunction(({width,height})=>Module.canvas.width===width&&Module.canvas.height===height,{width,height});
  const buttons=await Promise.all(['game-save','game-exit','main-menu','zoom-out','zoom-in'].map(id=>page.locator('#'+id).boundingBox()));
  for(const rect of buttons)assert.ok(rect.x>=0&&rect.x+rect.width<=width);
  for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){
   const a=buttons[i],b=buttons[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'Header controls do not overlap');
  }
  for(const rect of buttons.slice(-2))assert.ok(rect.width>=44&&rect.height>=44,'Zoom touch targets are at least 44px');
  const selection=await page.locator('#zoom-in').evaluate(button=>({
   css:getComputedStyle(button).userSelect,calloutSupported:CSS.supports('-webkit-touch-callout','none'),callout:getComputedStyle(button).getPropertyValue('-webkit-touch-callout'),
   allowed:button.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})),
  }));
  assert.equal(selection.css,'none');assert.equal(selection.allowed,false);
  if(selection.calloutSupported)assert.equal(selection.callout,'none');
  const s=await page.evaluate(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[]))),pad=await page.locator('#touchpad').boundingBox(),v=s.viewport;
  assert.equal(v.occlusion.x,Math.round(pad.x));assert.equal(v.occlusion.y,Math.round(pad.y));
  assert.ok(!(v.clonkScreenX>=pad.x&&v.clonkScreenX<=pad.x+pad.width&&v.clonkScreenY>=pad.y&&v.clonkScreenY<=pad.y+pad.height),'Clonk stays clear of touch controls');
  await page.screenshot({path:`${out}/header-${width}.png`});report.checks.push({width,height,selection});
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}

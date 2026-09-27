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
 await page.evaluate(()=>{Module.ccall('nc_browser_pause','number',['number'],[1]);Module.ccall('nc_browser_step','number',['number'],[20]);});
 const simulation=()=>page.evaluate(()=>{const s=JSON.parse(Module.ccall('nc_browser_state','string',[],[]));return {frame:s.frame,randomHold:s.randomHold,randomCount:s.randomCount,cursor:s.players[0].cursor,terrain:Module.ccall('nc_browser_landscape_hash','number',[],[])};});
 const before=await simulation();
 assert.equal(await page.locator('#canvas').evaluate(c=>getComputedStyle(c).imageRendering),'pixelated');
 for(const zoom of [.5,1,1.5,2,2.35,4]){
  await page.evaluate(zoom=>{window.__filterCounts={nearest:0,linear:0,minLinear:0};const input=document.getElementById('zoom');input.value=zoom;input.dispatchEvent(new Event('input'));},zoom);
  await page.waitForFunction(zoom=>Math.abs(JSON.parse(Module.ccall('nc_browser_state','string',[],[])).viewport.zoom-zoom)<.001,zoom);
  await page.waitForFunction(()=>window.__filterCounts.nearest>0);
  const filters=await page.evaluate(()=>window.__filterCounts);assert.equal(filters.linear,0,'Magnified sprites must not use bilinear filtering');
  assert.deepEqual(await simulation(),before,'Zoom changes presentation only');
  await page.screenshot({path:`${out}/${zoom}x.png`});report.checks.push({zoom,filters});
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}

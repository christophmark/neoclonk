// Verify touch visibility, browser cursor restoration and no pointer artifacts in paused frames.
import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const kind=process.env.BROWSER||'chromium',base=process.env.GAME_URL||'http://127.0.0.1:3906',out=`rage-port/outputs/touch-cursor-${kind}`;
await mkdir(out,{recursive:true});
const browser=await(kind==='webkit'?webkit:chromium).launch(kind==='webkit'?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}:{headless:true,executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={browser:kind,engines:[]};
try{for(const engine of ['rage','planet']){
 const page=await browser.newPage({viewport:{width:800,height:700},hasTouch:true}),r={engine};report.engines.push(r);
 await page.goto(base+(engine==='rage'?'/rage/index.html?scenario=worlds.c4f/goldmine.c4s&play=1&touch=1':'/planet/index.html?scenario=planet-official/easy.c4f/goldmine.c4s'));
 await page.waitForFunction(e=>e==='rage'?window.__rageBrowser?.getState().ready:window.__planetBrowser?.state().ready,engine,{timeout:90000});
 await page.evaluate(e=>Module.ccall(e==='rage'?'nc_browser_pause':'nc_planet_pause','number',['number'],[1]),engine);
 for(const visible of [true,false,true]){
  await page.evaluate(({engine,visible})=>{
   if(engine==='rage')window.__rageBrowser.showTouch(visible);
   else{document.getElementById('touchpad').hidden=!visible;window.dispatchEvent(new Event('resize'));window.__planetBrowser.setZoom(2);}
  },{engine,visible});
  await page.waitForTimeout(300);
  if(visible)assert.equal(await page.locator('canvas').evaluate(c=>getComputedStyle(c).cursor),'none');
  const tag=engine+'-'+(visible?'touch':'mouse');
  await page.mouse.move(280,220);await page.waitForTimeout(150);await page.screenshot({path:out+'/'+tag+'-near.png',clip:{x:248,y:188,width:64,height:64}});
  await page.screenshot({path:out+'/'+tag+'-full.png'});
  await page.mouse.move(460,220);await page.waitForTimeout(150);await page.screenshot({path:out+'/'+tag+'-away.png',clip:{x:248,y:188,width:64,height:64}});
  const pixels=Number(execFileSync('python3',['-c','from PIL import Image,ImageChops;import sys;d=ImageChops.difference(Image.open(sys.argv[1]).convert("RGB"),Image.open(sys.argv[2]).convert("RGB"));print(sum(p!=(0,0,0) for p in d.get_flattened_data()))',out+'/'+tag+'-near.png',out+'/'+tag+'-away.png'],{encoding:'utf8'}));
  (r.checks??=[]).push({touchVisible:visible,changedPixels:pixels});
  if(visible)assert.equal(pixels,0,'Touch mode must not draw a pointer at the mouse position');
  else assert.notEqual(await page.locator('canvas').evaluate(c=>getComputedStyle(c).cursor),'none','System cursor is restored when the pad is hidden');
 }
 await page.close();
}report.passed=true;}catch(e){report.failure=String(e.stack||e);process.exitCode=1;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(report);await browser.close();}

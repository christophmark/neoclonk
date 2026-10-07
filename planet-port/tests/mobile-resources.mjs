// Measure real browser GPU resource lifetime through startup, gameplay and zoom.
import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const kind=process.env.BROWSER||'chromium',tag=process.env.AUDIT_TAG||'optimized';
const out=`planet-port/build/mobile-resources-${kind}-${tag}`;await mkdir(out,{recursive:true});
const browser=kind==='webkit'?await webkit.launch({headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}):await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={browser:kind,tag,scenarios:[]};
try {for(const scenario of ['easy.c4f/goldmine.c4s','hazard.c4f/research.c4s']){
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const record={scenario,errors:[]};report.scenarios.push(record);page.on('pageerror',e=>record.errors.push(String(e)));
 await page.addInitScript(()=>{
  const textures=new Map(),fbos=new Set(),bindings=new Map();let unit=0,peakTextures=0,peakFbos=0,peakBytes=0,uploads=0,readbacks=0;
  const proto=WebGL2RenderingContext.prototype;
  const wrap=(name,hook)=>{const original=proto[name];proto[name]=function(...args){const result=original.apply(this,args);hook(args,result);return result;};};
  wrap('createTexture',(_,t)=>{textures.set(t,0);peakTextures=Math.max(peakTextures,textures.size);});
  wrap('deleteTexture',([t])=>textures.delete(t));
  wrap('activeTexture',([u])=>unit=u);
  wrap('bindTexture',([target,t])=>bindings.set(unit+':'+target,t));
  wrap('texImage2D',a=>{if(a.length<9)return;const t=bindings.get(unit+':'+a[0]),bytes=a[3]*a[4]*(a[2]===0x8232?1:a[2]===0x8051?3:4);if(t)textures.set(t,bytes);peakBytes=Math.max(peakBytes,[...textures.values()].reduce((a,b)=>a+b,0));});
  wrap('createFramebuffer',(_,f)=>{fbos.add(f);peakFbos=Math.max(peakFbos,fbos.size);});wrap('deleteFramebuffer',([f])=>fbos.delete(f));
  wrap('texSubImage2D',()=>uploads++);wrap('readPixels',()=>readbacks++);
  window.resourceSnapshot=()=>({textures:textures.size,framebuffers:fbos.size,textureBytes:[...textures.values()].reduce((a,b)=>a+b,0),peakTextures,peakFbos,peakBytes,uploads,readbacks,wasmBytes:window.Module?.HEAPU8?.byteLength});
 });
 const base=process.env.GAME_URL||'http://127.0.0.1:3906';await page.goto(`${base}/planet/index.html?scenario=planet-official/${scenario}`);
 await page.waitForFunction(()=>window.__planetBrowser?.state().ready,null,{timeout:90000});
 await page.evaluate(()=>{Module._nc_planet_pause(1);__planetBrowser.setZoom(2);});
 const snap=()=>page.evaluate(()=>({resources:resourceSnapshot(),state:__planetBrowser.state()}));record.initial=await snap();
 // Original controls and simulation advance; presentation happens through the engine.
 record.steps=await page.evaluate(()=>{const t=performance.now();for(let i=0;i<12;i++){__planetBrowser.control(i%2?'KeyY':'KeyC',true);__planetBrowser.control(i%2?'KeyY':'KeyC',false);Module._nc_planet_step(30);}return {ticks:360,elapsedMs:performance.now()-t};});
 record.afterPlay=await snap();
 for(let i=0;i<3;i++)for(const zoom of [.5,1,2,4,8,2])await page.evaluate(z=>{__planetBrowser.setZoom(z);Module._nc_planet_step(1);},zoom);
 record.afterResize=await snap();
 assert.equal(record.afterResize.resources.textures,record.afterPlay.resources.textures,'Zoom must release replaced textures');
 assert.equal(record.afterResize.resources.framebuffers,record.afterPlay.resources.framebuffers);
 if(tag!=='baseline'){assert.equal(record.afterResize.resources.textures,2,'Only screen + palette textures');assert.equal(record.afterResize.resources.framebuffers,0);assert.equal(record.afterResize.resources.readbacks,0);}
 assert.deepEqual(record.errors,[]);await page.screenshot({path:out+'/'+scenario.replaceAll('/','_')+'.png'});await page.close();
}report.passed=true;}catch(e){report.failure=String(e.stack||e);process.exitCode=1;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}

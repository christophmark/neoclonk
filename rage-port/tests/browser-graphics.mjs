// Isolated browser bring-up check against the genuine C++/WASM renderer.
import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const output='rage-port/outputs';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1100,height:850}});
const messages=[],errors=[];
page.on('console',message=>{messages.push(`${message.type()}: ${message.text()}`);console.log(message.type(),message.text().slice(0,1800));});
page.on('pageerror',error=>errors.push(error.stack||String(error)));
page.on('response',response=>{if(response.status()>=400){const detail=`HTTP ${response.status()}: ${response.url()}`;messages.push(detail);console.warn(detail);}});
let report;
try{
 await page.addInitScript(()=>{
   window.__graphicsDiagnostics=[];
   for(const type of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(type){
    const proto=type.prototype,compile=proto.compileShader,link=proto.linkProgram;
    proto.compileShader=function(shader){compile.call(this,shader);if(!this.getShaderParameter(shader,this.COMPILE_STATUS)){const info={kind:'shader',error:this.getShaderInfoLog(shader),source:this.getShaderSource(shader)};window.__graphicsDiagnostics.push(info);console.error('RAGE_SHADER',JSON.stringify(info));}};
    proto.linkProgram=function(program){link.call(this,program);if(!this.getProgramParameter(program,this.LINK_STATUS)){const info={kind:'program',error:this.getProgramInfoLog(program),sources:this.getAttachedShaders(program).map(shader=>this.getShaderSource(shader))};window.__graphicsDiagnostics.push(info);console.error('RAGE_PROGRAM',JSON.stringify(info));}};
   }
 });
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:3002/');
 await page.getByRole('button',{name:/start|play|enter|begin/i}).first().click();
 try{await page.waitForFunction(()=>['playing','error','exited'].includes(window.__rageBrowser?.getState().phase),{},{timeout:Number(process.env.QA_TIMEOUT_MS||60000)});}
 catch(error){errors.push('Startup did not finish: '+error.message);}
 // Permit completed map drawing after the original "Game started" log line.
 if(await page.evaluate(()=>window.__rageBrowser?.getState().phase==='playing'))await page.waitForTimeout(1500);
 report=await page.evaluate(()=>({...window.__rageBrowser?.getState(),graphicsDiagnostics:window.__graphicsDiagnostics}));
 await page.screenshot({path:`${output}/graphics-page.png`});
 // Diagnostic underlay only: remove a loading/error cover to inspect the actual
 // original renderer. This does not change game state or mask report failures.
 await page.evaluate(()=>{document.getElementById('cover').hidden=true;document.getElementById('debug').hidden=true;});
 await page.screenshot({path:`${output}/graphics-canvas.png`});
 await writeFile(`${output}/graphics-report.json`,JSON.stringify({state:report,errors,messages},null,2));
 console.log(JSON.stringify({phase:report?.phase,errors,lastLogs:messages.slice(-20)},null,2));
 if(report?.phase!=='playing'||errors.length||report?.graphicsDiagnostics?.length)process.exitCode=1;
}finally{await browser.close();}

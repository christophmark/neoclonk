/** Regression: IndexedDB can finish before the original content download. */
import assert from 'node:assert/strict';
import {chromium, webkit, devices} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
const engine=process.env.BROWSER||'chromium';
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'
 ?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}
 :{executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={engine,checks:[],errors:[]};
try {
 for(const unavailable of [false,true]) {
  const context=await browser.newContext({...devices['iPhone 13'],defaultBrowserType:undefined});
  if(unavailable)await context.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{value:{open(){throw new DOMException('Storage disabled for regression test','SecurityError');}}});});
  const page=await context.newPage();let storageFinishedBeforeDownload=false;
  page.on('pageerror',e=>report.errors.push(String(e)));
  await page.route('**/clonk.data*',async route=>{
   // Deterministically hold the download until IDBFS finishes, reversing the
   // order that masked the bug on the developer's fast local connection.
   const frame=route.request().frame();
   await frame.waitForFunction(()=>['ready','error'].includes(window.__rageBrowser?.getState().persistence),null,{timeout:60000});
   storageFinishedBeforeDownload=true;
   await route.continue();
  });
  const start=async()=>{
   await page.locator('iframe').waitFor();
   const game=await (await page.locator('iframe').elementHandle()).contentFrame();
   await game.locator('#start').tap();
   await game.waitForFunction(()=>['playing','error','exited'].includes(window.__rageBrowser?.getState().phase),null,{timeout:120000});
   const status=await game.evaluate(()=>window.window.__rageBrowser.getState());
   assert.equal(status.phase,'playing',JSON.stringify(status));
   assert.equal(storageFinishedBeforeDownload,true);
   await game.waitForFunction(()=>JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).players.some(p=>p.cursor),null,{timeout:30000});
   return game;
  };
  await page.goto(process.env.NEOCLONK_URL||'http://127.0.0.1:3000/');
  let game=await start();
  const marker='storage-startup-regression';
  if(!unavailable){
   assert.equal(await game.evaluate(async marker=>{const earlier=window.__rageBrowser.syncSaves();window.Module.FS.writeFile('/data/home/startup-regression.txt',marker);const stored=await window.__rageBrowser.syncSaves();await earlier;return stored;},marker),true);
   await page.reload();game=await start();
   assert.equal(await game.evaluate(()=>window.Module.FS.readFile('/data/home/startup-regression.txt',{encoding:'utf8'})),marker);
   // Touch events must reach the original engine after mobile startup.
   await game.evaluate(()=>window.Module.ccall('nc_browser_pause','number',['number'],[1]));
   await game.evaluate(()=>window.__rageBrowser.pause());await page.waitForTimeout(250);
   assert.equal(await game.evaluate(()=>JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).paused),false);
  }else assert.equal(await game.evaluate(()=>window.__rageBrowser.getState().persistence),'error');
  report.checks.push(unavailable?'Storage denied: playable in memory':'Slow download: startup, reload persistence, mobile Pause');
  await page.screenshot({path:`outputs/startup-${engine}-${unavailable?'denied':'persistent'}.png`});
  await page.unrouteAll({behavior:'wait'});await context.close();
 }
 assert.deepEqual(report.errors,[]);
} catch(error){report.failure=String(error);throw error;}
finally{await mkdir('outputs',{recursive:true});await writeFile(`outputs/startup-${engine}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}

// Original mission access through config, native exit, and cached startup recovery.
import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const engine=process.env.BROWSER||'chromium';
assert.ok(['chromium','webkit'].includes(engine));
const out='rage-port/outputs/'+(engine==='webkit'?'exit-webkit':'exit');await mkdir(out,{recursive:true});
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}:{executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:640,height:480}}),report={engine,errors:[]};page.on('pageerror',e=>report.errors.push(String(e)));
try{
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:3902')+'/?scenario=missions.c4f/submine.c4s');await page.waitForFunction(()=>window.__scenarioGallery?.getSelected()?.id==='missions.c4f/submine.c4s');await page.locator('#start').click();await page.waitForFunction(()=>window.__rageBrowser.getState().ready||window.__rageBrowser.getState().phase==='error',null,{timeout:90000});assert.equal(await page.evaluate(()=>window.__rageBrowser.getState().ready),true);
 report.scenario=await page.evaluate(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])).scenario);report.config=await page.evaluate(()=>Module.FS.readFile('/data/home/browser.cfg',{encoding:'utf8'}).match(/^MissionAccess=(.*)$/m)?.[1]);assert.ok(report.config.includes('ComeDown'));assert.ok(!report.config.includes('PortalOpen')&&!report.config.includes('StormPortal'),'Unlock entries only, never earned internal mission flags');
 const marker={path:'/data/home/exit-flush-'+Date.now()+'.txt',contents:'Original engine final-exit persistence '+Date.now()};
 await page.evaluate(marker=>{Module.FS.writeFile(marker.path,marker.contents);return Module.ccall('nc_browser_quit','number',[],[]);},marker);
 await page.waitForFunction(()=>['ended','error'].includes(window.__rageBrowser.getState().phase),null,{timeout:30000});
 // Read the actual browser database, independently of the surviving in-memory FS.
 const persisted=async marker=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('/data/home');request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result;const transaction=db.transaction('FILE_DATA','readonly');const get=transaction.objectStore('FILE_DATA').get(marker.path);get.onerror=()=>{db.close();reject(get.error);};get.onsuccess=()=>{const value=get.result?.contents;db.close();resolve(value?new TextDecoder().decode(value):null);};};
 });
 await page.waitForFunction(async marker=>new Promise(resolve=>{
  const request=indexedDB.open('/data/home');request.onerror=()=>resolve(false);
  request.onsuccess=()=>{const db=request.result;const get=db.transaction('FILE_DATA','readonly').objectStore('FILE_DATA').get(marker.path);get.onerror=()=>{db.close();resolve(false);};get.onsuccess=()=>{const value=get.result?.contents;db.close();resolve(value&&new TextDecoder().decode(value)===marker.contents);};};
 }),marker,{timeout:15000});
 await page.waitForFunction(()=>window.__rageBrowser.getState().exitSync==='saved',null,{timeout:15000});
 report.after=await page.evaluate(()=>window.__rageBrowser.getState());assert.equal(report.after.phase,'ended');assert.equal(report.after.exitSync,'saved');assert.equal(await page.locator('#new-game').isVisible(),true);
 await page.reload();await page.waitForFunction(()=>Boolean(window.__rageBrowser));
 report.persistedAfterReload=await page.evaluate(persisted,marker);assert.equal(report.persistedAfterReload,marker.contents,'Final exit flush survives page reload');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error);console.error(error);process.exitCode=1;try{report.after=await page.evaluate(()=>window.__rageBrowser.getState());}catch{}}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}console.log({passed:report.passed,failure:report.failure});

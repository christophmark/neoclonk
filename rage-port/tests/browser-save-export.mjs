// Save-button API check against original Game.QuickSave, not a host save format.
import assert from 'node:assert/strict';
import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();const errors=[],saves=[];let passed=false;page.on('pageerror',e=>errors.push(String(e)));
const call=(name,result,args=[])=>page.evaluate(({name,result,args})=>Module.ccall(name,result,args.map(()=>'number'),args),{name,result,args});
const state=async()=>JSON.parse(await call('nc_browser_state','string'));
const digest=path=>page.evaluate(async path=>{const bytes=FS.readFile(path),hash=await crypto.subtle.digest('SHA-256',bytes);return {size:bytes.length,sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};},path);
async function save(){
 const queued=await page.evaluate(()=>{const request=Module.ccall('nc_browser_save','number',[],[]);return {request,duplicate:Module.ccall('nc_browser_save','number',[],[])};});
 assert.ok(queued.request>0);assert.equal(queued.duplicate,-2,'A pending save cannot create a second concurrent slot');
 await page.waitForFunction(()=>['saved','error'].includes(JSON.parse(Module.ccall('nc_browser_save_status','string',[],[])).status),{},{timeout:30000});
 const result=JSON.parse(await call('nc_browser_save_status','string'));assert.equal(result.status,'saved',result.error);assert.equal(result.requestId,queued.request);assert.match(result.path,/^\/data\/home\/Savegames\.c4f\/Neoclonk-\d{8}-\d{6}-\d+\.c4s$/);assert.ok(result.bytes>1000);saves.push(result);return result;
}
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:3002/');await page.locator('#start').click();
 await page.waitForFunction(()=>['error','exited'].includes(window.__rageBrowser?.getState().phase)||(window.__rageBrowser?.getState().phase==='playing'&&window.Module?._nc_browser_save&&JSON.parse(Module.ccall('nc_browser_state','string',[],[])).players.length),{},{timeout:90000});
 assert.equal((await state()).running,true);assert.equal(await call('nc_browser_pause','number',[1]),1);
 const before=await state(),first=await save(),hashBefore=await digest(first.path);
 assert.equal((await state()).frame,before.frame,'Saving paused game does not tick simulation');assert.equal((await state()).paused,true);
 const second=await save();assert.notEqual(second.path,first.path,'Each save uses a new slot');assert.deepEqual(await digest(first.path),hashBefore,'Later saves preserve prior save bytes');assert.equal((await state()).frame,before.frame);
 await call('nc_browser_pause','number',[0]);const third=await save();assert.equal(third.paused,false);assert.equal((await state()).paused,false,'Saving a running game restores running state');
 await page.evaluate(()=>new Promise((resolve,reject)=>FS.syncfs(false,e=>e?reject(e):resolve())));
 assert.equal(errors.length,0);passed=true;console.log(JSON.stringify({passed:true,saves,firstSave:hashBefore},null,2));
}catch(error){try{console.error('RAW_SAVE_STATUS',await call('nc_browser_save_status','string'));}catch{}throw error;}finally{await mkdir('rage-port/outputs',{recursive:true});await writeFile('rage-port/outputs/save-export-report.json',JSON.stringify({passed,saves,errors},null,2));await browser.close();}

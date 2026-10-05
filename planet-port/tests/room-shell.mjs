import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRoom,roomState,nativeState} from '../../rage-port/tests/room-driver.mjs';
const out='planet-port/build/room-shell';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const report={errors:[]};let room;
try{
 const base=process.env.GAME_URL||'http://127.0.0.1:3906/rage/index.html';
 const context=await browser.newContext(),host=await context.newPage();host.on('pageerror',e=>report.errors.push(String(e)));await host.goto(base);await host.waitForFunction(()=>window.__scenarioGallery?.getCatalog());
 room=await createRoom({browser,host,base,scenarioId:process.env.PLANET_SCENARIO||'planet-official/easy.c4f/goldmine.c4s',onPageError:e=>report.errors.push(String(e))});
 for(const page of room.pages){const frame=page.frames().find(f=>f.url().includes('/planet/'));assert.ok(frame);await frame.evaluate(()=>{__planetBrowser.control('KeyC',true);__planetBrowser.control('KeyC',false);});}
 await host.waitForFunction(()=>__neoclonkMultiplayer.getState()?.error||__neoclonkMultiplayer.getState()?.lastVerifiedFrame>=120,null,{timeout:60000});assert.equal((await roomState(host)).error,null);
 await host.evaluate(()=>__neoclonkMultiplayer.setPaused(true));await host.waitForTimeout(300);
 report.sync=await Promise.all(room.pages.map(p=>p.evaluate(()=>{const ptr=Module.ccall('nc_browser_net_sync','number',[],[]),size=Module.ccall('nc_browser_net_size','number',[],[]);return Array.from(Module.HEAPU8.slice(ptr,ptr+size));})));assert.deepEqual(report.sync[0],report.sync[1]);
 report.states=await Promise.all(room.pages.map(nativeState));assert.deepEqual(report.states.map(s=>s.players.filter(p=>p.local).map(p=>p.number)),[[0],[1]]);
 const frozen=(await roomState(host)).frame;await host.waitForTimeout(150);assert.equal((await roomState(host)).frame,frozen);await host.evaluate(()=>__neoclonkMultiplayer.setPaused(false));await host.waitForFunction(f=>__neoclonkMultiplayer.getState().frame>f+5,frozen);
 report.room=await roomState(host);assert.equal(report.errors.length,0);report.passed=true;await host.screenshot({path:out+'/host.png'});
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{if(room){report.final=await Promise.all(room.pages.map(roomState));report.native=await Promise.all(room.pages.map(nativeState));}await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}console.log(JSON.stringify(report));

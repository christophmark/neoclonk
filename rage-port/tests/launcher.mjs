import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const kind=process.env.BROWSER||'chromium',base=process.env.GAME_URL||'http://127.0.0.1:3906/rage/index.html',out='rage-port/outputs/launcher-'+kind;
await mkdir(out,{recursive:true});
const browser=kind==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),report={browser:kind,errors:[]};page.on('pageerror',e=>report.errors.push(String(e)));
await page.route('**/api/lobby',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rooms:[]})}));
try{
 await page.goto(base);await page.waitForFunction(()=>window.__scenarioGallery?.getCatalog());
 assert.equal(await page.locator('#game-picker').isVisible(),true);assert.equal(await page.locator('.scenario-tile:visible').count(),0);
 await page.locator('.neoclonk-logo').evaluate(img=>img.decode());await page.screenshot({path:out+'/mobile-home.png'});
 await page.locator('[data-game=planet]').click();assert.equal(await page.locator('.scenario-tile:visible').count(),53);assert.equal(await page.locator('#scenario-panel').isVisible(),false);
 await page.screenshot({path:out+'/mobile-planet.png'});await page.goBack();assert.equal(await page.locator('#game-picker').isVisible(),true);
 await page.locator('[data-game=rage]').click();assert.equal(await page.locator('.scenario-tile:visible').count(),80);
 await page.locator('[data-scenario-id="worlds.c4f/goldmine.c4s"]').click();assert.equal(await page.locator('#scenario-panel').isVisible(),true);
 await page.locator('#host-room').click();assert.equal(await page.locator('#host-scenario').inputValue(),'worlds.c4f/goldmine.c4s');
 await page.locator('#room-back').click();assert.equal(await page.locator('#room-mode').isVisible(),true);assert.equal(await page.locator('#room-crew').isVisible(),false);
 await page.locator('#room-name').fill('Mobile explorer');await page.locator('#room-host-choice').click();
 await page.locator('#host-game').selectOption('planet');assert.ok((await page.locator('#host-scenario').inputValue()).startsWith('planet-official/'));assert.equal(await page.locator('#room-manual').getAttribute('open'),null);
 const scenario=await page.locator('#host-scenario').inputValue();assert.equal(await page.evaluate(()=>__neoclonkRoomTransport.getRoom().scenario.id),scenario);
 await page.screenshot({path:out+'/mobile-host.png'});await page.locator('#room-back').click();await page.locator('#room-join-choice').click();assert.equal(await page.locator('#room-code-input').isVisible(),true);assert.equal(await page.locator('#room-crew').isVisible(),false);assert.equal(await page.locator('#room-name').inputValue(),'Mobile explorer');
 await page.screenshot({path:out+'/mobile-join.png'});await page.locator('#room-close').click();
 await page.goto(base);await page.waitForFunction(()=>__scenarioGallery?.getCatalog());await page.locator('#join-room').click();assert.equal(await page.locator('#room-mode').isVisible(),true);assert.equal(await page.locator('#discovery-guest').isVisible(),false);await page.screenshot({path:out+'/mobile-multiplayer.png'});await page.locator('#room-close').click();
 await page.setViewportSize({width:1280,height:800});await page.screenshot({path:out+'/desktop-home.png'});await page.locator('[data-game=rage]').click();await page.screenshot({path:out+'/desktop-rage.png'});
 await page.goto(base+'?game=planet');await page.waitForFunction(()=>__scenarioGallery?.getCatalog());assert.equal(await page.locator('.scenario-tile:visible').count(),53);
 await page.goto(base+'?scenario=worlds.c4f/goldmine.c4s');await page.waitForFunction(()=>__scenarioGallery?.getSelected());assert.equal(await page.locator('#scenario-panel').isVisible(),true);assert.equal(await page.locator('.scenario-tile:visible').count(),80);
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;await page.screenshot({path:out+'/failure.png'});}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}

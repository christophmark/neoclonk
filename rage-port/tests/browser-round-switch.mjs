// Real-engine navigation, save-before-leaving, and touch/action-bar clearance.
import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const engine=process.env.BROWSER||'chromium',touchOnly=process.env.TOUCH_ONLY==='1',out=`rage-port/outputs/round-switch-${engine}${touchOnly?'-touch':''}`;await mkdir(out,{recursive:true});
const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}:{executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),report={engine,checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(String(e)));
const base=process.env.GAME_URL||'http://127.0.0.1:3902/rage/index.html';
const ready=()=>page.waitForFunction(()=>window.__rageBrowser?.getState().ready,null,{timeout:120000});
const state=()=>page.evaluate(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])));
const check=name=>{report.checks.push(name);console.log('PASS',name);};
try{
 await page.goto(base+'?play=1&touch=1&scenario=worlds.c4f/goldmine.c4s');await ready();
 for(const [width,height]of [[390,844],[320,700],[896,414]]){
  await page.setViewportSize({width,height});
  await page.waitForFunction(({width,height})=>{const v=JSON.parse(Module.ccall('nc_browser_state','string',[],[])).viewport,p=document.getElementById('touchpad').getBoundingClientRect();return Module.canvas.width===width&&Module.canvas.height===height&&v.occlusion.y===Math.round(p.y)&&v.occlusion.height===Math.ceil(p.height);},{width,height});
  const pad=await page.locator('#touchpad').boundingBox(),v=(await state()).viewport;
  assert.ok(pad.y+pad.height<=v.y+v.height-23-5-23-5,'Touch pad must clear the bottom action strip and the adjacent side-action row');
  const controls=await Promise.all(['game-save','game-exit','main-menu','zoom-control'].map(id=>page.locator('#'+id).boundingBox()));
  for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'Header targets overlap');}
  await page.screenshot({path:`${out}/${width}-touch.png`});
 }
 check('Raised touch controls clear action strip and header targets do not overlap');
 if(!touchOnly){
 await page.setViewportSize({width:390,height:844});await page.locator('#main-menu').click();
 await page.locator('.scenario-tile[data-scenario-id="tutorial.c4f/tutorial01.c4s"]').click();
 assert.equal(await page.locator('#start').textContent(),'Play selected scenario');assert.equal(await page.locator('#new-game').textContent(),'Resume current game');
 await page.locator('#start').click();assert.equal(await page.locator('#leave-dialog').isVisible(),true);assert.match((await state()).scenario,/goldmine/i);assert.equal((await state()).paused,true);
 await page.locator('#leave-cancel').click();await page.locator('#new-game').click();assert.equal(await page.locator('#cover').isVisible(),false);assert.match((await state()).scenario,/goldmine/i);
 await page.locator('#game-exit').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#cover').isVisible(),false);check('Cancel preserves current round; explicit Resume and Exit work');
 await page.locator('#main-menu').click();await page.locator('#start').click();
 await page.evaluate(()=>{window.__originalCcall=Module.ccall;Module.ccall=function(name,...args){if(name==='nc_browser_save')return -1;return window.__originalCcall.call(this,name,...args);};});
 await page.locator('#leave-save').click();await page.waitForFunction(()=>document.getElementById('leave-error').textContent.length>0);assert.equal(await page.locator('#leave-dialog').isVisible(),true);assert.match((await state()).scenario,/goldmine/i);
 await page.evaluate(()=>{Module.ccall=window.__originalCcall;delete window.__originalCcall;});check('Failed save keeps original round open');
 await page.locator('#leave-save').click();await page.waitForURL(url=>url.searchParams.get('scenario')==='tutorial.c4f/tutorial01.c4s');await ready();assert.match((await state()).scenario,/tutorial01/i);
 const saves=await page.evaluate(()=>window.__rageBrowser.listSavedGames());assert.equal(saves.length,1);
 const metadata=await page.evaluate(()=>JSON.parse(Module.FS.readFile('/data/home/neoclonk-saves.json',{encoding:'utf8'})));assert.equal(metadata[saves[0]].scenarioId,'worlds.c4f/goldmine.c4s');check('Save and start persists old scenario and starts selected scenario');
 await page.locator('#game-exit').click();await page.locator('#leave-discard').click();await page.waitForURL(url=>!url.searchParams.has('play')&&!url.searchParams.has('scenario'));await page.waitForFunction(()=>window.__scenarioGallery?.getCatalog());assert.equal(await page.evaluate(()=>window.__rageBrowser.getState().booted),false);assert.equal(await page.locator('#scenario-panel').isVisible(),false);check('Exit without saving returns to clean main menu');
 await page.locator('#saves-open').click();await page.locator('#saved-games').selectOption(saves[0]);await page.locator('#load-save').click();await ready();assert.ok((await state()).scenario.endsWith(saves[0]));check('Saved original round remains loadable');
 await page.locator('#game-exit').click();await page.locator('#leave-save').click();await page.waitForFunction(()=>window.__rageBrowser&&!window.__rageBrowser.getState().booted&&window.__rageBrowser.listSavedGames().length===2,null,{timeout:60000});check('Save and exit persists round before returning to menu');
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error);report.stack=error.stack;process.exitCode=1;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}

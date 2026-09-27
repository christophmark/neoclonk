// Verify the staged production gallery uses real original-engine captures.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../../web/node_modules/playwright/index.mjs';
const base=process.env.GAME_URL||'http://127.0.0.1:3902';
const out='rage-port/outputs/scenario-library/gallery';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
const results=[];
try{
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(base);await page.waitForFunction(()=>window.__scenarioGallery?.getCatalog()?.scenarios.length===80);
  // Decode every actual preview even when lazy loading leaves off-screen rows idle.
  const previews=await page.evaluate(async()=>{
   const images=[...document.querySelectorAll('.scenario-tile img')];
   for(const image of images){image.loading='eager';try{await image.decode();}catch{}}
   return images.map(image=>({scenario:image.closest('.scenario-tile').dataset.scenarioId,kind:image.dataset.preview,loaded:image.complete&&image.naturalWidth>0,source:image.getAttribute('src'),width:image.naturalWidth,height:image.naturalHeight}));
  });
  assert.equal(previews.length,80);assert(previews.every(p=>p.kind==='gameplay'&&p.loaded&&p.source.startsWith('catalog/screenshots/')));
  assert.equal(await page.locator('.scenario-category').count(),9);
  const layout=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,coverWidth:document.querySelector('#cover')?.scrollWidth,selected:window.__scenarioGallery.getSelected()?.id,visibleTiles:[...document.querySelectorAll('.scenario-track')].map(track=>({track:track.id,width:track.clientWidth,tileWidth:track.querySelector('.scenario-tile').getBoundingClientRect().width}))}));
  assert(layout.documentWidth<=width+1,'Horizontal page overflow');
  // Keyboard focus and selection operate without launching the engine.
  const first=page.locator('.scenario-track').first().locator('.scenario-tile').first();await first.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.__scenarioGallery.getSelected().id),'tutorial.c4f/tutorial02.c4s');
  await page.evaluate(()=>{window.__scenarioGallery.select('worlds.c4f/goldmine.c4s');document.activeElement?.blur();document.getElementById('cover').scrollTop=0;});await page.screenshot({path:`${out}/${name}-startup.png`});await page.locator('#category-base-worlds').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${name}.png`});
  await page.evaluate(()=>window.__scenarioGallery.select('western.c4f/goldrush.c4s'));await page.locator('#category-western').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${name}-western.png`});
  assert.equal(await page.evaluate(()=>window.__rageBrowser.getState().ready),false,'Gallery test must not launch game');assert.deepEqual(errors,[]);
  results.push({name,viewport:{width,height},layout,previews,errors,passed:true});await context.close();
 }
 await writeFile(`${out}/report.json`,JSON.stringify({base,results,passed:true},null,2)+'\n');console.log(JSON.stringify({passed:true,viewports:results.map(r=>r.name),realPreviews:80}));
}finally{await browser.close();}

// Shared UI transitions, including a held action disappearing during crew changes.
import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const kind=process.env.BROWSER||'chromium';
const browser=kind==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 await page.setContent(`<style>[hidden]{display:none!important}#pad{position:absolute;bottom:20px;right:10px;display:grid;grid-template-columns:repeat(3,50px);gap:4px}#special-controls{grid-column:1/-1;display:flex}button{min-height:44px}b{display:block}</style><div id="pad">${['Q','W','E','A','S','D','Z','X','C'].map(k=>`<button data-code="Key${k}">${k}</button>`).join('')}</div>`);
 await page.addScriptTag({path:'rage-port/shell/adaptive-touch.js'});
 await page.evaluate(()=>{
  window.released=[];window.pressed=[];window.layouts=0;
  window.info={player:0,cursor:1,crewCount:1,menu:false,extras:[]};
  window.touch=NeoclonkTouch.create({pad:document.querySelector('#pad'),enabled:()=>true,read:()=>info,bind:b=>b.onpointerdown=()=>pressed.push(b.dataset.code),release:code=>released.push(code),changed:()=>layouts++});touch.refresh();
 });
 const visible=()=>page.locator('#pad button:visible').count();
 assert.equal(await visible(),6);
 const bottom=await page.locator('[data-code=KeyC]').boundingBox();
 await page.evaluate(()=>{info.extras=[{control:10,variants:[{gesture:'press',label:'Inventory'}]},{control:11,variants:[{gesture:'double',label:'Inspect'}]}];touch.refresh();});
 assert.equal(await visible(),8);assert.equal(await page.locator('[data-code=KeyF] span').textContent(),'Double tap: Inspect');
 assert.deepEqual(await page.locator('[data-code=KeyC]').boundingBox(),bottom,'Bottom movement controls stay in place when extras appear');
 await page.locator('[data-code=KeyV]').tap();assert.deepEqual(await page.evaluate(()=>pressed),['KeyV']);
 await page.evaluate(()=>{info.cursor=2;info.extras=[];info.crewCount=2;touch.refresh();});
 assert.equal(await visible(),9);assert.ok((await page.evaluate(()=>released)).includes('KeyV'),'Release special action when changing to a character without it');
 await page.evaluate(()=>{info.crewCount=1;info.menu=true;touch.refresh();});assert.equal(await visible(),9);
 await page.evaluate(()=>{info.menu=false;touch.refresh();});assert.equal(await visible(),6);
 await page.evaluate(()=>{info.cursor=0;touch.refresh();});assert.equal(await visible(),9,'Crew selection remains available when no cursor is selected');
 await page.evaluate(()=>{info.cursor=1;touch.refresh();});
 const layouts=await page.evaluate(()=>layouts);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>layouts),layouts,'Unchanged polls do not resize or rewrite the pad');
 await page.evaluate(()=>{info.extras=[{control:10,variants:[{gesture:'press',label:'<img src=x onerror=alert(1)>'}]}];touch.refresh();});
 assert.equal(await page.locator('#pad img').count(),0,'Script descriptions are rendered as text');
 console.log(`PASS ${kind}: crew changes, menu fallback, optional actions, hold release, stable bottom row, quiet polling, text labels`);
}finally{await browser.close();}

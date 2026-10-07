import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const kind=process.env.BROWSER||'chromium';
const browser=kind==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.route('http://touch.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="pad"><button data-code="KeyZ">Z</button><button data-code="KeyC">C</button><button data-code="KeyX">X</button></div>'}));await page.goto('http://touch.test/');
 await page.addScriptTag({path:'rage-port/shell/adaptive-touch.js'});await page.addScriptTag({path:'rage-port/shell/touch-movement.js'});
 await page.evaluate(()=>{
  window.events=[];window.info={player:0,cursor:1,menu:false};
  window.movement=NeoclonkTouch.movement({pad:document.querySelector('#pad'),input:(code,down)=>events.push([code,down]),read:()=>info,enabled:()=>true});
  for(const b of document.querySelectorAll('button')){b.setPointerCapture=()=>{};movement.bind(b);}
  window.send=(code,type,id=1)=>document.querySelector(`[data-code=${code}]`).dispatchEvent(new PointerEvent(type,{pointerId:id,bubbles:true,cancelable:true}));
 });
 const events=()=>page.evaluate(()=>events);const reset=()=>page.evaluate(()=>events=[]);
 await page.evaluate(()=>{send('KeyC','pointerdown');send('KeyC','pointerup');});assert(!(await events()).some(([c])=>c==='KeyX'),'Tap release must not stop');
 await page.getByRole('switch',{name:'Hold to move'}).check();await reset();
 await page.evaluate(()=>{send('KeyC','pointerdown');send('KeyC','pointerup');send('KeyC','lostpointercapture');});assert.equal((await events()).filter(([c,d])=>c==='KeyX'&&d).length,1,'Exactly one stop on release');
 await reset();await page.evaluate(()=>{send('KeyZ','pointerdown',1);send('KeyC','pointerdown',2);send('KeyC','pointerup',2);});assert.deepEqual((await events()).at(-1),['KeyZ',true]);assert(!(await events()).some(([c])=>c==='KeyX'));await page.evaluate(()=>send('KeyZ','pointercancel',1));assert.deepEqual((await events()).slice(-2),[['KeyX',true],['KeyX',false]]);
 await reset();await page.evaluate(()=>{send('KeyC','pointerdown',1);send('KeyC','pointerdown',2);send('KeyC','pointerup',2);send('KeyC','pointerup',1);});assert.equal((await events()).filter(([c,d])=>c==='KeyC'&&d).length,1,'Two fingers on the same direction must not create double-tap commands');
 await reset();await page.evaluate(()=>{info.menu=true;send('KeyZ','pointerdown');send('KeyZ','pointerup');info.menu=false;});assert(!(await events()).some(([c])=>c==='KeyX'),'Native menu navigation must not synthesize Stop');
 await reset();await page.evaluate(()=>{send('KeyC','pointerdown');info.cursor=2;send('KeyC','pointerup');});assert(!(await events()).some(([c])=>c==='KeyX'),'Release must not stop a different selected crew member');
 await reset();await page.evaluate(()=>{send('KeyC','pointerdown');movement.releaseAll();send('KeyC','pointerup');});assert.equal((await events()).filter(([c,d])=>c==='KeyX'&&d).length,1,'Focus loss releases once');
 await reset();await page.evaluate(()=>{send('KeyC','pointerdown');send('KeyX','pointerdown',2);send('KeyX','pointerup',2);send('KeyC','pointerup');});assert.equal((await events()).filter(([c,d])=>c==='KeyX'&&d).length,1,'Manual Stop must not become a double Stop');
 await reset();await page.evaluate(()=>{info.digging=true;send('KeyZ','pointerdown',1);send('KeyC','pointerdown',2);send('KeyC','pointerup',2);send('KeyZ','pointerup',1);});assert.deepEqual(await events(),[['KeyZ',true],['KeyC',true],['KeyC',false],['KeyZ',false]],'Digging must steer once per press without Stop or direction restoration');
 await reset();await page.evaluate(()=>{send('KeyZ','pointerdown');info.digging=false;send('KeyZ','pointerup');});assert(!(await events()).some(([c])=>c==='KeyX'),'A steering gesture stays exempt when the action changes before release');
 await reset();await page.evaluate(()=>{send('KeyC','pointerdown');info.digging=true;send('KeyC','pointerup');});assert(!(await events()).some(([c])=>c==='KeyX'),'Digging started during a hold must survive release');
 await reset();await page.getByRole('switch',{name:'Hold to move'}).uncheck();await page.getByRole('switch',{name:'Hold to move'}).check();assert(!(await events()).some(([c])=>c==='KeyX'),'Changing mode must not stop active digging');
 assert.equal(await page.evaluate(()=>localStorage.getItem('neoclonk.touch.hold-movement')),'1');
 console.log(`PASS ${kind}: tap, hold, cancellation, opposing fingers, native menus, crew changes, focus loss and stored preference`);
}finally{await browser.close();}

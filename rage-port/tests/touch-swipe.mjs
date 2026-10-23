import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const kind=process.env.BROWSER||'chromium';
const browser=await(kind==='webkit'?webkit:chromium).launch(kind==='webkit'?{headless:true}:{headless:true,executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:800,height:700}});
 await page.route('http://touch.test/**',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0}canvas{width:800px;height:600px}#pad{width:200px}</style><canvas></canvas><div id="pad"></div>'}));await page.goto('http://touch.test');
 await page.evaluate(()=>localStorage.setItem('neoclonk.touch.hold-movement','1'));
 for(const name of ['adaptive-touch','touch-swipe','touch-movement'])await page.addScriptTag({path:`rage-port/shell/${name}.js`});
 await page.evaluate(()=>{
  let now=1000,id=0;const timers=new Map();Object.defineProperty(performance,'now',{value:()=>now});
  window.setTimeout=(fn,delay)=>{timers.set(++id,{fn,time:now+delay});return id;};window.clearTimeout=id=>timers.delete(id);
  window.advance=ms=>{const end=now+ms;for(;;){const due=[...timers].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!due)break;timers.delete(due[0]);now=due[1].time;due[1].fn();}now=end;};
  window.info={player:0,cursor:1,menu:false,paused:false,aimValid:true,aimX:.5,aimY:.5,commandDirection:0,procedure:0,digging:false};window.events=[];
  const canvas=document.querySelector('canvas');canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
  window.movement=NeoclonkTouch.movement({pad:document.querySelector('#pad'),canvas,read:()=>{info.frame=Math.floor(now/28);return info;},enabled:()=>true,input:(code,down)=>events.push([code,down])});
  window.send=(type,x=600,y=300,id=1,pointerType='touch')=>{const event=new PointerEvent(type,{pointerId:id,pointerType,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(event,'timeStamp',{value:now});return canvas.dispatchEvent(event);};
  window.reset=()=>{movement.releaseAll();events=[];Object.assign(info,{cursor:1,menu:false,paused:false,aimValid:true,aimX:.5,aimY:.5,digging:false,commandDirection:0,procedure:0});};
 });
 assert(await page.getByRole('radio',{name:'Hold',exact:true}).isChecked(),'Migrate the saved Hold preference');
 await page.getByRole('radio',{name:'Swipe',exact:true}).check();await page.evaluate(()=>reset());
 const codes=()=>page.evaluate(()=>events.filter(([,down])=>down).map(([code])=>code));
 await page.evaluate(()=>{send('pointerdown');advance(160);send('pointermove',100);advance(40);send('pointerup',100);});assert.deepEqual(await codes(),['KeyC','KeyZ','KeyX']);
 await page.evaluate(()=>{reset();send('pointerdown');advance(50);send('pointerup');advance(200);});assert.deepEqual(await codes(),[],'A short tap does not start running');
 for(const [y,key] of [[210,'KeyS'],[390,'KeyA']]){
  await page.evaluate(y=>{reset();send('pointerdown');advance(70);send('pointermove',600,y);send('pointerup',600,y);advance(1000);},y);assert.deepEqual(await codes(),[key],'Exactly one flick action; release does not cancel the native action');
 }
 await page.evaluate(()=>{reset();send('pointerdown',600,500);advance(40);send('pointerup',600,500);advance(80);send('pointerdown',600,500);advance(160);});assert.deepEqual(await codes(),['KeyC','KeyD'],'Second tap and hold sends one original Dig');
 await page.evaluate(()=>{info.digging=true;info.commandDirection=6;advance(40);});assert.equal((await codes()).at(-1),'KeyC');
 await page.evaluate(()=>{info.commandDirection=5;advance(320);});assert.deepEqual((await codes()).slice(-2),['KeyC','KeyC'],'Steer through the original intermediate dig angles');
 await page.evaluate(()=>{info.commandDirection=4;send('pointerup',600,500);advance(1000);});assert.equal((await codes()).at(-1),'KeyX');assert.equal((await codes()).filter(c=>c==='KeyD').length,1);
 await page.evaluate(()=>{reset();send('pointerdown');advance(40);send('pointerup');advance(50);send('pointerdown');advance(140);send('pointercancel');advance(1500);});assert.deepEqual(await codes(),['KeyC','KeyD','KeyX'],'Cancellation stops even before native delayed digging starts');
 await page.evaluate(()=>{reset();info.menu=true;send('pointerdown');advance(200);send('pointerup');});assert.deepEqual(await codes(),[]);
 await page.evaluate(()=>{reset();send('pointerdown',600,300,1,'mouse');advance(200);send('pointerup',600,300,1,'mouse');});assert.deepEqual(await codes(),[],'Mouse is never a swipe gesture');
 await page.evaluate(()=>{reset();send('pointerdown');advance(160);send('pointerdown',100,300,2);send('pointerup',100,300,2);advance(40);send('pointerup');});assert.deepEqual(await codes(),['KeyC','KeyX'],'Second finger cannot steal movement');
 await page.evaluate(()=>{reset();send('pointerdown');advance(160);info.cursor=2;advance(40);send('pointerup');});assert.deepEqual(await codes(),['KeyC'],'A different selected crew is never stopped');
 await page.evaluate(()=>{reset();send('pointerdown');advance(160);window.dispatchEvent(new Event('blur'));send('pointerup');});assert.deepEqual(await codes(),['KeyC','KeyX']);
 await page.evaluate(()=>{reset();send('pointerdown');advance(160);});await page.getByRole('radio',{name:'Tap',exact:true}).check();await page.evaluate(()=>{advance(500);send('pointerup');});assert.deepEqual(await codes(),['KeyC','KeyX']);
 await page.getByRole('radio',{name:'Swipe',exact:true}).check();await page.evaluate(()=>{reset();send('pointerdown');advance(1000);send('pointermove',600,210);send('pointerup',600,210);});assert.deepEqual(await codes(),['KeyC','KeyX','KeyS'],'A fast flick also works after a stationary long hold');
 await page.evaluate(()=>{reset();info.digging=true;info.commandDirection=4;send('pointerdown',600,500);advance(200);info.digging=false;advance(2000);send('pointerup',600,500);});assert(!(await codes()).includes('KeyD'),'A seam never triggers repeated digging');
 await page.evaluate(()=>{reset();send('pointerdown');advance(160);});await page.getByRole('radio',{name:'Hold',exact:true}).check();assert.deepEqual(await codes(),['KeyC','KeyX'],'Switching into Hold must not send a double Stop');
 await page.getByRole('radio',{name:'Swipe',exact:true}).check();
 await page.evaluate(()=>{reset();send('pointerdown');advance(160);info.aimX=.75;advance(80);info.aimX=.73;advance(500);send('pointerup');});assert.deepEqual(await codes(),['KeyC','KeyX'],'Walking stops at the finger and stays stopped without a duplicate Stop on release');
 await page.evaluate(()=>{reset();send('pointerdown');advance(160);info.aimX=.75;advance(80);send('pointermove',680,300);advance(80);send('pointerup',680,300);});assert.deepEqual(await codes(),['KeyC','KeyX','KeyC','KeyX'],'Moving the finger farther away resumes walking');
 await page.evaluate(()=>{reset();info.digging=true;info.commandDirection=4;send('pointerdown',600,500);advance(160);info.aimX=.75;info.aimY=500/600;advance(80);info.digging=false;advance(1000);send('pointermove',680,500);advance(160);send('pointerup',680,500);});assert.deepEqual(await codes(),['KeyX','KeyC','KeyD','KeyX'],'Digging stops at the finger and restarts only after moving the finger away');
 await page.evaluate(()=>{reset();info.procedure=1;send('pointerdown',600,500);advance(40);send('pointerup',600,500);advance(80);send('pointerdown',600,500);advance(160);});assert.deepEqual(await codes(),[],'A digging request made in midair waits for landing');
 await page.evaluate(()=>{info.procedure=0;advance(80);});assert.deepEqual(await codes(),['KeyC','KeyD']);
 await page.evaluate(()=>{advance(1800);send('pointerup',600,500);});assert.deepEqual(await codes(),['KeyC','KeyD','KeyX'],'A failed dig request stops its facing movement exactly once');
 await page.getByRole('radio',{name:'Swipe',exact:true}).check();assert.equal(await page.evaluate(()=>localStorage.getItem('neoclonk.touch.movement-mode')),'swipe');
 console.log(`PASS ${kind}: three modes, preference migration, hold steering, both flicks, double-tap dig angles, release/cancel, native menus, mouse exclusion, multiple fingers and crew changes`);
}finally{await browser.close();}

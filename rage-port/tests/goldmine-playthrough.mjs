// Plays genuine Gold Mine through original player inputs; no state mutation.
import assert from 'node:assert/strict';
import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const output='rage-port/outputs';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1200,height:850}});const logs=[],trace=[];
page.on('console',m=>logs.push(`${m.type()}: ${m.text()}`));page.on('pageerror',e=>logs.push(`PAGEERROR ${e.stack}`));
const call=(name,result,args=[])=>page.evaluate(({name,result,args})=>Module.ccall(name,result,args.map(()=>'number'),args),{name,result,args});
const state=async()=>JSON.parse(await call('nc_browser_state','string'));
const objects=async()=>JSON.parse(await call('nc_browser_objects','string',[0,0,0]));
let player=0;
const step=async(n=1)=>{const actual=await call('nc_browser_step','number',[n]);assert.ok(actual>=0,`step(${n}) returned ${actual}`);return state();};
const tap=async(index,n=1)=>{await call('nc_browser_control','number',[player,index,1,0]);await call('nc_browser_control','number',[player,index,0,0]);return step(n);};
const crew=s=>s.players.find(p=>p.number===player)?.cursor;
const record=async(label)=>{const s=await state();trace.push({label,state:s});console.log(label,JSON.stringify({frame:s.frame,player:s.players[0]}));return s;};
async function closeMenu(){if(crew(await state())?.menu)await tap(5);}
async function moveToX(x){
 for(let i=0;i<100;i++){
  const before=crew(await state());assert.ok(before,'No controlled clonk');if(Math.abs(before.x-x)<3){await tap(7);return;}
  const direction=before.x<x?8:6;await tap(direction,Math.max(1,Math.min(24,Math.floor(Math.abs(before.x-x)/1.96))));
  const after=crew(await state());if(after.x===before.x){await tap(4,12);}
 }
 throw new Error(`Could not walk to x=${x}`);
}
async function selectMenu(id){
 for(let i=0;i<60;i++){
  const menu=crew(await state())?.menu;assert.ok(menu,`Menu absent selecting ${id}`);
  const index=menu.items.indexOf(id);assert.ok(index>=0,`${id} missing from ${menu.items}`);
  if(menu.selected===index)return;
  await tap(menu.selected<index?8:6);
 }
 throw new Error(`Could not select ${id}`);
}
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:3002/');await page.getByRole('button',{name:/start|play|enter|begin/i}).first().click();
 await page.waitForFunction(()=>window.Module?._nc_browser_state && window.__rageBrowser?.getState().phase==='playing',{},{timeout:90000});
 for(let i=0;i<30;i++){const s=await state();if(s.running&&s.players.some(p=>p.local&&p.cursor))break;await page.waitForTimeout(500);}
 const initial=await state();assert.ok(initial.running&&initial.players.some(p=>p.local&&p.cursor),`No playable player: ${JSON.stringify(initial)}`);
 player=initial.players.find(p=>p.local).number;assert.equal(await call('nc_browser_pause','number',[1]),1);
 await record('initial');const initialObjects=await objects();await writeFile(`${output}/goldmine-initial-objects.json`,JSON.stringify(initialObjects,null,2));
 const hut=initialObjects.find(o=>o.id==='HUT2'&&o.owner===player);assert.ok(hut,'Original player hut missing');
 await closeMenu();await moveToX(hut.x-10);await tap(4,35);await record('entered-hut');
 assert.equal(crew(await state()).contained,hut.number,'UP enters original HUT2');
 await closeMenu();await tap(4,5);await selectMenu('FLNT');
 const wealth=(await state()).players.find(p=>p.number===player).wealth;await tap(3,16);await record('bought-flint');
 assert.equal((await state()).players.find(p=>p.number===player).wealth,wealth-5,'Original purchase charges five wealth');
 await closeMenu();await tap(7,20);await record('exited-hut');
 await writeFile(`${output}/goldmine-after-buy-objects.json`,JSON.stringify(await objects(),null,2));
 await page.screenshot({path:`${output}/goldmine-first-purchase.png`});
 console.log('Verified original hut entry, purchase menu and FLNT purchase through nine-key controls.');
}catch(error){logs.push(`FAIL ${error.stack}`);console.error(error);process.exitCode=1;try{console.log('INSPECTION',await state());}catch(e){console.log('INSPECTION ERROR',String(e));}await page.screenshot({path:`${output}/goldmine-failure.png`});}
finally{await writeFile(`${output}/goldmine-playthrough.json`,JSON.stringify({trace,logs},null,2));await browser.close();}

import assert from 'node:assert/strict';
import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1000,height:750},hasTouch:true});
const trace=[];let failure;
try{
 await page.goto('http://127.0.0.1:3000/rage/index.html?touch=1');await page.locator('#start').tap();
 await page.waitForFunction(()=>window.__rageBrowser?.getState().phase==='playing',null,{timeout:90000});
 await page.waitForFunction(()=>JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).players.some(p=>p.cursor));
 await page.evaluate(()=>window.Module.ccall('nc_browser_pause','number',['number'],[1]));
 const snapshot=()=>page.evaluate(()=>{const s=JSON.parse(window.Module.ccall('nc_browser_state','string',[],[]));return{frame:s.frame,...s.players.find(p=>p.local).cursor};});
 const record=async label=>{const s=await snapshot();trace.push({label,...s});console.log(label,JSON.stringify({x:s.x,y:s.y,action:s.action,dir:s.commandDirection}));return s;};
 const step=n=>page.evaluate(n=>{const out=[];for(let i=0;i<n;i++){window.Module.ccall('nc_browser_step','number',['number'],[1]);const s=JSON.parse(window.Module.ccall('nc_browser_state','string',[],[]));const c=s.players.find(p=>p.local).cursor;out.push({frame:s.frame,x:c.x,y:c.y,action:c.action,dir:c.commandDirection});}return out;},n);
 const tap=async code=>{await page.locator(`[data-code="Key${code}"]`).tap();await page.waitForTimeout(150);};
 await step(40);await tap('C');await step(24);const entrance=await record('entrance');
 await tap('D');trace.push(...await step(180));const bottom=await record('dug-tunnel');assert.ok(bottom.y>entrance.y+30,'A real underground tunnel was dug');
 if(bottom.action==='Dig'){await tap('Z');await step(1);const angled=await record('left-while-digging');assert.equal(angled.action,'Dig');assert.equal(angled.commandDirection,bottom.commandDirection+1);}
 await tap('X');await step(12);await record('stopped');
 await tap('Z');trace.push(...await step(12));await record('left');
 await tap('S');trace.push(...await step(60));await record('jump-or-climb');
 for(let i=0;i<10;i++){
  const s=await snapshot();if(s.y<=entrance.y+4)break;
  if(s.action==='Scale'||s.action==='ScaleDown')await tap('S');
  else {await tap('Z');await step(1);if(['Walk','Kneel'].includes((await snapshot()).action))await tap('S');}
  trace.push(...await step(30));
 }
 const returned=await record('returned');
 assert.ok(trace.some(s=>s.action==='Hangle'),'Original ceiling-hanging is entered');
 assert.ok(returned.y<=entrance.y+4,'Clonk climbed out of the real tunnel');
 await page.screenshot({path:'rage-port/outputs/tunnel-controls.png'});
}catch(error){failure=String(error);process.exitCode=1;console.error(error);await page.screenshot({path:'rage-port/outputs/tunnel-controls-failure.png'});}
finally{await mkdir('rage-port/outputs',{recursive:true});await writeFile('rage-port/outputs/tunnel-controls.json',JSON.stringify({failure,trace},null,2));await browser.close();}

// Genuine Gold Mine automation: original queued commands only, never state edits.
import assert from 'node:assert/strict';
import {planDigToGold} from './goldmine-route.mjs';
import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const output='rage-port/outputs';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1200,height:850}});const logs=[],trace=[];
page.on('console',m=>{logs.push(`${m.type()}: ${m.text()}`);if(m.type()==='error'||/Game started|Player join|Error/.test(m.text()))console.log(m.type(),m.text());});page.on('pageerror',e=>logs.push(`PAGEERROR ${e.stack}`));
const call=(name,result,args=[])=>page.evaluate(({name,result,args})=>Module.ccall(name,result,args.map(()=>'number'),args),{name,result,args});
const state=async()=>JSON.parse(await call('nc_browser_state','string'));
const objects=async()=>JSON.parse(await call('nc_browser_objects','string',[0,0,0]));
const id=s=>s.split('').reduce((n,c,i)=>n+(c.charCodeAt(0)<<(i*8)),0);
let player=0,passed=false;
const crew=s=>s.players.find(p=>p.number===player)?.cursor;
const step=async(n=1)=>{const actual=await call('nc_browser_step','number',[n]);assert.ok(actual>=0,`step returned ${actual}`);return state();};
const command=async(cmd,target=0,x=0,y=0,target2=0,data=0,append=0)=>{assert.equal(await call('nc_browser_command','number',[player,cmd,target,x,y,target2,data,append]),1);return step(1);};
const record=async(label)=>{const s=await state();trace.push({label,state:s});console.log(label,JSON.stringify({frame:s.frame,gold:s.materials.find(m=>m.name==='Gold')?.pixels,goldObjects:s.goldObjects,wealth:s.players[0]?.wealth,clonk:crew(s)}));return s;};
async function finish(label,budget=1200){for(let t=0;t<budget;t+=20){const s=await step(20);if(!crew(s)?.commands.length)return record(label);}await record(label+'-timeout');throw new Error(label+' command timed out');}
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:3002/');await page.getByRole('button',{name:/start|play|enter|begin/i}).first().click();
 await page.waitForFunction(()=>['error','exited'].includes(window.__rageBrowser?.getState().phase)||(window.__rageBrowser?.getState().phase==='playing'&&window.Module?._nc_browser_command&&JSON.parse(Module.ccall('nc_browser_state','string',[],[])).players.some(p=>p.cursor)),{},{timeout:90000});
 const audio=await page.evaluate(()=>({context:SDL.audioContext?.state,music:SDL.music.audio?{paused:SDL.music.audio.paused,source:!!SDL.music.audio.webAudioNode,htmlMedia:SDL.music.audio instanceof HTMLMediaElement,currentTime:SDL.music.audio.currentTime,duration:SDL.music.audio.duration}:null,decodedEffects:SDL.audios.filter(a=>a?.webAudio?.decodedBuffer).length}));console.log('AUDIO',JSON.stringify(audio));await writeFile(`${output}/goldmine-audio.json`,JSON.stringify(audio,null,2));
 assert.equal(await call('nc_browser_pause','number',[1]),1);const initial=await record('initial');player=initial.players.find(p=>p.local).number;
 const hut=(await objects()).find(o=>o.id==='HUT2'&&o.owner===player);assert.ok(hut);
 const {width,height}=initial.landscape;const terrain=JSON.parse(await call('nc_browser_terrain','string',[0,0,width,height]));await writeFile(`${output}/goldmine-terrain.json`,JSON.stringify({state:initial,terrain}));
 // Original ExecBase attaches the starting flag on Tick10; wait for it naturally.
 await step(20);
 const gold=initial.materials.find(m=>m.name==='Gold').index;
 const pixels=[];for(let i=0;i<terrain.materials.length;i++)if(terrain.materials[i]===gold)pixels.push({x:i%width,y:Math.floor(i/width)});
 pixels.sort((a,b)=>Math.hypot(a.x-hut.x,a.y-hut.y)-Math.hypot(b.x-hut.x,b.y-hut.y));console.log('NEAREST GOLD',pixels.slice(0,5));
 await command(22,hut.number,1,0,0,id('SFLN'));await finish('bought-superflint');
 const explosive=(await objects()).find(o=>o.id==='SFLN'&&o.contained===hut.number);assert.ok(explosive,'Purchase creates actual item in hut');
 await command(12,explosive.number);await finish('carrying-superflint');assert.ok(crew(await state()).contents.includes(explosive.number));
 await command(4);await finish('exited');
 const route=planDigToGold(terrain,initial.materials,crew(await state()),await objects());console.log('ROUTE',JSON.stringify(route.waypoints));const aim=route.gold;
 for(const point of route.waypoints){let reached=false;for(let attempt=0;attempt<3&&!reached;attempt++){await command(15,0,point.x,point.y+7);await finish('dig-waypoint',1800);const actual=crew(await state());reached=Math.hypot(actual.x-point.x,actual.y-point.y)<20;if(!reached)await step(45);}assert.ok(reached,'Original dig reaches planned waypoint');}
 const beforeBlast=await state();
 // Approach beneath the seam so a normal upward throw strikes gold.
 const facingControl=crew(await state()).x<aim.x?8:6;await call('nc_browser_control','number',[player,facingControl,1,0]);await call('nc_browser_control','number',[player,facingControl,0,0]);await step(1);
 await command(7,explosive.number);await finish('thrown-explosive',1800);await call('nc_browser_control','number',[player,7,1,0]);await call('nc_browser_control','number',[player,7,0,0]);await step(35);const afterBlast=await record('after-blast');assert.ok(afterBlast.materials.find(m=>m.name==='Gold').pixels<beforeBlast.materials.find(m=>m.name==='Gold').pixels,'Original explosion removes gold material');assert.ok(afterBlast.goldObjects>beforeBlast.goldObjects,'Original explosion converts seam into collectible gold');
 const goldObjects=(await objects()).filter(o=>o.id==='GOLD');assert.ok(goldObjects.length,'Original blast creates GOLD');
 const target=goldObjects.sort((a,b)=>Math.hypot(a.x-aim.x,a.y-aim.y)-Math.hypot(b.x-aim.x,b.y-aim.y))[0];
 await command(12,target.number);await finish('carrying-gold',2000);assert.ok(crew(await state()).contents.includes(target.number));
 const wealth=(await state()).players[0].wealth;
 let home=false;
 for(let attempt=0;attempt<7&&!home;attempt++){
  await command(3,hut.number);
  for(let t=0;t<650;t+=25){const current=await step(25);if(crew(current)?.contained===hut.number){home=true;break;}if(!crew(current)?.commands.length)break;}
  if(!home){await record('return-needs-climb');const current=crew(await state());const waypoint=current.commands.find(c=>c.name==='MoveTo');const direction=waypoint&&waypoint.x>current.x?8:6;
   // Original keyboard orders clear the AI stack and put the Clonk against the
   // shaft wall, then invoke the original jump/scale context. No position edits.
   await call('nc_browser_control','number',[player,direction,1,0]);await call('nc_browser_control','number',[player,direction,0,0]);await step(12);
   await call('nc_browser_control','number',[player,4,1,0]);await call('nc_browser_control','number',[player,4,0,0]);await step(65);
   await record('original-wall-climb');
  }
 }
 assert.ok(home,'Original commands and wall-climb return to hut');await step(70);const returned=await record('sold-gold');assert.equal(crew(returned).contained,hut.number,'Return reaches original base');assert.ok(!(await objects()).some(o=>o.number===target.number),'Original auto-sale removes delivered GOLD');assert.ok(returned.players[0].wealth>=wealth,'Original sale offsets at most one five-wealth base-energy purchase');
 await page.screenshot({path:`${output}/goldmine-mining-cycle.png`});passed=true;await page.screenshot({path:`${output}/goldmine-cycle-passed.png`});console.log('PASS: original purchase, terrain excavation, seam blast, new GOLD collection, return and sale.');
}catch(error){console.error(error);logs.push(`FAIL ${error.stack}`);process.exitCode=1;try{await record('failure');}catch{}await page.screenshot({path:`${output}/goldmine-command-failure.png`});}
finally{try{const music=await page.evaluate(()=>({context:SDL.audioContext?.state,music:SDL.music.audio?{keys:Object.keys(SDL.music.audio),paused:SDL.music.audio.paused,source:!!SDL.music.audio.webAudioNode,startTime:SDL.music.audio.startTime,duration:SDL.music.audio.resource?.webAudio?.decodedBuffer?.duration,pending:SDL.music.audio.resource?.webAudio?.onDecodeComplete?.length}:null}));console.log('FINAL_AUDIO',JSON.stringify(music));await writeFile(`${output}/goldmine-audio-final.json`,JSON.stringify(music,null,2));}catch{}await writeFile(`${output}/goldmine-command-trace.json`,JSON.stringify({passed,trace,logs},null,2));if(passed)await writeFile(`${output}/goldmine-cycle-passed.json`,JSON.stringify({passed,trace,logs},null,2));await browser.close();}

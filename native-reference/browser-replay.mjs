import {chromium} from '../web/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[],messages=[],states=[];
page.on('console',message=>messages.push(`${message.type()}: ${message.text()}`));page.on('pageerror',error=>errors.push(String(error)));
const call=(name,type,args=[])=>page.evaluate(({name,type,args})=>Module.ccall(name,type,args.map(()=>'number'),args),{name,type,args});
const state=async()=>JSON.parse(await call('nc_browser_state','string'));
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:3002/?replay=1');
 await page.getByRole('button',{name:'Play native recording',exact:true}).click();
 await page.waitForFunction(()=>['playing','error','exited'].includes(window.__rageBrowser?.getState().phase),{},{timeout:90000});
 const shell=await page.evaluate(()=>window.__rageBrowser.getState());
 if(shell.phase!=='playing')throw Error(`Replay did not start: ${JSON.stringify(shell)}`);
 await call('nc_browser_pause','number',[1]);
 states.push(await state());
 await page.locator('#canvas').screenshot({path:'native-reference/screenshots/browser-replay-initial.png'});
 for(const target of [100,680]){
  let current=await state();let attempts=0;
  while(current.frame<target&&current.running&&++attempts<30){const delta=Math.min(250,target-current.frame);const done=await call('nc_browser_step','number',[delta]);if(done<=0)break;current=await state();}
  if(current.frame!==target||!current.players.some(player=>player.name==='Reference'))throw Error('Native replay failed to reach expected frame/player: '+JSON.stringify(current));
  states.push(current);await page.waitForTimeout(100);await page.locator('#canvas').screenshot({path:`native-reference/screenshots/browser-replay-frame-${current.frame}.png`});
 }
 if(errors.length||messages.some(line=>/FATAL ERROR|Synchronization loss|Error at player file/.test(line)))throw Error('Original replay synchronization or browser error.');
 await writeFile('native-reference/browser-replay-report.json',JSON.stringify({shell,states,errors,messages},null,2));
 console.log(JSON.stringify({phase:shell.phase,states:states.map(s=>({frame:s.frame,scenario:s.scenario,landscape:s.landscape,players:s.players.map(p=>({name:p.name,cursor:p.cursor}))})),errors},null,2));
} catch(error){await writeFile('native-reference/browser-replay-report.json',JSON.stringify({error:String(error),states,errors,messages},null,2));await page.screenshot({path:'native-reference/screenshots/browser-replay-error.png'});throw error;}finally{await browser.close();}

// Real unchanged scenarios through the production shell. This runner queues only
// original controls, advances original ticks and uses the original screenshot and
// save routines. Multiplayer scenarios use two real production WebRTC peers.
import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRoom,exerciseRoom} from './room-driver.mjs';
const base=process.env.GAME_URL||'http://127.0.0.1:3902';
const out=process.env.SWEEP_OUT||'rage-port/outputs/scenario-library';
const catalog=JSON.parse(await readFile('rage-port/catalog/scenarios.json','utf8'));
const filter=process.env.SCENARIOS?.split(',');
const scenarios=catalog.scenarios.filter(s=>!filter||filter.includes(s.id)||filter.includes(s.categoryId));
const engineSha256=createHash('sha256').update(await readFile('rage-port/dist/clonk.wasm')).digest('hex');
const limit=Number(process.env.SCENARIO_LIMIT||scenarios.length);
const resume=process.env.SWEEP_RESUME==='1',results=[];
const viewWidth=Number(process.env.SWEEP_WIDTH||640),viewHeight=Number(process.env.SWEEP_HEIGHT||480);
await mkdir(out,{recursive:true});
if(resume){try{results.push(...JSON.parse(await readFile(path.join(out,'report.json'),'utf8')).results);}catch{}}
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const savedCategories=new Set(results.filter(r=>r.saveLoad?.passed).map(r=>r.categoryId));
const call=(page,name,result='number',types=[],args=[])=>page.evaluate(({name,result,types,args})=>Module.ccall('nc_browser_'+name,result,types,args),{name,result,types,args});
const state=page=>call(page,'state','string').then(JSON.parse);
const diagnostics=page=>call(page,'diagnostics','string').then(JSON.parse);
const pause=page=>call(page,'pause','number',['number'],[1]);
async function engineReady(page){
 await page.waitForFunction(()=>['error','ended'].includes(window.__rageBrowser?.getState().phase)||window.__rageBrowser?.getState().ready,null,{timeout:120000});
 const shell=await page.evaluate(()=>window.__rageBrowser.getState());if(['error','ended'].includes(shell.phase)){const fatal=shell.logs.find(line=>/FATAL ERROR:/.test(line)&&!line.includes('Program terminated'));throw Error(fatal||shell.error||'Original engine exited during scenario initialization');}
}
async function tick(page,network,count){
 if(network)throw Error('Use the production room clock for multiplayer');
 const advanced=await call(page,'step','number',['number'],[count]);if(advanced!==count)throw Error(`Original step advanced ${advanced}/${count}`);
}
async function dismissDialogs(page,record,network){
 for(let attempt=0;attempt<8;++attempt){const d=await diagnostics(page);if(!d.dialog)return;record.dialogs.push(d.dialog);await call(page,'key','number',['number','number','number','number'],[13,1,0,0]);await call(page,'key','number',['number','number','number','number'],[13,0,0,0]);await page.waitForTimeout(70);await pause(page);try{await tick(page,network,1);}catch{/* Some native modal halts clear after the next browser callback. */}}
}
async function readFile64(page,file){return page.evaluate(file=>{const b=Module.FS.readFile(file);let raw='';for(let i=0;i<b.length;i+=32768)raw+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(raw);},file);}
async function nativeLog(page,scenario,record){
 const found=await page.evaluate(()=>{for(const file of ['/data/Clonk.log','/data/home/.clonk/rage/Clonk.log','/data/home/Clonk.log','/Clonk.log']){try{return {file,text:Module.FS.readFile(file,{encoding:'utf8'})};}catch{}}return null;});
 if(!found)return;const filename=path.join(out,scenario.id.replace(/[^a-z0-9]/gi,'_')+'.native.log');await writeFile(filename,found.text);record.nativeLog={path:filename,virtualPath:found.file};record.nativeWarnings=found.text.split(/\r?\n/).map(line=>line.replace(/^\[\d\d:\d\d:\d\d\] /,'')).filter(line=>/^WARNING:/i.test(line));
}
function originalWarningBaseline(scenario,record){
 if(scenario.id!=='races.c4f/tritonpath.c4s')return;
 const expected=[
 'WARNING: parameter has the same name as type id (in Take, Races.c4f/Tritonpath.c4s/Hippo.c4d/HippoSaddled.c4d/Script.c:83:21)',
 'WARNING: parameter has the same name as type id (in Put, Races.c4f/Tritonpath.c4s/Hippo.c4d/HippoSaddled.c4d/Script.c:95:20)'];
 if(JSON.stringify(record.nativeWarnings)!==JSON.stringify(expected)||!record.scriptLink?.includes('44338 lines, 2 warnings, 0 errors'))return;
 record.shippedWarnings={count:2,messages:expected,baseline:'native-reference/warning-audit/Clonk.log',nativeVersion:'Official Linux Clonk Rage 4.9.10.7 [330]',note:'Exact unchanged native warnings reproduced, not new browser warnings.'};
 record.scriptWarnings=record.scriptWarnings.filter(line=>!line.includes('C4AulScriptEngine linked - 44338 lines, 2 warnings, 0 errors')&&!expected.some(w=>line.endsWith(w)));
}
async function overview(page,scenario,record){
 const before=await state(page);if(await call(page,'overview')!==1)throw Error('Original full-landscape screenshot failed');
 const files=await page.evaluate(()=>{const result=[],fs=Module.FS;function walk(folder,depth){if(depth>8)return;let names;try{names=fs.readdir(folder);}catch{return;}for(const name of names){if(name==='.'||name==='..')continue;const p=folder+'/'+name;try{const st=fs.stat(p);if(fs.isDir(st.mode))walk(p,depth+1);else if(/^Screenshot\d+\.png$/.test(name))result.push(p);}catch{}}}walk('/data',0);return result;});
 if(!files.length)throw Error('Original screenshot file missing');const file=files.sort().at(-1),slug=scenario.id.split('/').join('__').replace(/\.c4[fs]/g,''),folder=path.join('rage-port/catalog/screenshots',scenario.categoryId);await mkdir(folder,{recursive:true});
 const png=path.join(out,slug+'.png'),webp=path.join(folder,slug+'.webp');await writeFile(png,Buffer.from(await readFile64(page,file),'base64'));
 const dimensions=JSON.parse(execFileSync('python3',['-c',"from PIL import Image;import sys,json;i=Image.open(sys.argv[1]);original=i.size;i.resize((640,max(1,round(i.height*640/i.width))),Image.Resampling.LANCZOS).save(sys.argv[2],quality=86,method=6);print(json.dumps({'original':original,'preview':[640,max(1,round(i.height*640/i.width))]}))",png,webp],{encoding:'utf8'}));
 record.screenshot={path:webp.replace(/^rage-port\//,''),originalPng:png,originalVirtualPath:file,frame:before.frame,dimensions,method:'Original Game.GraphicsSystem.SaveScreenshot(true); Pillow Lanczos resize and WebP compression only'};
}
async function save(page,record){
 const id=await call(page,'save');if(id<1){record.save={available:false,status:id};return null;}
 await page.waitForFunction(id=>{const s=JSON.parse(Module.ccall('nc_browser_save_status','string',[],[]));return s.requestId===id&&['saved','error'].includes(s.status);},id,{timeout:60000});
 record.save=JSON.parse(await call(page,'save_status','string'));if(record.save.status!=='saved')throw Error(record.save.error||'Original save failed');
 if(!await page.evaluate(()=>window.__rageBrowser.syncSaves()))throw Error('IndexedDB save sync failed');return record.save.path.split('/Savegames.c4f/')[1];
}
async function loadSaved(page,name,record){
 const before=await state(page);await page.goto(base+'/?save='+encodeURIComponent(name)+'&load=1');await engineReady(page);await page.waitForFunction(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])).players.length>0,null,{timeout:30000});await pause(page);const after=await state(page);record.saveLoad={passed:after.running&&after.landscape.width===before.landscape.width&&after.landscape.height===before.landscape.height&&after.frame>=record.save.frame,beforeFrame:record.save.frame,afterFrame:after.frame,scenario:after.scenario};if(!record.saveLoad.passed)throw Error('Original saved-round resume mismatched');
}
try{
 for(const scenario of scenarios.slice(0,limit)){
  if(resume&&results.some(r=>r.id===scenario.id&&r.passed))continue;
  const record={clonkJsSha256:createHash('sha256').update(await readFile('rage-port/dist/clonk.js')).digest('hex'),engineSha256:createHash('sha256').update(await readFile('rage-port/dist/clonk.wasm')).digest('hex'),viewport:{width:viewWidth,height:viewHeight},id:scenario.id,title:scenario.title,categoryId:scenario.categoryId,minimumPlayers:scenario.minPlayers,startedAt:new Date().toISOString(),dialogs:[],pageErrors:[],requestFailures:[],passed:false};
  console.log('BEGIN '+scenario.id);const context=await browser.newContext({viewport:{width:viewWidth,height:viewHeight}}),page=await context.newPage();page.on('pageerror',error=>record.pageErrors.push(String(error)));page.on('requestfailed',request=>record.requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
  const network=scenario.minPlayers>1;record.mode=network?'production WebRTC room with two independent devices':'original solo';let room=null;
  try{
   await page.goto(base);await page.waitForFunction(()=>window.__rageBrowser&&window.__scenarioLibrary?.catalog);
   if(network){room=await createRoom({browser,base,scenarioId:scenario.id,host:page,viewport:{width:viewWidth,height:viewHeight},onPageError:error=>record.pageErrors.push(String(error))});console.log('ROOM READY '+scenario.id);}
   else{await page.evaluate(id=>window.__rageBrowser.startScenario(id),scenario.id);await engineReady(page);console.log('READY '+scenario.id);await pause(page);await dismissDialogs(page,record,false);for(let t=0;t<12;++t){const s=await state(page);if(s.players.filter(p=>!p.eliminated).length>=scenario.minPlayers&&s.frame>=2)break;await tick(page,false,1);}}
   record.initial=await state(page);record.diagnostics=await diagnostics(page);if(record.initial.players.filter(p=>!p.eliminated).length<scenario.minPlayers)throw Error('Required original players did not join');if(!record.diagnostics.definitionCount)throw Error('No original definitions loaded');
   if(network){record.multiplayer=await exerciseRoom(room);record.guestLogs=await room.guest.evaluate(()=>window.__rageBrowser.getState().logs);}
   else{
   await dismissDialogs(page,record,network);await tick(page,network,90);let joined=await state(page);const selecting=joined.players.find(p=>p.local&&p.menu&&!p.cursor);if(selecting){record.teamMenu={player:selecting.number,method:'Original Throw/menu-enter control'};await call(page,'control','number',['number','number','number','number'],[selecting.number,3,1,0]);await call(page,'control','number',['number','number','number','number'],[selecting.number,3,0,0]);await tick(page,network,6);}record.beforeControls=await state(page);
   const player=record.beforeControls.players.find(p=>p.local&&!p.eliminated&&p.cursor);if(player){record.control={player:player.number,result:await call(page,'control','number',['number','number','number','number'],[player.number,8,1,0])};await tick(page,network,18);await call(page,'control','number',['number','number','number','number'],[player.number,8,0,0]);await call(page,'control','number',['number','number','number','number'],[player.number,7,1,0]);await call(page,'control','number',['number','number','number','number'],[player.number,7,0,0]);await tick(page,network,2);record.control.after=(await state(page)).players.find(p=>p.number===player.number)?.cursor;record.control.before=player.cursor;}
   await dismissDialogs(page,record,network);}
   console.log('CAPTURE '+scenario.id);await overview(page,scenario,record);console.log('SAVE '+scenario.id);const saved=await save(page,record);
   await nativeLog(page,scenario,record);record.final=await state(page);record.pendingPlayers=(await diagnostics(page)).players.filter(p=>p.status===2||p.status===3);record.logs=(await page.evaluate(()=>window.__rageBrowser.getState())).logs;record.platformWarnings=record.logs.filter(line=>/WARNING: using emscripten GL(?: immediate mode)? emulation/.test(line));record.scriptWarnings=record.logs.filter(line=>/\b(?:warnings?|errors?)\b/i.test(line)&&!/0 errors?, 0 warnings?|0 warnings?, 0 errors?/i.test(line)&&!record.platformWarnings.includes(line));record.guestScriptWarnings=(record.guestLogs||[]).filter(line=>/\b(?:warnings?|errors?)\b/i.test(line)&&!/0 errors?, 0 warnings?|0 warnings?, 0 errors?|WARNING: using emscripten GL(?: immediate mode)? emulation/i.test(line));record.scriptLink=record.logs.find(line=>line.includes('C4AulScriptEngine linked'))||null;originalWarningBaseline(scenario,record);
   if(saved&&!network&&!savedCategories.has(scenario.categoryId)&&process.env.SKIP_SAVE_LOAD!=='1'){console.log('RELOAD '+scenario.id);await loadSaved(page,saved,record);savedCategories.add(scenario.categoryId);}
   if(record.pendingPlayers.length)throw Error('Original players still choosing teams: '+record.pendingPlayers.map(p=>p.number).join(','));if(record.guestScriptWarnings.length)throw Error('Guest original engine warnings/errors: '+record.guestScriptWarnings.join('; '));if(record.scriptWarnings.length)throw Error('Original engine warnings/errors: '+record.scriptWarnings.join('; '));if(record.pageErrors.length)throw Error('Browser exception(s): '+record.pageErrors.join('; '));record.passed=true;
  }catch(error){record.error=String(error);record.stack=error.stack;try{record.logs=(await page.evaluate(()=>window.__rageBrowser?.getState())).logs;const fatal=record.logs?.find(line=>/FATAL ERROR:/.test(line)&&!line.includes('Program terminated'));if(fatal){record.harnessError=record.error;record.error=fatal;}if(network)record.roomFailure=await page.evaluate(()=>window.__neoclonkMultiplayer.getState());await page.screenshot({path:path.join(out,scenario.id.replace(/[^a-z0-9]/gi,'_')+'-failure.png')});}catch{}}
  finally{record.finishedAt=new Date().toISOString();if(room)await room.close();await context.close();const old=results.findIndex(r=>r.id===record.id);if(old>=0)results.splice(old,1);results.push(record);await writeFile(path.join(out,'report.json'),JSON.stringify({base,seedPolicy:'Original solo initialization or production room shared seed; see diagnostics.randomSeed per case',engineSha256,scenarioCount:catalog.scenarios.length,results},null,2)+'\n');await writeFile(path.join(out,'screenshots.json'),JSON.stringify(results.filter(r=>r.screenshot).map(r=>({id:r.id,...r.screenshot,diagnostics:r.diagnostics,ready:r.initial?.running,seed:r.diagnostics?.randomSeed,scriptWarnings:r.scriptWarnings,shippedWarnings:r.shippedWarnings})),null,2)+'\n');console.log(`${record.passed?'PASS':'FAIL'} ${record.id}${record.error?' '+record.error:''}`);}
 }
}finally{await browser.close();}
console.log(JSON.stringify({tested:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).map(r=>({id:r.id,error:r.error}))}));if(results.some(r=>!r.passed))process.exitCode=1;

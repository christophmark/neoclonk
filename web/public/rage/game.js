'use strict';
(() => {
 const $=id=>document.getElementById(id), canvas=$('canvas'), cover=$('cover'), query=new URLSearchParams(location.search);
 const assetUrl=path=>window.__scenarioLibrary.url(path),library=window.__scenarioLibrary;
 const logs=[],state={phase:'menu',ready:false,error:null,persistence:'waiting',lastSync:null,replay:query.get('replay')==='1'};
 let booted=false,ready=false,failed=false,exited=false,syncTimer=0,downloadTotal=0,selectedSave=null;
 let selectedScenarioId=query.get('scenario')||'worlds.c4f/goldmine.c4s',launchScenario=null,session=null,stagedPacks=[];
 let savedScenarioMeta={},knownSaves=new Set();const saveIndexPath='/data/home/neoclonk-saves.json';
 let persistenceMounted=false,syncPromise=null,exitSync=null,saveBusy=false,saveFeedbackTimer=0,viewFrame=0,viewInitialized=false;
 let indexedSaves=[],savedMetadata=new Map(),planetSaves=[];
 const zoomLevels=[.25,.5,1,2,3,4,5,6,7,8];
 const snapZoom=value=>zoomLevels.reduce((nearest,level)=>Math.abs(level-value)<=Math.abs(nearest-value)?level:nearest,zoomLevels[0]);
 const setting=(name,fallback)=>{try{return localStorage.getItem(name)||fallback;}catch{return fallback;}};
 let worldZoom=snapZoom(Math.max(.25,Math.min(8,Number(setting('neoclonk.zoom','2'))||2)));
 function updateZoomButtons(){
  $('zoom-out').disabled=worldZoom===zoomLevels[0];$('zoom-in').disabled=worldZoom===zoomLevels.at(-1);
  $('zoom-control').setAttribute('aria-label',`World zoom: ${worldZoom} times`);
  for(const [id,label]of [['zoom-out','Zoom out'],['zoom-in','Zoom in']])$(id).title=`${label} (${worldZoom}×)`;
 }
 updateZoomButtons();
 function phase(value){if(value!=='menu')$('scenario-panel').hidden=false;state.phase=value;document.body.dataset.phase=value;$('game-header').hidden=value!=='playing';window.dispatchEvent(new CustomEvent('neoclonk-phase',{detail:{phase:value}}));}
 function setStatus(message){state.lastStatus=String(message||'');$('status').textContent=state.lastStatus;}
 function storageStatus(message){if($('storage-status'))$('storage-status').textContent=message;}
 function log(...args){const line=args.map(String).join(' ');logs.push(line);if(logs.length>600)logs.shift();$('debug').textContent=logs.join('\n');console.log('[Clonk]',line);
  if(/Game (started|resumed|joined)\./.test(line)){ready=true;state.ready=true;phase('playing');cover.hidden=true;$('game-save').disabled=!!session;$('game-save').title=session?'Saving a connected round is not available yet.':'Save round on this device';showTouch(touchWanted);touch.refresh();canvas.focus();scheduleView();if(session)window.__neoclonkMultiplayer?.engineReady();}
  if(line.includes('Game saved.'))setTimeout(()=>{rememberSaves();syncSaves();},0);
 }
 function fail(message){if(failed)return;failed=true;ready=false;clearInterval(syncTimer);cancelAnimationFrame(viewFrame);viewFrame=0;state.ready=false;state.error=String(message);phase('error');cover.hidden=false;$('title').textContent='Could not start the scenario';$('intro').textContent='Reload to try again. Your stored saves are retained.';$('start').disabled=true;$('error').hidden=false;$('error').textContent=state.error;$('debug').hidden=false;log(state.error);}
 function validSavePath(path){const parts=String(path).split('/');return parts.length<=16&&parts.every(p=>p&&p!=='.'&&p!=='..'&&!/[\\\0]/.test(p))&&/\.c4s$/i.test(parts.at(-1));}
 function listSavedGames(){if(exited||!persistenceMounted)return [...indexedSaves];const fs=window.Module.FS,base='/data/home/Savegames.c4f',result=[];
  function walk(relative,depth){if(depth>15||result.length>=1000)return;let names;try{names=fs.readdir(base+(relative?'/'+relative:''));}catch{return;}for(const name of names){if(name==='.'||name==='..')continue;const entry=relative?relative+'/'+name:name;try{const stat=fs.stat(base+'/'+entry);if(validSavePath(entry)){result.push(entry);savedMetadata.set(entry,{date:stat.mtime});}else if(fs.isDir(stat.mode))walk(entry,depth+1);}catch{}}}
  walk('',0);return result.sort((a,b)=>new Date(savedMetadata.get(b)?.date||0)-new Date(savedMetadata.get(a)?.date||0));
 }
 function refreshSavedGames(){const names=listSavedGames();indexedSaves=[...names];for(const save of planetSaves){const name='planet:'+save.id;names.push(name);savedMetadata.set(name,{date:save.date});savedScenarioMeta[name]={title:save.title+' · Clonk Planet'};}const select=$('saved-games'),chosen=select.value||query.get('save');select.replaceChildren();for(const name of names){const option=document.createElement('option');option.value=name;const date=savedMetadata.get(name)?.date;option.textContent=(savedScenarioMeta[name]?.title||name.split('/').at(-1).replace(/\.c4s$/i,''))+(date?' · '+new Date(date).toLocaleString([], {dateStyle:'short',timeStyle:'short'}):'');select.append(option);}if(names.includes(chosen))select.value=chosen;select.hidden=false;$('load-save').hidden=false;if(!names.length){const empty=document.createElement('option');empty.value='';empty.textContent='No saved rounds yet';select.append(empty);}select.disabled=!names.length;$('load-save').disabled=!names.length;if($('save-empty'))$('save-empty').hidden=!!names.length;}
 // Read the existing IDBFS catalog without loading the engine or changing saves.
 async function readSavedIndex(){return new Promise(resolve=>{let request;try{request=indexedDB.open('/data/home');}catch{storageStatus('Local storage unavailable');resolve();return;}
  request.onupgradeneeded=()=>request.transaction.abort(); // No prior saves; let IDBFS create its own schema later.
  request.onerror=event=>{event.preventDefault();resolve();};request.onblocked=()=>resolve();
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();if(!db.objectStoreNames.contains('FILE_DATA')){db.close();resolve();return;}
   const tx=db.transaction('FILE_DATA','readonly'),cursor=tx.objectStore('FILE_DATA').openCursor(),prefix='/data/home/Savegames.c4f/';
   cursor.onsuccess=()=>{const entry=cursor.result;if(!entry)return;const path=String(entry.key);if(path===saveIndexPath){try{savedScenarioMeta=JSON.parse(new TextDecoder().decode(entry.value.contents))||{};}catch{/* Old or incomplete optional index. */}}if(path.startsWith(prefix)&&validSavePath(path.slice(prefix.length))){const name=path.slice(prefix.length);indexedSaves.push(name);savedMetadata.set(name,{date:entry.value.timestamp});}entry.continue();};
   tx.oncomplete=()=>{db.close();indexedSaves.sort((a,b)=>new Date(savedMetadata.get(b)?.date||0)-new Date(savedMetadata.get(a)?.date||0));refreshSavedGames();resolve();};tx.onerror=()=>{db.close();resolve();};
  };
 });}
 function rememberSaves(){if(!ready||!window.Module?.FS||!launchScenario)return;let changed=false;for(const name of listSavedGames()){if(knownSaves.has(name))continue;knownSaves.add(name);savedScenarioMeta[name]={scenarioId:launchScenario.id,title:launchScenario.title,requiredPacks:launchScenario.requiredPacks,multiplayer:!!session};changed=true;}if(changed)window.Module.FS.writeFile(saveIndexPath,JSON.stringify(savedScenarioMeta));}
 function syncSaves(){if(exited||failed||!persistenceMounted||state.persistence==='loading')return Promise.resolve(false);if(syncPromise)return syncPromise.then(()=>syncSaves());
  syncPromise=new Promise(resolve=>window.Module.FS.syncfs(false,error=>{syncPromise=null;if(exited){resolve(false);return;}if(error){state.persistence='error';storageStatus('Local save sync failed');log('[storage]',error.message||error);resolve(false);}else{state.persistence='ready';state.lastSync=new Date().toISOString();storageStatus('Saves stored on this device');refreshSavedGames();resolve(true);}}));return syncPromise;
 }
 // The C++ shutdown writes its final config/crew before Emscripten exits.
 // IDBFS remains a JavaScript filesystem; flush it once, without native calls.
 function flushAfterExit(){if(!persistenceMounted)return;state.exitSync='saving';
  exitSync=Promise.resolve(syncPromise).catch(()=>false).then(()=>new Promise(resolve=>{
   try{window.Module.FS.syncfs(false,error=>{state.exitSync=error?'error':'saved';if(error){state.persistence='error';storageStatus('Final local progress could not be stored');log('[storage]',error.message||error);}else{state.lastSync=new Date().toISOString();storageStatus('Saves stored on this device');}resolve(!error);});}
   catch(error){state.exitSync='error';log('[storage]',error.message||error);resolve(false);}
  }));
 }
 function initializeStorage(){const module=window.Module,fs=module.FS;fs.mkdirTree('/data');fs.mkdirTree('/data/home');fs.mkdirTree('/home/web_user/.clonk/rage');fs.chdir('/data');state.persistence='loading';module.addRunDependency('neoclonk-local-saves');
  const finish=error=>{if(error){persistenceMounted=false;state.persistence='error';storageStatus('Local saves unavailable in this browser session');log('[storage]',error.message||error);}else{state.persistence='ready';storageStatus('Local saves ready');}module.removeRunDependency('neoclonk-local-saves');};
  try{fs.mount(module.IDBFS,{},'/data/home');persistenceMounted=true;fs.syncfs(true,finish);}catch(error){finish(error);}
 }
 function screenSize(){const box=$('stage').getBoundingClientRect();return {width:Math.max(240,Math.round(box.width)),height:Math.max(240,Math.round(box.height))};}
 function setIniValue(text,section,key,value){const lines=text.split(/\r?\n/);let start=lines.findIndex(l=>l.trim()==='['+section+']');if(start<0){lines.push('['+section+']',key+'='+value);return lines.join('\n');}let end=lines.findIndex((l,i)=>i>start&&/^\[/.test(l));if(end<0)end=lines.length;const index=lines.findIndex((l,i)=>i>start&&i<end&&l.startsWith(key+'='));if(index<0)lines.splice(end,0,key+'='+value);else lines[index]=key+'='+value;return lines.join('\n');}
 function initializePlayer(){const module=window.Module,fs=module.FS;try{for(const pack of stagedPacks)fs.writeFile('/data/'+pack.filename,pack.bytes);stagedPacks=[];fs.mkdirTree('/data/home/.clonk/rage');fs.mkdirTree('/data/home/players');const player='/data/home/players/Browser.c4p';if(!fs.analyzePath(player).exists){if(fs.isDir(fs.stat('/data/Browser.c4p').mode)){fs.mkdirTree(player);fs.writeFile(player+'/Player.txt',fs.readFile('/data/Browser.c4p/Player.txt'));}else fs.writeFile(player,fs.readFile('/data/Browser.c4p'));}
  try{savedScenarioMeta=JSON.parse(fs.readFile(saveIndexPath,{encoding:'utf8'}))||savedScenarioMeta;}catch{/* No index for older original saves. */}
  const config='/data/home/browser.cfg';if(!fs.analyzePath(config).exists)fs.writeFile(config,fs.readFile('/data/browser.cfg'));
  const size=screenSize();let settings=fs.readFile(config,{encoding:'utf8'});settings=setIniValue(settings,'Graphics','ResolutionX',size.width);settings=setIniValue(settings,'Graphics','ResolutionY',size.height);
  // The gallery exposes every mission. Supply the original mission passwords
  // through the existing config field; retain the native access check and scripts.
  const priorAccess=(settings.match(/^MissionAccess=(.*)$/m)?.[1]||'').trim().replace(/^"|"$/g,'');
  const access=[...new Set([...priorAccess.split(';'),...library.catalog.scenarios.map(s=>s.missionAccess)].filter(Boolean))].join(';');
  settings=setIniValue(settings,'General','MissionAccess',JSON.stringify(access));fs.writeFile(config,settings);
  if(selectedSave){if(!validSavePath(selectedSave)||!fs.analyzePath('/data/home/Savegames.c4f/'+selectedSave).exists)throw Error('This saved round is unavailable on this device.');module.arguments[module.arguments.length-1]='/data/home/Savegames.c4f/'+selectedSave;}
  if(session){fs.mkdirTree('/data/session');const colors=[255,16711680,65280,16776960,16711935,65535,16744448,8421504];for(let i=0;i<session.players.length;i++){const player=session.players[i],path='/data/session/Player'+(i+1)+'.c4p';fs.mkdirTree(path);const name=String(player.name||'Player '+(i+1)).replace(/[\r\n\0=\[\]]/g,'').slice(0,30);fs.writeFile(path+'/Player.txt','[Player]\nName='+name+'\n[Preferences]\nColor='+i+'\nColorDw='+colors[i%colors.length]+'\nControl=0\nAutoStopControl=0\nAutoContextMenu=0\nMouse=0\n');}
   if(module.ccall('nc_browser_net_configure','number',['number','number','number'],[session.seed,session.localPlayerIndex,session.players.length])!==1)throw Error('Could not prepare the original multiplayer session.');}
  knownSaves=new Set(listSavedGames());refreshSavedGames();if(persistenceMounted){syncTimer=setInterval(()=>syncSaves(),15000);setTimeout(()=>syncSaves(),0);}
 }catch(error){fail('Could not prepare the local player: '+(error.message||error.errno));throw error;}}
 async function saveGame(){if(!ready||saveBusy||session)return false;saveBusy=true;clearTimeout(saveFeedbackTimer);const button=$('game-save'),feedback=$('save-feedback');button.disabled=true;button.textContent='Saving…';feedback.hidden=false;feedback.textContent='Saving round…';
  try{const id=window.Module.ccall('nc_browser_save','number',[],[]);if(id<1)throw Error('Saving is unavailable right now.');const result=await new Promise((resolve,reject)=>{const timer=setInterval(()=>{if(exited){clearInterval(timer);reject(Error('The round ended before saving finished.'));return;}try{const result=JSON.parse(window.Module.ccall('nc_browser_save_status','string',[],[]));if(result.requestId!==id)return;if(result.status==='saved'){clearInterval(timer);resolve(result);}else if(result.status==='error'){clearInterval(timer);reject(Error(result.error||'Could not save this round.'));}}catch(error){clearInterval(timer);reject(error);}},80);});
   rememberSaves();if(!await syncSaves())throw Error('The round could not be stored on this device.');feedback.textContent='Game saved';state.lastSaved=result.path;return true;
  }catch(error){feedback.textContent=error.message;log('[save]',error.message);return false;}finally{saveBusy=false;button.disabled=!ready;button.textContent='Save';saveFeedbackTimer=setTimeout(()=>{feedback.hidden=true;},5000);if(state.phase==='playing')canvas.focus();}
 }
 function updateView(){viewFrame=0;if(exited||!ready||!window.Module?._nc_browser_view)return;const size=screenSize(),stage=$('stage').getBoundingClientRect(),pad=$('touchpad').getBoundingClientRect(),visible=!$('touchpad').hidden;
  const args=[size.width,size.height,worldZoom,visible?Math.round(pad.left-stage.left):0,visible?Math.round(pad.top-stage.top):0,visible?Math.ceil(pad.width):0,visible?Math.ceil(pad.height):0];
  const signature=['number','number','number','number','number','number','number'];
  if(window.Module.ccall('nc_browser_view','number',signature,args)!==1){setTimeout(scheduleView,100);return;}
  const game=JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])),view=game.viewport;
  if(!view||(!viewInitialized&&!game.players.some(player=>player.cursor))){setTimeout(scheduleView,100);return;}
  viewInitialized=true;
  updateZoomButtons();
 }
 function scheduleView(){if(!viewFrame)viewFrame=requestAnimationFrame(updateView);}
 function setZoom(value){
  if(!Number.isFinite(Number(value)))return worldZoom;
  worldZoom=snapZoom(Math.max(.25,Math.min(8,Number(value))));updateZoomButtons();
  try{localStorage.setItem('neoclonk.zoom',String(worldZoom));}catch{/* Optional preference. */}
  scheduleView();return worldZoom;
 }
 for(const [id,direction]of [['zoom-out',-1],['zoom-in',1]])$(id).onclick=()=>{
  setZoom(zoomLevels[Math.max(0,Math.min(zoomLevels.length-1,zoomLevels.indexOf(worldZoom)+direction))]);canvas.focus();
 };
 $('game-header').addEventListener('selectstart',event=>event.preventDefault());
 $('game-save').onclick=saveGame;
 new ResizeObserver(scheduleView).observe($('stage'));window.visualViewport?.addEventListener('resize',scheduleView);window.addEventListener('orientationchange',scheduleView);
 const controlIndices={KeyQ:0,KeyW:1,KeyE:2,KeyA:3,KeyS:4,KeyD:5,KeyZ:6,KeyY:6,KeyX:7,KeyC:8,KeyR:9,KeyV:10,KeyF:11};
 const keyCodes={KeyY:89,KeyQ:81,KeyW:87,KeyE:69,KeyA:65,KeyS:83,KeyD:68,KeyZ:90,KeyX:88,KeyC:67,KeyR:82,KeyV:86,KeyF:70,Pause:19,Escape:27,Enter:13,F9:120};
 const pressed=new Set();
 // Resolve through the active player's original configuration, including QWERTZ.
 function control(index,down,repeated=false){
  if(!ready||failed||!window.Module?._nc_browser_control)return -1;
  const player=JSON.parse(window.Module.ccall('nc_browser_state','string',[],[])).players.find(p=>p.local&&!p.eliminated);
  if(!player)return -1;
  return window.Module.ccall('nc_browser_control','number',['number','number','number','number'],[player.number,index,Number(down),Number(repeated)]);
 }
 function key(code,down){
  if(!booted||failed||exited)return false;
  if(down===pressed.has(code))return false;
  const keyCode=keyCodes[code];if(!keyCode)throw Error('Unsupported original key: '+code);
  down?pressed.add(code):pressed.delete(code);
  if(code==='Pause'&&session){if(down)window.__neoclonkMultiplayer.setPaused(!window.__neoclonkMultiplayer.getState().localPaused);return true;}
  if(code in controlIndices)return control(controlIndices[code],down)>=0;
  canvas.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:code,code,keyCode,which:keyCode,bubbles:true,cancelable:true,repeat:false}));return true;
 }
 window.addEventListener('keydown',event=>{if(session&&ready&&document.activeElement===canvas&&(event.code==='Pause'||event.key==='Pause')){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)window.__neoclonkMultiplayer.setPaused(!window.__neoclonkMultiplayer.getState().localPaused);}},true);
 // Hardware Y and Z are aliases for the configured Left action. Only consume
 // events handled by the original gameplay dispatcher; GUI text input stays native.
 const hardwareLeft=new Set();
 for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{
  if(!ready||failed||($('help')&&!$('help').hidden)||document.activeElement!==canvas||event.ctrlKey||event.altKey||event.metaKey)return;
  if(!['y','z'].includes(event.key.toLowerCase()))return;
  const down=type==='keydown',id=event.code||event.key;
  if(!down&&!hardwareLeft.has(id))return;
  const handled=control(6,down,event.repeat);
  if(down&&handled!==1)return;
  down?hardwareLeft.add(id):hardwareLeft.delete(id);
  event.preventDefault();event.stopImmediatePropagation();
 },true);
 function releaseAll(){if(hardwareLeft.size){control(6,false);hardwareLeft.clear();}for(const code of [...pressed])key(code,false);pressed.clear();document.querySelectorAll('#touchpad .active').forEach(button=>button.classList.remove('active'));}
 function tap(code){key(code,true);setTimeout(()=>key(code,false),50);}
 const touchHolds=new Map();
 function bindTouch(button){
  button.addEventListener('pointerdown',event=>{event.preventDefault();if(!ready)return;canvas.focus();button.setPointerCapture(event.pointerId);touchHolds.set(event.pointerId,button.dataset.code);button.classList.add('active');key(button.dataset.code,true);});
  const end=event=>{event.preventDefault();const code=touchHolds.get(event.pointerId);if(!code)return;touchHolds.delete(event.pointerId);if(![...touchHolds.values()].includes(code)){key(code,false);button.classList.remove('active');}};
  button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);button.addEventListener('contextmenu',event=>event.preventDefault());
 }
 for(const button of document.querySelectorAll('#touchpad button'))bindTouch(button);
 const coarse=matchMedia('(pointer: coarse)');
 let touchWanted=coarse.matches||query.get('touch')==='1',menuWasPaused=false;
 function showTouch(show){touchWanted=show;$('touchpad').hidden=!ready||state.phase!=='playing'||!show;scheduleView();}
 coarse.addEventListener('change',()=>showTouch(coarse.matches||query.get('touch')==='1'));
 const touch=NeoclonkTouch.create({pad:$('touchpad'),enabled:()=>ready&&!failed&&!exited&&!window.__planetHost&&!$('touchpad').hidden,
  read:()=>window.Module?._nc_browser_touch?JSON.parse(window.Module.ccall('nc_browser_touch','string',[],[])):null,
  bind:bindTouch,release:code=>key(code,false),changed:scheduleView});
 showTouch(touchWanted);
 function openMenu(){if(!ready)return;releaseAll();const game=JSON.parse(window.Module.ccall('nc_browser_state','string',[],[]));menuWasPaused=game.paused;if(session)window.__neoclonkMultiplayer.setPaused(true);else if(!menuWasPaused)window.Module.ccall('nc_browser_pause','number',['number'],[1]);phase('menu');cover.hidden=false;$('start').disabled=false;if(!window.__scenarioGallery?.getSelected())window.__scenarioGallery?.select(launchScenario.id);window.__scenarioGallery?.updateActions();showTouch(touchWanted);refreshSavedGames();$('start').focus();}
 function resumeGame(){if(!ready)return;if(session)window.__neoclonkMultiplayer.setPaused(false);else if(!menuWasPaused)window.Module.ccall('nc_browser_pause','number',['number'],[0]);phase('playing');cover.hidden=true;showTouch(touchWanted);canvas.focus();}
 $('main-menu').onclick=openMenu;
 $('new-game').onclick=()=>{if(ready&&selectedScenarioId!==launchScenario?.id)resumeGame();else startScenario(selectedScenarioId,null,{solo:ready&&!session});};
 let pendingLeave=null,leaveBusy=false;
 function requestLeave(action,title='Leave current game?'){
  if(!ready)return action();if(pendingLeave)return;
  const returnToGame=state.phase==='playing';if(returnToGame)openMenu();
  pendingLeave={action,returnToGame};$('leave-title').textContent=title;
  $('leave-description').textContent=session?'Leaving disconnects you from this multiplayer game. Connected rounds cannot be saved yet.':'Save your current round before leaving?';
  const verb=title.startsWith('Exit ')?'exit':title.startsWith('Start ')?'start':title.startsWith('Load ')?'load':'continue';
  $('leave-save').textContent='Save and '+verb;$('leave-discard').textContent=session?'Leave game':verb[0].toUpperCase()+verb.slice(1)+' without saving';$('leave-save').hidden=!!session;$('leave-error').textContent='';$('leave-dialog').showModal();$('leave-cancel').focus();
 }
 function cancelLeave(){if(leaveBusy||!pendingLeave)return;const back=pendingLeave.returnToGame;pendingLeave=null;$('leave-dialog').close();if(back)resumeGame();}
 async function finishLeave(save){
  if(leaveBusy||!pendingLeave)return;leaveBusy=true;for(const b of $('leave-dialog').querySelectorAll('button'))b.disabled=true;
  try{
   if(save&&!await saveGame()){$('leave-error').textContent=$('save-feedback').textContent||'Could not save. Your current game is still open.';return;}
   const action=pendingLeave.action;pendingLeave=null;$('leave-dialog').close();await action();
  }catch(error){setStatus(error.message||String(error));}
  finally{leaveBusy=false;for(const b of $('leave-dialog').querySelectorAll('button'))b.disabled=false;}
 }
 $('game-exit').onclick=()=>requestLeave(()=>restart(),'Exit current game?');
 $('leave-cancel').onclick=cancelLeave;$('leave-save').onclick=()=>finishLeave(true);$('leave-discard').onclick=()=>finishLeave(false);
 $('leave-dialog').addEventListener('cancel',event=>{event.preventDefault();cancelLeave();});
 const closeHelp=()=>{if($('help'))$('help').hidden=true;(ready&&state.phase==='playing'?canvas:$('start')).focus();};
 $('saves-open').onclick=()=>{refreshSavedGames();$('saved-dialog').showModal();};
 $('saves-close').onclick=()=>$('saved-dialog').close();
 if($('help-open'))$('help-open').onclick=()=>{$('help').hidden=false;$('help-close').focus();};
 if($('help-close'))$('help-close').onclick=closeHelp;
 window.addEventListener('keydown',event=>{if($('help')&&!$('help').hidden){if(event.key==='Escape'){event.preventDefault();closeHelp();}event.stopImmediatePropagation();return;}if(!cover.hidden){if(event.target===canvas)event.stopImmediatePropagation();return;}if(ready&&document.activeElement===canvas&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(event.code))event.preventDefault();},true);
 window.addEventListener('keyup',event=>{if((!cover.hidden&&event.target===canvas)||($('help')&&!$('help').hidden))event.stopImmediatePropagation();},true);
 window.addEventListener('blur',()=>{releaseAll();touchHolds.clear();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseAll();touchHolds.clear();syncSaves();}});
 window.addEventListener('pagehide',()=>syncSaves());
 canvas.addEventListener('pointerdown',()=>canvas.focus());canvas.addEventListener('contextmenu',event=>event.preventDefault());
 window.addEventListener('error',event=>{if(booted&&!failed)fail(event.message||'Unexpected engine error.');});
 window.addEventListener('unhandledrejection',event=>{if(booted&&!failed)fail(event.reason?.stack||event.reason||'Unexpected engine rejection.');});
 function planetURL(scenarioId,save=null){const url=new URL('../planet/index.html',location.href);if(scenarioId)url.searchParams.set('scenario',scenarioId);if(save)url.searchParams.set('save',save);return url;}
 async function loadRound(name){if(name.startsWith('planet:')){const go=()=>location.assign(planetURL(null,name.slice(7)));if(booted)return requestLeave(go,'Load saved Planet game?');return go();}if(!booted){state.replay=false;return startGame(name);}return requestLeave(()=>restart({save:name,load:'1'}),'Load saved game?');}
 async function restart(options={}){if(exitSync)await exitSync;else await syncSaves();window.__neoclonkMultiplayer?.disconnect();const next=new URL(location.href);for(const key of ['scenario','save','replay','load','play','solo','host','join','room','lobby'])next.searchParams.delete(key);for(const [key,value]of Object.entries(options))next.searchParams.set(key,value);location.assign(next);}
 // Solo uses original one-player engine startup; scenario rules and goals stay intact.
 async function startScenario(id,networkSession=null,{solo=false}={}){
  await library.ready;const scenario=library.get(id);selectedScenarioId=scenario.id;window.__scenarioGallery?.select(scenario.id);
  if(library.isBlocked(scenario)){setStatus(scenario.blockedReason||'This scenario needs additional content.');return false;}
  if(scenario.engine==='openclonk'){setStatus('This scenario requires the separate OpenClonk engine.');return false;}
  const host=!solo&&scenario.minPlayers>1;
  if(booted)return requestLeave(()=>restart({scenario:id,[host?'host':'play']:'1',...(solo?{solo:'1'}:{})}),'Start '+scenario.title+'?');
  if(host&&!networkSession){window.__neoclonkMultiplayer.host(id);return;}
  if(!networkSession)window.__neoclonkMultiplayer?.disconnect();
  if(scenario.engine==='planet'){if(networkSession)return startPlanetRoom(scenario,networkSession);location.assign(planetURL(id));return;}
  state.replay=false;return startGame(null,scenario,networkSession);
 }
 // The room stays in this document while its separate Planet engine runs in a
 // same-origin frame. Only the selected engine allocates a WASM heap.
 function startPlanetRoom(scenario,networkSession){
  booted=true;session=networkSession;launchScenario=scenario;state.scenarioId=scenario.id;state.multiplayer=true;phase('loading');
  const frame=document.createElement('iframe');frame.id='planet-game';frame.title='Clonk Planet';frame.allow='autoplay; fullscreen';frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:25;background:#080a06';
  window.__planetHost={session,notice(text){frame.contentWindow.__planetBrowser?.message(text);},ready(module){window.Module=module;ready=true;state.ready=true;phase('playing');cover.hidden=true;$('game-header').hidden=true;$('touchpad').hidden=true;window.__neoclonkMultiplayer.engineReady();},failed(error){fail(error);},exit(){window.__neoclonkMultiplayer.disconnect();location.assign(new URL('index.html',location.href));}};
  const url=planetURL(scenario.id);url.searchParams.set('network','1');frame.src=url;document.body.append(frame);
 }
 async function startGame(save=null,scenario=null,networkSession=null){
  if(booted){if(ready)resumeGame();return;}const menuScenario=scenario||library.find(savedScenarioMeta[save]?.scenarioId)||library.find(selectedScenarioId);if(menuScenario)window.__scenarioGallery?.select(menuScenario.id);booted=true;selectedSave=save;session=networkSession;phase('loading');$('start').disabled=true;$('play-solo').disabled=true;$('host-room').disabled=true;$('load-save').disabled=true;$('start').textContent='Loading…';setStatus('Preparing scenario…');canvas.focus();
  try{await library.ready;await savedIndexReady;launchScenario=scenario||library.find(savedScenarioMeta[save]?.scenarioId)||library.get(selectedScenarioId);selectedScenarioId=launchScenario.id;state.scenarioId=launchScenario.id;state.multiplayer=!!session;
   const packs=save?(savedScenarioMeta[save]?.requiredPacks||library.allPacks):launchScenario.requiredPacks;
   stagedPacks=await library.fetchPacks(packs,(done,total)=>setStatus(total?'Preparing original content ('+done+'/'+total+')…':'Loading '+launchScenario.title+'…'));
  }catch(error){fail(error.message);return;}
  const size=screenSize();canvas.width=size.width;canvas.height=size.height;
  const players=session?session.players.map((_,i)=>'/data/session/Player'+(i+1)+'.c4p'):['/data/home/players/Browser.c4p'];
  window.Module={canvas,keyboardListeningElement:canvas,neoclonkAudioSampleRate:matchMedia('(pointer:coarse)').matches?24000:0,thisProgram:'/data/clonk',arguments:['/config:/data/home/browser.cfg','/fullscreen','/nosplash',...players,state.replay?'verification/NativeGoldmine.c4s':launchScenario.path],locateFile:assetUrl,print:log,printErr:(...args)=>log('[engine]',...args),setStatus,
   monitorRunDependencies:remaining=>{downloadTotal=Math.max(downloadTotal,remaining);setStatus(remaining?`Loading ${launchScenario.title} (${Math.round((downloadTotal-remaining)/downloadTotal*100)}%)…`:'Starting '+launchScenario.title+'…');},preRun:[initializeStorage],
   onRuntimeInitialized:()=>{initializePlayer();setStatus('Starting '+launchScenario.title+'…');},onAbort:reason=>fail('WebAssembly abort: '+reason),
   onExit:code=>{exited=true;ready=false;state.ready=false;clearInterval(syncTimer);cancelAnimationFrame(viewFrame);viewFrame=0;releaseAll();window.__neoclonkMultiplayer?.disconnect();flushAfterExit();if(code){const reason=[...logs].reverse().find(line=>/FATAL ERROR|Access to this mission|ERROR:/i.test(line));fail(reason||'The original engine could not open this scenario (exit '+code+').');return;}if(!failed){phase('ended');cover.hidden=false;$('title').textContent='Round ended';$('intro').textContent='Choose another scenario or load a saved round.';$('start').hidden=true;$('new-game').hidden=false;refreshSavedGames();showTouch(touchWanted);setStatus('');log('Engine exited',code);}}
  };
  const script=document.createElement('script');script.src=assetUrl('clonk.js');script.onerror=()=>fail('The game could not download. Reload to try again.');document.body.append(script);
 }
 window.addEventListener('scenario-select',event=>{selectedScenarioId=event.detail.id;state.selectedScenarioId=selectedScenarioId;});
 $('start').onclick=()=>{if(ready&&state.phase==='menu'&&selectedScenarioId===launchScenario?.id){resumeGame();return;}startScenario(selectedScenarioId);};
 $('play-solo').onclick=()=>startScenario(selectedScenarioId,null,{solo:true});
 $('load-save').onclick=async()=>{const name=$('saved-games').value;if(!name)return;$('saved-dialog').close();loadRound(name);};
 window.__rageBrowser={getState:()=>({...state,ready,booted,selectedScenarioId,zoom:worldZoom,logs:[...logs],canvas:{width:canvas.width,height:canvas.height}}),press:code=>key(code,true),release:code=>key(code,false),tap,pause:()=>tap('Pause'),releaseAll,readFile:path=>Array.from(window.Module.FS.readFile(path)),listFiles:path=>window.Module.FS.readdir(path),showTouch,syncSaves,listSavedGames,openMenu,saveGame,updateView,setZoom,startScenario,restart:options=>requestLeave(()=>restart(options))};
 phase('menu');refreshSavedGames();
 const savedIndexReady=Promise.all([readSavedIndex(),(async()=>{try{planetSaves=await window.NeoclonkLocal?.saves()||[];refreshSavedGames();}catch{/* Planet saves are optional. */}})()]);Promise.all([savedIndexReady,library.ready]).then(()=>{if(query.get('load')==='1'&&query.get('save'))loadRound(query.get('save'));else if(query.get('play')==='1')startScenario(selectedScenarioId,null,{solo:query.get('solo')==='1'});else if(query.get('host')==='1')window.__neoclonkMultiplayer.host(selectedScenarioId);else if(query.get('join')==='1')window.__neoclonkMultiplayer.join();else if(query.get('lobby')==='1')window.__neoclonkMultiplayer.chooser();}).catch(error=>{setStatus(error.message);$('start').disabled=true;});
})();

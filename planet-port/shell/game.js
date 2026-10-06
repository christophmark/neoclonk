'use strict';
(async()=>{
 const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),canvas=$('canvas');
 const host=query.get('network')==='1'&&parent!==window&&parent.location.origin===location.origin?parent.__planetHost:null,session=host?.session;
 const log=[],pressed=new Set(),keys={KeyQ:0,KeyW:1,KeyE:2,KeyA:3,KeyS:4,KeyD:5,KeyY:6,KeyZ:6,KeyX:7,KeyC:8,KeyV:10,KeyF:11};
 let ready=false,failed=false,scenario,catalog,saveBusy=false,feedbackTimer,zoom=2,leaving=false;
 const coarse=matchMedia('(pointer:coarse)'),steps=[.25,.5,1,2,3,4,5,6,7,8];
 try{const stored=Number(localStorage.getItem('neoclonk.planet.zoom'));if(steps.includes(stored))zoom=stored;}catch{}
 const call=(name,type='number',types=[],args=[])=>Module.ccall('nc_planet_'+name,type,types,args);
 const state=()=>window.Module?.calledRun?JSON.parse(call('state','string')):{ready:false,running:false,players:[]};
 function message(text){$('feedback').textContent=text;$('feedback').hidden=false;clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>$('feedback').hidden=true,4500);}
 function fail(error){if(failed)return;failed=true;ready=false;$('cover').hidden=false;$('header').hidden=true;$('touchpad').hidden=true;$('status').textContent=String(error.message||error);$('log').hidden=false;$('log').textContent=log.join('\n');host?.failed(String(error.message||error));}
 function print(...args){const line=args.join(' ');log.push(line);if(log.length>300)log.shift();console.log('[Planet]',line);if(/Game (started|resumed)/i.test(line)){ready=true;$('cover').hidden=true;$('header').hidden=false;$('touchpad').hidden=!coarse.matches;canvas.focus();touch.refresh();resize();setTimeout(resize,100);if(session){$('save').disabled=true;$('save').title='Connected rounds cannot be saved.';setTimeout(()=>host.ready(Module),0);}}}
 function resize(){if(!ready)return;const r=$('world').getBoundingClientRect(),pad=$('touchpad').getBoundingClientRect();if(Module._nc_planet_view)call('view','number',Array(7).fill('number'),[Math.round(r.width),Math.round(r.height),zoom,$('touchpad').hidden?0:Math.round(pad.left-r.left),Math.round(pad.top-r.top),$('touchpad').hidden?0:Math.round(pad.width),Math.round(pad.height)]);$('zoom-out').disabled=zoom===steps[0];$('zoom-in').disabled=zoom===steps.at(-1);}
 function control(code,down){if(!ready||failed||!(code in keys)||down===pressed.has(code))return;down?pressed.add(code):pressed.delete(code);const player=state().players.find(p=>p.local&&!p.eliminated);if(player)call('control','number',Array(4).fill('number'),[player.number,keys[code],Number(down),0]);}
 function releaseAll(){for(const code of [...pressed])control(code,false);}
 const labels=[['Q','Previous','KeyQ'],['W','Select','KeyW'],['E','Next','KeyE'],['A','Throw','KeyA'],['S','Up / Jump','KeyS'],['D','Dig','KeyD'],['Y/Z','Left','KeyY'],['X','Stop','KeyX'],['C','Right','KeyC']];
 const touchHolds=new Map();
 function bindTouch(b){
  b.onpointerdown=e=>{e.preventDefault();if(!ready)return;b.setPointerCapture(e.pointerId);touchHolds.set(e.pointerId,b.dataset.code);control(b.dataset.code,true);};
  b.onpointerup=b.onpointercancel=b.onlostpointercapture=e=>{e.preventDefault();const code=touchHolds.get(e.pointerId);if(!code)return;touchHolds.delete(e.pointerId);if(![...touchHolds.values()].includes(code))control(code,false);};
  b.oncontextmenu=e=>e.preventDefault();
 }
 for(const [glyph,label,code]of labels){const b=document.createElement('button');b.type='button';b.dataset.code=code;b.setAttribute('aria-label',label);const big=document.createElement('b');big.textContent=glyph;b.append(big,document.createTextNode(label==='Previous'?'Prev':label));bindTouch(b);$('touchpad').append(b);}
 const touch=NeoclonkTouch.create({pad:$('touchpad'),enabled:()=>ready&&!failed&&!$('touchpad').hidden&&!$('leave').open,
  read:()=>Module._nc_browser_touch?JSON.parse(Module.ccall('nc_browser_touch','string',[],[])):null,
  bind:bindTouch,release:code=>control(code,false),changed:resize});
 window.addEventListener('keydown',e=>{if($('leave').open||!ready)return;if(e.code in keys){e.preventDefault();e.stopImmediatePropagation();control(e.code,true);}else if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();requestLeave();}else if(e.code==='Pause'){e.preventDefault();e.stopImmediatePropagation();pause(!paused());}},true);
 window.addEventListener('keyup',e=>{if(e.code in keys){e.preventDefault();e.stopImmediatePropagation();control(e.code,false);}},true);
 window.addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});canvas.oncontextmenu=e=>e.preventDefault();canvas.onpointerdown=()=>canvas.focus();
 new ResizeObserver(resize).observe($('stage'));coarse.addEventListener('change',()=>{$('touchpad').hidden=!ready||!coarse.matches;resize();});
 for(const [id,direction]of [['zoom-out',-1],['zoom-in',1]])$(id).onclick=()=>{zoom=steps[Math.max(0,Math.min(steps.length-1,steps.indexOf(zoom)+direction))];try{localStorage.setItem('neoclonk.planet.zoom',zoom);}catch{}resize();};
 function paused(){return session?!!parent.__neoclonkMultiplayer.getState()?.localPaused:state().paused;}
 function pause(value){if(session)parent.__neoclonkMultiplayer.setPaused(value);else call('pause','number',['number'],[Number(value)]);}
 async function save(){if(!ready||saveBusy||session)return false;saveBusy=true;$('save').disabled=true;try{if(call('save')!==1)throw Error('The original engine could not save this round.');const bytes=Module.FS.readFile('/data/BrowserSave.c4s');await NeoclonkLocal.save(scenario,bytes);message('Game saved on this device');return true;}catch(e){message(e.message);return false;}finally{saveBusy=false;$('save').disabled=false;}}
 function exit(){call('exit');if(host)host.exit();else location.assign('../rage/index.html');}
 let previouslyPaused=false;
 function requestLeave(){if(!ready)return exit();releaseAll();previouslyPaused=paused();pause(true);$('save-leave').hidden=!!session;$('leave-description').textContent=session?'Leaving disconnects you from this round.':'Save your progress before returning to the scenarios.';$('leave').showModal();}
 $('save').onclick=save;$('exit').onclick=requestLeave;
 $('save-leave').onclick=async()=>{if(leaving)return;leaving=true;if(await save())exit();else leaving=false;};$('discard-leave').onclick=exit;$('cancel-leave').onclick=()=>{$('leave').close();pause(previouslyPaused);};$('leave').oncancel=()=>pause(previouslyPaused);
 window.__planetBrowser={state,save,message,control,releaseAll,logs:log,setZoom(value){if(steps.includes(value)){zoom=value;resize();}}};
 try{
  const response=await fetch('../rage/catalog/extensions.json?v=planet-1');if(!response.ok)throw Error('The Planet catalog could not load.');catalog=await response.json();
  const loaded=query.get('save')?await NeoclonkLocal.get('saves',query.get('save')):null;
  scenario=catalog.scenarios.find(s=>s.id===(loaded?.scenarioId||query.get('scenario')));if(!scenario||scenario.engine!=='planet')throw Error('This Planet scenario is unavailable.');
  if(['blocked','missing-dependencies','unsupported-engine','runtime-incompatible'].includes(scenario.availability))throw Error(scenario.blockedReason||'A required content pack is missing.');$('title').textContent=scenario.title;
  const packs=[];for(const id of [...new Set(scenario.requiredPacks)]){const p=catalog.packs.find(p=>p.filename===id);if(!p)throw Error('Missing pack: '+id);let bytes;const local=await NeoclonkLocal.get('packs',p.sha256);if(local)bytes=await NeoclonkLocal.bytes(local.bytes);else{if(p.localOnly&&!catalog.privateDistribution)throw Error('Import your community collection from the main menu first.');const response=await fetch(new URL('../rage/'+p.url,location.href));if(!response.ok)throw Error('Could not download '+p.mountPath);bytes=new Uint8Array(await response.arrayBuffer());}if(bytes.length!==p.bytes)throw Error('Incomplete pack: '+p.mountPath);if(crypto.subtle){const digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==p.sha256)throw Error('Pack checksum mismatch: '+p.mountPath);}packs.push({p,bytes});$('status').textContent='Loading '+scenario.title+' ('+packs.length+'/'+scenario.requiredPacks.length+')…';}
  let saveBytes=loaded?await NeoclonkLocal.bytes(loaded.bytes):null;
  const players=session?session.players.map((_,i)=>'Player'+(i+1)+'.c4p'):['Browser.c4p'];
  window.Module={canvas,arguments:[loaded?'/data/LoadedSave.c4s':scenario.path,'Objects.c4d',...players],locateFile:p=>p+'?v=adaptive-touch-1',print,printErr:print,onAbort:reason=>fail(Error('Planet engine: '+reason)),onExit:code=>{if(code)fail(Error('The scenario could not start (code '+code+').'));},onRuntimeInitialized(){const fs=Module.FS;try{if(session){for(let i=0;i<session.players.length;i++){const path='/data/'+players[i],name=String(session.players[i].name||'Player '+(i+1)).replace(/[\r\n\0=\[\]]/g,'').slice(0,30);fs.mkdirTree(path);fs.writeFile(path+'/Player.txt','[Player]\r\nName='+name+'\r\n[Preferences]\r\nColor='+i+'\r\nControl=0\r\nAutoStopControl=0\r\nAutoContextMenu=0\r\nMouse=0\r\n');}if(Module.ccall('nc_browser_net_configure','number',['number','number','number'],[session.seed,session.localPlayerIndex,session.players.length])!==1)throw Error('Could not prepare the Planet multiplayer round.');}for(const {p,bytes}of packs)fs.writeFile('/data/'+p.mountPath,bytes);packs.length=0;if(saveBytes){fs.writeFile('/data/LoadedSave.c4s',saveBytes);saveBytes=null;}const access=catalog.scenarios.filter(s=>s.engine==='planet').map(s=>s.missionAccess).filter(Boolean).join(';');let ini=fs.readFile('/data/clonk.ini',{encoding:'utf8'}).replace('[General]','[General]\nMissionAccess='+access);fs.writeFile('/data/clonk.ini',ini.replace(/\r?\n/g,'\r\n'));}catch(error){fail(error);throw error;}}};
  canvas.width=Math.max(320,innerWidth);canvas.height=Math.max(240,innerHeight);const script=document.createElement('script');script.src='planet.js?v=adaptive-touch-1';script.onerror=()=>fail(Error('The Planet engine could not download.'));document.body.append(script);
 }catch(error){fail(error);}
})();

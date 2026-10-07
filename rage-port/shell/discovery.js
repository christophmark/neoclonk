'use strict';
// Temporary room discovery and signaling only. Original game packets never use this API.
(() => {
 const $=id=>document.getElementById(id),transport=window.__neoclonkRoomTransport,lib=window.__scenarioLibrary;
 const config=window.__neoclonkDiscoveryConfig||{},service=String(config.serviceUrl||'').replace(/\/$/,'');
 const directServers=(config.stunServers||[]).map(s=>({urls:[s.urls].flat().filter(u=>/^stuns?:/i.test(u))})).filter(s=>s.urls.length);
 const directTimeout=12000,relayTimeout=30000,pollDelay=5000;
 let active=null,revision=0,listBusy=false,listFetchedAt=0,autoJoined=false,lobbyBusy=false;
 const current=s=>active===s&&!s.stopped&&transport.getRoom()===s.owner&&!s.owner.started;
 function setStatus(message){transport.status(message);}
 function online(){if(!service)throw Error('Online discovery is not configured yet. Advanced manual invitations are available.');}
 function credentials(){return {version:lib.version,catalog:lib.catalog.catalogDigest};}
 async function request(action,data={},session=null,{keepalive=false}={}){
  online();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  if(session&&!keepalive)session.controllers.add(controller);
  try{
   const response=await fetch(service+'/api/lobby',{method:'POST',headers:{'Content-Type':'application/json',...(session?.token?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify({action,...data}),cache:'no-store',credentials:'omit',signal:controller.signal,keepalive});
   let result;try{result=await response.json();}catch{throw Error('The room service returned an unreadable response.');}
   if(!response.ok){const error=Error(result.error||'The room service is unavailable.');error.code=result.code;error.status=response.status;error.retryAfter=Math.max(5,Number(result.retryAfter)||Number(response.headers.get('Retry-After'))||30);throw error;}
   return result;
  }catch(error){error.serviceFailure=true;throw error;}finally{clearTimeout(timeout);session?.controllers.delete(controller);}
 }
 function invoke(fn){return async()=>{const generation=revision;try{await fn();}catch(error){if(generation===revision&&error.name!=='AbortError')setStatus(error.message||String(error));}};}
 function inviteLink(code){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('join','1');url.searchParams.set('room',code);return url.href;}
 function showSession(s){$('discovery-host').hidden=true;$('discovery-guest').hidden=true;$('discovery-invite').hidden=false;$('room-code-display').textContent=s.code;$('room-link').value=inviteLink(s.code);$('room-manual').open=false;$('room-manual').hidden=true;$('room-connection-kind').textContent='Connecting to your crew…';transport.render();}
 function makeSession(result,host,owner){
  const s={code:result.code,token:result.token,host,owner,room:result.room,slot:result.slot,rtcToken:result.rtcToken,peers:new Map(),controllers:new Set(),pollTimer:0,stopped:false,polling:false};
  active=s;showSession(s);return s;
 }
 function clearPeer(p){clearTimeout(p.timeout);p.timeout=0;}
 function clear(s){s.stopped=true;clearTimeout(s.pollTimer);for(const p of s.peers.values())clearPeer(p);for(const c of s.controllers)c.abort();s.controllers.clear();}
 function leave(){revision++;listBusy=false;lobbyBusy=false;const previous=active;active=null;if(previous){clear(previous);if(!previous.started)request('leave',{code:previous.code},previous,{keepalive:true}).catch(()=>{});} }
 function open(host){
  for(const id of ['room-publish','room-join-code','room-refresh'])$(id).disabled=false;
  $('room-manual').hidden=false;$('room-manual').open=false;$('discovery-host').hidden=!host;$('discovery-guest').hidden=host;$('discovery-invite').hidden=true;$('room-connection-kind').textContent='';$('room-code-display').textContent='';$('room-link').value='';$('room-list').replaceChildren();$('room-code-input').value='';
  if(!service){$('discovery-host').hidden=true;$('discovery-guest').hidden=true;$('room-manual').open=true;setStatus('Connect using an invitation and reply.');$('room-publish').disabled=true;$('room-join-code').disabled=true;$('room-refresh').disabled=true;return;}
  if(host){setStatus('');return;}
  const code=new URLSearchParams(location.search).get('room');
  if(code&&!autoJoined){autoJoined=true;$('room-code-input').value=code;invoke(()=>join(code))();}else{setStatus('Choose an open room or enter a code from your friend.');invoke(()=>refresh(true))();}
 }
 async function create(){
  online();const owner=transport.getRoom();if(!owner?.host||owner.started||active||lobbyBusy)return;
  const generation=revision;lobbyBusy=true;$('room-publish').disabled=true;
  try{const result=await request('create',{name:transport.name(),scenario:owner.scenario.id,...credentials(),maxPlayers:Math.min(12,owner.scenario.maxPlayers),visibility:$('room-public').checked?'public':'private'});
   if(generation!==revision||transport.getRoom()!==owner){request('leave',{code:result.code},{token:result.token,controllers:new Set()},{keepalive:true}).catch(()=>{});return;}
   const s=makeSession(result,true,owner);setStatus('Room open. Share the code or link, and keep this tab open.');schedule(s,0);
  }finally{if(generation===revision){lobbyBusy=false;$('room-publish').disabled=false;}}
 }
 async function join(code){
  online();const owner=transport.getRoom();if(!owner||owner.host||owner.started||active||lobbyBusy)return;
  code=String(code||$('room-code-input').value).trim().toUpperCase();if(!/^[A-Z0-9]{4,10}$/.test(code))throw Error('Enter the room code from your host.');
  const generation=revision;lobbyBusy=true;$('room-join-code').disabled=true;
  try{const result=await request('join',{code,name:transport.name(),...credentials()});
   if(generation!==revision||transport.getRoom()!==owner){request('leave',{code:result.code},{token:result.token,controllers:new Set()},{keepalive:true}).catch(()=>{});return;}
   const s=makeSession(result,false,owner);owner.scenario=lib.get(result.room.scenario);if(!owner.scenario){leave();throw Error('This scenario is unavailable in your game version.');}$('room-scenario').textContent=owner.scenario.title;transport.render();setStatus('Waiting for the host to connect…');schedule(s,0);
  }finally{if(generation===revision){lobbyBusy=false;$('room-join-code').disabled=false;}}
 }
 async function refresh(force=false){
  online();if(listBusy||active)return;if(!force&&Date.now()-listFetchedAt<10000)return;
  const generation=revision;listBusy=true;$('room-refresh').disabled=true;$('room-list-status').textContent='Looking for open rooms…';
  try{const result=await request('list',credentials());if(generation!==revision||active)return;listFetchedAt=Date.now();$('room-list').replaceChildren();const rooms=result.rooms||[];$('room-list-status').textContent=rooms.length?'Choose a room to join.':'No open rooms yet. Ask a friend to create one.';
   for(const r of rooms){const scenario=lib.get(r.scenario);if(!scenario)continue;const li=document.createElement('li'),button=document.createElement('button');button.className='small-button';button.type='button';button.textContent=`${r.name} · ${scenario.title} · ${r.players}/${r.maxPlayers}`;button.onclick=invoke(()=>join(r.code));li.append(button);$('room-list').append(li);}
  }catch(error){if(generation===revision)$('room-list-status').textContent=error.message;}
  finally{if(generation===revision){listBusy=false;$('room-refresh').disabled=false;}}
 }
 function schedule(s,delay=pollDelay){if(!current(s)||(!s.host&&[...s.peers.values()].some(p=>p.connected)))return;clearTimeout(s.pollTimer);s.pollTimer=setTimeout(()=>poll(s),Math.max(delay,(s.retryAt||0)-Date.now()));}
 async function poll(s){
  if(!current(s)||s.polling)return;s.polling=true;let next=document.hidden?15000:pollDelay;
  try{const result=await request('poll',{code:s.code,...(s.host?{connectedPeers:[...s.peers.values()].filter(p=>transport.connected(p.slot)).map(p=>({slot:p.slot,rtcToken:p.rtcToken}))}:{})},s);if(!current(s))return;s.room=result.room;
   const records=s.host?result.guests:[result],seen=new Set(records.map(p=>p.slot));
   if(s.host)for(const [slot,p] of s.peers)if(!seen.has(slot)){clearPeer(p);s.peers.delete(slot);transport.remove(slot);}
   await Promise.all(records.map(record=>processPeer(s,record)));
  }catch(error){if(!current(s)||error.name==='AbortError')return;
   if([401,403,404,410].includes(error.status)){clear(s);setStatus('This room has closed or expired. Leave the lobby and create or join a new room.');return;}
   next=Math.min(3600000,Math.max(next,(error.retryAfter||10)*1000));s.retryAt=Date.now()+next;setStatus(error.message+' Retrying shortly.');
  }finally{s.polling=false;if(current(s))schedule(s,next);}
 }
 function isPeer(s,p){return current(s)&&s.peers.get(p.slot)===p;}
 async function fallback(s,p){
  if(!isPeer(s,p)||transport.connected(p.slot)||p.relayRequested||p.generation!==0)return;
  p.relayRequested=true;clearPeer(p);setStatus('The direct connection did not open. Trying the relay…');
  try{await request('signal',{code:s.code,...(s.host?{slot:p.slot}:{}),kind:'relay',generation:0},s);if(isPeer(s,p))schedule(s,0);}
  catch(error){if(!isPeer(s,p)||error.name==='AbortError')return;p.failed=true;setStatus(error.message+' Leave the lobby to try again.');}
 }
 function arm(s,p){if(!isPeer(s,p)||p.timeout||transport.connected(p.slot))return;p.timeout=setTimeout(()=>{p.timeout=0;if(!isPeer(s,p)||transport.connected(p.slot))return;if(p.generation===0)fallback(s,p);else{p.failed=true;setStatus('The relay connection could not open. Leave the lobby to try again.');}},p.generation===0?directTimeout:relayTimeout);}
 async function processPeer(s,record){
  if(!current(s)||!Number.isInteger(record.slot)||record.slot<1||record.slot>=12)return;
  let p=s.peers.get(record.slot);if(p&&(p.generation!==record.generation||p.rtcToken!==record.rtcToken)){clearPeer(p);transport.remove(p.slot);s.peers.delete(p.slot);p=null;}
  if(!p){p={slot:record.slot,generation:record.generation,rtcToken:record.rtcToken,timeout:0,busy:false,offerSent:false,answerSent:false,answerAccepted:false,relayRequested:false,failed:false,connected:false,kind:null};s.peers.set(p.slot,p);}
  if(p.closed){if(s.host)await dropPeer(s,p);return;}if(p.busy||p.failed)return;
  if(transport.connected(p.slot)){if(!p.connected)connected(p.slot);return;}
  p.busy=true;
  try{
   let servers=directServers;
   if(p.generation===1&&!p.servers){setStatus('Trying the relay as a fallback…');const relay=await request('turn',{code:s.code,...(s.host?{slot:p.slot}:{})},s);if(!isPeer(s,p))return;p.servers=[...directServers,...relay.iceServers];}
   if(p.servers)servers=p.servers;
   if(s.host){
    if(!p.offerSent){const offer=p.localOffer||await transport.offer(p.slot,p.rtcToken,servers);if(!isPeer(s,p))return;p.localOffer=offer;await request('signal',{code:s.code,slot:p.slot,kind:'offer',description:offer.sdp,generation:p.generation},s);if(!isPeer(s,p))return;p.offerSent=true;}
    if(record.answer&&!p.answerAccepted){await transport.accept({protocol:'neoclonk-rtc-1',slot:p.slot,token:p.rtcToken,sdp:record.answer});if(!isPeer(s,p))return;p.answerAccepted=true;arm(s,p);}
   }else if(record.offer&&!p.answerSent){
    const answer=p.localAnswer||await transport.answer({protocol:'neoclonk-rtc-1',...credentials(),scenario:s.room.scenario,slot:p.slot,token:p.rtcToken,sdp:record.offer},servers);if(!isPeer(s,p))return;p.localAnswer=answer;
    await request('signal',{code:s.code,kind:'answer',description:answer.sdp,generation:p.generation},s);if(!isPeer(s,p))return;p.answerSent=true;arm(s,p);
   }
  }catch(error){if(!isPeer(s,p)||error.name==='AbortError')return;if(error.status===409){schedule(s,0);return;}if(error.serviceFailure)throw error;if(p.generation===0&&!p.relayRequested){await fallback(s,p);}else{p.failed=true;setStatus(error.message+' Leave the lobby to try again.');}}
  finally{p.busy=false;}
 }
 function connected(slot){const s=active,p=s?.peers.get(slot);if(!s||!p||!current(s))return;clearPeer(p);p.connected=true;p.everConnected=true;if(!s.host)clearTimeout(s.pollTimer);
  request('connected',{code:s.code,...(s.host?{slot}:{})},s).catch(()=>{});
  transport.connectionKind(slot).then(kind=>{if(!isPeer(s,p))return;p.kind=kind;const peers=[...s.peers.values()].filter(x=>x.connected);$('room-connection-kind').textContent=peers.some(x=>x.kind==='relay')?'Connected. A relay is carrying one connection; a player still hosts the game.':'Connected directly between players.';}).catch(()=>{});
 }
 async function dropPeer(s,p){
  if(!isPeer(s,p)||p.dropping)return;p.dropping=true;
  try{await request('drop',{code:s.code,slot:p.slot,rtcToken:p.rtcToken},s);}
  catch(error){if(!isPeer(s,p)||error.name==='AbortError')return;if(![404,409].includes(error.status))throw error;}
  finally{p.dropping=false;}
  if(isPeer(s,p)){s.peers.delete(p.slot);schedule(s,0);}
 }
 function connectionFailed(slot){
  const s=active,p=s?.peers.get(slot);if(!s||!p||!current(s)||p.closed)return;p.connected=false;
  if(p.everConnected){
   p.closed=true;p.failed=true;clearPeer(p);transport.remove(slot);
   if(s.host){setStatus('A player disconnected. They can join again with the room code.');dropPeer(s,p).catch(error=>{if(!isPeer(s,p))return;s.retryAt=Date.now()+(error.retryAfter||10)*1000;schedule(s);setStatus(error.message+' Retrying room cleanup shortly.');});}
   else{clear(s);request('leave',{code:s.code},s,{keepalive:true}).catch(()=>{});$('room-ready').disabled=true;setStatus('The connection to the host closed. Leave this lobby, then join again using the room code.');}
   return;
  }
  if(p.generation===0)fallback(s,p);else{p.failed=true;clearPeer(p);setStatus('The player connection closed. Leave the lobby to try again.');}
 }
 function started(){const s=active;if(!s)return;s.started=true;clear(s);if(s.host)request('start',{code:s.code},s,{keepalive:true}).catch(()=>{});}
 $('room-publish').onclick=invoke(create);$('room-join-code').onclick=invoke(()=>join());$('room-refresh').onclick=invoke(()=>refresh());$('room-code-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();invoke(()=>join())();}});
 $('room-copy-link').onclick=invoke(async()=>{const input=$('room-link');try{await navigator.clipboard.writeText(input.value);setStatus('Invite link copied. Send it to your friend.');}catch{input.focus();input.select();setStatus(document.execCommand('copy')?'Invite link copied. Send it to your friend.':'Select and copy the invite link.');}});
 document.addEventListener('visibilitychange',()=>{if(active&&current(active)&&!document.hidden)schedule(active,0);});
 window.__neoclonkDiscovery={open,leave,started,connected,connectionFailed,rosterChanged(){},getState:()=>({configured:!!service,active:!!active&&!active.stopped,code:active?.code||null,host:active?.host||false,started:!!active?.started,connections:active?[...active.peers.values()].map(p=>({slot:p.slot,generation:p.generation,connected:p.connected,kind:p.kind,failed:p.failed})):[]})};
})();

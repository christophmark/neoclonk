import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const ROOM_TTL=180000,GUEST_TTL=90000;
export class LobbyError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(s,c,m)=>{throw new LobbyError(s,c,m);};
const hash=s=>createHash('sha256').update(s).digest('hex');
const secret=()=>randomBytes(24).toString('base64url');
const rtcSecret=()=>randomBytes(16).toString('hex');
function text(v,key,max=80){if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f]/.test(v))fail(400,'invalid_input','Invalid '+key+'.');return v.trim();}
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;return timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function publicRoom(r,turnAvailable){return {code:r.code,name:r.name,scenario:r.scenario,version:r.version,catalog:r.catalog,maxPlayers:r.maxPlayers,players:1+r.guests.length,visibility:r.visibility,expiresAt:r.expiresAt,turnAvailable};}
function guestView(g){return {slot:g.slot,name:g.name,rtcToken:g.rtcToken,offer:g.offer,answer:g.answer,generation:g.generation,relayRequested:g.relayRequested,connected:g.connected};}
export function createService({store,turn=null,clock=Date.now,requestLimit=20000,ipLimit=180,byteLimit=1024*1024*1024,enabled=true}) {
 async function access(input,token,mutate) {
  const code=text(input.code,'room code',8).toUpperCase();if(!/^[A-Z2-9]{8}$/.test(code))fail(400,'invalid_code','Use the eight-character room code.');
  for(let attempt=0;attempt<5;attempt++){
   const now=clock(),before=await store.get(code);if(!before)fail(404,'room_expired','This room has closed or expired.');
   const r=JSON.parse(before);if(r.expiresAt<=now)fail(404,'room_expired','This room has closed or expired.');
   r.guests=r.guests.filter(g=>g.connected?now-(g.confirmedAt||0)<ROOM_TTL:now-g.lastSeen<GUEST_TTL);
   const digest=hash(token||''),host=same(r.hostHash,digest),guest=r.guests.find(g=>same(g.authHash,digest));
   if(!host&&!guest)fail(401,'unauthorized','This room invitation is no longer valid.');
   if(!host&&input.slot!==undefined&&input.slot!==guest.slot)fail(403,'invalid_slot','A guest cannot act on another player slot.');
   if(host)r.expiresAt=now+ROOM_TTL;else guest.lastSeen=now;
   const result=mutate(r,{host,guest,now});
   const after=result.remove?null:JSON.stringify(r),ttl=Math.max(1,Math.ceil((r.expiresAt-now)/1000));
   if(await store.cas(code,before,after,ttl,r.visibility==='public'&&!r.started?r.expiresAt:0))return result.value;
  }
  fail(409,'busy','The room changed. Try again.');
 }
 const pick=(r,ctx,slot)=>{if(!ctx.host)return ctx.guest;if(!Number.isInteger(slot))fail(400,'invalid_slot','Choose a player.');const g=r.guests.find(p=>p.slot===slot);if(!g)fail(404,'player_expired','This player has left the room.');return g;};
 return async function handle(input,{token='',ip='unknown'}={}) {
  if(!enabled)fail(503,'disabled','Online discovery is temporarily disabled. Manual invitations still work.');
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'invalid_input','Expected a request object.');
  const now=clock(),admitted=await store.budget(hash(ip).slice(0,32),requestLimit,ipLimit,now,byteLimit);
  if(!admitted)fail(503,'budget_exhausted','The lobby has reached its usage allowance. Manual invitations still work.');
  if(admitted<0)fail(429,'rate_limited','Too many requests. Wait a minute and try again.');
  let out;
  switch(input.action){
   case 'list': {
    const version=text(input.version,'version'),catalog=text(input.catalog,'catalog',128);
    const rooms=(await store.list(now)).map(s=>JSON.parse(s)).filter(r=>r.expiresAt>now&&!r.started&&r.version===version&&r.catalog===catalog&&r.guests.length+1<r.maxPlayers);
    out={rooms:rooms.map(r=>publicRoom(r,!!turn))};break;
   }
   case 'create': {
    const name=text(input.name,'room name',48),scenario=text(input.scenario,'scenario',128),version=text(input.version,'version'),catalog=text(input.catalog,'catalog',128);
    if(!Number.isInteger(input.maxPlayers)||input.maxPlayers<2||input.maxPlayers>12)fail(400,'invalid_capacity','A room supports 2–12 players.');
    if(!['public','private'].includes(input.visibility))fail(400,'invalid_visibility','Choose a public or private room.');
    const token=secret();for(let i=0;i<5;i++){
     const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from(randomBytes(8),n=>alphabet[n%32]).join('');
     const r={code,name,scenario,version,catalog,maxPlayers:input.maxPlayers,visibility:input.visibility,hostHash:hash(token),guests:[],expiresAt:now+ROOM_TTL,started:false};
     if(await store.cas(code,null,JSON.stringify(r),180,r.visibility==='public'?r.expiresAt:0)){out={code,token,role:'host',room:publicRoom(r,!!turn)};break;}
    }if(!out)fail(503,'busy','Could not create a room. Try again.');break;
   }
   case 'join': {
    const code=text(input.code,'room code',8).toUpperCase(),name=text(input.name,'player name',24),version=text(input.version,'version'),catalog=text(input.catalog,'catalog',128);if(!/^[A-Z2-9]{8}$/.test(code))fail(400,'invalid_code','Use the eight-character room code.');
    const token=secret(),rtcToken=rtcSecret();for(let i=0;i<5;i++){
     const before=await store.get(code);if(!before)fail(404,'room_expired','This room has closed or expired.');const r=JSON.parse(before);
     if(r.expiresAt<=now||r.started)fail(404,'room_expired','This room has closed or already started.');
     if(r.version!==version||r.catalog!==catalog)fail(409,'version_mismatch','Both devices need the same Neoclonk version. Reload and try again.');
     r.guests=r.guests.filter(g=>g.connected?now-(g.confirmedAt||0)<ROOM_TTL:now-g.lastSeen<GUEST_TTL);
     if(r.guests.length+1>=r.maxPlayers)fail(409,'room_full','This room is full.');
     let slot=1;while(r.guests.some(g=>g.slot===slot))slot++;r.guests.push({slot,name,rtcToken,authHash:hash(token),lastSeen:now,generation:0,offer:null,answer:null,relayRequested:false,connected:false,leases:{}});
     if(await store.cas(code,before,JSON.stringify(r),Math.max(1,Math.ceil((r.expiresAt-now)/1000)),r.visibility==='public'?r.expiresAt:0)){out={code,token,slot,rtcToken,room:publicRoom(r,!!turn)};break;}
    }if(!out)fail(409,'busy','The room changed. Try joining again.');break;
   }
   case 'poll': case 'heartbeat':
    out=await access(input,token,(r,c)=>{
     if(input.connectedPeers!==undefined){
      if(!c.host)fail(403,'host_only','Only the host can confirm connected players.');
      if(!Array.isArray(input.connectedPeers)||input.connectedPeers.length>11||new Set(input.connectedPeers.map(p=>p?.slot)).size!==input.connectedPeers.length||input.connectedPeers.some(p=>!Number.isInteger(p?.slot)||p.slot<1||p.slot>11||typeof p.rtcToken!=='string'||p.rtcToken.length!==32))fail(400,'invalid_peers','Invalid connected player list.');
      for(const peer of input.connectedPeers){const g=r.guests.find(g=>g.slot===peer.slot&&g.rtcToken===peer.rtcToken);if(g&&(g.connected||(g.offer&&g.answer))){g.connected=true;g.confirmedAt=c.now;g.offer=null;g.answer=null;}}
     }
     return {value:c.host?{room:publicRoom(r,!!turn),guests:r.guests.map(guestView)}:{room:publicRoom(r,!!turn),...guestView(c.guest)}};
    });break;
   case 'signal':
    out=await access(input,token,(r,c)=>{
     if(r.started)fail(409,'already_started','The match has already started.');const g=pick(r,c,input.slot);
     if(input.kind==='relay') {if(g.connected)fail(409,'already_connected','This player is already connected.');if(!turn)fail(503,'relay_unavailable','A relay has not been configured. Try another network or manual connection settings.');if(!g.relayRequested){g.relayRequested=true;g.generation=1;g.offer=null;g.answer=null;}return {value:{generation:g.generation,relayRequested:true}};}
     if(input.generation!==g.generation)fail(409,'stale_signal','A newer connection attempt is in progress.');
     if((input.kind==='offer'&&!c.host)||(input.kind==='answer'&&c.host)||!['offer','answer'].includes(input.kind))fail(403,'signal_role','This player cannot send that connection message.');
     const d=input.description;if(d?.type!==input.kind||typeof d.sdp!=='string'||d.sdp.length>48000||!d.sdp.startsWith('v=0'))fail(400,'invalid_sdp','Invalid connection description.');
     if(input.kind==='answer'&&!g.offer)fail(409,'missing_offer','Wait for the host connection offer.');
     // Idempotent retries are safe; conflicting descriptions require a new generation.
     if(g[input.kind]&&g[input.kind].sdp!==d.sdp)fail(409,'signal_exists','This connection description is already set.');
     g[input.kind]={type:d.type,sdp:d.sdp};return {value:{ok:true,generation:g.generation}};
    });break;
   case 'connected':
    out=await access(input,token,(r,c)=>{const g=pick(r,c,input.slot);
     if(!g.connected&&(!g.offer||!g.answer))fail(409,'missing_signal','Complete the connection exchange first.');
     if(c.host){g.connected=true;g.confirmedAt=c.now;g.offer=null;g.answer=null;}else g.guestConnected=true;
     return {value:{ok:true}};
    });break;
   case 'drop':
    out=await access(input,token,(r,c)=>{if(!c.host)fail(403,'host_only','Only the host can remove a player.');const g=pick(r,c,input.slot);if(input.rtcToken!==g.rtcToken)fail(409,'stale_player','A new player now occupies this slot.');r.guests=r.guests.filter(p=>p!==g);return {value:{ok:true}};});break;
   case 'start':
    out=await access(input,token,(r,c)=>{if(!c.host)fail(403,'host_only','Only the host can start a room.');return {remove:true,value:{ok:true}};});break;
   case 'leave':
    out=await access(input,token,(r,c)=>{if(c.host)return {remove:true,value:{ok:true}};r.guests=r.guests.filter(g=>g.slot!==c.guest.slot);return {value:{ok:true}};});break;
   case 'turn': {
    if(!turn)fail(503,'relay_unavailable','A relay has not been configured.');
    const reservation=secret();let identity;
    const state=await access(input,token,(r,c)=>{const g=pick(r,c,input.slot),role=c.host?'host':'guest';if(!g.relayRequested||g.connected)fail(403,'relay_not_needed','Relay credentials are only issued for a failed direct connection.');const lease=g.leases[role];if(lease?.credentials&&lease.credentials.expiresAt>c.now+60000)return {value:{cached:lease.credentials}};if(lease?.pending&&c.now-lease.pendingAt<10000)fail(409,'relay_pending','Relay credentials are being prepared.');identity=r.code+'-'+g.slot+'-'+role+'-'+g.rtcToken.slice(0,12);g.leases[role]={pending:reservation,pendingAt:c.now};return {value:{slot:g.slot}};});
    if(state.cached){out=state.cached;break;}
    try {
     const credentials=await turn({identity,now});
     out=await access({...input,slot:state.slot},token,(r,c)=>{const g=pick(r,c,state.slot),role=c.host?'host':'guest';if(g.leases[role]?.pending!==reservation)fail(409,'relay_pending','A newer relay request is in progress.');g.leases[role]={credentials};return {value:credentials};});
    }catch(error){await access({...input,slot:state.slot},token,(r,c)=>{const g=pick(r,c,state.slot),role=c.host?'host':'guest';if(g.leases[role]?.pending===reservation)delete g.leases[role];return {value:{ok:true}};}).catch(()=>{});if(error instanceof LobbyError)throw error;fail(503,'relay_unavailable','The relay could not be reached. Try again shortly.');}
    break;
   }
   default:fail(400,'unknown_action','Unknown lobby action.');
  }
  await store.bytes(Buffer.byteLength(JSON.stringify(out)));return out;
 };
}

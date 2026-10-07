// Production lobby UI + real browser data channels; fixture API records signaling only.
import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('rage-port/shell'),out=resolve('rage-port/outputs/discovery-browser');await mkdir(out,{recursive:true});
const calls=[],rooms=new Map();let roomSequence=1000,guestSequence=0,holdCreate=null;
const scenario={id:'worlds.c4f/goldmine.c4s',title:'Gold Mine',categoryId:'worlds',minPlayers:1,maxPlayers:12};
const catalog={catalogDigest:'fixture-catalog',scenarios:[scenario],categories:[{id:'worlds',title:'Worlds'}]};
function api(body,token){const {action,code}=body;calls.push({action,code,generation:body.generation,kind:body.kind});let r=rooms.get(code),member=r?.hostToken===token?{host:true}:r?.guests.find(g=>g.token===token);
 if(action==='create'){const code=String(++roomSequence);r={room:{code,name:body.name,scenario:body.scenario,version:body.version,catalog:body.catalog,maxPlayers:body.maxPlayers,visibility:body.visibility,players:1,turnAvailable:true},hostToken:'host-'+code,guests:[]};rooms.set(code,r);return {code,token:r.hostToken,room:r.room};}
 if(action==='list')return {rooms:[...rooms.values()].filter(r=>r.room.visibility==='public'&&!r.started).map(r=>r.room)};
 if(!r)throw {status:404,error:'Room expired',code:'room_not_found'};
 if(action==='join'){const slot=Array.from({length:11},(_,i)=>i+1).find(n=>!r.guests.some(g=>g.slot===n)),identity=++guestSequence,g={slot,name:body.name,token:'guest-'+code+'-'+identity,rtcToken:('0'.repeat(32)+identity).slice(-32),generation:0,connected:false,offer:null,answer:null};r.guests.push(g);r.room.players++;return {code,token:g.token,slot,rtcToken:g.rtcToken,room:r.room};}
 if(!member)throw {status:401,error:'Invalid token'};
 const g=member.host?r.guests.find(g=>g.slot===body.slot):member;
 if(action==='poll')return member.host?{room:r.room,guests:r.guests}:{room:r.room,...member};
 if(action==='signal'){if(body.kind==='relay'){if(g.generation===0){g.generation=1;g.offer=null;g.answer=null;}return {};}
  if(g.generation!==body.generation)throw {status:409,error:'Generation changed'};g[body.kind]=body.description;return {};}
 if(action==='connected'){if(!g)throw {status:404,error:'Player left'};g.connected=true;return {};}
 if(action==='drop'){if(!member.host)throw {status:403,error:'Host only'};if(!g||g.rtcToken!==body.rtcToken)throw {status:409,error:'Player changed'};r.guests=r.guests.filter(x=>x!==g);r.room.players--;return {};}
 if(action==='turn'){assert.equal(g.generation,1,'TURN never before fallback');return {iceServers:[{urls:'turn:127.0.0.1:9',username:'fixture',credential:'fixture'}],expiresAt:Date.now()+60000};}
 if(action==='start'){r.started=true;return {};}
 if(action==='leave'){if(member.host)rooms.delete(code);else{r.guests=r.guests.filter(x=>x!==member);r.room.players--;}return {};}
 throw {status:400,error:'Unknown action'};
}
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/lobby'){let raw='';for await(const chunk of req)raw+=chunk;let result;try{const body=JSON.parse(raw);result=api(body,req.headers.authorization?.replace(/^Bearer /,''));if(body.action==='create'&&holdCreate){const hold=holdCreate;holdCreate=null;hold.code=result.code;hold.called();await hold.promise;}}catch(e){res.statusCode=e.status||500;result=e;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;}
 let file=url.pathname==='/'?'index.html':url.pathname.slice(1);const path=resolve(root,file);if(!path.startsWith(root+'/')){res.writeHead(404).end();return;}const body=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});const pages=[],errors=[],report={};
async function page({failDirect=false}={}){const p=await browser.newPage({viewport:{width:390,height:844}});pages.push(p);p.on('pageerror',e=>errors.push(String(e)));
 await p.route('**/scenario-library.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.__scenarioLibrary={version:'fixture-1',catalog:${JSON.stringify(catalog)},get:id=>(${JSON.stringify(scenario)}),find:id=>id?(${JSON.stringify(scenario)}):null,isBlocked:()=>false,ready:Promise.resolve()};`}));
 await p.route('**/discovery-config.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.__neoclonkDiscoveryConfig={serviceUrl:${JSON.stringify(base)},stunServers:[]};`}));
 await p.route('**/game.js*',route=>route.fulfill({contentType:'text/javascript',body:"window.__rageBrowser={getState:()=>({booted:false,phase:'playing'}),startScenario:async()=>{}};"}));
 await p.route('**/gallery.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.__scenarioGallery={getSelected:()=>(${JSON.stringify(scenario)})};`}));
 if(failDirect)await p.addInitScript(()=>{const Native=RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(config){const fallback=config.iceServers.some(s=>[s.urls].flat().some(u=>u.startsWith('turn:')));super({...config,iceServers:[]});this.dropDirectCandidates=!fallback;}get localDescription(){const d=super.localDescription;if(!d||!this.dropDirectCandidates)return d;const json={type:d.type,sdp:d.sdp.replace(/^a=candidate:.*\r?\n/gm,'')};return {...json,toJSON:()=>json};}};});
 await p.goto(base);return p;
}
async function host(p){await p.evaluate(id=>window.__neoclonkMultiplayer.host(id),scenario.id);await p.locator('#room-publish').click();await p.waitForFunction(()=>window.__neoclonkDiscovery.getState().code);return p.evaluate(()=>window.__neoclonkDiscovery.getState().code);}
async function join(p,code){await p.locator('#join-room').click();await p.locator('#room-join-choice').click();await p.locator('#room-code-input').fill(code);await p.locator('#room-join-code').click();}
const waitConnected=(p,n)=>p.waitForFunction(count=>window.__neoclonkMultiplayer.getState()?.players.length===count,n,{timeout:65000});
try{
 const h=await page(),a=await page(),b=await page();const code=await host(h);await Promise.all([join(a,code),join(b,code)]);await Promise.all([waitConnected(h,3),waitConnected(a,3),waitConnected(b,3)]);
 assert.equal(calls.filter(c=>c.action==='turn').length,0,'Direct connections never request relay credentials');assert.equal(calls.filter(c=>c.kind==='relay').length,0);
 report.concurrentDirect=await h.evaluate(()=>window.__neoclonkDiscovery.getState());assert.equal(report.concurrentDirect.connections.length,2);
 await h.screenshot({path:out+'/mobile-host.png'});for(const p of [h,a,b])if(await p.locator('#room-ready').isVisible())await p.locator('#room-ready').check();await h.locator('#room-start').click();await h.waitForFunction(()=>window.__neoclonkDiscovery.getState().started);await a.waitForFunction(()=>window.__neoclonkDiscovery.getState().started);await new Promise(r=>setTimeout(r,100));const atStart=calls.filter(c=>c.action==='poll').length;await new Promise(r=>setTimeout(r,6000));assert.equal(calls.filter(c=>c.action==='poll').length,atStart,'No discovery polling during gameplay');report.gameplayPollingStopped=true;
 const fh=await page({failDirect:true}),fg=await page({failDirect:true}),fallbackCode=await host(fh);await join(fg,fallbackCode);await Promise.all([waitConnected(fh,2),waitConnected(fg,2)]);report.fallback=await fh.evaluate(()=>window.__neoclonkDiscovery.getState());assert.equal(report.fallback.connections[0].generation,1);assert.equal(calls.filter(c=>c.code===fallbackCode&&c.action==='turn').length,2,'Both peers receive TURN settings only after generation1');assert.equal(report.fallback.connections[0].kind,'direct','Fallback policy still allows direct route');
 await fh.locator('#room-leave').click();await fg.locator('#room-leave').click();const newCode=await host(fh);await new Promise(r=>setTimeout(r,1200));assert.equal((await fh.evaluate(()=>window.__neoclonkDiscovery.getState())).code,newCode,'Old callbacks cannot replace new session');assert.equal((await fh.evaluate(()=>window.__neoclonkMultiplayer.getState())).players.length,0);report.staleSessionSafe=true;
 // Cancel creation while its HTTP response is pending, then reopen immediately.
 const pendingPage=await page();let releaseCreate,calledCreate;const createCalled=new Promise(r=>calledCreate=r);const hold={promise:new Promise(r=>releaseCreate=r),called:calledCreate};holdCreate=hold;
 await pendingPage.evaluate(id=>window.__neoclonkMultiplayer.host(id),scenario.id);await pendingPage.locator('#room-publish').click();await createCalled;await pendingPage.locator('#room-close').click();
 await pendingPage.evaluate(id=>window.__neoclonkMultiplayer.host(id),scenario.id);assert.equal(await pendingPage.locator('#room-publish').isEnabled(),true,'Reopened create button must be enabled before old request returns');releaseCreate();
 await pendingPage.waitForFunction(()=>!window.__neoclonkDiscovery.getState().active);await new Promise(r=>setTimeout(r,100));assert.equal(rooms.has(hold.code),false,'Cancelled create response cleans up its orphan room');report.pendingCreateCancelled=true;
 // Same slot, fresh rtcToken between polls: keep old channel alive to make the token check essential.
 const reuseGuest=await page();await join(reuseGuest,newCode);await Promise.all([waitConnected(fh,2),waitConnected(reuseGuest,2)]);
 const reusedRoom=rooms.get(newCode),oldIdentity=reusedRoom.guests[0].rtcToken;reusedRoom.guests=[];reusedRoom.room.players=1;
 const replacement=await page();await join(replacement,newCode);assert.notEqual(reusedRoom.guests[0].rtcToken,oldIdentity);assert.equal(reusedRoom.guests[0].slot,1);
 await Promise.all([waitConnected(fh,2),waitConnected(replacement,2)]);assert.equal(reusedRoom.guests.length,1,'Stale disconnect must not drop a new guest in the same slot');report.slotReuseConnected=true;
 // A channel closes unexpectedly before starting. Host drops its occupied server slot; no TURN retry.
 const relaysBefore=calls.filter(c=>c.kind==='relay').length;
 await replacement.evaluate(()=>[...window.__neoclonkRoomTransport.getRoom().peers.values()][0].channel.close());
 await fh.waitForFunction(()=>window.__neoclonkMultiplayer.getState().connections.length===0);await new Promise(r=>setTimeout(r,200));assert.equal(reusedRoom.guests.length,0,'Closed guest must free room capacity');assert.equal(calls.filter(c=>c.kind==='relay').length,relaysBefore,'A previously connected closed channel is removed, not sent to TURN');assert.match(await replacement.locator('#room-status').textContent(),/join again/);report.connectedCloseCleanup=true;
 const rejoined=await page();await join(rejoined,newCode);await Promise.all([waitConnected(fh,2),waitConnected(rejoined,2)]);report.rejoinedAfterClose=true;
 assert.deepEqual(errors,[]);report.passed=true;
}catch(error){report.failure=String(error);report.stack=error.stack;process.exitCode=1;for(let i=0;i<pages.length;i++){try{report['page'+i]=await pages[i].evaluate(()=>({discovery:window.__neoclonkDiscovery.getState(),room:window.__neoclonkMultiplayer.getState(),status:document.getElementById('room-status').textContent}));}catch{}}}
finally{report.calls=calls;report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}console.log(JSON.stringify(report,null,2));

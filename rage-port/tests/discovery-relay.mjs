// Real Node lobby + Redis + coturn + original WASM simulation, in two browsers.
// Local: isolated Redis + coturn. Opt-in LOBBY_URL: short-lived live verification rooms.
import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {fromEnvironment} from '../../lobby-service/src/http.js';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,extname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const remoteService=process.env.LOBBY_URL?.replace(/\/$/,'');
if(!remoteService&&(!process.env.REDIS_TEST_URL||!process.env.TURN_SERVER_BINARY))throw Error('Set isolated REDIS_TEST_URL and TURN_SERVER_BINARY, or opt in with LOBBY_URL.');
const out=resolve(process.env.DISCOVERY_OUT||'rage-port/outputs/discovery-relay');await mkdir(out,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'neoclonk-relay-')),secret=randomBytes(32).toString('hex');
const port=Number(process.env.TURN_TEST_PORT||18347),turnConfig=join(temp,'turnserver.conf');
await writeFile(turnConfig,`listening-ip=127.0.0.1\nrelay-ip=127.0.0.1\nlistening-port=${port}\nmin-port=18400\nmax-port=18500\nrealm=neoclonk-local-test\nuse-auth-secret\nstatic-auth-secret=${secret}\nallow-loopback-peers\nno-multicast-peers\nno-cli\nno-tls\nno-dtls\nno-tcp-relay\nrelay-threads=1\nuser-quota=8\ntotal-quota=32\npidfile=${temp}/turn.pid\nlog-file=${temp}/turn.log\nsimple-log\n`,{mode:0o600});
const turn=remoteService?null:spawn(process.env.TURN_SERVER_BINARY,['-c',turnConfig],{stdio:['ignore','ignore','pipe']});let turnErrors='';turn?.stderr.on('data',b=>turnErrors+=b);
const calls=[],errors=[],report={modes:[]};let browser,handler;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/lobby'){let raw='';for await(const b of req)raw+=b;req.body=JSON.parse(raw);calls.push({action:req.body.action,kind:req.body.kind,generation:req.body.generation});return handler(req,res);}
 if(url.pathname==='/rage/discovery-config.js'&&!remoteService){res.setHeader('Content-Type','text/javascript');res.end(`window.__neoclonkDiscoveryConfig={serviceUrl:${JSON.stringify(base)},stunServers:[]};`);return;}
 const relative=url.pathname.replace(/^\/rage\//,'');if(relative.includes('..')||!url.pathname.startsWith('/rage/')){res.writeHead(404).end();return;}
 let body;try{body=await readFile(resolve('rage-port/shell',relative));}catch{body=await readFile(resolve('web/public/rage',relative));}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'})[extname(relative)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404).end();}});
await new Promise((r,reject)=>{server.once('error',reject);server.listen(remoteService?3902:0,'127.0.0.1',r);});const base=`http://127.0.0.1:${server.address().port}`;
if(!remoteService)handler=await fromEnvironment({REDIS_URL:process.env.REDIS_TEST_URL,REDIS_NAMESPACE:'neoclonk:e2e:'+Date.now(),ALLOWED_ORIGINS:base,TURN_PROVIDER:'coturn',TURN_SHARED_SECRET:secret,TURN_URLS:`turn:127.0.0.1:${port}?transport=udp`,LOBBY_IP_PER_MINUTE:'1000'});
const state=p=>p.evaluate(()=>window.__neoclonkMultiplayer.getState());
try{
 if(!remoteService)await new Promise((resolve,reject)=>{const started=Date.now();function check(){const socket=createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',()=>{socket.destroy();if(Date.now()-started>10000)reject(Error('coturn did not start: '+turnErrors));else setTimeout(check,100);});}check();});
 browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 for(const mode of ['direct','relay']){
  const contexts=[],pages=[],startCalls=calls.length;
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:i?{width:896,height:414}:{width:1280,height:800}});contexts.push(context);const p=await context.newPage();pages.push(p);
   p.on('pageerror',e=>errors.push(String(e)));
   if(remoteService){
    p.on('request',request=>{if(request.url()===remoteService+'/api/lobby'&&request.method()==='POST'){const body=request.postDataJSON();calls.push({action:body.action,kind:body.kind,generation:body.generation});}});
   }
   if(mode==='relay')await p.addInitScript(()=>{const Native=RTCPeerConnection;window.RTCPeerConnection=class extends Native{
    constructor(config){const fallback=config.iceServers.some(s=>[s.urls].flat().some(u=>/^turns?:/.test(u)));super({...config,...(fallback?{iceTransportPolicy:'relay'}:{})});this.testDirect=!fallback;}
    get localDescription(){const d=super.localDescription;if(!d||!this.testDirect)return d;const json={type:d.type,sdp:d.sdp.replace(/^a=candidate:.*\r?\n/gm,'')};return {...json,toJSON:()=>json};}
   };}); // Model a network where only TURN candidates can reach the other browser.
   await p.goto(base+'/rage/index.html');await p.waitForFunction(()=>window.__scenarioGallery?.getCatalog());
   if(remoteService)assert.equal(await p.evaluate(()=>window.__neoclonkDiscoveryConfig.serviceUrl),remoteService,'Test the shipped service configuration');
  }
  const [host,guest]=pages;await host.evaluate(()=>window.__neoclonkMultiplayer.host('worlds.c4f/goldmine.c4s'));
  await host.locator('#room-public').uncheck();
  await host.locator('#room-publish').click();await host.waitForFunction(()=>window.__neoclonkDiscovery.getState().code);const code=await host.evaluate(()=>window.__neoclonkDiscovery.getState().code);
  await guest.locator('#join-room').click();await guest.locator('#room-code-input').fill(code);await guest.locator('#room-join-code').click();
  for(const p of pages)await p.waitForFunction(()=>window.__neoclonkMultiplayer.getState()?.players.length===2,null,{timeout:100000});
  await host.waitForFunction(()=>window.__neoclonkDiscovery.getState().connections[0]?.kind&&window.__neoclonkDiscovery.getState().connections[0]?.kind!=='unknown');
  const discovery=await host.evaluate(()=>window.__neoclonkDiscovery.getState());assert.equal(discovery.connections[0].kind,mode,'Selected ICE candidate pair must prove the real route');
  const turns=calls.slice(startCalls).filter(c=>c.action==='turn').length;assert.equal(turns,mode==='relay'?2:0);
  for(const p of pages)await p.locator('#room-ready').check();await host.waitForFunction(()=>!document.getElementById('room-start').disabled);await host.locator('#room-start').click();
  for(const p of pages)await p.waitForFunction(()=>window.__neoclonkMultiplayer.getState()?.error||window.__neoclonkMultiplayer.getState()?.frame>=5,null,{timeout:150000});
  assert.equal((await state(host)).error,null);assert.equal((await state(guest)).error,null);
  const callsDuringGame=calls.length;
  await guest.evaluate(()=>window.__rageBrowser.tap('KeyC'));for(const p of pages)await p.evaluate(()=>window.__rageBrowser.tap('KeyD'));
  await host.waitForFunction(()=>window.__neoclonkMultiplayer.getState()?.error||window.__neoclonkMultiplayer.getState()?.lastVerifiedFrame>=120,null,{timeout:90000});
  assert.equal((await state(host)).error,null);await host.evaluate(()=>window.__neoclonkMultiplayer.setPaused(true));await guest.waitForFunction(()=>window.__neoclonkMultiplayer.getState().paused);
  await new Promise(r=>setTimeout(r,200));const sync=await Promise.all(pages.map(p=>p.evaluate(()=>{const ptr=Module.ccall('nc_browser_net_sync','number',[],[]),n=Module.ccall('nc_browser_net_size','number',[],[]);return {frame:JSON.parse(Module.ccall('nc_browser_state','string',[],[])).frame,fields:Array.from(Module.HEAPU8.slice(ptr,ptr+n)),terrain:Module.ccall('nc_browser_landscape_hash','number',[],[])};})));
  assert.deepEqual(sync[0],sync[1],'Both original simulations and landscapes agree');assert.equal(calls.length,callsDuringGame,'No lobby calls during gameplay');
  await host.screenshot({path:join(out,mode+'.png')});report.modes.push({mode,discovery,turnRequests:turns,verifiedFrame:(await state(host)).lastVerifiedFrame,sync:sync[0],gameplayLobbyRequests:0});
  for(const c of contexts)await c.close();console.log(mode+' passed');
 }
 assert.deepEqual(errors,[]);report.passed=true;
}catch(error){report.failure=String(error);report.stack=error.stack;process.exitCode=1;console.error(error);}
finally{report.errors=errors;await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await new Promise(r=>server.close(r));await handler?.close?.();turn?.kill('SIGTERM');await rm(temp,{recursive:true,force:true});}

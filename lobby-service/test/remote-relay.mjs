#!/usr/bin/env node
// Opt-in deployment verification. No provider keys or SDP/credential logging.
// LOBBY_URL=https://lobby.example.com node test/remote-relay.mjs
import {createServer} from 'node:http';
import {access,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {chromium} from '../../web/node_modules/playwright/index.mjs';

const serviceUrl=(process.env.LOBBY_URL||'https://lobby.40-180-87-214.sslip.io').replace(/\/$/,'');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3902';
const originUrl=new URL(origin);
if(!['127.0.0.1','localhost'].includes(originUrl.hostname)||originUrl.protocol!=='http:')throw Error('TEST_ORIGIN must be an HTTP localhost origin.');
const output=resolve(dirname(fileURLToPath(import.meta.url)),'../artifacts/remote-relay-report.json');
const selected=(process.env.TURN_TRANSPORTS||'udp3478,tcp3478,tls5349,tls443').split(',');
if(selected.some(s=>!['udp3478','tcp3478','tls5349','tls443'].includes(s)))throw Error('Unknown TURN_TRANSPORTS selection.');
let browser,server;
const report={endpoint:serviceUrl,origin,startedAt:new Date().toISOString(),results:[]};
try {
 server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Neoclonk relay verification</title><p>Checking player-hosted relay connections.</p></html>');});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(originUrl.port)||80,originUrl.hostname,resolve);});
 const executablePath=process.env.CHROME_BINARY||await access('/opt/google/chrome/chrome').then(()=>'/opt/google/chrome/chrome',()=>undefined);
 browser=await chromium.launch({headless:true,executablePath});
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:10000});
 // Use independent peer connections and fresh authenticated rooms for every URL.
 // All temporary TURN passwords and signaling descriptions stay inside the page.
 for(const transport of selected){
  const result=await page.evaluate(async({serviceUrl,transport})=>{
   const started=performance.now(),peers=[],abort=new AbortController();
   let host,guest,openA,openB,roomClosed=false;
   const deadline=setTimeout(()=>abort.abort(),85000);
   const timeout=(promise,ms,label)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(label+' timed out')),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
   const api=async(action,data={},member)=>{
    const response=await fetch(serviceUrl+'/api/lobby',{method:'POST',headers:{'Content-Type':'application/json',...(member?{Authorization:'Bearer '+member.token}:{})},body:JSON.stringify({action,...data}),signal:abort.signal});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error('API '+action+' failed: '+response.status+' '+String(result.code||'unknown').replace(/[^a-z0-9_-]/gi,''));
    return result;
   };
   const matches=url=>{
    const normalized=String(url).toLowerCase();
    if(transport==='udp3478')return /^turn:[^?]+:3478(?:\?|$)/.test(normalized)&&(!normalized.includes('transport=')||normalized.includes('transport=udp'));
    if(transport==='tcp3478')return /^turn:[^?]+:3478\?/.test(normalized)&&normalized.includes('transport=tcp');
    if(transport==='tls5349')return /^turns:[^?]+:5349(?:\?|$)/.test(normalized)&&!normalized.includes('transport=udp');
    return /^turns:[^?]+:443(?:\?|$)/.test(normalized)&&!normalized.includes('transport=udp');
   };
   const filtered=lease=>lease.iceServers.map(s=>({...s,urls:(Array.isArray(s.urls)?s.urls:[s.urls]).filter(matches)})).filter(s=>s.urls.length);
   const gathering=async pc=>{if(pc.iceGatheringState==='complete')return;await timeout(new Promise(resolve=>{const on=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',on);resolve();}};pc.addEventListener('icegatheringstatechange',on);on();}),20000,'ICE gathering');};
   const whenOpen=channel=>{if(channel.readyState==='open')return Promise.resolve();return timeout(new Promise((resolve,reject)=>{channel.addEventListener('open',()=>resolve(),{once:true});channel.addEventListener('error',()=>reject(Error('Data channel error')),{once:true});channel.addEventListener('close',()=>reject(Error('Data channel closed before opening')),{once:true});}),25000,'Data channel');};
   try {
    const version='relay-deployment-check-1',catalog='relay-deployment-check';
    host=await api('create',{name:'Relay verification',scenario:'relay-verification',version,catalog,maxPlayers:2,visibility:'private'});
    if(!host.room?.turnAvailable)throw Error('The deployment has no TURN provider configured');
    guest=await api('join',{code:host.code,name:'Relay verifier',version,catalog});
    // A fresh direct generation must not mint TURN credentials.
    const denied=await fetch(serviceUrl+'/api/lobby',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+guest.token},body:JSON.stringify({action:'turn',code:host.code}),signal:abort.signal});
    const deniedBody=await denied.json();
    if(denied.status!==403||deniedBody.code!=='relay_not_needed')throw Error('TURN was available before a fallback request');
    await api('signal',{code:host.code,kind:'relay',generation:0},guest);
    const [hostLease,guestLease]=await Promise.all([api('turn',{code:host.code,slot:guest.slot},host),api('turn',{code:host.code},guest)]);
    const hostServers=filtered(hostLease),guestServers=filtered(guestLease);
    if(!hostServers.length||!guestServers.length)throw Error('Requested TURN transport is missing from service configuration');
    const a=new RTCPeerConnection({iceServers:hostServers,iceTransportPolicy:'relay'}),b=new RTCPeerConnection({iceServers:guestServers,iceTransportPolicy:'relay'});peers.push(a,b);
    const channel=a.createDataChannel('neoclonk-relay-probe',{ordered:true});
    let remote;
    openB=timeout(new Promise((resolve,reject)=>{b.ondatachannel=event=>{remote=event.channel;remote.onmessage=event=>{if(event.data==='neoclonk-ping')remote.send('neoclonk-pong');};whenOpen(remote).then(resolve,reject);};}),60000,'Remote data channel');openB.catch(()=>{});
    await a.setLocalDescription(await a.createOffer());await gathering(a);
    if(!a.localDescription.sdp.includes(' typ relay'))throw Error('Host gathered no relay candidate');
    await api('signal',{code:host.code,slot:guest.slot,kind:'offer',generation:1,description:{type:'offer',sdp:a.localDescription.sdp}},host);
    const offered=await api('poll',{code:host.code},guest);
    if(offered.generation!==1||offered.offer?.type!=='offer')throw Error('Relay offer was not delivered');
    await b.setRemoteDescription(offered.offer);await b.setLocalDescription(await b.createAnswer());await gathering(b);
    if(!b.localDescription.sdp.includes(' typ relay'))throw Error('Guest gathered no relay candidate');
    await api('signal',{code:host.code,kind:'answer',generation:1,description:{type:'answer',sdp:b.localDescription.sdp}},guest);
    const answered=await api('poll',{code:host.code},host),answer=answered.guests.find(g=>g.slot===guest.slot)?.answer;
    if(answer?.type!=='answer')throw Error('Relay answer was not delivered');
    await a.setRemoteDescription(answer);openA=whenOpen(channel);await Promise.all([openA,openB]);
    const pong=timeout(new Promise(resolve=>channel.addEventListener('message',event=>{if(event.data==='neoclonk-pong')resolve();})),5000,'Relay ping/pong');channel.send('neoclonk-ping');await pong;
    const summary=async pc=>{
     const stats=await pc.getStats(),values=[...stats.values()];
     const transportStats=values.find(s=>s.type==='transport'&&s.selectedCandidatePairId);
     const pair=transportStats?stats.get(transportStats.selectedCandidatePairId):values.find(s=>s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated);
     if(!pair)throw Error('No selected ICE pair found');
     const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
     if(local?.candidateType!=='relay'||remote?.candidateType!=='relay')throw Error('The selected connection did not use two relay candidates');
     // Candidate addresses, ports, SDP and credentials are deliberately omitted.
     return {localType:local.candidateType,remoteType:remote.candidateType,protocol:local.protocol,relayProtocol:local.relayProtocol||null,pairState:pair.state,bytesSent:pair.bytesSent||0,bytesReceived:pair.bytesReceived||0};
    };
    const [hostStats,guestStats]=await Promise.all([summary(a),summary(b)]);
    await api('connected',{code:host.code,slot:guest.slot},host);
    await api('connected',{code:host.code},guest);
    await api('leave',{code:host.code},host);roomClosed=true;
    return {transport,ok:true,durationMs:Math.round(performance.now()-started),credentialsDeniedBeforeFallback:true,relayUrls:hostServers.flatMap(s=>s.urls),host:hostStats,guest:guestStats};
   }catch(error){return {transport,ok:false,durationMs:Math.round(performance.now()-started),error:abort.signal.aborted?'Transport verification exceeded its deadline':String(error.message||'Verification failed').slice(0,240)};}
   finally {
    clearTimeout(deadline);for(const pc of peers)pc.close();
    // Separate short cleanup deadline also works when the test request timed out.
    if(host&&!roomClosed){try{await fetch(serviceUrl+'/api/lobby',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+host.token},body:JSON.stringify({action:'leave',code:host.code}),signal:AbortSignal.timeout(5000)});}catch{}}
   }
  },{serviceUrl,transport});
  report.results.push(result);
  console.log(JSON.stringify(result));
 }
 report.ok=report.results.length===selected.length&&report.results.every(result=>result.ok);
}catch(error){report.ok=false;report.error=error.code==='EADDRINUSE'?'The localhost test origin port is already in use. Stop its existing server or set TEST_ORIGIN to an allowed free localhost port.':String(error.message||'Deployment verification failed').slice(0,240);console.error(report.error);}
finally {
 await browser?.close();
 if(server?.listening)await new Promise(resolve=>server.close(resolve));
 report.finishedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 if(!report.ok)process.exitCode=1;
}

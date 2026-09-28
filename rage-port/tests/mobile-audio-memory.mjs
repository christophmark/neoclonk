// Verify the mobile audio memory profile using real engine music plus a known tone.
import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const engine=process.argv[2]||'chromium',fallback=process.env.FORCE_AUDIO_FALLBACK==='1';
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}:{headless:true,executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports=[];const errors=[];
try{for(const mobile of (engine==='webkit'||fallback?[true]:[true,false])){
 const page=await browser.newPage({viewport:mobile?{width:414,height:896}:{width:1000,height:760},deviceScaleFactor:mobile?2:1,hasTouch:mobile});page.on('pageerror',error=>errors.push(String(error)));
 if(fallback)await page.addInitScript(()=>{const Original=window.AudioContext;window.__testAudioAttempts=0;window.AudioContext=new Proxy(Original,{construct(target,args){window.__testAudioAttempts++;if(args[0]?.sampleRate)throw new DOMException('Test device rejects requested rate','NotSupportedError');return Reflect.construct(target,args);}});});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:3905/index.html?scenario=worlds.c4f%2Fgoldmine.c4s&play=1');
 await page.waitForFunction(()=>window.__rageBrowser?.getState().ready,null,{timeout:120000});await page.mouse.click(100,400);
 await page.waitForFunction(()=>SDL.music.audio?.resource?.webAudio?.decodedBuffer&&SDL.music.audio?.webAudioNode,null,{timeout:90000});
 const report=await page.evaluate(async()=>{
  const context=SDL.audioContext,track=SDL.music.audio.resource.webAudio.decodedBuffer;
  const length=48000,wav=new ArrayBuffer(44+length*2),v=new DataView(wav);const word=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
  word(0,'RIFF');v.setUint32(4,wav.byteLength-8,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,48000,true);v.setUint32(28,96000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,length*2,true);
  for(let i=0;i<length;i++)v.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*440*i/48000)*16000),true);
  const tone=await context.decodeAudioData(wav),data=tone.getChannelData(0);let upwardCrossings=0;for(let i=1;i<data.length;i++)if(data[i-1]<0&&data[i]>=0)upwardCrossings++;
  return {constructorAttempts:window.__testAudioAttempts||null,requested:Module.neoclonkAudioSampleRate,rate:context.sampleRate,contextState:context.state,track:{duration:track.duration,channels:track.numberOfChannels,bytes:track.length*track.numberOfChannels*4,rate:track.sampleRate},tone:{duration:tone.duration,samples:tone.length,upwardCrossings},playbackRate:SDL.music.audio.webAudioNode.playbackRate.value,oldMusicId:SDL.audios.indexOf(SDL.music.audio.resource)};
 });
 assert.equal(report.requested,mobile?24000:0);if(mobile&&!fallback)assert.equal(report.rate,24000);if(fallback){assert.equal(report.constructorAttempts,2);assert(report.rate>24000);}assert.equal(report.track.rate,report.rate);assert.equal(report.contextState,'running');assert.equal(report.playbackRate,1);assert(Math.abs(report.tone.duration-1)<1/report.rate);assert(Math.abs(report.tone.upwardCrossings-440)<=1);
 await page.evaluate(()=>_Mix_HaltMusic());await page.waitForFunction(id=>SDL.audios[id]===null,report.oldMusicId,{timeout:15000});report.previousMusicReleased=true;
 reports.push({engine,mobile,fallback,...report});console.log(JSON.stringify(reports.at(-1)));await page.close();
 }assert.deepEqual(errors,[]);await fs.writeFile(`rage-port/outputs/mobile-audio-${engine}${fallback?'-fallback':''}.json`,JSON.stringify({reports,errors},null,2));
}finally{await browser.close();}

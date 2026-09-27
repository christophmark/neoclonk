// Actual original WAV/OGG playback via the browser platform adapter.
import assert from 'node:assert/strict';
import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
let report;
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:3002/');
 await page.getByRole('button',{name:/start|play|enter|begin/i}).first().click();
 await page.waitForFunction(()=>['error','exited'].includes(window.__rageBrowser?.getState().phase)||(window.__rageBrowser?.getState().phase==='playing'&&window.Module?._nc_browser_state&&JSON.parse(Module.ccall('nc_browser_state','string',[],[])).players.length),{},{timeout:90000});
 // Original keyboard menu selection produces the game's own UI sound.
 await page.evaluate(()=>{Module.ccall('nc_browser_pause','number',['number'],[1]);Module.ccall('nc_browser_control','number',['number','number','number','number'],[0,4,1,0]);Module.ccall('nc_browser_control','number',['number','number','number','number'],[0,4,0,0]);Module.ccall('nc_browser_step','number',['number'],[15]);});
 await page.waitForFunction(()=>SDL.music.audio?.webAudioNode||(SDL.music.audio instanceof HTMLMediaElement&&SDL.music.audio.currentTime>0),{},{timeout:45000});
 report=await page.evaluate(()=>({context:SDL.audioContext?.state,frequency:SDL.mixerFrequency,channels:SDL.mixerNumChannels,music:SDL.music.audio?{paused:SDL.music.audio.paused,source:!!SDL.music.audio.webAudioNode,htmlMedia:SDL.music.audio instanceof HTMLMediaElement,currentTime:SDL.music.audio.currentTime,readyState:SDL.music.audio.readyState,duration:SDL.music.audio.resource?.webAudio?.decodedBuffer?.duration||SDL.music.audio.duration}:null,decoded:SDL.audios.filter(Boolean).map(a=>({filename:a.source||a.filename,duration:a.webAudio?.decodedBuffer?.duration,rate:a.webAudio?.decodedBuffer?.sampleRate})),effects:SDL.channels.filter(c=>c.audio).map(c=>({paused:c.audio.paused,source:!!c.audio.webAudioNode,duration:c.audio.resource?.webAudio?.decodedBuffer?.duration}))}));
 assert.equal(report.context,'running');assert.equal(report.frequency,44100);assert.equal(report.channels,2);assert.ok((report.music?.source||(report.music?.htmlMedia&&report.music.currentTime>0&&report.music.readyState>=2))&&!report.music.paused,'Original OGG music source is playing');assert.ok(report.decoded.some(a=>a.duration>0&&a.duration<10),'Original short effect decoded');assert.equal(errors.length,0);
 console.log(JSON.stringify(report,null,2));
}finally{await writeFile('rage-port/outputs/audio-browser-report.json',JSON.stringify({report,errors},null,2));await browser.close();}

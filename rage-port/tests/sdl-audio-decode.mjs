// Exercise the actual patched SDL dependency's asynchronous failure boundary.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../.toolchains/emsdk/upstream/emscripten/src/library_sdl.js',import.meta.url),'utf8');
const playStart=source.indexOf('    playWebAudio(audio) {');
const playEnd=source.indexOf('\n    },',playStart);
const play='function '+source.slice(playStart,playEnd).trim()+'\n}';
const decodeStart=source.indexOf('      var onDecodeFailure = (error) => {');
const decodeEnd=source.indexOf('\n    } else if (audio === undefined && bytes)',decodeStart);
assert.ok(playStart>=0&&playEnd>playStart&&decodeStart>=0&&decodeEnd>decodeStart,'Patched SDL dependency must be present');
const decode=source.slice(decodeStart,decodeEnd);
const unhandled=[];const listener=error=>unhandled.push(String(error));
process.on('unhandledRejection',listener);
try{
 for(const mode of ['callback-and-promise','promise-only','callback-only']){
  const warnings=[],webAudio={onDecodeComplete:[]};
  const audio={resource:{webAudio},paused:false};
  const failure=new DOMException('Unable to decode audio data','EncodingError');
  const SDL={music:{audio},webAudioAvailable:()=>true,audioContext:{decodeAudioData(buffer,success,error){
   if(mode==='callback-only'){queueMicrotask(()=>error(failure));return undefined;}
   return Promise.resolve().then(()=>{if(mode==='callback-and-promise')error(failure);throw failure;});
  }}};
  const context=vm.createContext({SDL,webAudio,audio,arrayBuffer:new ArrayBuffer(1),filename:'unsupported-fixture.mid',err:text=>warnings.push(text)});
  SDL.playWebAudio=vm.runInContext('('+play+')',context);
  SDL.playWebAudio(audio); // Original immediate playback queues until decoding finishes.
  assert.equal(webAudio.onDecodeComplete.length,1);
  vm.runInContext(decode,context);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(webAudio.decodeFailed,true);
  assert.equal(webAudio.onDecodeComplete,undefined);
  assert.equal(audio.paused,true);
  assert.equal(Boolean(SDL.music.audio&&!SDL.music.audio.paused),false,'Original Mix_PlayingMusic poll observes completion');
  SDL.playWebAudio(audio); // Repeated playback remains a failed, paused resource.
  assert.equal(audio.paused,true);
  assert.equal(warnings.length,1,'Callback and Promise must not double-report one failure');
  assert.match(warnings[0],/unsupported-fixture.mid.*EncodingError/);
  console.log('PASS',mode);
 }
 assert.deepEqual(unhandled,[]);
}finally{process.off('unhandledRejection',listener);}

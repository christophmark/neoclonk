'use strict';
// Original scenario inventory and unchanged group files. Gameplay stays in C++.
(() => {
 const version='scenarios-zoom-2';
 const url=path=>{const u=new URL(path,location.href);u.searchParams.set('v',version);return u.href;};
 let catalog,byId=new Map(),byPack=new Map();
 const ready=fetch(url('catalog/scenarios.json'),{credentials:'same-origin'}).then(async response=>{
  if(!response.ok)throw Error('The scenario library could not load. Please reload.');
  catalog=await response.json();
  for(const scenario of catalog.scenarios)byId.set(scenario.id,scenario);
  for(const pack of catalog.packs)byPack.set(pack.filename,pack);
  return catalog;
 });
 // A consumer reports catalog failures in its own visible menu.
 ready.catch(()=>{});
 const find=id=>byId.get(id)||null;
 function get(id){const scenario=find(id);if(!scenario)throw Error('This scenario is not in the installed original library.');return scenario;}
 async function fetchPacks(ids,onProgress=()=>{}){
  await ready;const embedded=new Set(catalog.preloadedPacks||[]),names=[...new Set(ids)].filter(name=>!embedded.has(name));
  let complete=0;onProgress(complete,names.length);
  return Promise.all(names.map(async name=>{
   const pack=byPack.get(name);if(!pack||!/^[-\w .]+\.c4[dfg]$/i.test(name))throw Error('An original content pack is missing from the catalog.');
   const response=await fetch(url(pack.url),{credentials:'same-origin'});if(!response.ok)throw Error('Could not download '+name+'. Reload to try again.');
   const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==pack.bytes)throw Error(name+' is incomplete. Reload to download it again.');
   if(globalThis.crypto?.subtle&&pack.sha256){const digest=await crypto.subtle.digest('SHA-256',bytes),hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(hex!==pack.sha256)throw Error(name+' failed its content check.');}
   onProgress(++complete,names.length);return {filename:name,bytes};
  }));
 }
 window.__scenarioLibrary={ready,get,find,fetchPacks,url,version,get catalog(){return catalog;},get allPacks(){return [...byPack.keys()];}};
})();

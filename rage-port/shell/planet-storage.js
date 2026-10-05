/* Device-local Planet saves and user-supplied community archives. */
'use strict';
(() => {
 const open=()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('neoclonk-library',1);
  request.onupgradeneeded=()=>{for(const name of ['saves','packs','previews'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};
  request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other Neoclonk tabs and retry.'));request.onsuccess=()=>resolve(request.result);
 });
 async function operation(store,mode,work){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);let value;try{const req=work(tx.objectStore(store));req.onsuccess=()=>{value=req.result;};}catch(error){db.close();reject(error);return;}tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('Local storage failed'));};});}
 const keys=store=>operation(store,'readonly',s=>s.getAllKeys());
 const get=(store,id)=>operation(store,'readonly',s=>s.get(id));
 const put=(store,value)=>operation(store,'readwrite',s=>s.put(value));
 const bytes=async value=>value instanceof Blob?new Uint8Array(await value.arrayBuffer()):value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value);
 window.NeoclonkLocal={get,put,keys,bytes,async saves(){return(await operation('saves','readonly',s=>s.getAll())).map(({bytes,...meta})=>meta).sort((a,b)=>b.date-a.date);},async save(scenario,bytes){const id=crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),record={id,engine:'planet',scenarioId:scenario.id,title:scenario.title,date:Date.now(),requiredPacks:scenario.requiredPacks,bytes:bytes.slice().buffer};await put('saves',record);return record;}};
})();

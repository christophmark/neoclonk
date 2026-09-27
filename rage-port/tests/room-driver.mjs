// Production lobby and reliable WebRTC pairing. No fabricated simulation state.
import assert from 'node:assert/strict';
export const roomState=page=>page.evaluate(()=>window.__neoclonkMultiplayer.getState());
export const nativeState=page=>page.evaluate(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])));
export async function createRoom({browser,base,scenarioId,host,viewport={width:640,height:480},onPageError=()=>{}}){
 const guestContext=await browser.newContext({viewport}),guest=await guestContext.newPage(),pages=[host,guest];
 guest.on('pageerror',error=>onPageError(error));
 try{
  await guest.goto(base);await guest.waitForFunction(()=>window.__scenarioGallery?.getCatalog());
  await host.evaluate(id=>window.__neoclonkMultiplayer.host(id),scenarioId);
  await host.locator('#room-name').fill('Library host');await host.locator('#room-name').dispatchEvent('change');await host.locator('#room-create-invite').click();await host.waitForFunction(()=>document.getElementById('invite-output').value.length>20);
  const offer=await host.locator('#invite-output').inputValue();await guest.locator('#join-room').click();await guest.locator('#room-name').fill('Library guest');await guest.locator('#room-name').dispatchEvent('change');await guest.locator('#invite-input').fill(offer);await guest.locator('#room-create-answer').click();await guest.waitForFunction(()=>document.getElementById('answer-output').value.length>20);
  const answer=await guest.locator('#answer-output').inputValue();await host.locator('#answer-input').fill(answer);await host.locator('#room-add-guest').click();
  for(const page of pages)await page.waitForFunction(()=>document.querySelectorAll('#room-players li').length===2);
  for(const page of pages)await page.locator('#room-ready').check();await host.waitForFunction(()=>!document.getElementById('room-start').disabled);await host.locator('#room-start').click();
  for(const page of pages){await page.waitForFunction(()=>window.__neoclonkMultiplayer.getState()?.error||window.__rageBrowser.getState().phase==='error'||window.__neoclonkMultiplayer.getState()?.frame>=5,null,{timeout:150000});const r=await roomState(page);assert.equal(r.error,null);const shell=await page.evaluate(()=>window.__rageBrowser.getState());assert.notEqual(shell.phase,'error',shell.error||'Could not initialize room');}
  const teamSelections=[];
  for(let i=0;i<pages.length;++i){const page=pages[i];await page.waitForFunction(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])).players.some(p=>p.local&&(p.menu||p.cursor)),null,{timeout:30000});const before=await nativeState(page),local=before.players.find(p=>p.local);
   if(!local.cursor&&local.menu){if(i)await page.evaluate(()=>window.__rageBrowser.tap('KeyC'));await page.waitForTimeout(150);await page.evaluate(()=>window.__rageBrowser.tap('KeyA'));await page.waitForFunction(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])).players.some(p=>p.local&&p.cursor),null,{timeout:30000});teamSelections.push({device:i,method:i?'Original Right then Throw/menu-enter':'Original Throw/menu-enter',before,after:await nativeState(page)});}
  }
  return {pages,host,guest,guestContext,teamSelections,close:()=>guestContext.close()};
 }catch(error){await guestContext.close();throw error;}
}
export async function exerciseRoom(room){
 const {pages,host}=room,controls=[];
 for(let i=0;i<pages.length;++i){const before=await nativeState(pages[i]);assert.deepEqual(before.players.filter(p=>p.local).map(p=>p.number),[i]);const d=await pages[i].evaluate(()=>JSON.parse(Module.ccall('nc_browser_diagnostics','string',[],[])));assert.equal(d.viewports.length,1);await pages[i].evaluate(()=>window.__rageBrowser.tap('KeyC'));controls.push({device:i,before:before.players.find(p=>p.local)});}
 const frame=(await roomState(host)).frame;await host.waitForFunction(frame=>window.__neoclonkMultiplayer.getState()?.error||window.__neoclonkMultiplayer.getState()?.frame>=frame+18,frame,{timeout:60000});
 for(let i=0;i<pages.length;++i){await pages[i].evaluate(()=>window.__rageBrowser.tap('KeyX'));controls[i].after=(await nativeState(pages[i])).players.find(p=>p.local);}
 // Per-map check uses the actual frozen native frame after both inputs.
 // The separate rtc-room regression covers the periodic 120-frame exchange.
 assert.equal((await roomState(host)).error,null);
 await host.evaluate(()=>window.__neoclonkMultiplayer.setPaused(true));for(const page of pages)await page.waitForFunction(()=>window.__neoclonkMultiplayer.getState()?.paused);
 await host.waitForTimeout(200);let sync;
 for(let attempt=0;attempt<20;++attempt){const frames=await Promise.all(pages.map(roomState));if(frames[0].frame===frames[1].frame){sync=await Promise.all(pages.map(page=>page.evaluate(()=>{const p=Module.ccall('nc_browser_net_sync','number',[],[]),n=Module.ccall('nc_browser_net_size','number',[],[]);return {frame:JSON.parse(Module.ccall('nc_browser_state','string',[],[])).frame,fields:Array.from(Module.HEAPU8.slice(p,p+n)),terrain:Module.ccall('nc_browser_landscape_hash','number',[],[])};})));break;}await host.waitForTimeout(100);}
 assert.ok(sync,'Both devices must reach the same frozen frame');assert.deepEqual(sync[0],sync[1],'Original synchronized fields and actual terrain must agree on both devices');
 return {mode:'Production WebRTC room, two independent browser contexts',teamSelections:room.teamSelections,controls,sync,room:await roomState(host)};
}

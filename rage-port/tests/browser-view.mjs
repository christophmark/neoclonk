// Presentation acceptance: zoom/resize do not alter original simulation state.
import assert from 'node:assert/strict';
import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out='rage-port/outputs/view'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1280,height:800}}), errors=[], trace=[], coverage={mousePicking:'not reached'};
page.on('pageerror',error=>errors.push(String(error)));
const call=(name,result='number',args=[])=>page.evaluate(({name,result,args})=>Module.ccall('nc_browser_'+name,result,args.map(()=>'number'),args),{name,result,args});
const state=async()=>JSON.parse(await call('state','string'));
const record=async name=>{const s=await state();trace.push({name,state:s});console.log(name,JSON.stringify(s.viewport));return s;};
async function view(width,height,zoom,occlusion=[0,0,0,0]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(350);
  // ResizeObserver/visualViewport may each enqueue a final shell layout. Wait
  // until this explicit render-test configuration is actually the active one.
  for(let attempt=0;attempt<6;++attempt) {
    assert.equal(await call('view','number',[width,height,zoom,...occlusion]),1);
    await page.waitForTimeout(250);const s=await state();
    const o=s.viewport.occlusion;
    if(Math.abs(s.viewport.requestedZoom-zoom)<0.001 &&
      [o.x,o.y,o.width,o.height].every((n,i)=>n===occlusion[i]))return s;
  }
  throw Error('Shell layout kept replacing explicit camera test configuration');
}
try {
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:3002/');await page.locator('#start').click();
 await page.waitForFunction(()=>window.__rageBrowser?.getState().phase==='playing'&&window.Module?._nc_browser_view,null,{timeout:90000});
 await call('pause','number',[1]);await call('step','number',[40]);
 const initial=await state(), hash=await call('landscape_hash'), cursor=initial.players.find(p=>p.local).cursor;
 const one=await view(1280,800,1);await record('desktop-1x');
 assert.equal(one.viewport.width,1280);assert.equal(one.viewport.y,64);
 await page.screenshot({path:out+'/desktop-1x.png'});
 const header1=await page.screenshot({clip:{x:580,y:0,width:120,height:48}});
 const two=await view(1280,800,one.viewport.zoom*2);await record('desktop-2x');
 assert.equal(two.viewport.width,one.viewport.width);assert.equal(two.viewport.headerHeight,64);
 assert.ok(Math.abs(two.viewport.worldWidth*2-one.viewport.worldWidth)<=1);
 const header2=await page.screenshot({clip:{x:580,y:0,width:120,height:48}});
 assert.ok(header2.equals(header1),'Opaque original header/logo pixels stay unchanged when world zoom doubles');
 await page.screenshot({path:out+'/desktop-2x.png'});
 // A real mouse move goes through the original SDL and mouse-control adapters.
 const sx=640, sy=380;await page.mouse.move(sx,sy);await page.waitForTimeout(200);
 const picking=await state();
 trace.push({name:'mouse-picking',state:picking});
 console.log('mouse-picking',JSON.stringify({mouse:picking.mouse,viewport:picking.viewport}));
 if(picking.mouse.active && (picking.mouse.screenX!==0 || picking.mouse.screenY!==0)) {
   assert.ok(Math.abs(picking.mouse.worldX-(picking.viewport.worldX+picking.mouse.screenX/picking.viewport.zoom))<=1,'Mouse world X matches active viewport inverse projection');
   assert.ok(Math.abs(picking.mouse.worldY-(picking.viewport.worldY+picking.mouse.screenY/picking.viewport.zoom))<=1,'Mouse world Y matches active viewport inverse projection');
   coverage.mousePicking='passed: original viewport mouse coordinates use inverse world projection';
 } else coverage.mousePicking='not exercised: original Classic keyboard round did not route the DOM mouse event to world control; coordinates remained zero';
 const mobile=await view(390,844,2,[222,638,160,198]);await record('portrait-safe-camera');
 assert.equal(mobile.viewport.width,390);
 assert.ok(mobile.viewport.worldX>=0&&mobile.viewport.worldY>=0,'Portrait camera does not add avoidable left/top borders');
 assert.ok(mobile.viewport.clonkScreenX<222 || mobile.viewport.clonkScreenY<638,'Clonk stays outside lower-right touch obstruction');
 assert.ok(mobile.viewport.clonkScreenY>=64&&mobile.viewport.clonkScreenY<844);
 await page.screenshot({path:out+'/portrait-2x.png'});
 const wide=await view(896,414,2,[718,230,170,176]);await record('landscape-safe-camera');
 assert.equal(wide.viewport.width,896);
 assert.ok(wide.viewport.worldX>=0&&wide.viewport.worldY>=0,'Landscape camera does not add avoidable left/top borders');
 assert.ok(wide.viewport.clonkScreenX<718 || wide.viewport.clonkScreenY<230);
 await page.screenshot({path:out+'/landscape-2x.png'});
 const final=await state(),finalCursor=final.players.find(p=>p.local).cursor;
 assert.equal(final.frame,initial.frame);assert.equal(finalCursor.fixedX,cursor.fixedX);assert.equal(finalCursor.fixedY,cursor.fixedY);
 assert.equal(await call('landscape_hash'),hash,'Presentation changes preserve every terrain byte');
 assert.deepEqual(errors,[]);console.log('PASS responsive world-only zoom, invariant header, touch-safe camera and unchanged simulation');
}catch(error){console.error(error);errors.push(error.stack);process.exitCode=1;await page.screenshot({path:out+'/failure.png'});}
finally{await writeFile(out+'/report.json',JSON.stringify({trace,errors,coverage},null,2));await browser.close();}

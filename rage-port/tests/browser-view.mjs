// Presentation acceptance: zoom/resize do not alter original simulation state.
import assert from 'node:assert/strict';
import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const engine=process.env.BROWSER||'chromium';
const out=engine==='webkit'?'rage-port/outputs/view-webkit':'rage-port/outputs/view'; await mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}}:{executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true}), errors=[], trace=[], coverage={mousePicking:'not reached'};
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
 const url=new URL(process.env.GAME_URL||'http://127.0.0.1:3902/');url.searchParams.set('touch','0');await page.goto(url.href);await page.locator('#start').click();
 await page.waitForFunction(()=>window.__rageBrowser?.getState().phase==='playing'&&window.Module?._nc_browser_view,null,{timeout:90000});
 await call('pause','number',[1]);await call('step','number',[40]);
 // WebKit may expose the new native viewport before the shell's first layout.
 await page.waitForFunction(()=>JSON.parse(Module.ccall('nc_browser_state','string',[],[])).viewport?.zoom===1.5);
 const initial=await state(), hash=await call('landscape_hash'), cursor=initial.players.find(p=>p.local).cursor;
 assert.equal(initial.viewport.zoom,1.5,'Fresh default zoom stays unchanged');
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
 // Exercise the actual slider at its new minimum with the real touch pad.
 await page.evaluate(()=>window.__rageBrowser.showTouch(true));
 for(const [width,height,label]of [[390,844,'portrait'],[896,414,'landscape']]){
  await page.setViewportSize({width,height});
  await page.waitForFunction(({width,height})=>Module.canvas.width===width&&Module.canvas.height===height,{width,height});
  const slider=page.locator('#zoom'),box=await slider.boundingBox();
  await page.touchscreen.tap(box.x+1,box.y+box.height/2);
  await page.waitForFunction(()=>{const v=JSON.parse(Module.ccall('nc_browser_state','string',[],[])).viewport;return v.zoom===.25&&Number(document.querySelector('#zoom').min)===.25;});
  const overview=await record(label+'-slider-minimum'),v=overview.viewport;
  assert.equal(v.worldWidth,Math.round(v.width/.25));
  assert.equal(v.worldHeight,Math.round(v.height/.25));
  const pad=await page.locator('#touchpad').boundingBox();
  assert.ok(v.clonkScreenX>=0&&v.clonkScreenX<width&&v.clonkScreenY>=64&&v.clonkScreenY<height,'Clonk remains on screen');
  assert.ok(!(v.clonkScreenX>=pad.x&&v.clonkScreenX<=pad.x+pad.width&&v.clonkScreenY>=pad.y&&v.clonkScreenY<=pad.y+pad.height),'Overview keeps Clonk clear of touch controls');
  assert.equal(v.headerHeight,64);
  const capture=out+'/'+label+'-minimum.png';await page.screenshot({path:capture});
  // Catch projection/clipping errors that leave correct camera coordinates but
  // a blank landscape. Inspect the map itself, excluding the HUD and margins.
  const bounds=[v.x-v.worldX*v.zoom,v.y-v.worldY*v.zoom,v.x+(overview.landscape.width-v.worldX)*v.zoom,v.y+(overview.landscape.height-v.worldY)*v.zoom].map(Math.round);
  const visible=Number(execFileSync('python3',['-c','from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGB").crop(tuple(map(int,sys.argv[2:]))); pixels=list(im.getdata()); print(sum(max(p)-min(p)>20 and sum(p)>90 for p in pixels)/len(pixels))',capture,...bounds.map(String)],{encoding:'utf8'}));
  assert.ok(visible>.5,'Overview renders colored landscape rather than an empty viewport');
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('neoclonk.zoom')),'0.25','New zoom-out preference is saved');
 const final=await state(),finalCursor=final.players.find(p=>p.local).cursor;
 assert.equal(final.frame,initial.frame);assert.equal(finalCursor.fixedX,cursor.fixedX);assert.equal(finalCursor.fixedY,cursor.fixedY);
 assert.equal(await call('landscape_hash'),hash,'Presentation changes preserve every terrain byte');
 assert.deepEqual(errors,[]);console.log('PASS responsive world-only zoom, invariant header, touch-safe camera and unchanged simulation');
}catch(error){console.error(error);errors.push(error.stack);process.exitCode=1;await page.screenshot({path:out+'/failure.png'});}
finally{await writeFile(out+'/report.json',JSON.stringify({engine,trace,errors,coverage},null,2));await browser.close();}

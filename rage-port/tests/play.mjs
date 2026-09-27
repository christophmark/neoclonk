/** Isolated browser console for playing the original engine using its own controls. */
import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { createInterface } from 'node:readline';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:process.env.MOBILE==='1'});
page.on('pageerror',e=>console.log('ERROR',e.stack));
page.on('console',e=>console.log('LOG',e.text().slice(0,400)));
page.setDefaultTimeout(60000);
await page.goto(process.env.NEOCLONK_URL||'http://127.0.0.1:3002/');
await page.getByRole('button',{name:/start/i}).first().click();
await page.waitForFunction(()=>['playing','error','exited'].includes(window.__rageBrowser?.getState().phase),null,{timeout:60000});
console.log('ENGINE',await page.evaluate(()=>({phase:window.__rageBrowser.getState().phase,export:typeof Module._nc_browser_state,state:Module.ccall('nc_browser_state','string',[],[])})));
await page.evaluate(()=>Module.ccall('nc_browser_pause','number',['number'],[1]));
console.log('READY');
for await(const line of createInterface({input:process.stdin,terminal:false})){
 try{
  const c=JSON.parse(line);let result;
  if(c.op==='shot'){await page.screenshot({path:c.path||'rage-port/outputs/play.png'});result='saved'}
  else if(c.op==='dom'){await page.keyboard.press(c.key);result='pressed'}
  else if(c.op==='touch'){await page.locator(`[data-code="${c.code}"]`).tap();await page.waitForTimeout(150);result='tapped'}
  else if(c.op==='eval')result=await page.evaluate(c.js);
  else if(c.op==='quit')break;
  else result=await page.evaluate(c=>{const call=(name,type,args=[])=>Module.ccall('nc_browser_'+name,type,args.map(()=> 'number'),args);if(c.op==='state')return JSON.parse(call('state','string'));if(c.op==='objects')return JSON.parse(call('objects','string',[0,0,0]));if(c.op==='step')return call('step','number',[c.ticks]);if(c.op==='pause')return call('pause','number',[c.value]);if(c.op==='key')return call('key','number',[c.key,c.down,0,0]);if(c.op==='tap'){call('control','number',[0,c.control,1,0]);return call('control','number',[0,c.control,0,0])}throw Error(c.op)},c);
  console.log('RESULT',JSON.stringify(result));
 }catch(e){console.log('ERROR',e.stack)}
}
await browser.close();

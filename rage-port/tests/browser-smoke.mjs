import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1100,height:850}});
const logs=[];
page.on('console',m=>{logs.push(`${m.type()}: ${m.text()}`); console.log(m.type(),m.text().slice(0,1500));});
page.on('pageerror',e=>{logs.push(`PAGEERROR ${e.stack}`); console.log('PAGEERROR',e.stack);});
try {
 await page.goto('http://127.0.0.1:3002/');
 await page.getByRole('button',{name:/start|play|enter|begin/i}).first().click();
 await page.waitForTimeout(Number(process.env.WAIT_MS||25000));
 await page.screenshot({path:'rage-port/outputs/browser-smoke.png'});
 await writeFile('rage-port/outputs/browser-log.txt',logs.join('\n'));
 await writeFile('rage-port/outputs/browser-body.txt',await page.locator('body').innerText());
 const log=await page.evaluate(()=>{try{return Module.FS.readFile('/data/Clonk.log',{encoding:'utf8'})}catch(e){return String(e)}});
 await writeFile('rage-port/outputs/engine-log.txt',log);
 console.log('BODY',await page.locator('body').innerText());
} finally {await browser.close();}

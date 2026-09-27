// Check the actual static export under a repository-name base path.
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const root=resolve(process.env.PAGES_DIR||'_site'),out=resolve('rage-port/outputs/pages-static');await mkdir(out,{recursive:true});
const failures=[],mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.wasm':'application/wasm','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/neoclonk/')){failures.push(url.pathname);res.writeHead(404).end();return;}let path=resolve(root,decodeURIComponent(url.pathname.slice('/neoclonk/'.length)));if(!path.startsWith(root+'/')&&path!==root)throw Error();let info=await stat(path);if(info.isDirectory()){path=resolve(path,'index.html');info=await stat(path);}res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.setHeader('Content-Length',info.size);res.end(req.method==='HEAD'?undefined:await readFile(path));}catch{failures.push(req.url);res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/neoclonk/`;
const browser=await chromium.launch({headless:true,executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],report={};page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(base);const game=page.frameLocator('#game');await game.locator('#catalog-summary').filter({hasText:'80 original scenarios'}).waitFor();assert.equal(await game.locator('.scenario-tile').count(),80);assert.deepEqual(await page.locator('#game').boundingBox(),{x:0,y:0,width:390,height:844});
 const manifestURL=await page.locator('link[rel="manifest"]').evaluate(el=>el.href);assert.equal(manifestURL,base+'manifest.json');const manifest=await(await page.request.get(manifestURL)).json();for(const key of ['id','start_url','scope'])assert.equal(new URL(manifest[key],manifestURL).href,base);
 for(const icon of manifest.icons){const url=new URL(icon.src,manifestURL).href;assert.ok(url.startsWith(base+'icons/'));assert.equal((await page.request.head(url)).status(),200);}assert.equal((await page.request.head(await page.locator('link[rel="apple-touch-icon"]').evaluate(el=>el.href))).status(),200);
 await page.screenshot({path:out+'/mobile-gallery.png'});report.galleryAndIcons=true;
 await page.goto(base+'?room=abcd2345&scenario=worlds.c4f/goldmine.c4s&touch=1');await game.locator('#room-title').filter({hasText:'Join a crew'}).waitFor();const frameURL=new URL(await page.locator('#game').getAttribute('src'));assert.equal(frameURL.pathname,'/neoclonk/rage/index.html');assert.equal(frameURL.searchParams.get('room'),'ABCD2345');assert.equal(frameURL.searchParams.get('join'),'1');assert.equal(frameURL.searchParams.get('touch'),'1');assert.equal(frameURL.searchParams.get('scenario'),'worlds.c4f/goldmine.c4s');report.wrapperInvite=true;
 await page.goto(base+'rage/index.html?join=1&room=ABCD2345');await page.locator('#room-title').filter({hasText:'Join a crew'}).waitFor();assert.equal(await page.locator('link[rel="manifest"]').evaluate(el=>el.href),manifestURL);assert.equal(await page.locator('link[rel="apple-touch-icon"]').evaluate(el=>el.href),base+'apple-touch-icon.png');report.nativeInviteIcons=true;
 for(const asset of ['rage/clonk.wasm','rage/clonk.data','rage/source/browser-port-sources.zip','rage/licenses/clonk_content_license.txt']){const result=await page.request.head(base+asset);assert.equal(result.status(),200,asset);}
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);report.passed=true;
}catch(error){report.failure=String(error);report.stack=error.stack;process.exitCode=1;}finally{report.errors=errors;report.missing=failures;await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}console.log(JSON.stringify(report,null,2));

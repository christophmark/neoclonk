// Crop an actual original-engine screenshot for the game chooser.
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source='rage-port/outputs/scenario-library/western__goldrush.png';
const png=await readFile(source),crop={x:1070,y:135,width:400,height:225};
const output='rage-port/shell/assets/Rage-GoldRush-card.png';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:crop.width,height:crop.height},deviceScaleFactor:1});
 await page.setContent(`<style>html,body{margin:0;overflow:hidden}img{position:absolute;left:-${crop.x}px;top:-${crop.y}px;max-width:none}</style><img src="data:image/png;base64,${png.toString('base64')}">`);
 await page.locator('img').evaluate(img=>img.decode());
 await page.screenshot({path:output});
 await writeFile(output.replace('.png','.provenance.json'),JSON.stringify({scenario:'western.c4f/goldrush.c4s',source,sourceSha256:createHash('sha256').update(png).digest('hex'),crop,method:'Original Game.GraphicsSystem.SaveScreenshot(true), cropped at native resolution using browser screenshot. No generated scenery.',reproduce:'node tools/render-game-card.mjs',attribution:'Clonk Rage content © RedWolf Design / Matthes Bender and contributors. CC BY-NC 4.0.'},null,2)+'\n');
} finally {await browser.close();}

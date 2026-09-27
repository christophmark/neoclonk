// Compose real engine screenshots in a browser; no generated scenery or retouching.
// Inputs are full-resolution captures from rage-port/tests/scenario-library.mjs.
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const panels = [
  { title: 'Arctic', id: 'farworlds.c4f/arctic.c4s', file: 'farworlds__arctic.png', width: 4500, height: 900, crop: [1050, 0, 600, 900] },
  { title: 'Gold Rush', id: 'western.c4f/goldrush.c4s', file: 'western__goldrush.png', width: 4350, height: 650, crop: [1030, 0, 433.333333, 650] },
  { title: 'Jungle', id: 'farworlds.c4f/jungle.c4s', file: 'farworlds__jungle.png', width: 2600, height: 1000, crop: [1220, 0, 600, 900] },
];
const provenance = [];
const figures = [];
for (const panel of panels) {
  const source = `rage-port/outputs/scenario-library/${panel.file}`;
  const png = await readFile(path.join(root, source));
  const [x, y, w] = panel.crop;
  const scale = 400 / w;
  figures.push(`<figure><img alt="${panel.title}" src="data:image/png;base64,${png.toString('base64')}" style="width:${panel.width * scale}px;height:${panel.height * scale}px;left:${-x * scale}px;top:${-y * scale}px"><figcaption>${panel.title}</figcaption></figure>`);
  provenance.push({ ...panel, source, sha256: createHash('sha256').update(png).digest('hex') });
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}html,body{margin:0;width:1200px;height:600px;background:#171a13}
    main{display:flex}figure{position:relative;margin:0;width:400px;height:600px;overflow:hidden}
    figure+figure{box-shadow:inset 3px 0 #dfc685;z-index:1}
    img{position:absolute;max-width:none;z-index:-1}figure:first-child img{z-index:0}
    figure:after{content:'';position:absolute;inset:0;pointer-events:none;border:1px solid #e8d39544}
    figcaption{position:absolute;bottom:0;left:0;right:0;padding:52px 24px 24px;color:#ffe4a0;font:bold 32px Georgia,serif;text-shadow:0 2px 4px #000;background:linear-gradient(transparent,#10130ae8)}
  </style></head><body><main>${figures.join('')}</main></body></html>`);
  await page.evaluate(async () => Promise.all([...document.images].map(image => image.decode())));
  await mkdir(path.join(root, 'docs/images'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'docs/images/scenarios.png') });
  await writeFile(path.join(root, 'docs/images/scenarios.provenance.json'), JSON.stringify({
    description: 'Three portrait crops of original-engine gameplay captures, arranged side by side with scenario labels.',
    attribution: 'Clonk Rage content © RedWolf Design / Matthes Bender and contributors. CC BY-NC 4.0.',
    license: 'https://creativecommons.org/licenses/by-nc/4.0/',
    captureMethod: 'Original Game.GraphicsSystem.SaveScreenshot(true), rendered in the browser port.',
    composition: 'node tools/render-readme-collage.mjs',
    dimensions: [1200, 600], panels: provenance,
  }, null, 2) + '\n');
} finally {
  await browser.close();
}

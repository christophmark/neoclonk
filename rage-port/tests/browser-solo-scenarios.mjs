// Actual one-player startup and original control input in multiplayer scenarios.
import { chromium, webkit } from '../../web/node_modules/playwright/index.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const engine = process.env.BROWSER || 'chromium';
const catalog = JSON.parse(await readFile('rage-port/catalog/scenarios.json', 'utf8'));
const filter = process.env.SCENARIOS?.split(',');
const scenarios = catalog.scenarios.filter(s => s.minPlayers > 1 && (!filter || filter.includes(s.id)));
const base = process.env.GAME_URL || 'http://127.0.0.1:3902/rage/index.html';
const out = `rage-port/outputs/solo-scenarios-${engine}`;
await mkdir(out, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit'
 ? { headless: true, env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' } }
 : { executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { engine, results: [] };
if (process.env.RESUME === '1') {
 try { report.results = JSON.parse(await readFile(`${out}/report.json`, 'utf8')).results.filter(r => r.passed); } catch {}
}

const call = (page, name, result = 'number', types = [], args = []) => page.evaluate(({ name, result, types, args }) => Module.ccall('nc_browser_' + name, result, types, args), { name, result, types, args });
const state = page => call(page, 'state', 'string').then(JSON.parse);
const diagnostics = page => call(page, 'diagnostics', 'string').then(JSON.parse);
async function ready(page) {
 await page.waitForFunction(() => window.__rageBrowser?.getState().ready || ['error', 'ended'].includes(window.__rageBrowser?.getState().phase), null, { timeout: 120000 });
 const shell = await page.evaluate(() => window.__rageBrowser.getState());
 assert.equal(shell.ready, true, shell.logs.slice(-15).join('\n'));
 assert.equal(shell.multiplayer, false);
 await call(page, 'pause', 'number', ['number'], [1]);
}
let nextScenario = 0;
async function worker() {
 for (;;) {
  const scenario = scenarios[nextScenario++]; if (!scenario) break;
  if (report.results.some(r => r.id === scenario.id && r.passed)) continue;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const record = { id: scenario.id, passed: false, dialogs: [], errors: [] };
  page.on('pageerror', e => record.errors.push(String(e)));
  try {
   await page.goto(base + '?scenario=' + scenario.id);
   await page.waitForFunction(() => window.__scenarioGallery?.getSelected());
   assert.equal(await page.locator('#start').textContent(), 'Host');
   assert.equal(await page.locator('#play-solo').isVisible(), true);
   if (scenario.id === 'farworlds.c4f/jungle.c4s') await page.screenshot({ path: `${out}/jungle-selection.png` });
   await page.locator('#play-solo').click();
   await ready(page);
   // A scenario may show original team-selection or information dialogs.
   for (let attempt = 0; attempt < 8; attempt++) {
    const d = await diagnostics(page);
    if (!d.dialog) break;
    record.dialogs.push(d.dialog.id);
    await page.locator('#canvas').focus(); await page.keyboard.press('Enter');
    await page.waitForTimeout(70); await call(page, 'pause', 'number', ['number'], [1]);
    await call(page, 'step', 'number', ['number'], [1]);
   }
   await call(page, 'step', 'number', ['number'], [5]);
   for (let attempt = 0; attempt < 8; attempt++) {
    const player = (await state(page)).players[0];
    if (player?.cursor || !player?.menu) break;
    await page.evaluate(() => window.__rageBrowser.tap('KeyA'));
    await page.waitForTimeout(70); await call(page, 'step', 'number', ['number'], [5]);
   }
   record.initial = await state(page);
   assert.equal(record.initial.players.length, 1);
   assert.ok(!record.initial.players[0].eliminated);
   assert.ok(record.initial.players[0].cursor, 'One player must have a controllable Clonk');
   await page.evaluate(() => window.__rageBrowser.press('KeyC'));
   await call(page, 'step', 'number', ['number'], [30]);
   record.input = await state(page);
   await page.evaluate(() => { window.__rageBrowser.release('KeyC'); window.__rageBrowser.tap('KeyX'); });
   await call(page, 'step', 'number', ['number'], [210]);
   record.after = await state(page); record.diagnostics = await diagnostics(page);
   if (record.after.gameOver && record.after.evaluated && record.diagnostics.dialog && record.after.frame < record.initial.frame + 240) {
    record.earlyEvaluation = { state: record.after, dialog: record.diagnostics.dialog };
    // Original evaluation dialog focuses End game first; Tab selects Continue this round.
    await page.locator('#canvas').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    // The deterministic step helper deliberately stops at GameOver; continue through the real browser clock.
    await page.waitForTimeout(100); await call(page, 'pause', 'number', ['number'], [0]);
    await page.waitForFunction(frame => JSON.parse(Module.ccall('nc_browser_state', 'string', [], [])).frame >= frame, record.initial.frame + 240, { timeout: 30000 });
    await call(page, 'pause', 'number', ['number'], [1]);
    record.after = await state(page); record.diagnostics = await diagnostics(page);
    record.continuedAfterEvaluation = true;
   }
   assert.ok(record.after.frame >= record.initial.frame + 240, 'Original simulation advances');
   assert.ok(record.after.running && !record.after.players[0].eliminated);
   assert.equal(record.after.players.length, 1);
   assert.deepEqual(record.errors, []);
   if (scenario.id === 'farworlds.c4f/jungle.c4s') {
    assert.notDeepEqual([record.initial.players[0].cursor.x, record.initial.players[0].cursor.y, record.initial.players[0].cursor.action], [record.input.players[0].cursor.x, record.input.players[0].cursor.y, record.input.players[0].cursor.action], 'Jungle Clonk responds to original movement controls');
    await page.screenshot({ path: `${out}/jungle-playing.png` });
    await page.locator('#main-menu').click();
    assert.equal(await page.locator('#start').textContent(), 'Resume game');
    assert.equal(await page.locator('#host-room').isVisible(), true);
    assert.equal(await page.locator('#play-solo').isVisible(), false);
    await page.screenshot({ path: `${out}/jungle-menu.png` });
    await page.locator('#new-game').click();
    assert.equal(await page.locator('#leave-dialog').isVisible(), true);
    await page.locator('#leave-discard').click();
    await page.waitForURL(url => url.searchParams.get('solo') === '1'); await ready(page);
    assert.equal((await page.evaluate(() => window.__rageBrowser.getState())).scenarioId, scenario.id);
    record.restartRetainsSolo = true;
   }
   record.passed = true;
  } catch (error) {
   record.failure = String(error); record.stack = error.stack;
   await page.screenshot({ path: `${out}/${scenario.id.replaceAll('/', '_')}-failure.png` }).catch(() => {});
   console.error(record.failure);
  } finally { await page.close(); }
  report.results.push(record); console.log(record.passed ? 'PASS' : 'FAIL', scenario.id);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
 }
}
try { await Promise.all(Array.from({ length: Number(process.env.WORKERS || 3) }, () => worker())); }
finally { await browser.close(); }
report.expectedScenarios = scenarios.map(s => s.id);
report.passed = scenarios.length > 0 && scenarios.every(s => report.results.some(r => r.id === s.id && r.passed)) && report.results.every(r => r.passed);
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;

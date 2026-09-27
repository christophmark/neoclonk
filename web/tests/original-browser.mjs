/** Real browser acceptance of original Clonk Rage. No game-state setters or synthetic terrain. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const url = process.env.GAME_URL || process.env.NEOCLONK_URL || 'http://127.0.0.1:3000/';
const output = fileURLToPath(new URL('../outputs/original-browser/', import.meta.url));
await mkdir(output, { recursive: true });
const report = { url, checks: [], trace: [], errors: [], console: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
let activePage;
function check(name, details = {}) { report.checks.push({ name, ...details }); console.log('PASS', name, JSON.stringify(details)); }
async function session(options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage(); activePage = page;
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => report.errors.push(error.stack));
  page.on('console', message => { if (message.type() === 'error') report.console.push(message.text()); });
  await page.goto(url);
  let game = page.mainFrame();
  if (await page.locator('iframe').count()) {
    game = await (await page.locator('iframe').first().elementHandle()).contentFrame();
  }
  const call = (name, result = 'number', args = []) => game.evaluate(({ name, result, args }) =>
    window.Module.ccall('nc_browser_' + name, result, args.map(() => 'number'), args), { name, result, args });
  const state = async () => JSON.parse(await call('state', 'string'));
  const player = s => s.players.find(p => p.local);
  const clonk = s => player(s)?.cursor;
  const step = async ticks => { assert.equal(await call('step', 'number', [ticks]), ticks); return state(); };
  const key = async (keyName, ticks = 1) => {
    await game.locator('#canvas').focus();
    await page.keyboard.press(keyName);
    // SDL consumes the browser event at the next host yield, even while game simulation is paused.
    await page.waitForTimeout(140);
    return step(ticks);
  };
  const start = async () => {
    if (game.isDetached()) game = await (await page.locator('iframe').first().elementHandle()).contentFrame();
    await game.locator('#start').click();
    await game.waitForFunction(() => ['playing', 'error', 'exited'].includes(window.__rageBrowser?.getState().phase), null, { timeout: 90000 });
    const boot = await game.evaluate(() => window.__rageBrowser.getState());
    assert.equal(boot.phase, 'playing', JSON.stringify(boot));
    await game.waitForFunction(() => JSON.parse(window.Module.ccall('nc_browser_state', 'string', [], [])).players.some(p => p.local && p.cursor));
    assert.equal(await call('pause', 'number', [1]), 1);
    return state();
  };
  const record = async name => { const s = await state(); report.trace.push({ name, state: s }); return s; };
  return { context, page, get game() { return game; }, call, state, player, clonk, step, key, start, record };
}

try {
  if (process.env.TEST_ONLY !== 'mobile') {
  const d = await session({ viewport: { width: 1100, height: 850 } });
  const initial = await d.start();
  assert.match(initial.scenario, /Goldmine/i);
  assert.equal(d.player(initial).controlStyle, 0, 'Original Classic control style');
  check('Original Goldmine initializes', { scenario: initial.scenario, objects: initial.objectCount });
  await d.step(40);
  await d.key('c', 16);
  const terrainBefore = await d.call('landscape_hash');
  await d.key('d', 10);
  let diagonal;
  // Goldmine generates random earth/rock seams. Observe a clear ten-tick segment;
  // original contact handling may stop or flatten a dig when it meets solid rock.
  for (let attempt = 0; attempt < 8 && !diagonal; ++attempt) {
    for (let interval = 0; interval < 5 && !diagonal; ++interval) {
      const before = await d.state(); const after = await d.step(10);
      const a = d.clonk(before), b = d.clonk(after);
      const dx = b.fixedX - a.fixedX, dy = b.fixedY - a.fixedY;
      if (a.action === 'Dig' && b.action === 'Dig' && dx > 0 && dx === dy) diagonal = { dx, dy, ticks: 10 };
    }
    if (!diagonal) { await d.key('x', 8); await d.key('s', 12); await d.key('c', 28); await d.key('d', 10); }
  }
  await d.record('digging-after-keys-released');
  assert.ok(diagonal, 'Original controls find an unobstructed diagonal digging segment');
  assert.notEqual(await d.call('landscape_hash'), terrainBefore, 'Original excavation changes actual landscape');
  check('DOM C then D keeps digging at 45 degrees after release', diagonal);
  await d.page.screenshot({ path: output + 'desktop-digging.png' });
  const stopped = await d.key('x', 12);
  assert.notEqual(d.clonk(stopped).action, 'Dig');
  const settled = await d.step(12);
  assert.equal(d.clonk(settled).fixedX, d.clonk(stopped).fixedX);
  check('DOM X stops digging and horizontal movement');
  const menu = await d.key('r');
  assert.equal(d.player(menu).menu, true);
  check('DOM R opens the original player menu');
  await d.page.screenshot({ path: output + 'original-menu.png' });
  // Original single-player Goldmine main menu: goals, rules, new player, save.
  for (let i = 0; i < 3; ++i) await d.key('c');
  await d.key('a');
  await d.page.screenshot({ path: output + 'original-save-slots.png' });
  await d.key('a', 3);
  await d.game.waitForFunction(() => window.__rageBrowser.getState().logs.some(line => line.includes('Game saved.')));
  assert.equal(await d.game.evaluate(() => window.__rageBrowser.syncSaves()), true);
  const saves = await d.game.evaluate(() => window.__rageBrowser.listSavedGames());
  assert.ok(saves.length > 0, 'Original menu save is discoverable');
  const savedBytes = await d.game.evaluate(name => window.__rageBrowser.readFile('/data/home/Savegames.c4f/' + name), saves[0]);
  const savedHash = createHash('sha256').update(new Uint8Array(savedBytes)).digest('hex');
  check('Original save menu writes a round and syncs IDBFS', { saves });
  await d.page.reload();
  await d.start();
  const restored = await d.game.evaluate(() => window.__rageBrowser.listSavedGames());
  assert.deepEqual(restored, saves);
  const restoredBytes = await d.game.evaluate(name => window.__rageBrowser.readFile('/data/home/Savegames.c4f/' + name), saves[0]);
  assert.equal(createHash('sha256').update(new Uint8Array(restoredBytes)).digest('hex'), savedHash);
  check('Saved round survives a full page reload with identical bytes', { sha256: savedHash, bytes: savedBytes.length });
  await d.game.locator('#saved-games').selectOption(saves[0]);
  await d.game.locator('#load-save').click();
  await d.game.waitForURL(/save=/);
  const resumed = await d.start();
  assert.match(resumed.scenario, /Savegames\.c4f/i);
  check('Saved-round selector resumes the original saved game', { scenario: resumed.scenario, frame: resumed.frame });
  await d.page.screenshot({ path: output + 'saved-round-resumed.png' });
  await d.context.close();
  }

  const m = await session({ viewport: { width: 896, height: 414 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await m.start(); await m.step(40);
  await m.game.evaluate(() => {
    window.__acceptanceControls = [];
    const original = window.Module.ccall;
    window.Module.ccall = function(name, result, types, args) {
      if (name === 'nc_browser_control') window.__acceptanceControls.push({ index: args[1], pressed: args[2] });
      return original.call(this, name, result, types, args);
    };
  });
  await m.game.locator('#touchpad').waitFor({ state: 'visible' });
  const codes = await m.game.locator('#touchpad button').evaluateAll(buttons => buttons.map(button => button.dataset.code));
  assert.deepEqual(codes, ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC']);
  // Test direction before UP: beside the initial hut UP correctly enters it,
  // where LEFT/RIGHT navigate its menus instead of moving a clonk outside.
  for (const code of ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyZ', 'KeyC', 'KeyD', 'KeyX', 'KeyS']) {
    const button = m.game.locator(`#touchpad button[data-code="${code}"]`);
    const box = await button.boundingBox();
    assert.ok(box && box.width >= 40 && box.height >= 40, `${code} has a usable touch target`);
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 896 && box.y + box.height <= 414, `${code} fits landscape viewport`);
    const beforeTouch = await m.state();
    await m.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await m.page.waitForTimeout(140); await m.step(code === 'KeyS' ? 60 : 12);
    assert.equal(await button.evaluate(b => b.classList.contains('active')), false, `${code} releases after touch`);
    const afterTouch = await m.record('touch-' + code);
    if (code === 'KeyZ') assert.ok(m.clonk(afterTouch).x < m.clonk(beforeTouch).x, 'Touch left moves the original clonk left');
    if (code === 'KeyC') assert.ok(m.clonk(afterTouch).x > m.clonk(beforeTouch).x, 'Touch right moves the original clonk right');
    const events = await m.game.evaluate(index => window.__acceptanceControls.filter(event => event.index === index).map(event => event.pressed), codes.indexOf(code));
    assert.deepEqual(events, [1, 0], `${code} dispatches one configured control press and release`);
  }
  check('All nine translucent controls accept real landscape touchscreen taps', { codes });
  await m.page.screenshot({ path: output + 'mobile-nine-buttons.png' });
  await m.game.locator('#game-menu').tap(); await m.page.waitForTimeout(140); await m.step(1);
  assert.equal(m.player(await m.state()).menu, true);
  check('Mobile Menu opens the original player menu');
  await m.game.locator('#game-pause').tap(); await m.page.waitForTimeout(250);
  assert.equal((await m.state()).paused, false, 'Mobile Pause resumes the original simulation');
  await m.game.locator('#game-pause').tap(); await m.page.waitForTimeout(250);
  assert.equal((await m.state()).paused, true, 'Mobile Pause pauses the original simulation');
  check('Mobile Pause toggles the original simulation');
  await m.context.close();
  assert.deepEqual(report.errors, [], 'No uncaught browser runtime errors');
} catch (error) {
  report.failure = error.stack; console.error(error); process.exitCode = 1;
  try { await activePage.screenshot({ path: output + 'failure.png' }); } catch { /* The failing page may already be closed. */ }
} finally {
  await writeFile(output + 'report.json', JSON.stringify(report, null, 2));
  await browser.close();
}

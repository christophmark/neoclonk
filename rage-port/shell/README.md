# Browser host for the original engine

`index.html`, `game.js`, and `assets/` are the canonical standalone shell. Copy them beside the generated `clonk.js`, `clonk.wasm`, and `clonk.data` in `rage-port/dist/`. It expects the non-modularized Emscripten build with exported `FS`, `IDBFS`, `addRunDependency`, `removeRunDependency` and linked `-lidbfs.js`, and the original game data mounted at `/data`.

Click **Start Goldmine** to load the engine. This deliberate button supplies a browser user interaction, focuses the canvas, and leaves actual browser fullscreen optional. The page hosts the original engine's canvas and does not draw replacement scenery or simulate gameplay.

Parameters:

- `?replay=1`: load the native recording fixture instead of a fresh Goldmine round.
- `?touch=1`: show the transparent nine-button controls even on a desktop.
- `?debug=1`: show the engine log immediately.

The touch pad resolves the active player's original keyboard configuration: Q/W/E selection; A throw; S jump/up; D dig; Y/Z left; X stop/down; C right. Pointer release sends keyup, and subsequent taps remain separate key presses so the original double-command logic remains authoritative. No held movement or digging is synthesized after release: persistence comes from the original engine.

For automation, `window.__rageBrowser` exposes:

- `getState()` — lifecycle, original log lines, canvas dimensions.
- `press(code)`, `release(code)`, `tap(code)` — original key events (`KeyC`, `KeyD`, etc.).
- `pause()` — tap the original Pause key.
- `readFile(path)`, `listFiles(path)` — read-only access to the original engine's virtual files/logs/replays.
- `releaseAll()`, `showTouch(boolean)` — cleanup and visible control configuration.

This test interface does not alter terrain, object positions, inventory, RNG, or simulation routines. The original engine remains responsible for pause state and controls. State becomes `playing` when the original log reports `Game started.`; it does not substitute a fixed loading timeout for actual startup.

Host over HTTP rather than opening `index.html` as a file. JavaScript/data loading failures and WebAssembly aborts produce a visible error and retain the engine log. Browser integration testing still needs the actual generated engine; a successful HTML parse alone is not evidence of a running game.

## Local original-format saves

The shell mounts `/data/home` as IDBFS, loads its files before the engine starts, and seeds a fresh persistent player/config only once. Original game saves created from the R player menu live in `/data/home/Savegames.c4f`. F9 is screenshot, not save.

The shell syncs files after the original `Game saved.` log, periodically every 15 seconds, on visibility/pagehide, and on engine exit. **Save** in the wooden header creates an original `.c4s` round through `Game.QuickSave` and waits for the IndexedDB write before confirming success. Every save uses a unique filename and preserves the previous paused/running state. A saved-round selector opens files with the original engine using `?save=<filename.c4s>`. Initialization failures disable persistence and display that the session cannot be retained; a failed read is never followed by a write that could overwrite existing local data.

Storage stays on the current device and origin. The browser may not complete an asynchronous pagehide sync; the immediate post-save sync and explicit sync status are the useful completion checks. The test interface adds `syncSaves()` (resolves success/failure) and `listSavedGames()`.

## Original interface and responsive camera

The original Clonk Rage artwork and font form the startup menu. It reads the
existing save catalog before downloading the engine, allowing direct **Load**.
During play, the canvas occupies the full available viewport. Only **Save** and
**Zoom** are added to the original wooden header; touch devices get the nine
transparent buttons. Tap the original central logo to open the paused menu,
then **Resume game**, **New game**, or load an earlier round.

`nc_browser_view` applies responsive resolution and world-only zoom, keeping
native HUD text and controls at the same size. Minimum zoom fits the finite
landscape to the viewport. The camera uses the largest clear rectangle above
or left of the touch pad to keep the controlled Clonk visible. Browser mouse
coordinates are transformed back to original world coordinates. This changes
presentation only; digging, physics, scripts and simulation speed are unchanged.

The test interface also exposes `openMenu()`, `saveGame()` and `updateView()`.


## Mobile startup ordering

Mount/populate IDBFS in `preRun`, but seed player/config files only in
`onRuntimeInitialized`. The data preloader is asynchronous too: a fast IndexedDB
lookup can finish before `clonk.data` arrives. Reading the seed from the IDBFS
callback caused `ErrnoError` and left `neoclonk-local-saves` pending on phones.
The runtime hook runs after both dependencies finish and before original main.

Save requests arriving during an existing sync await a subsequent sync, so a
caller can safely reload after the returned promise resolves. The regression
in `web/tests/startup-storage.mjs` deliberately reverses the download/storage
order and writes during an active sync. It also covers unavailable storage.

## Keyboard layouts

Touch buttons resolve the player's original configured control through
`nc_browser_control`, including German Left=Y and Menu=<. They never assume
that a visible English letter matches the engine's active keyboard binding.
Physical Y and Z both resolve to the configured Left action while gameplay
handles that key; unhandled GUI/text-entry events keep their native path.
The touch label explicitly shows Y / Z. Repeat and release events still pass
through the original keyboard dispatcher.

# Browser host for the original engine

`index.html`, `game.js`, `gallery.js`, `scenario-library.js`, `multiplayer.js`, and `assets/` are the canonical standalone shell. Copy them beside the generated `clonk.js`, `clonk.wasm`, and `clonk.data` in `rage-port/dist/`. It expects the non-modularized Emscripten build with exported `FS`, `IDBFS`, `addRunDependency`, `removeRunDependency` and linked `-lidbfs.js`, and the original game data mounted at `/data`.

Select one of the 80 scenarios in nine galleries, then choose **Play solo** or **Host game** to load the engine. This deliberate button supplies a browser user interaction, focuses the canvas, and leaves actual browser fullscreen optional. The page hosts the original engine's canvas and does not draw replacement scenery or simulate gameplay.

Parameters:

- `?replay=1`: load the native recording fixture instead of a fresh Goldmine round.
- `?touch=1`: show the transparent nine-button controls even on a desktop.
- `?scenario=<original-lowercase-path>`: select a catalog scenario.
- `?host=1` / `?join=1`: open the manual WebRTC room flow.

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

The original Clonk Rage artwork and font, plus the documented HD restoration of its background, form the startup menu. It reads the
existing save catalog before downloading the engine, allowing direct **Load**.
During play, the canvas occupies the full available viewport. Only **Save** and
**Zoom** are added to the original wooden header; touch devices get the nine
transparent buttons. Tap the original central logo to open the paused menu,
then **Resume game**, **New game**, or load an earlier round.

`nc_browser_view` applies responsive resolution and world-only zoom, keeping
native HUD text and controls at the same size. Zoom ranges from 0.25 to 8,
with the existing 1.5 default. The camera uses the largest clear rectangle above
or left of the touch pad to keep the controlled Clonk visible, centering smaller
landscapes in that area when zoomed out. Browser mouse
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

## Catalog and multiplayer lifecycle

`scenario-library.js` loads the 80-scenario catalog and verifies unchanged supplemental pack downloads. `gallery.js` displays the nine original categories, original player limits and prerequisites. Original Title.png previews remain distinct from new browser gameplay screenshots.

All mission scenarios are available immediately, as requested. At browser startup, the adapter adds only the catalog’s 12 original scenario-entry `Head.MissionAccess` passwords to the player’s configuration. The original engine gate remains intact. Internal progress flags such as `StormPortal` and `PortalOpen` are not prefilled; puzzles, scripted objectives and earned progress inside each mission remain unchanged.

`multiplayer.js` manages browser-to-browser WebRTC rooms. The host creates an invitation, the guest pastes it and returns a reply, and the host pastes that reply. No default discovery, signalling, game, STUN or TURN server is contacted. Optional user-supplied ICE servers are supported. Every participant uses a separate browser/device; there is no shared-keyboard or split-screen mode. The host tab must remain open.

The transport carries original native control packets through reliable ordered data channels, with original state checks during the round. Live-room saving and reconnect are not implemented; the Save button is disabled in connected rounds. Solo saving and loading remain supported. The root README links the scenario and room reports. The sweep checks startup, normal controls, a short simulation interval, screenshots, and saves where available; scenarios requiring two players use actual two-browser rooms. This does not claim completion of every objective.

## Audio compatibility

WAV effects and Vorbis music use Web Audio. There is no MIDI synthesizer in the browser adapter; original MIDI-only tracks are skipped and silent. Unsupported audio decoding is contained by the SDK adapter so gameplay and local saves continue to work. Original audio packs remain unchanged. See the root README for the cross-browser room report (Chromium host, WebKit guest), including shared controls, frame-120 synchronization, terrain agreement and pause.

## Touch movement mode

`touch-movement.js` adds a persisted Tap / Hold switch above the shared touch pad. Tap retains original continuous left/right movement. Hold sends the original Stop command on release of the last held direction; another held direction resumes instead. During the original `DFA_DIG` procedure, directions are steering taps in either mode: releasing a direction neither sends Stop nor repeats a remaining held direction. X explicitly stops digging. The read-only `nc_browser_touch` metadata reports this procedure in both engines. Pointer cancellation and focus loss release held inputs. Native menu navigation and crew ownership checks prevent a release from sending Stop into a menu or to a newly selected clonk. The switch only changes touch input, and every command follows the normal original control/network path. Hardware Y/Z aliases remain; the touch label is Z.

Checks: `node rage-port/tests/touch-movement.mjs` and `node rage-port/tests/browser-touch-movement.mjs`; both accept `BROWSER=webkit`. The latter runs real Rage and Planet Gold Mine rounds, verifies continued movement in Tap and stopped movement in Hold, digging-angle changes without stopping, explicit Stop during digging, shared preference and portrait/landscape layout. The digging check first walks beyond the hut foundation so the original undiggable foundation does not stop the test tunnel.

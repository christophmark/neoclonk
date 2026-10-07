# Clonk Planet browser engine

This is a separate Clonk Planet 4.65 engine compiled to WebAssembly. Planet scenarios use their own original definitions, materials and scripts. The Rage engine is not used to interpret Planet gameplay.

The source is based on [Teero888's Linux adaptation](https://github.com/Teero888/clonk_planet), pinned to `b7004562bca547e1a8e1bbe3314cee32b03a29c8`. That adaptation retains Planet's C4 engine and script interpreter and replaces Win32 graphics/audio with indexed OpenGL surfaces, GLFW and miniaudio. Our additional browser changes are in `patches/linux-to-browser.patch`; all 252 source files have before/after SHA-256 hashes in `source-manifest.json`.

## Build

Use Emscripten **3.1.74**, installed at `../.toolchains/emsdk`, the same toolchain as the Rage port.

```sh
python3 planet-port/scripts/prepare.py
python3 planet-port/scripts/build.py --jobs 6
c++ -std=c++17 planet-port/tests/random.cpp -o planet-port/build/random-test
planet-port/build/random-test
```

`prepare.py` checks an existing source tree, or reconstructs a missing tree from the pinned Git revision and browser patch. It does not overwrite local work. After intentional source changes, refresh the manifest and patch with `python3 planet-port/scripts/provenance.py --write` (requires the pinned checkout).

The build creates `dist/planet.js`, `planet.wasm` and `planet.data`. The data preload contains only a small original base fixture and a generated local player; selected catalog packs are mounted by the shell before `main`. Serve the shell and artifacts through HTTP(S), with WebAssembly MIME support. The project packaging script assembles the actual catalog and browser site.

## Browser adaptations

- Newly created crew start at rank 6 (14,696 experience), the first original rank that unlocks both climbing and ceiling traversal. `C4ObjectInfoList::New` calls the original promotion routine, including normal rank-based health. This applies equally to all multiplayer players and later recruits. Loaded crew records and scenario physical overrides are preserved.

- Indexed surfaces are composed in CPU memory, with fast paths for ordinary sprite copies and fills. WebGL 2 presents the final pixels through a palette shader. This avoids GPU readback stalls and supports sprite strips larger than the device texture limit. Terrain and objects remain original engine data. Compilation/link errors fail initialization and are printed to the console.
- Emscripten animation callbacks drive original 28 ms simulation and one-second timers. A suspended tab discards accumulated waiting time.
- Original Windows CRT random sequence is explicitly reproduced using a 32-bit state and 15-bit result; host libc randomness is not substituted. The native fixture verifies the first ten seed-1 values and zero-range behavior.
- WebAssembly32 retains pointer width for the original script interpreter. Emscripten's function-pointer cast emulation adapts the old script API calling convention.
- UTF-8/Windows-1252 decoding is applied only at console presentation (`adapters/stdio.js`). UTF-8 argument quoting and Windows-1252 fallback at packed group name lookups support original names containing spaces and umlauts without modifying archive bytes.
- `nc_planet_view` resizes original indexed surfaces and viewport. Zoom changes the logical pixel resolution. Touch bounds adjust camera focus away from the pad where landscape bounds permit; action icons and menus anchor to the left while the pad is present. Desktop placement remains original.
- Wave sound effects use miniaudio's WebAudio backend, including its user-gesture unlock. MIDI synthesizer code is compiled, but background music is disabled because the distribution does not preload its required soundfont.

## Shell API

All functions are available through `Module.ccall`. Integer arguments use `number`; `zoom` is a C double.

| Function | Arguments | Result |
|---|---|---|
| `nc_planet_state` | none | JSON string: ready, running, frame, paused, gameOver, scenario, random state/count, landscape, players/crew/cursor, viewport |
| `nc_planet_control` | player number, control index, pressed, repeated | 1 or negative error; original QWE/ASD/YXC indices 0–8 |
| `nc_planet_pause` | paused | 1 |
| `nc_planet_step` | ticks (0–10000) | Actual frame delta, preserving pause; stops on game over |
| `nc_planet_view` | canvas width, height, zoom (.25–8), touch x/y/width/height | 1 or negative error; dimensions use physical canvas pixels |
| `nc_planet_save` | none | 1 on success; native C4Group save at `/data/BrowserSave.c4s` |
| `nc_planet_exit` | none | 1; stops main loop |

Load saved bytes at `/data/LoadedSave.c4s` and pass that scenario path to `Module.arguments`; the shell must also mount the required original definition packs. Original `Game.Save` serializes the save; IndexedDB persistence belongs to the shell. Saving copies the source scenario first so local scenario resources remain present. Loading `/data/BrowserSave.c4s` itself is deliberately rejected for subsequent saving; use the separate load path.

## Evidence and remaining limits

Initial browser QA on untouched `Easy.c4f/Goldmine.c4s` loaded 269 definitions, 16 textures and 21 materials, rendered correctly without shader errors, moved an original clonk from x=700 to x=645 over 30 controlled ticks, and wrote a 105971-byte native save. Fixed stepping, pause and viewport resize were exercised. Reloading the native save in a fresh browser page restored frame, cursor, energy and wealth, and a further native save succeeded. Wüstoland confirmed packed Windows-1252 filename lookup. See `../planet-content/audit/planet-runtime-probe/` and later scenario-specific audit reports for exact results and screenshots.

This is an operational port of the original Planet engine through a modern community platform adapter. Exact parity with the original Windows executable has **not** been established: the inherited Linux source already contains changes and fixes. All 53 official scenarios pass the recorded startup/control checks. Mobile Chromium and WebKit pass zoom, touch input and original save roundtrips through the shared menu. See `../planet-content/validation/`. The original socket transport is replaced by the browser lockstep bridge described below; end-to-end WebRTC integration is maintained by the shell. The editor and Qt launcher are not included. Competitive missions retain their original victory conditions, including early game-over with too few players.

## Browser multiplayer bridge

`source/engine/src/C4BrowserNetwork.cpp` exposes the same transport-facing names as the Rage shell: `nc_browser_net_configure(seed, localSlot, totalPlayers)`, `status()`, `size()`, `drain()`, `admit(origin, bytes, length)`, `build(frame)`, `accept(frame, bytes, length)` and `sync()`. Buffers returned by `drain/build/sync` are copied immediately from `Module.HEAPU8` using `size()`; the next call reuses the output buffer. Return values use the same success/error conventions as the Rage adapter.

Call configure before `main` from `onRuntimeInitialized`, after mounting identical numbered player profiles on every device. Pass all profile paths in the same argument order. Planet joins these players immediately during initialization; no Rage-style startup join frame is needed. Only the local player's viewport, mouse and input ownership differ between devices. Native socket networking stays disabled.

The host admits validated, owned inputs and broadcasts a single ordered original `C4Control` packet for each frame. The original simulation cannot advance without accepting the matching frame. Payloads use Planet's original packed 17-byte `C4PacketHeader` and unchanged player control, selection, object-command, hostility and surrender records. Lengths, packet types, count, ownership and selected crew ownership are validated before invoking the legacy parser. Inputs are limited to 64 KiB and frames to 1 MiB. Network game time follows the shared 28 ms frame clock, avoiding wall-clock drift between peers. The original sync checker plus explicit CRT random state detects divergent simulations.

`node planet-port/tests/network.mjs` passed with two independent browser modules, shared seed 424242, both players sending movement/stop controls, 180 accepted frames, matching native sync values every 20 frames, one local viewport per device, and rejection of malformed and foreign-player inputs. Evidence: `build/network-test/report.json`. After removing GPU readbacks, the full test (two boots, hundreds of Playwright round trips and screenshots) completed in 23.46 seconds; this is a test duration, not a measured real-time gameplay frame rate. This tests the engine lockstep adapter; WebRTC discovery/transport and full scenario playthroughs require the separate shell QA. This adapter does not support reconnect, late join or migration to a new host.

## Licenses

`LICENSE.txt` is the upstream ISC source license; historical source notices, including `source/engine/license.txt`, are retained. The publisher's current source release terms supersede the old package's restrictions; source and game content have separate terms. Vendored miniaudio, stb, TinySoundFont and TinyMidiLoader notices remain embedded in `source/standard/inc/external/`. `licenses/DejaVu.txt` accompanies the replacement font. The original Microsoft fonts shipped in the community Linux repository are not included in the browser preload.

Original game content is from the publisher's Planet release, extracted separately under `../planet-content/original/planet-release/`. It is subject to the publisher's content terms (CC BY-NC 4.0), not the engine ISC license. User-contributed contest content requires its own provenance and permission checks, maintained by the project catalog importer.

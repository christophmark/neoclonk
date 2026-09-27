# Original Rage browser platform port

The `source` tree began as an unchanged copy of the user-provided Clonk Rage
4.9.10.7 build 330 archive. `cr_source` remains untouched. These platform changes
operate below the game simulation, script interpreter, controls and scenarios.
The separate build script also applies compiler compatibility changes.

## Browser scheduling

`StdSDLApp::HandleMessage` yields using `emscripten_sleep`, compiled with
Emscripten Asyncify. This preserves the original blocking startup, modal dialogs
and game state machine, including nested message loops. The original 28 ms game
scheduler remains authoritative. A simple requestAnimationFrame callback would
not preserve these nested execution paths.

SDL keyboard/mouse events continue through the original event handlers. Logical
fullscreen uses the browser canvas; the surrounding page controls actual browser
fullscreen after a user gesture. Canvas resolutions are enumerated explicitly
because SDL's “all modes available” sentinel is rejected by the native engine.

## Rendering

The port keeps the original OpenGL renderer through Emscripten's legacy GL
compatibility layer. Desktop ATI/ARB assembly fragment programs are excluded on
Emscripten; Rage already provides the fixed-function rendering fallback used
instead. This does not change terrain, objects, physics or scripts. Desktop
shader-only liquid coloration/saturation effects are unavailable on this path.

`StdEmscriptenGL` converts the original BGRA 32 bit / 16 bit reversed pixel
uploads to WebGL RGBA bytes. Texture CPU reads use a temporary framebuffer and
readPixels, converted back to the original pixel format. This keeps the game's
surface pixel interpretation, including inverse alpha, unchanged. Display gamma
ramps are managed by the browser rather than the native operating system.

## Build integration

Compile the original SDL and OpenGL source files plus
`standard/src/StdEmscriptenGL.cpp`. Exclude bundled desktop `glew.c`.
Define SDL main loop, OpenGL and non-networked engine options; use
`-sUSE_SDL=1 -sLEGACY_GL_EMULATION=1 -sASYNCIFY=1`.

Preload the original data packs into a virtual filesystem directory, change the
working directory there before `main`, and set `Module.thisProgram` to the
executable path in that directory. Create the configured home/save parent
folders in advance: the legacy directory creation is not recursive.

## Reproducing the platform patch

`patches/browser-platform.patch` contains only the platform files listed above,
including the new GL adapter. On a fresh copy of the archive in `source`, run
`python3 rage-port/patch-platform.py` from the project root. The script dry-runs
first and refuses already patched or diverged sources. The current `source`
tree already has the patch applied.

## Verification completed

Emscripten 3.1.74 successfully compiles StdSDLApp, StdSDLWindow, StdGL, StdGLCtx,
StdSurface2 and StdEmscriptenGL. The complete original engine links and starts the original Goldmine scenario in
Chromium with its 345 definitions and 23,988 script lines. The actual browser
canvas visibly renders original terrain, ore seams, sprites, sky and HUD. The
graphics smoke test reports no page errors or shader compile/link errors.
Gameplay interaction and persistence checks are tracked by the parent browser
QA task.

## Compatibility issues found by actual browser execution

- Convex `GL_POLYGON` blits use `GL_TRIANGLE_FAN` in the browser because
  Emscripten does not emulate `GL_POLYGON`. Their original vertices are retained.
- Browser line drawing repeats the same current color for each endpoint. Native
  GL retains current color between vertices; Emscripten's immediate stream
  expects attributes to repeat with a constant stride.
- Emscripten 3.1.74's legacy texture-environment optimizer extracts texture
  expressions with an unbalanced regex. Matrix coordinates cause invalid GLSL
  and invisible terrain. `scripts/patch-emscripten.py` corrects that dependency
  parser without changing Rage's texture matrices or materials. Run this
  idempotent script after installing a fresh toolchain and before linking.
- The same patch adds the missing `GL_ADD_SIGNED` texture combiner used by
  original MOD2 blits, first encountered in Submine. It generates
  `Arg0 + Arg1 - 0.5`, retains the original RGB scale, and clamps the resulting
  texture stage after scaling. Its shader-cache key has a distinct sixth
  combiner value; the original engine's rendering calls remain unchanged.
- Emscripten's assertion-only filesystem errno message now avoids native
  `strerror` after runtime exit. The JavaScript filesystem and IndexedDB adapter
  remain available for one final persistence flush after the original engine
  saves its config and crew. No native calls are permitted after exit; the
  browser shell waits for this explicit flush before restarting.
  `tests/browser-exit.mjs` passed actual Submine startup, native quit and a
  unique file written immediately before quit appearing in IndexedDB after
  page reload in Chromium and WebKit (`outputs/exit/report.json` and
  `outputs/exit-webkit/report.json`, no browser errors). The WebKit run uses
  `BROWSER=webkit` with software GL; physical iPhone testing remains separate.
- The same script repairs SDL's missing DOM Pause mapping. Emscripten's headers
  define `SDLK_PAUSE` as scancode 72 with its 1024 mask, while the unpatched JS
  event table passed DOM keycode 19. The mapping lets the original Pause binding
  handle keyboard and touch header inputs without changing simulation logic.
- The browser graphics test intercepts actual WebGL shader compile/link errors
  and saves both page and unobstructed canvas screenshots. Engine startup alone
  is insufficient to pass it when shaders fail.

## Browser audio resource failures

The SDK patch supplies both Web Audio's decode error callback and its Promise
rejection handler. One unsupported or corrupt resource is reported once per
load, pending playback is released, and the resource stays paused. Original
SDL music polling can then move on; general browser exceptions are not hidden.
`tests/sdl-audio-decode.mjs` exercises the actual patched dependency with
callback-only, Promise-only and combined failures, including repeated playback
and absence of unhandled rejections.

Original WAV and Vorbis playback remains available. MIDI tracks are **not
synthesized**: a MIDI-only track is silent/skipped by the original playlist's
playback checks. No original music pack was rewritten or replaced. This is a
browser audio limitation, not a claim of complete audio-format parity.

## Original content warning baseline

The scenario sweep identified two shipped script warnings in Triton's Path.
The unchanged official Linux330 executable reproduces both `id` parameter-name
warnings, the same 44,338-line link summary and successful startup. Exact native
messages, reproduction command and binary/content hashes are preserved in
`native-reference/warning-audit/`; these are baseline content warnings, not a
browser compiler failure. All other script warnings remain subject to review.

## Responsive viewport and world zoom

`nc_browser_view(width, height, zoom, occlusionX, occlusionY, occlusionWidth,
occlusionHeight)` accepts CSS pixels, returning 1 on success. It changes the
original display resolution and a world-only OpenGL projection. The original
HUD, menus and pointer regions keep their pixel sizes. Zoom is bounded by the
scale needed to fill the finite landscape and a maximum of 8. Camera tracking
uses the largest clear rectangle above or left of the touch controls.

The read-only `nc_browser_state().viewport` reports screen and world dimensions,
effective `zoom`, `requestedZoom`, `minZoom`, the 64-pixel browser header,
the clonk's screen position and the occlusion rectangle. Mouse world coordinates
apply the inverse projection; selection outlines and object labels apply the
forward projection. Existing cursor graphics stay loaded during runtime resize,
because the original graphics groups have already closed by this stage.

`GAME_URL=http://127.0.0.1:3902/ node rage-port/tests/browser-view.mjs` checks
world zoom, opaque header pixels, responsive dimensions, camera occlusion and
unchanged frame/object/terrain state. The final camera run passed desktop zoom,
opaque header pixel invariance, exact portrait and landscape occlusion, positive
camera origins and simulation invariance. The test waits for the requested
configuration after the host's ResizeObserver settles. World mouse picking is
reported as untested when the original keyboard-only round does not route DOM
mouse events to world control (screen/world coordinates remain zero). See the
integrated browser reports for complete UI coverage in Chromium and WebKit.

## Responsive browser interface

The browser-only viewport adapter scales the original world draw pass, then
restores the projection for the original HUD. World labels, selection markers,
context menus and mouse coordinates use the corresponding transform. Resolution
changes go through `Application.SetResolution`. Touch occlusion changes camera
centering, and zoom never changes simulation coordinates or timing.

`C4BrowserSave.cpp` queues the original `Game.QuickSave` at a browser event
boundary, verifies the resulting original group, and preserves halt state.
The HTML host separately flushes IDBFS before confirming a stored save. Startup
uses the original background, logo, buttons and font; credits remain in the menu.

## Native touch menus

When a viewport has a touch occlusion rectangle, its original object and player
menus are anchored at the lower left using native GUI `SetPos`. A menu too wide
to fit beside the pad rises above it on narrow screens. Original GUI bounds and
hit regions move together; menu contents, selection commands and purchase logic
are unchanged. Desktop alignment is restored when the touch layout is removed.

Classic keyboard profiles can leave the world mouse associated with the initial
observer (`NO_OWNER`). Browser GUI taps resolve the local player from the menu's
original viewport, then enqueue the original select/enter/close commands. This
also avoids assigning a guest device's inventory taps to player zero.

`tests/browser-touch-menus.mjs` passed real canvas touchscreen purchases at
390×844 and 896×414. The original FLNT shop purchases reduced wealth from
50 to 45 to 40. Both native menus fit the viewport at x=8, remained clear of the
lower-right controls, and produced no browser errors. Screenshots and native GUI
rectangles are in `outputs/touch-menus/`. The read-only `nc_browser_menus` export
reports actual screen rectangles using the original GUI coordinate transforms.
The browser removes the original same-device New Player entry and rejects its
handler, because multiplayer participation is assigned by the browser room.

## Browser-hosted multiplayer

`C4BrowserNetwork.cpp` adapts original binary `C4Control` batches to an ordered,
frame-numbered transport, currently a browser-hosted WebRTC data channel. Each
peer executes the complete original simulation and waits for canonical controls
at the original frame boundary. Shared scenario/profile bytes, player order and
seed precede initialization. Original synchronized-script restrictions and the
original `IsNetworkGame` parameter are enabled; native TCP/UDP are not used.

The production room regression passed original controls, synchronization bytes,
full terrain hashes and coordinated pause/resume at frame 122 in two independent
browser contexts with different viewport sizes. See `BROWSER_LOCKSTEP.md` for
API contracts, packet admission, scope and scenario-specific coverage limits.
Native and browser Save entry points reject live rooms until coordinated original
snapshot support is verified; original solo saves remain available.

## Scenario inspection and lifecycle

`nc_browser_diagnostics()` exposes original player limits/seed, loaded definition
modules/count, player profile paths, key names, teams, all viewports, native dialog
bounds and existing goal objects. It does not call goal scripts; fulfillment is
null until the original engine has evaluated the round. `nc_browser_overview()`
uses the original full-landscape screenshot operation. `nc_browser_quit()` schedules
the original confirmed abort routine after the initiating browser call returns.

For the complete current browser/compiler patch, run
`python3 rage-port/scripts/export-patch.py`. The authoritative full patch and file
hash manifest are `patches/original-to-browser.patch` and `patches/manifest.json`;
the earlier `browser-platform.patch` is only the initial graphics/platform subset.

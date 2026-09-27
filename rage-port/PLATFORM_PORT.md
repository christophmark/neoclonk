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
- The same script repairs SDL's missing DOM Pause mapping. Emscripten's headers
  define `SDLK_PAUSE` as scancode 72 with its 1024 mask, while the unpatched JS
  event table passed DOM keycode 19. The mapping lets the original Pause binding
  handle keyboard and touch header inputs without changing simulation logic.
- The browser graphics test intercepts actual WebGL shader compile/link errors
  and saves both page and unobstructed canvas screenshots. Engine startup alone
  is insufficient to pass it when shaders fail.

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

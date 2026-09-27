# Neoclonk: original Clonk Rage engine browser port

This replaces the earlier TypeScript approximation. The source is copied from the
user-provided Clonk Rage 4.9.10.7 [330] archive. The original `../cr_source` stays
unchanged. Gold Mine is `Worlds.c4f/Goldmine.c4s`, using unmodified official packs.

## Build

1. Install Emscripten 3.1.74 under `../.toolchains/emsdk`.
2. Run `python3 rage-port/deps/build-openssl.py` from the project root.
3. Run `python3 rage-port/scripts/build.py --jobs 4`.
4. Serve `rage-port/dist` over HTTP; its shell is in `rage-port/shell/index.html`.
5. After verification, run `python3 rage-port/scripts/export-patch.py` and
   `python3 rage-port/scripts/install-web.py`, then build the website in `web`.

`patches/original-to-browser.patch` captures all source changes against the
untouched archive. `config.h` records platform configuration. The build derives
its source list from the original Makefile and retains the original PNG, JPEG,
zlib and FreeType sources. Modern C++ compatibility changes express temporary
ownership transfer and null pointers explicitly; original gameplay routines
remain authoritative. Function-pointer ABI emulation preserves legacy C4Script
calls with differing argument counts.

The platform supplies browser filesystem, SDL input/audio and WebGL rendering
through the original engine interfaces. Asyncify preserves original modal loops
and the original timer. Desktop assembly shaders use the original fixed-function
fallback. Multiplayer networking is disabled in this local single-player build.

The build applies `scripts/patch-emscripten.py` idempotently to the pinned SDK.
It corrects legacy texture-matrix shader translation and the SDL Pause key
mapping. Original WAV effects and OGG music use browser audio decoding; game
save files and the player profile use IndexedDB through IDBFS.

The installed website includes `source/browser-port-sources.zip`: the complete
patch, platform configuration, build adapters, shell and verification sources.
To reconstruct the source tree, place the supplied original archive in
`cr_source/`, copy it to `rage-port/source/`, and apply
`patch -p1 < ../patches/original-to-browser.patch` from that copied directory.
Place the unchanged official packs listed in `data/content-manifest.json` in
`rage-port/data/`; the source bundle includes the initial player/configuration
and native replay fixture. Follow the build steps above. The source archive does not
include the SDK, downloaded dependency trees, or original licensed game packs.

## Gameplay and verification

See `../docs/ORIGINAL_GAMEPLAY_AUDIT.md` for source references, actual original
Gold Mine settings, and the native reference. Gold seams require explosives.
The original goal requires fewer than 150 gold terrain pixels **and zero GOLD
objects**, including carried nuggets: selling remains part of the game.

`tests/BROWSER_AUTOMATION.md` documents read-only inspection and input, pause,
and full original tick stepping. It cannot spawn objects, edit terrain or alter
inventories. `tests/play.mjs` drives an isolated Chromium for interactive agent
play; `tests/browser-graphics.mjs` checks real startup and rendering.

Narrow algorithm parity and pixel-format tests are supplementary: they do not
establish that the complete scenario works. Runtime results are recorded under
`outputs/` and full browser acceptance is tracked separately.

## Content

Original pack hashes and licensing are in `data/content-manifest.json` and
`../original-content/README.md`. Original content is CC BY-NC 4.0; source and
trademark licenses are distinct and preserved. Third-party library notices are
included when installing the website. This project is an unofficial browser
port named Neoclonk.

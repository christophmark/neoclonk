# Neoclonk

An unofficial, noncommercial browser adaptation of **Clonk Rage 4.9.10.7 [330]**. The original C++ engine runs through Emscripten/WebAssembly, with the original scenario scripts, sprites, materials and sound. The earlier Three.js simulation has been replaced.

**Work in progress:** the catalog includes all 80 official scenarios (53 base and 27 from Knights, Far Worlds, Fantasy and Western). Inclusion in the catalog does not establish complete playability: scenario-by-scenario loading, objectives, screenshots and multiplayer acceptance remain under active verification. The original Gold Mine has been exercised in the browser and checked against a native original-engine replay. Read the checked-in audit and reports for the precise limits of each result.

## Run the checked-in build

A Python HTTP server is enough for the standalone game:

```sh
python3 -m http.server 3000 --bind 0.0.0.0 --directory web/public
```

Open `http://localhost:3000/rage/`. On the same Wi-Fi, use the host computer's LAN address and port 3000. The browser keeps player files and original saved games in that browser's IndexedDB. Saved games and local browser state are not included in this repository.

For the React website (Node 22.13 or later):

```sh
cd web
npm ci
npm run dev -- --host 0.0.0.0 --port 3000
```

This export uses a generic Vite/Vinext configuration. It excludes the author's hosting account metadata, credentials and deployment history.

## Build the engine

Install Python 3, Node, and Emscripten **3.1.74** at `.toolchains/emsdk`:

```sh
git clone https://github.com/emscripten-core/emsdk.git .toolchains/emsdk
.toolchains/emsdk/emsdk install 3.1.74
.toolchains/emsdk/emsdk activate 3.1.74
python3 rage-port/deps/build-openssl.py
python3 rage-port/scripts/build.py --jobs 4
python3 rage-port/scripts/install-web.py
```

`rage-port/source/` contains the modified engine; `cr_source/` preserves the original ISC source and bundled library notices (unused historical Windows binaries are omitted). `rage-port/patches/original-to-browser.patch` records the modifications. Build scripts pin the OpenSSL input hash and patch the pinned SDK for the original SDL/GL compatibility layer. The SDK, dependency build products and object files are intentionally excluded.

The included packed files are unchanged originals. Supplemental packs load separately as needed; no individual pack exceeds the hosting file limit. Catalog source paths refer to the acquisition workspace. For fresh catalog regeneration, download the archives listed and hashed in `rage-port/catalog/packs.json`, extract them under `original-content/`, run `tools/import-content.mjs`, then run `python3 rage-port/catalog/build-catalog.py` (requires Pillow). Serving the checked-in build does not require extracting the packs.

## Structure and verification

- `web/`: website source and runnable compiled engine/assets under `public/rage/`.
- `rage-port/`: original engine port, build configuration, shell, catalog, tests and data.
- `cr_source/`: unchanged source used to establish the port patch.
- `original-content/`: provenance, license notices and the exact Gold Mine audit manifest.
- `docs/ORIGINAL_GAMEPLAY_AUDIT.md`: source-level gameplay findings and original objective rules.
- `native-reference/`: selected reproducible verification scripts and reports, without native executables or private runtime libraries.

The native Gold Mine recording was replayed by the browser engine through frame 680 with original synchronization checks and matching inspected state. This is a bounded parity check, not certification of every engine feature. Browser test scripts live in `rage-port/tests/` and `web/tests/`; review their prerequisites and corresponding reports before running them. New gallery screenshots must be actual browser gameplay captures; original Title.png previews are labeled separately in the catalog.

## Licenses, attribution and changes

**Engine code:** the original Clonk source is under the **ISC license**; preserve the copyright notices in `cr_source/licenses/clonk_source_license.txt`. Browser platform, rendering, input, filesystem/audio adapters, responsive viewport, menus, gallery and build tooling are modifications to the original project. Individual bundled libraries retain their own licenses; see source notices and `web/public/rage/licenses/`.

**Original game content:** graphics, audio, scenario/object scripts and text are by **RedWolf Design / Matthes Bender and the credited original contributors**, under **Creative Commons Attribution–NonCommercial 4.0**. They are not covered by the engine's ISC license. This distribution and browser adaptation are noncommercial; commercial reuse requires separate permission. Preserve the verbatim content license in `original-content/licenses/clonk_content_license.txt`, original credits in the packs, and asset provenance manifests.

**Clonk trademark:** Clonk is a registered trademark of Matthes Bender. The original trademark license is reproduced verbatim in `original-content/licenses/clonk_trademark_license.txt`. Neoclonk is an unofficial adaptation and is not endorsed by the original authors.

Original scenario and object packs remain unchanged. The surrounding browser menu/layout, responsive presentation, background/icon treatment and newly captured screenshots are adaptations; their underlying original artwork remains subject to the content license. A private GitHub repository does not change any of these license terms.

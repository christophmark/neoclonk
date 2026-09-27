# Neoclonk

An unofficial, noncommercial browser adaptation of **Clonk Rage 4.9.10.7 [330]**. The original C++ engine runs through Emscripten/WebAssembly, with the original scenario scripts, sprites, materials and sound. The earlier Three.js simulation has been replaced.

The catalog includes all 80 official scenarios (53 base and 27 from Knights, Far Worlds, Fantasy and Western). The original Gold Mine has been exercised in the browser and checked against a native original-engine replay. The bounded acceptance scope and report links are documented below.

## Current interface and room scope

The 80 scenarios are organized into nine category galleries. Original packs download unchanged as required. Original Title.png previews are kept separate from newly captured browser gameplay screenshots. The menu includes a documented HD restoration of the original background; the original packs and scenario scripts are not repainted or rewritten.

Multiplayer connects browser-to-browser using WebRTC. The optional [lobby service](lobby-service/README.md) provides public rooms, private room codes and automatic connection setup. Browsers try a direct connection first; only a failed direct attempt requests expiring TURN credentials. A relay forwards encrypted packets while the original simulation still runs on the players' devices. Configure the public endpoint in `rage-port/shell/discovery-config.js`; when unconfigured, manual invitation/reply exchange remains available under Advanced. The host tab must stay open; background browser throttling may slow the room. Each participant has one local player in their own browser/device, with no shared-keyboard or split-screen multiplayer. **Live-room saves, reconnect and host migration are not implemented.** Solo saves remain local and use original `.c4s` files. See the verification section for measured acceptance scope and current results.

All mission scenarios are available immediately, as requested. At browser startup, the adapter adds only the catalog’s 12 original scenario-entry `Head.MissionAccess` passwords to the player’s configuration. The original engine gate remains intact. Internal progress flags such as `StormPortal` and `PortalOpen` are not prefilled; puzzles, scripted objectives and earned progress inside each mission remain unchanged.

## Verification scope

**All 80 original scenarios passed the bounded integration sweep**, including all 27 scenarios requiring at least two players in actual two-browser rooms. The report contains one passing result for each unique catalog scenario.

The scenario sweep covers original-engine startup, normal controls, a short simulation interval, actual gameplay screenshots, and solo saves where available. Scenarios requiring two players are exercised through actual rooms between two independent browser instances. This is a bounded integration check: it does **not** claim that every objective, campaign puzzle, long-running round, device or network condition has been completed or tested.

Release reports are published with the checked-in browser build:

- [Scenario acceptance](web/public/rage/source/scenario-library-acceptance.json) and [gameplay screenshot provenance](web/public/rage/source/scenario-screenshot-provenance.json).
- [Sweep summary](web/public/rage/source/scenario-summary.json), [responsive gallery checks](web/public/rage/source/scenario-gallery.json), and [80-scenario contact sheet](web/public/rage/source/scenario-contact-sheet.webp).
- Direct-room checks: [Gold Mine](web/public/rage/source/rtc-goldmine.json), [Knights](web/public/rage/source/rtc-knights.json), and [Desert](web/public/rage/source/rtc-desert.json).
- [Chromium host ↔ WebKit guest](web/public/rage/source/rtc-cross-browser.json): production invitation/reply exchange, player input, synchronization at frame 120, terrain agreement and shared pause passed.
- [Discovery and real TURN relay](web/public/rage/source/discovery-relay.json): original Gold Mine synchronized through frame 120 over both direct WebRTC and a real local coturn relay. Direct connections requested no TURN credentials; both modes stopped lobby requests during gameplay. This is a local integration check, not a claim about every carrier/firewall.
- Native exit/save persistence: [Chromium](web/public/rage/source/native-exit-persistence.json) and [WebKit](web/public/rage/source/native-exit-persistence-webkit.json).
- [Touch access to original menus](web/public/rage/source/touch-menus.json) and [original native replay parity](web/public/rage/source/native-replay-verification.json).


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
python3 rage-port/scripts/install-library.py
```

`rage-port/source/` contains the modified engine; `cr_source/` preserves the original ISC source and bundled library notices (unused historical Windows binaries are omitted). `rage-port/patches/original-to-browser.patch` records the modifications. Build scripts pin the OpenSSL input hash and patch the pinned SDK for the original SDL/GL compatibility layer. The SDK, dependency build products and object files are intentionally excluded.

The included packed files are unchanged originals. Supplemental packs load separately as needed; no individual pack exceeds the hosting file limit. All 19 catalog group files are included at their original `sourcePath` locations under `original-content/release/cr_game_linux/` and `original-content/addons/release/`; `install-library.py` verifies their hashes. No native executable is included. The five publisher archives are recorded by URL/hash as provenance but are not redundantly included.

For fresh catalog regeneration, install Pillow and unpack the included groups into new inspection directories:

```sh
python3 -m pip install Pillow
node tools/import-content.mjs original-content/release/cr_game_linux original-content/import
node tools/import-content.mjs original-content/addons/release original-content/addons/import/all
python3 rage-port/catalog/build-catalog.py
python3 rage-port/scripts/install-library.py
```

The importer requires a fresh destination. The generator retains archived download provenance when the redundant ZIP/tar files are absent, and preserves existing screenshot fields. Serving the checked-in build does not require extraction.

## Structure and verification

- `web/`: website source and runnable compiled engine/assets under `public/rage/`.
- `lobby-service/`: Node discovery/signaling service, Redis storage, expiring TURN credentials and a single-server deployment bundle; no game simulation or player saves.
- `rage-port/`: original engine port, build configuration, shell, catalog, tests and data.
- `cr_source/`: unchanged source used to establish the port patch.
- `original-content/`: provenance, license notices and the exact Gold Mine audit manifest.
- `docs/ORIGINAL_GAMEPLAY_AUDIT.md`: source-level gameplay findings and original objective rules.
- `native-reference/`: selected reproducible verification scripts and reports, without native executables or private runtime libraries.

The native Gold Mine recording was replayed by the browser engine through frame 680 with original synchronization checks and matching inspected state. This is a bounded parity check, not certification of every engine feature. Browser test scripts live in `rage-port/tests/` and `web/tests/`; review their prerequisites and corresponding reports before running them. New gallery screenshots must be actual browser gameplay captures; original Title.png previews are labeled separately in the catalog.

## Licenses, attribution and changes

**Engine code:** the original Clonk source is under the **ISC license**; preserve the copyright notices in `cr_source/licenses/clonk_source_license.txt`. Browser platform, rendering, input, filesystem/audio adapters, responsive viewport, menus, gallery and build tooling are modifications to the original project. Individual bundled libraries retain their own licenses; see source notices and `web/public/rage/licenses/`.

**Original game content:** graphics, audio, scenario/object scripts and text are by **RedWolf Design / Matthes Bender and the credited original contributors**, under **[Creative Commons Attribution–NonCommercial 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**. They are not covered by the engine's ISC license. This distribution and browser adaptation are noncommercial; commercial reuse requires separate permission. Preserve the verbatim content license in `original-content/licenses/clonk_content_license.txt`, original credits in the packs, and asset provenance manifests.

**Clonk trademark:** Clonk is a registered trademark of Matthes Bender. The original trademark license is reproduced verbatim in `original-content/licenses/clonk_trademark_license.txt`. Neoclonk is an unofficial adaptation and is not endorsed by the original authors.

Original scenario and object packs remain unchanged. The surrounding browser menu/layout, responsive presentation, background/icon treatment and newly captured screenshots are adaptations; their underlying original artwork remains subject to the content license. A private GitHub repository does not change any of these license terms.

## Audio compatibility

Original WAV effects and Vorbis music are supported through Web Audio. The browser adapter has no MIDI synthesizer, so original MIDI-only tracks are skipped and silent. Unsupported audio decoding is isolated from gameplay and saving; it does not disable the round or local saves. This is a known presentation limitation, not an alteration to the original music files or scenario scripts.

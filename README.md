# Project Neoclonk

**Play Clonk Rage in the browser.**

> Unofficial, noncommercial browser adaptation of [Clonk Rage](https://www.clonk.de/) © RedWolf Design / Matthes Bender and contributors. Original content: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/); engine: [ISC](cr_source/licenses/clonk_source_license.txt). Browser code and presentation are modified. “Clonk” is a registered trademark of Matthes Bender; no endorsement is implied. Provided **as-is, without warranties**, to the extent permitted by law. See [licenses and attribution](#licenses-and-attribution) before redistributing.

![Three portrait gameplay screenshots: Arctic's snowy ice formations, Gold Rush's western headquarters, and Jungle's lush terrain and waterways.](docs/images/scenarios.png)

*Arctic · Gold Rush · Jungle — original-engine gameplay screenshots, cropped and arranged for this collage. Original artwork © RedWolf Design / Matthes Bender and contributors, CC BY-NC 4.0.*

**[Play Neoclonk](https://christophmark.github.io/neoclonk/)**

Neoclonk runs the original **Clonk Rage 4.9.10.7 [330]** C++ engine in the browser through Emscripten/WebAssembly, with the original scenario scripts, sprites, materials and sound. Gameplay runs on your device.

## Playing

- **80 official scenarios** in nine galleries: 53 base scenarios and 27 from Knights, Far Worlds, Fantasy and Western. Tiles show actual gameplay; scenario packs download as needed.
- **Solo exploration** is available through **Play solo** for multiplayer scenarios, including Jungle. Original rules and goals remain in place; some need opponents or finish immediately. Choose **Continue this round** after an early victory to keep exploring. **Host** starts the normal multiplayer lobby.
- **Every mission is available immediately.** Puzzles, objectives and progress within each mission follow the original scripts.
- **Classic nine-button controls**, with transparent touch controls on mobile. Touch buttons sit above the game's action icons, and the camera accounts for the space they cover.
- **Responsive, full-viewport play** with a zoom slider. Pixel-preserving sprite magnification keeps the original artwork sharp; whole-number zoom levels give the most uniform pixel sizes.
- **Local saves** in the original `.c4s` format. Choose **Load saved game** on the start screen to continue. The header's **Exit** button and scenario switching offer to save a solo round before leaving; a failed save keeps the round open.
- **Help** and **Multiplayer lobby** are available at the top of the start screen.

Saved games and player files are stored in that browser's IndexedDB. They are not uploaded to the lobby or shared automatically between devices; clearing browser storage removes them.

## Multiplayer

Each player joins from their own browser or device. Public rooms and private room codes are available through the lobby. The host's browser runs the room and must stay open.

Players connect directly through WebRTC where possible. If a direct connection fails, an expiring TURN relay connection forwards encrypted packets. Game simulation stays on the players' devices; the lobby handles discovery and connection setup, with no lobby requests during gameplay.

To run your own discovery and relay service, see [the lobby service documentation](lobby-service/README.md) and configure its public endpoint in `rage-port/shell/discovery-config.js`. Manual invitation/reply exchange is also available under **Advanced** when discovery is unconfigured.

### Compatibility and limitations

- Live multiplayer saves, reconnect and host migration are not supported. Background browser throttling may slow a room. Shared-keyboard and split-screen multiplayer are not supported.
- WAV sound effects and Vorbis music are supported through Web Audio. MIDI-only music tracks are silent because the browser adapter has no MIDI synthesizer.
- The original artwork retains its original resolution. Fractional zoom levels can produce uneven pixel sizes.

## Run locally

A Python HTTP server is enough to run the included standalone game:

```sh
python3 -m http.server 3000 --bind 0.0.0.0 --directory web/public
```

Open `http://localhost:3000/rage/`. On the same Wi-Fi, use the host computer's LAN address and port 3000.

For the React website, use Node **22.13 or later**:

```sh
cd web
npm ci
npm run dev -- --host 0.0.0.0 --port 3000
```

See [GitHub Pages hosting](docs/GITHUB_PAGES.md) for static deployment.

## Build the engine

Install Python 3, Node and Emscripten **3.1.74** at `.toolchains/emsdk`:

```sh
git clone https://github.com/emscripten-core/emsdk.git .toolchains/emsdk
.toolchains/emsdk/emsdk install 3.1.74
.toolchains/emsdk/emsdk activate 3.1.74
python3 rage-port/deps/build-openssl.py
python3 rage-port/scripts/build.py --jobs 4
python3 rage-port/scripts/install-web.py
python3 rage-port/scripts/install-library.py
```

`rage-port/source/` contains the browser engine, and `cr_source/` contains the original ISC source and bundled library notices. Browser modifications are recorded in `rage-port/patches/original-to-browser.patch`. Build scripts pin the OpenSSL input hash and adapt the pinned SDK for the original SDL/GL compatibility layer. Toolchains and intermediate build products are not included.

All 19 original catalog group files are included under `original-content/release/cr_game_linux/` and `original-content/addons/release/`. `install-library.py` verifies their hashes. Supplemental packs load separately as needed. Publisher archive URLs and hashes are recorded in the provenance manifests; native executables are not included.

### Regenerate the scenario catalog

Install Pillow and unpack the included groups into fresh inspection directories:

```sh
python3 -m pip install Pillow
node tools/import-content.mjs original-content/release/cr_game_linux original-content/import
node tools/import-content.mjs original-content/addons/release original-content/addons/import/all
python3 rage-port/catalog/build-catalog.py
python3 rage-port/scripts/install-library.py
```

The importer requires a fresh destination. Catalog generation preserves download provenance and existing screenshot fields. Running the included build does not require extraction.

## Repository layout

| Directory | Contents |
| --- | --- |
| `web/` | Website source and runnable engine/assets in `public/rage/` |
| `rage-port/` | Engine port, browser shell, catalog, build scripts and tests |
| `lobby-service/` | Discovery/signaling service, Redis storage, TURN credentials and deployment bundle |
| `cr_source/` | Original engine source and library notices |
| `original-content/` | Original game packs, licenses and provenance |
| `docs/` | Gameplay audit, engine and hosting documentation |
| `native-reference/` | Native-engine comparison scripts and reports |

## Test coverage

The [80-scenario integration report](web/public/rage/source/scenario-library-acceptance.json) covers startup, normal controls, a short simulation interval, gameplay screenshots and solo saves where available. All 27 scenarios listed for two or more players are covered by actual two-browser rooms. This does not establish completion of every objective or campaign puzzle, or coverage of every device, network and long-running round.

Additional checks cover:

- [Solo startup for multiplayer scenarios](web/public/rage/source/solo-scenarios-chromium.json), including [Jungle in WebKit](web/public/rage/source/solo-scenarios-webkit.json). These checks cover one-player startup, original controls and a short simulation interval.
- [Original-engine replay parity](web/public/rage/source/native-replay-verification.json) through frame 680 of a Gold Mine recording.
- [Chromium ↔ WebKit multiplayer](web/public/rage/source/rtc-cross-browser.json), including player input, synchronized state, terrain agreement and shared pause.
- [Direct and TURN-relayed multiplayer on the deployed service](web/public/rage/source/discovery-live.json).
- Save persistence in [Chromium](web/public/rage/source/native-exit-persistence.json) and [WebKit](web/public/rage/source/native-exit-persistence-webkit.json), plus [touch access to native menus](web/public/rage/source/touch-menus.json).

Browser test scripts are in `rage-port/tests/` and `web/tests/`. Gameplay screenshot sources and capture details are recorded in the [catalog provenance](web/public/rage/source/scenario-screenshot-provenance.json) and [README collage provenance](docs/images/scenarios.provenance.json).

## Licenses and attribution

**Engine code:** the original Clonk source uses the **[ISC license](cr_source/licenses/clonk_source_license.txt)**. Preserve its copyright notices. Browser platform, rendering, input, filesystem/audio adapters, responsive viewport, menus, gallery and build tooling are modifications to the original project. Bundled libraries retain their own licenses; see source notices and `web/public/rage/licenses/`.

**Original game content:** graphics, audio, scenario/object scripts and text are by **RedWolf Design / Matthes Bender and the credited original contributors**, under **[Creative Commons Attribution–NonCommercial 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**. Content is not covered by the engine's ISC license. This distribution and browser adaptation are noncommercial; commercial reuse requires separate permission. Preserve the [original content license](original-content/licenses/clonk_content_license.txt), original credits in the packs and asset provenance manifests.

**Clonk trademark:** Clonk is a registered trademark of Matthes Bender. The [original trademark license](original-content/licenses/clonk_trademark_license.txt) applies. Neoclonk is an unofficial adaptation and is not endorsed by the original authors.

**Adaptations:** original scenario and object packs remain unchanged. The browser menu/layout, responsive presentation, background/icon treatment, gameplay captures and cropped screenshot collage are adaptations; their underlying original artwork remains subject to the content license. Public availability does not waive noncommercial content restrictions or other applicable license terms.

**Warranty:** provided as-is, without warranties, to the extent permitted by law.

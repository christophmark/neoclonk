# Original Clonk Rage native reference

This runs the **unmodified official Clonk Rage 4.9.10.7 [330] Linux binary** and original Goldmine packs as a baseline for the browser port. It does not use the earlier JavaScript prototype.

## Isolation and reproduction

Runtime dependencies are downloaded as `.deb` files into `packages/` and extracted into `libs/`; nothing is installed system-wide. The game uses a private Xvfb display `:93`, software OpenGL, a dedicated `reference.cfg`, a new test player `Reference.c4p`, and a private data folder `home/`. It does not control any existing desktop/browser session. `game/` contains a copy of the original executable and symlinks to unchanged official content packs.

```sh
# From repository root; starts Xvfb if needed and launches original Goldmine.
native-reference/launch.sh

# These send actual keyboard events to the visible original game window.
native-reference/key.sh key Pause
native-reference/key.sh key c       # persistent classic move right
native-reference/key.sh key d       # begin persistent digging
native-reference/key.sh key x       # stop
python3 native-reference/capture.py reference
```

`capture.py` reads Xvfb through `xwd` and converts the captured pixels to PNG with Pillow. It does not synthesize the scene. Screenshots are under `screenshots/`. English classic controls are Q/W/E crew selection, A throw, S up, D dig, Z/X/C left/stop/right. The original engine also supports its additional context controls.

The included config disables audio and gamma changes for this headless reference environment. These are runtime options, not changes to original gameplay routines. Display is 1024×768. The original engine creates a centered 800×600 play area by default within this resolution.

## Verified baseline

`goldmine-reference.log` confirms:

- Clonk Rage `4.9.10.7 [330] linux`.
- 345 loaded definitions.
- C4Script linked: 23,988 lines, zero warnings, zero errors.
- 48 texture table entries, 21 loaded textures, 21 materials.
- Goldmine landscape created; game started and player joined.
- Clean engine shutdown after the original Abort Round dialog was accepted. The original executable returns status 2 on this user abort.

### Original persistent digging

`screenshots/goldmine-dig-persistent.png` shows the result of actual press-and-release **C**, then press-and-release **D**, allowing approximately thirteen seconds to pass, then pressing **Pause**. The Clonk digs a clean **45-degree downward-right tunnel without any key being held**, collects a loose gold nugget, and stops at a solid rock/gold obstruction. `goldmine-start.png` shows the same recorded round before that tunnel.

This directly establishes the behavior requested by the user. It also confirms the difference between loose collectible gold and solid gold seams which require blasting.

### Original replay for browser parity

`game/Records.c4f/004-Goldmine.c4s` is the finalized portable reference recording: original Goldmine, seed `1790505353`, fresh untrained player **Reference**, Clonk **Newton**, and actual classic controls. `screenshots/packed-clean-start.png` and `packed-clean-dig.png` show the corresponding initial scene and 45-degree left-down tunnel after normal X → Z → D press-and-release input. No input was held during the digging. The recording ends at frame 685; the final tunnel can be compared immediately before that frame.

The packed player was created from `initial-reference-unpacked/Player.txt` using `pack-player.mjs`, implementing the published C4Group format and verifying its bytes with the existing importer. The original bundled c4group program refuses its pack command without a key, despite the game being freeware, so none of its key checks were changed or bypassed. The released archive format can be implemented independently. The original game successfully loads this 143-byte group and embeds its initial bytes in the replay's control stream at offset 68. No trained post-round profile is substituted.

The older `001-Goldmine.c4s` recording is preserved for provenance but is **not portable**: it used an unpacked player directory and the original recorder's raw-file embedding did not produce valid player data. It must not be used to claim browser parity. `packed-clean-record/files/` inventories the valid recording, and `packed-clean-reference.log` retains the native run log.

Replay natively:

```sh
native-reference/launch.sh Records.c4f/004-Goldmine.c4s
```

The valid record is copied unchanged to `rage-port/data/verification/NativeGoldmine.c4s`. `browser-replay.mjs` runs the actual browser engine and records its original sync-check results and screenshots. The valid recording successfully replayed through frame 680 in Chromium with no JavaScript errors, missing-player errors, fatal errors, or original-engine synchronization loss. Player Reference and Clonk Newton match the recording. The original engine’s synchronization checks remain enabled; the earlier invalid recording demonstrated that they do report a divergence at frame 100.

## Dependency provenance

Current Ubuntu Resolute packages downloaded using `apt download`:

- libgtk2.0-0t64, libsdl1.2debian, libsdl-mixer1.2, libglu1-mesa, libjpeg62
- libmikmod3, libfluidsynth3, libmad0, libopengl0, libinstpatch-1.0-2, libsdl3-0
- xvfb, xserver-common, x11-apps, xauth, xdotool, libxdo3

Historical libpng12 is the original Ubuntu package:
`http://archive.ubuntu.com/ubuntu/pool/main/libp/libpng/libpng12-0_1.2.54-1ubuntu1.1_amd64.deb`.

Original package copyright/license notices are retained in `libs/usr/share/doc/`. Package and replay hashes are recorded in `reference-manifest.json`. The Clonk engine and content licensing remains as documented in `original-content/README.md`; this setup grants no additional rights.

## Browser replay result

`browser-replay-report.json` records a successful actual Chromium run of the C++/WASM engine at frames 2, 100 and 680. Final state: Newton x=181,y=356, energy=50000, 13 gold objects, 152 total objects, RandomCount=3650, and no game-over/evaluation. Screenshots `browser-replay-frame-680.png` and `packed-clean-dig.png` visibly match the original landscape topology, hut/trees, resource placements and left-down diagonal tunnel. The browser replay uses film mode with a different viewport/header and a wall-clock display affected by accelerated stepping, so screenshot pixels/timer text are not asserted identical. There are no original sync-check errors through this sequence.

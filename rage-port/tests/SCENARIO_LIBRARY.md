# Original scenario library checks

`scenario-library.mjs` runs the installed scenarios through the production browser shell. Results are written incrementally to `rage-port/outputs/scenario-library/report.json`; the screenshot manifest is `screenshots.json` in that directory.

```sh
node rage-port/tests/scenario-library.mjs
SWEEP_RESUME=1 node rage-port/tests/scenario-library.mjs
SWEEP_RESUME=1 SCENARIOS=western node rage-port/tests/scenario-library.mjs
python3 rage-port/tests/scenario-contact-sheet.py
```

`GAME_URL` selects the served build (default `http://127.0.0.1:3902`). `SCENARIOS` accepts comma-separated scenario or category IDs. `SWEEP_WIDTH` and `SWEEP_HEIGHT` default to 640×480. Resume retains completed passing cases and retries failures; it does not assert that earlier passes used the current build.

## What is exercised

- A fresh browser context starts each original scenario with its required unchanged definition packs. The runner records the original definition count, script linker output, random seed, player initialization, and actual game frames.
- Solo scenes use the original pause/step bridge, at least 90 full native simulation ticks, and the configured original Right/Stop controls. Native introductory dialogs are dismissed through original Enter/menu controls where necessary.
- Scenarios requiring two players use two independent browser contexts, the production manual invitation/reply flow, reliable WebRTC, original team-selection menus, and original controls on each device. `room-driver.mjs` checks one local player and one viewport per device, applies both players' controls, pauses through the real room coordinator, and compares the original synchronization fields and landscape checksum at the same recorded frame. The separate `rtc-room.mjs` regression covers the periodic 120-frame verification exchange; the per-map check does not require frame 120.
- Original QuickSave is attempted wherever available. A representative available solo save is reopened in each category. Room saving is intentionally unavailable; that result is reported explicitly.
- Full-landscape PNGs come from original `Game.GraphicsSystem.SaveScreenshot(true)`. Pillow only resizes them to 640 pixels wide and compresses WebP previews. The labeled contact sheet includes blank-image candidates for visual inspection.

The user requested that every mission be immediately available. The production shell therefore initializes the original mission-password configuration with the official catalog's access tokens. The original engine's access check and scenario routines remain in use. This unlocks entry; the test does not grant victories, resources, crew positions, or completed objectives.

## Evidence limits

These are startup, input, short simulation, rendering, networking, and save/resume checks. They do not establish that every scenario objective has been completed, every menu branch has been exercised, or long multiplayer sessions have been exhaustively tested. A control can be correctly handled without moving a Clonk through a wall or out of a container; before/after native states are retained for review.

Build hashes are recorded per case in newer results. `engine-provenance.json` documents the initial capture run's inspector, browser-input, network-parameter, and SDK renderer transitions. A case spanning a relink is marked as uncertain instead of being assigned a guessed asset hash. Known Emscripten GL emulation startup notices are retained separately from original script/runtime warnings.

## Unchanged content notices and browser audio

Triton's Path ships two script warnings about a parameter named `id`, at `HippoSaddled.c4d/Script.c:83:21` and `:95:20`. The test permits only those exact two messages and the matching 44338-line, two-warning, zero-error summary after comparing the full browser native log against the unmodified official Linux [330] baseline (`triton-native-baseline.json`). Other script warnings still fail the check.

Western's English localization also contains missing keys in unchanged original string tables. `western-localization-audit.json` lists each observed path/key and hashes the inspected original file; these original engine notices remain in the runtime logs. No original strings or scripts are rewritten to hide them.

Browsers cannot decode the shipped MIDI music through Web Audio. The SDL adapter handles failed decoding and advances through the original music playback loop, keeping gameplay and saving functional. WAV/OGG audio is exercised separately. This is not MIDI synthesis or a claim that every original music track plays. `report-before-audio-fix.json` preserves the failed attempts that exposed this adapter issue; the final resumed cases record the corrected JavaScript hash.

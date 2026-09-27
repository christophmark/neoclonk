# Superseded prototype status

The status below describes the retired TypeScript prototype. The current work is the original-engine browser port in `rage-port/`; see its README and `ORIGINAL_GAMEPLAY_AUDIT.md`. These old test results do not validate the replacement.

# Neoclonk Alpha 01: Gold Mine

2026-09-27

The playable Gold Mine scenario now requires harvesting every gold unit in the terrain. It remains an original browser simulation approximating Clonk movement, not a full gameplay-compatible Rage engine port.

## Delivered

- Worker-based fixed 28 ms simulation; acceleration, collision substeps, slope stepping, swimming, wall climbing, downward/forward/upward excavation, crew selection and persistent classic movement commands.
- Gold Mine: extract every gold terrain unit to win, with exact remaining material and extraction percentage displayed. Five deposited nuggets optionally activate the pump; this does not complete the mission. The final fractional nugget is recovered. Exploration continues after completion.
- Physical thrown gold with gravity, bounce, settlement and pickup cooldown; inventory, loose gold and banked gold remain conserved.
- Deterministic bounded grid water updates, flow into excavated terrain, exposed rainfall accumulation and actual pump drainage. Cave shelter prevents rain from passing through roofs.
- Three.js sculpted terrain and mineral shading, procedural characters/objects with idle motion, underground occluded headlamps, mist, sunrise shafts, day/night, stars, noon heat and weather.
- Exposed water has sunlight reflections, caustics, storm crests and raindrop rings/splash crowns. Sheltered cave water remains calm. Water normals and visual waves do not alter collision geometry.
- Transparent nine-button touch pad, QWE/ASD/ZXC or YXC, numpad and arrow controls; pause, help, settings and mission completion UI.
- Device IndexedDB saves and portable export/import with validated v3 simulation saves and migration from the earlier v1/v2 expeditions. Mission completion is recomputed from remaining terrain when importing old saves.
- Original unchanged Rage RNG and pixel pathfinder compiled to native/WASM; browser generation uses original RNG. Full original engine port remains separate.
- Original C4Group importer with nested archives, checksums, image dimensions and metadata. Current scene graphics and audio are procedural.

## Self-play and verification

`/?dev=1` exposes `window.__neoclonk` for pausing, ordinary input commands, fixed stepping, full frame/snapshot inspection, weather and time. Pausing leaves the scene visible. There are no teleportation, inventory or terrain-edit cheats in this API.

`web/tests/playable-browser.mjs` launches isolated local Chromium with software WebGL and exercises the actual client, worker and rendering. The acceptance route uses ordinary nine-button commands to mine the landscape; it asserts the win condition against actual remaining gold terrain. Screenshots and JSON reports are retained locally in ignored `web/outputs/browser-qa/`.

Simulation tests cover the whole expedition, water conservation/rainfall/shelter/drainage, physical ore recovery, invalid saves, deterministic continuation, original WASM generation and escaping a flooded cavern through digging upward. Worker integration executes the emitted production bundle, including paused step/inspect and weather protocols. Water mask tests cover stacked pools and roof boundaries. Native GLSL validation covers all three custom shaders.

The preceding first-expedition build passed nine checks against the production build in Chromium 152: startup, full mission, IndexedDB restoration, fixed stepping, keyboard pause/resume, four weather modes, portrait touch movement/stop and no browser, shader or HTTP errors. All 21 game tests, production-worker integration, TypeScript, scoped ESLint and production build passed.

The in-app browser was unavailable. Isolated Chromium is the explicit self-play fallback. Software WebGL and emulated touch verify behavior and shader compilation; physical phone GPU performance and long-session performance are not established.

Earlier unchanged foundations remain verified: 13,026 native/WASM operations, 10,000 independent RNG checks, 35 original pathfinder terrain cases, 5,000 repeated searches with stable memory, and three archive importer tests.

## Remaining scope

- Full original C4Script/object/material execution and original scenario/save compatibility.
- Original content rendering and the full asset enhancement pipeline.
- Production chains, combat, multiplayer and additional missions.
- Full Rage liquid/material equivalence, richer rigid body interactions and physical-device performance gates.
- Advanced volumetric scattering and WebGPU/TSL backend comparison.

Next porting steps are documented in ENGINE_PORT.md and NEOCLONK_PLAN.md. This first scene can be played to completion independently of that longer engine migration.

## LAN serving

The production app can be served with `npm run serve:lan`, listening on port 3000 on IPv4 interfaces. A user service `neoclonk-lan` keeps this installation running after the coding session. The host’s Wi-Fi address at setup is `192.168.178.82`; clients use `http://192.168.178.82:3000` from the same LAN. Game state and saves remain per browser.

## Gold Mine verification

The new scenario passed 25 game tests, the production-worker integration test, TypeScript, scoped ESLint, and a production build. A Chromium playthrough over `http://192.168.178.82:3000` used only ordinary controls to harvest all 2,575 initial gold cells, producing 37 nuggets with zero gold terrain left. Save/load, paused stepping, keyboard pause/resume, all weather modes, portrait touch input, and error-free browser rendering also passed. The route uses both crew members and is retained as `web/tests/gold-mine-route.json`.

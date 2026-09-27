# Original gameplay regression probe

Run from the repository root:

```sh
python3 rage-port/tests/build_gameplay_probe.py
node rage-port/tests/gameplay-parity.mjs
```

The build script extracts **verbatim** original source from the unchanged `cr_source` tree and compiles the same C++ natively with GCC and to WebAssembly with the already-installed WASI SDK. The probe uses original `Fixed.h`, original `ValByPhysical`, original classic walking/digging control switch branches, the original digging action branch, original `ObjectActionDig`, and original `C4Player::InCom` / `ExecuteControl`. SHA-256 provenance is recorded under `build/source-manifest.json`.

The native runner first asserts observed original semantics, then produces an oracle trace. The WebAssembly runner compares every exported operation against that trace. Current coverage produces 40,329 matching operations across delayed single presses, double activation, release persistence, steering, direction limits, downward 45-degree components, upward half slope, material request toggle and seven physical capability levels in both facing directions.

This is a **focused original-code unit probe**, not a second implementation of the playable engine and not a substitute for a full engine comparison. Fixture boundaries deliberately exclude original terrain collision, attachment computation, scripts, menu handling, object creation and scenario initialization. The attachment fixture provides a true/false input; it does not simulate collision. Functions outside the selected branches are call-boundary fixtures. `Fixed.h`'s serialization adapter exists only to compile the unused serialization member; arithmetic is original.

The production port must compile the full original gameplay path. Its separate reference gate must compare original landscape/object/material/script state tick by tick and complete the actual original Gold Mine goal. See [the audit](../../docs/ORIGINAL_GAMEPLAY_AUDIT.md).

Original source license: [Clonk ISC license](../../cr_source/licenses/clonk_source_license.txt).

### Original tunnel exit and ceiling hanging

`node rage-port/tests/tunnel-controls.mjs` digs a natural Gold Mine tunnel with
real touch buttons, demonstrates that Left rotates Dig rather than cancelling
it, then tests X → Z → S and follows the original Scale/Hangle actions out.
It only uses original inputs and paused ticks; the random landscape can obstruct
the chosen route, so inspect its trace before treating a failure as a regression.
Observed passing run: bottom (406,375), Hangle (352,312), exit (288,270).
Evidence: `rage-port/outputs/tunnel-controls.json` and `.png`.

### Responsive interface and original saves

`GAME_URL=http://127.0.0.1:3902/ node rage-port/tests/browser-view.mjs`
checks world zoom, original HUD pixels, unchanged paused simulation and terrain,
responsive dimensions and touch occlusion. `browser-save-export.mjs` checks
unique original QuickSave groups, preservation of earlier saves and pause state.

The end-to-end menu/header/storage/rotation tests live in
`web/tests/usability-browser.mjs`; run `npm run test:browser` from `web/`.
# Lobby discovery and TURN

`node rage-port/tests/discovery-browser.mjs` tests the production lobby UI with
three browser peers and a fixture signaling API: direct connections, lazy fallback,
cancelled creation, same-slot replacement, peer departure, and stopped polling.

`REDIS_TEST_URL=redis://127.0.0.1:16387 TURN_SERVER_BINARY=/path/to/turnserver node rage-port/tests/discovery-relay.mjs`
tests the production server, isolated Redis namespace, real coturn, and the original
Gold Mine WASM engine. It verifies selected direct/relay candidate pairs, zero TURN
requests for direct connections, input, original frame-120 synchronization, matching
terrain and no lobby calls during gameplay. Use a local test Redis and an available
coturn binary; coturn listens only on loopback with test-only loopback peer access.
The relay run deliberately removes direct candidates to model a restricted network.
No production relay keys or player rooms are used. Results are written to
`rage-port/outputs/discovery-relay/`.

For an opt-in check against the deployed lobby and TURN, use the shipped
`discovery-config.js` endpoint and an allowed localhost origin (port 3902):

```sh
LOBBY_URL=https://lobby.40-180-87-214.sslip.io \
DISCOVERY_OUT=rage-port/outputs/discovery-live \
node rage-port/tests/discovery-relay.mjs
```

This creates temporary private rooms and runs the original Gold Mine simulation
through both a direct connection and a forced relay connection. It verifies
matching simulation and landscape state, guest input, and no lobby requests
during play. It consumes a small amount of the deployment's request/relay budget.

`browser-crispness.mjs` checks the compiled renderer at 3× device pixel density
and six zoom levels, including fractional zoom. It verifies magnification and
minification filter calls, canvas pixel scaling, and unchanged paused simulation
and terrain. Serve the static export on port 3902, then run:

```sh
node rage-port/tests/browser-crispness.mjs
BROWSER=webkit node rage-port/tests/browser-crispness.mjs
```

Use `GAME_URL` to override the default `/rage/index.html` test URL.

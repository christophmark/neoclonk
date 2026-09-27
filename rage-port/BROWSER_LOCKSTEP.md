# Original engine browser lockstep

This adapter transports the original `C4Control` binary format; it does not replace
physics, script execution, terrain updates or the original command interpreter.
The native socket implementation remains disabled. The browser shell owns a reliable,
ordered transport, room membership, sequencing, pause policy and disconnect handling.

## Discovery and relay

`shell/discovery.js` exchanges connection offers/answers through `lobby-service`.
Public rooms and private codes carry only temporary lobby metadata. The server
authenticates host/guest tokens and validates version, catalog and room capacity;
Redis atomically expires rooms and protects simultaneous joins. The service never
receives original `C4Control` packets, terrain, saved games or simulation frames.

Each connection first gathers direct/STUN candidates. If the direct data channel
cannot open, the peers advance to a new signaling generation and request temporary
TURN credentials. TURN is not allocated for the initial direct attempt. Fallback
still permits a direct candidate pair if one becomes available. The selected ICE
pair determines whether the UI reports direct or relayed transport. Connected
guests stop polling; the host maintains the room until starting. All discovery
polling ends when gameplay begins. Relay credentials default to four hours and can
be configured up to twelve; live credential renewal and host migration are not
implemented, so long relayed sessions are limited by their issued credentials.

Manual invitation/reply exchange remains available when no service is configured.
Keep provider keys and coturn's shared secret only on the server. The public shell
configuration contains the lobby URL and STUN URLs, never a permanent credential.

## Bootstrap

Every participant loads the same engine/content bytes and the same original player
profile files, paths and argument order. Call `nc_browser_net_configure(seed, slot,
playerCount)` after WASM initialization and before original `main`. Slots start at 0;
slot 0 sequences frames. Only fresh sessions are currently covered: saved multiplayer
rounds and late join require separate bootstrap/parity verification.

The adapter supplies the seed before original `FixRandom` and enables the original
`SyncMode` restrictions (no wall-clock script results, fixed smoke settings, etc.)
and the original `Parameters.IsNetworkGame` flag. The latter keeps official sun
and lens-flare scripts on their original network-safe cursor-position branch.
`Game.Execute` waits at frame 0. The host serializes its original startup player-join
queue; guests discard their duplicate initial queue when accepting this canonical
batch. After these original joins execute, each device retains only its assigned
user player's local controls and viewport. All player simulation objects stay present.
Room slots enumerate native user players in player-number order, excluding script players.

## API

All names below have the prefix `nc_browser_`. Numeric errors are negative.

| Export | Result / behavior |
|---|---|
| `net_configure(seed, slot, count)` | 1 on initial pre-main configuration; count 2–12 |
| `net_status()` | JSON: enabled, running, playersJoined, paused, frame, acceptedFrame, localPlayerIndex, totalPlayers, seed |
| `net_drain()` | Pointer to original binary input batch; drains pending local-owned inputs after initial joins |
| `net_admit(originSlot, bytes, length)` | Host validates packet types and player ownership, then appends pending input; maximum 64 KiB per batch |
| `net_build(frame)` | Host serializes pending original controls for exactly its current frame; does not execute them; may be called once per frame |
| `net_accept(frame, bytes, length)` | Stages one canonical batch for exactly the current frame; original main loop executes it once; maximum 1 MiB |
| `net_sync()` | Pointer to original C4ControlSyncCheck binary fields followed by original main RNG state |
| `net_size()` | Byte count for the most recent drain/build/sync result |

Copy returned data immediately with `Module.HEAPU8.slice(ptr, ptr + size)`: subsequent
calls reuse the buffer. Input array arguments can use `ccall`'s `array` type.
An empty control batch is still a valid original binary packet list, not a null pointer.
The shell must queue future network frames until the engine reports the corresponding
current frame. Duplicates, stale frames and replacement of a staged frame are rejected.

The host broadcasts a built frame before applying it locally. All peers wait when a
frame is missing. Compare sync bytes only at an agreed frame, with sequencing stopped
until every peer has reached it; never compare snapshots from different frames.
Native pause is local, so the shell must coordinate room pauses and monitor `paused`.

## Admission

Original player-control, object-command and crew-selection packets are accepted only
for the sender's assigned original user player. Script packets are restricted to exact
original native menu forms: team selection/switching, hostility, surrender, goal menu,
goal/rule Activate and escaped message-board answers. Arbitrary console/debug/editor
scripts and packets are rejected. Native custom chat-command script macros are not
currently admitted. Script-side gameplay callbacks still execute through the original
command interpreter on every peer.

## Read-only scenario QA

`nc_browser_diagnostics()` reports original seed, player limits, definitions, profiles,
control key names, teams, all viewports, native dialog bounds, and existing goal objects.
Goal fulfillment is null before original end-of-round evaluation; inspection does not
invoke goal script callbacks. `nc_browser_overview()` calls the original full-landscape
screenshot operation and writes to the configured screenshot directory.
`nc_browser_quit()` schedules original confirmed abort at the next browser boundary.

Validation command: `GAME_URL=http://127.0.0.1:3902 node rage-port/tests/browser-network.mjs`.
This delegates to the production-room regression `tests/rtc-room.mjs`. Its report is
`rage-port/outputs/rtc-room/report.json`. The initial Goldmine two-peer run passed at
frame 122, comparing original synchronization bytes and the full terrain hash across
desktop and landscape viewports, with original controls and coordinated pause/resume.
The original Knights Capture the Flag team-selection path also passed in
`outputs/rtc-team/report.json`. After enabling the native network flag, Desert passed
in `outputs/rtc-desert/report.json`: each device had exactly one assigned local player
and viewport, guest input reached its own original cursor, synchronization bytes and
full terrain matched, and coordinated pause/resume passed at frame 122. The room's
periodic comparison verified frame 120. This exercises the official sun script's
network branch across different viewport sizes; it does not establish parity for
every scenario or a complete multiplayer round.

Cross-browser transport and simulation also passed with a Chromium host and
WebKit guest (`outputs/rtc-cross-browser/report.json`): actual SDP pairing,
guest-owned input, frame-120 synchronization barrier, matching native sync bytes
and terrain, and coordinated pause at frame 123 followed by resume. Reproduce
with `RTC_GUEST_BROWSER=webkit RTC_OUT=rage-port/outputs/rtc-cross-browser` before
the command above. This is desktop Playwright WebKit with software GL, not a
physical Safari/iPhone test.

## Current scope

The room currently keeps original transport-client IDs at the native local client,
while assigning browser input ownership by original user player. The complete
unpacked official catalog has no script calls to client-ID/name/count functions
or AddMessageBoardCommand. Native dynamic CreateScriptPlayer/direct player-removal
control packets are outside current admission; the official catalog does not call
those paths. Custom content using them requires further adapter work and parity tests.

The browser hides same-device New Player and unavailable room Save menu entries.
Inventory taps use the native menu's local viewport player, including guest player
numbers, instead of an unassigned world mouse owner. Solo native touch purchases
passed in both portrait and landscape. The complete official-catalog sweep now
contains 80 unique passing scenario results, including all 27 minimum-two-player
scenarios in actual two-browser rooms across the base game and official add-ons.
This coverage checks startup, original controls, a short simulation interval and
captured gameplay; solo saves are checked where available. It does not establish
completion of every objective, long-running multiplayer reliability, or support
for custom content. The dedicated Goldmine, Knights team-selection, Desert and
Chromium/WebKit room reports provide additional synchronization/input checks.

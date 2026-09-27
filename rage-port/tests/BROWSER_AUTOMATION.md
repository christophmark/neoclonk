# Browser automation bridge

`engine/src/C4Browser.cpp` adds a thin host boundary around the **original** engine. Add this translation unit to the full-engine compile/link list. `EMSCRIPTEN_KEEPALIVE` retains and exports each function; ordinary Emscripten exported runtime methods `ccall`/`cwrap` suffice. No additional libraries are needed.

| Export | Arguments | Result |
| --- | --- | --- |
| `nc_browser_state` | none | JSON string: running/paused/frame/game-over state, scenario, original RNG state/count, landscape dimensions, weather, material counts, GOLD/object counts, players and detailed crew/cursor state |
| `nc_browser_object` | original object number | JSON object or `null` |
| `nc_browser_objects` | center x, center y, radius | JSON array of live objects in radius; radius0 returns all |
| `nc_browser_material` | x, y | original material index, or -1 for unavailable/outside |
| `nc_browser_terrain` | x, y, width, height | JSON rectangle with row-major original material indices; bounds checked, <=1,048,576 cells |
| `nc_browser_command` | player, command, target number, x, y, target2 number, data, append | queue original player mouse command; 1 queued, negative error (see below) |
| `nc_browser_landscape_hash` | none | FNV-1a hash over original texture/IFT bytes; zero when no running game |
| `nc_browser_key` | SDL1.2 key code, pressed, modifiers, repeated | original keyboard dispatcher result (1 handled, 0 unhandled, -1 unavailable); modifier bits1=alt,2=ctrl,4=shift |
| `nc_browser_control` | player number, control index, pressed, repeated | dispatch the player's configured original control key; indices0..8 classic nine buttons,9 menu,10/11 special |
| `nc_browser_pause` | 1 pause / 0 resume | resulting pause state; -1 unavailable/network/step in progress; -2 attempt to resume a multiple-halt state |
| `nc_browser_step` | ticks1..512 | actual original tick count advanced; -1 invalid count; -2 unavailable/network/game-over/reentrant; -3 not simply paused |

String results share a static `StdStrBuf`: convert/copy them immediately before calling another string-returning export. `ccall(name, 'string', [], [])` does that conversion. Inspection reports original fixed-point integers for position/speed fields `fixedX`, `fixedY`, `vx`, `vy`; divide by65536 only for display. `energy` and `breath` also retain original engine units. No engine script callbacks run during inspection.

Example while the original scene is running:

```js
const state = () => JSON.parse(Module.ccall('nc_browser_state', 'string', [], []));
const pause = value => Module.ccall('nc_browser_pause', 'number', ['number'], [value]);
const step = ticks => Module.ccall('nc_browser_step', 'number', ['number'], [ticks]);
const control = (player, index, pressed, repeated = 0) =>
  Module.ccall('nc_browser_control', 'number', ['number','number','number','number'],
              [player, index, pressed, repeated]);
pause(1);
const player = state().players.find(p => p.local).number;
control(player, 5, 1); // original Dig keydown
control(player, 5, 0); // original keyup: classic mode preserves the command
step(16);             // original control delay, action, movement, materials and scripts
const after = state();
console.log(after.players.find(p => p.number === player).cursor);
```

Stepping calls `Game.Unpause()`, runs the complete original `Game.Execute()` path, and restores `Game.Pause()` with an RAII guard. It stops when the original control preparation defers a tick or the game ends. It does not rewrite frame counters, RNG, inventories, terrain, coordinates, goals or C4Script. Run steps while paused in manageable batches; read the returned actual count. The regular browser application loop continues to render while game ticks are paused.

Control injection resolves `Config.Controls.Keyboard[player->Control][control]` and invokes `Game.DoKeyboardInput`. Original keyboard scopes, menus, repeats, player control mode, command queue and delayed single/double processing therefore remain authoritative. It supports local keyboard-controlled players; -2 means missing/nonlocal/eliminated player and -3 means a non-keyboard control set. Actual DOM/SDL key events should also be tested to verify browser wiring.

This bridge makes the original engine inspectable and playable by automation. A passing playthrough still needs assertions about original Gold Mine's goal and material behavior; existence of the API alone is not a gameplay test.

## Original command automation

`nc_browser_command(player, command, target, x, y, target2, data, append)` creates precisely the original `C4ControlPlayerCommand` packet used by `C4MouseControl::SendCommand`. `append=0` replaces the selected crew command stack; `append=1` appends using original flags. The actual original AI, collision, interaction range, stock, inventory and wealth checks execute during ordinary game ticks. A queued command may fail; inspect the object `commands` array and resulting state. No game script evaluation or object/terrain mutation is exposed.

Allowed command IDs: Follow1, MoveTo2, Enter3, Exit4, Grab5, Build6, Throw7, Chop8, UnGrab9, Jump10, Wait11, Get12, Put13, Drop14, Dig15, Activate16, PushTo17, Construct18, Buy22, Sell23, Home27, Take29, Take2=30. Other commands (including Call and internal Retry) return -3. Missing/nonlocal/eliminated players return -2; unavailable/network/reentrant game returns -1; nonexistent nonzero object targets return -4.

Examples: MoveTo `(player,2,0,x,y,0,0,0)`, Get `(player,12,itemNumber,0,0,0,0,0)`, Enter `(player,3,hutNumber,0,0,0,0,0)`, Buy one `(player,22,hutNumber,1,0,0,packedC4ID,0)`. `C4ID` packs four ASCII bytes little endian, exactly as the engine. Targeted Throw uses command7, carried item target, and world x/y. Dig uses command15, world bottom-center x/y, and data0 for ordinary tunneling. Detailed objects report original command names, coordinates, target object numbers, data, completion and failure counts.

## Original save-button export

`engine/src/C4BrowserSave.cpp` adds `nc_browser_save()` and `nc_browser_save_status()` without modifying the game serializer. The first call returns a positive request ID when accepted, -1 if no initialized local non-replay game is available, and -2 while a save is already pending. Acceptance alone does not mean a completed or persisted save.

The scheduled callback runs at the next browser event boundary and invokes the same `Game.QuickSave` entry point as the original main menu. The original `C4GameSaveSavegame::OnSaving` synchronizes local player files before saving. The callback pauses only if needed and restores the prior running/paused state; it does not advance game ticks. A pre-existing multiple halt is retained. It creates a fresh `Neoclonk-YYYYMMDD-HHMMSS-sequence.c4s` slot in the configured original save folder, using UTC time and an existing-path check to avoid replacing any prior file, directory or symlink. The resulting original group must reopen with Scenario.txt and Game.txt before success is reported.

`nc_browser_save_status()` returns a JSON string with `{requestId,status,path,frame,paused,bytes,error}`. `status` is `idle`, `pending`, `saving`, `saved`, or `error`; `path` is the absolute original .c4s path. `paused` records the state preserved during saving. On `saved`, the host must call `FS.syncfs(false, callback)` and report durable IndexedDB success only after that callback succeeds. Original engine save completion and browser storage persistence are separate results. The status string has its own static buffer and should be copied immediately.

Save export regression passed against the linked browser engine: three distinct original .c4s groups (72197,72240,72213bytes), busy duplicate rejection, first-save SHA256 unchanged after later saves, two paused saves both at frame3, a running save at frame4 with running state restored, and successful IndexedDB sync. The report is `rage-port/outputs/save-export-report.json`; rerun with `GAME_URL=http://127.0.0.1:3902 node rage-port/tests/browser-save-export.mjs` or the current served origin. The test also caught a status-only formatting issue: original `StdStrBuf` rejects `%lld`, so the adapter now uses standard snprintf before appending the decimal byte-count string. Original save serialization was unchanged.

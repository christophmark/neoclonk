# Original Clonk Rage gameplay audit

Audited against the supplied, unmodified `cr_source` archive. This document supports the requested fresh browser port of **Gold Mine** using original sprites, original scenario data, and original gameplay routines. Source references below are local paths and line numbers, verified from this checkout. This audit does not change the engine or the previous TypeScript prototype.

## Finding

The previous Three.js sandbox is a new game simulation. Its deterministic tests demonstrate that its own rules are repeatable; they do not establish Clonk Rage compatibility. Linking the original random generator or pathfinder does not make its movement, digging, material behavior, contents, scripts, or scenario original.

The exact port must execute the supplied C++ gameplay engine and the matching content's C4Script. Keep platform adaptations outside that behavior. Retain original sprite sheets and let original definitions/actions determine their frame, direction, dimensions, offsets, and overlays. Matching official 4.9.10.7 build330 content is now available under `original-content/import/files`. Gold Mine's actual objective is established below from its original goal script; the sandbox's goal is incompatible.

## Confirmed original Gold Mine content

The matching official package contains `Worlds.c4f/Goldmine.c4s/Scenario.txt`. Its header names Goldmine, selects `Objects.c4d`, and requests `Goals=GLDM=1`. There is no scenario map or scenario script in this package: original landscape generation and scenario settings create the world. The scenario contains an 80×60 base map with player extension, original landscape layers and randomized evaluated settings. Player1 starts with one CLNK, one HUT2, a flag and configured wealth, knowledge, home-base materials and production. It is not the sandbox's two-clonk hillside.

`Objects.c4d/Goals.c4d/Goldmine.c4d/Script.c` includes OREM and defines `IsFulfilled()`:

- Wait until the material count is available.
- Require fewer than **150 gold landscape pixels**.
- Require **zero `GOLD` objects**.

`SellID()` returns GOLD. This is a mining-and-selling objective; clearing every last terrain pixel is not required, and leaving physical nuggets unsold does not complete it.

`Material.c4g/Gold.c4m` has **no `DigFree`**, and defines `BlastFree=1`, `Blast2Object=GOLD`, `Blast2ObjectRatio=75`. Original gold seams must be blasted; the ordinary Dig action does not excavate them. Earth is diggable. This distinction makes explosives, purchase/production, throwing, original blasts, physical nuggets and selling mandatory parts of the playable original Gold Mine.

The original clonk action map is `Objects.c4d/Crew.c4d/Clonk.c4d/ActMap.txt`; its Dig action has `DigFree=11`, delay15 and sixteen animation frames with facet `0,60,16,20`. Load these values from the content through the original definition loader.

All paths in this section are relative to `original-content/import/files/`.

## Classic nine-button controls and command delivery

The physical 3×3 mapping is defined in `engine/inc/C4Constants.h:147` and converted by `engine/src/C4ObjectCom.cpp:868`:

| Row | Left | Middle | Right |
| --- | --- | --- | --- |
| Top | Previous crew cursor | Cursor toggle | Next crew cursor |
| Middle | Throw | Up/context action | Dig |
| Bottom | Left | Down/context action | Right |

The default first keyboard is Q/W/E, A/S/D, Z/X/C (Y on the German layout); numpad uses 7/8/9, 4/5/6, 1/2/3. See `engine/src/C4Config.cpp:310`. Additional original keys exist for special/menu functions and must remain accessible, even when the primary touch pad shows nine buttons.

The original input path is:

1. `C4Game::LocalControlKey` (`C4Game.cpp:3282`) converts a control index to an original command.
2. `C4Game::LocalPlayerControl` (`C4Game.cpp:3317`) handles player/object menu conversion and queues `C4ControlPlayerControl` through `Input.Add` (`:3344`).
3. `C4ControlPlayerControl::Execute` (`C4Control.cpp:349`) invokes `C4Player::InCom`.
4. `C4Player::InCom` (`C4Player.cpp:1499`) maintains pressed bits and the single/double command state; then `DirectCom` routes crew selection or object controls.
5. `C4Object::DirectCom` (`C4Object.cpp:3260` onward) honors containment, menus, script overrides, control style, and the object's current procedure.

This chain matters. A DOM key should not directly assign velocity, call `ObjectActionDig`, move a cursor, or invoke a scenario win flag. Touch should enter the same command path. Crew toggle double press selects all crew (`C4Player.cpp:1486`); toggling every crew member on an ordinary single press is different.

### Single and double press timing

`C4DoubleClick` is 10 (`C4Constants.h:145`). `InCom` remembers `LastCom` and resets `LastComDelay`. A different command flushes the buffered single command immediately; a repeated same command creates its double variant. `ExecuteControl` (`C4Player.cpp:1239`) emits the delayed single variant once `LastComDelay > C4DoubleClick`.

This timing is engine state. Browser wall-clock timers must not reimplement it. Paused stepping should advance it only when the original game advances.

### Persistent classic mode versus auto-stop mode

`LocalControlKeyUp` (`C4Game.cpp:3301`) generates release commands only for `pPlr->ControlStyle` (auto-stop mode). Classic movement and digging are commands that persist after key release. `LocalControlKey` ignores repeated keydown events only in auto-stop mode. The port must preserve the selected original control style and intentionally reproduce its repeat behavior; a blanket suppression of repeated events changes classic steering.

The alternate auto-stop handler lives at `C4Object.cpp:3470` onward; it must not accidentally become the classic default. In particular `AutoStopUpdateComDir` (`:3628`) derives direction from pressed bits and handles stopping while digging.

## Exact persistent digging

The reported 45-degree digging behavior is directly present in the supplied original engine:

- While walking, `COM_Dig_S` calls `ObjectComDig` and sets `Action.ComDir` to `COMD_DownRight` or `COMD_DownLeft`, according to facing (`C4Object.cpp:3329`).
- `ObjectComDig` (`C4ObjectCom.cpp:350`) checks the original physical capability and uses `ObjectActionDig` (`:129`) to select the definition's `Dig` action and initialize its material request flag.
- Once the current procedure is `DFA_DIG`, left/right commands rotate the stored `Action.ComDir` through adjacent directions (`C4Object.cpp:3378`). They do not simply start horizontal walking. Down stops the action. Another Dig single toggles `Action.Data`, which requests digging material into objects; Dig double has activation behavior.
- The action execution branch (`C4Object.cpp:4782`) computes `lLimit = ValByPhysical(125, pPhysical->Dig)` and uses equal horizontal and vertical components for downward diagonal digging.

| Stored direction | Original horizontal component | Original vertical component |
| --- | --- | --- |
| Down-left | `-lLimit` | `+lLimit` |
| Down | `0` | `+lLimit` |
| Down-right | `+lLimit` | `+lLimit` |
| Left / right | `-lLimit` / `+lLimit` | `0` |
| Up-left / up-right | `-lLimit` / `+lLimit` | `-lLimit / 2` |

Downward diagonals are 45 degrees in unobstructed diggable terrain. Upward diagonals are shallower; describing every original diagonal as 45 degrees would be incorrect. Collision, attachment and material restrictions still apply, so the table is not a promise that every observed trajectory is a straight line.

The Dig action requires a bottom attachment check before setting its velocity. Losing contact can stop digging. Contact reactions are also original behavior: bottom contact can change a downward diagonal to horizontal, while some top/side contacts stop digging (`C4Object.cpp:4221` onward).

### Excavation is tied to the original action definition

`C4Object::DoMovement` (`C4Movement.cpp:185`) clears the target area **before** movement. It reads `Def->ActMap[Action.Act].DigFree`:

- Value 1 uses the original object's shape rectangle.
- Other nonzero values provide a circular radius, with original construction-size scaling.
- The center is calculated from `fix_x + xdir`, `fix_y + ydir` using original fixed-point conversion.

`C4Landscape::DigFree` (`C4Landscape.cpp:980`) performs its own integer pixel traversal and stray-pixel cleanup. `DigFreePix` (`:936`) checks material `DigFree` and triggers instability. Keep those routines intact, including iteration order and edge behavior.

### Material becomes a real object

`DigFree` counts material into the excavating object and calls `DigOutMaterialCast` on the original Tick5 cadence. `C4Object::DigOutMaterialCast` (`C4Object.cpp:3903`) reads each material's `Dig2Object`, `Dig2ObjectRatio`, and `Dig2ObjectOnRequestOnly`. Once eligible, it creates the specified original object with `Game.CreateObject`, uses the original random rotation, and resets that material accumulator to zero.

This is materially different from increasing a numeric inventory every 70 pixels. The original nugget is a normal game object subject to object collection, containment, throwing, collisions, script callbacks, and scenario rules.

## Physics, materials and timing that must remain intact

### Position and collision

`standard/inc/Fixed.h:25` enables fixed-point math; `FIXED_SHIFT` is 16 (`:39`), with signed `int32_t` storage (`:62`). Preserve `C4Fixed`, its rounding rules, arithmetic and original fixed-point lookup tables. JavaScript number arithmetic is not a replacement for those semantics.

`C4Movement.cpp:185` performs pixelwise movement, shape contact testing, attachment, friction, force redirection and bounds handling. `C4Shape` and definition vertices describe collision and contact directions. Object behavior also depends on original physical attributes, action definitions, construction, contents, contact flags and scripts. A generic rigid-body library or a fixed 6×12 rectangle cannot establish exact compatibility.

The `DFA_WALK`, `DFA_SCALE`, `DFA_HANGLE`, `DFA_FLIGHT`, `DFA_DIG`, `DFA_SWIM`, build/push/pull/fight and other original procedure branches should all remain compiled. Gold Mine may use buildings and vehicles whose mechanics depend on those shared branches, even if an initial test only exercises one clonk.

### Water and other materials

Keep `C4Landscape`, `C4PXS`, `C4MassMover` and `C4Material` together:

- `C4MassMoverSet::Execute` (`C4MassMover.cpp:41`) traverses its original set twice per execution.
- `C4MassMover::Execute` (`:111`) uses material paths, density, slide limits and instability behavior.
- `C4PXS.cpp:46` checks density for free material particles.
- `C4Material.cpp:186` onward loads material properties; later branches implement material reactions.

Original weather belongs to the original simulation (`C4Weather.cpp:60`). Shimmer, spray and waves may be additional visual effects, but rain must not insert extra gameplay water or alter the RNG stream unless the original scenario/weather routines do so.

### Whole-game execution order

`C4Application` initializes its game delay to 28 ms (`C4Application.cpp:36`) and calls `Game.Execute` from its application loop (`:344`). Port scheduling rather than assuming display frames equal game ticks.

`C4Game::Execute` (`C4Game.cpp:721`) preserves this dependency order:

1. Network/control preparation; halt gate.
2. Queued control execution and tick counters.
3. Object execution, then global effects.
4. PXS particles, graphic particles, mass movers, weather, landscape.
5. Players, music, messages and scenario script.
6. Mouse control, rules, game-over checks and synchronization checks.

A browser pause/step API should invoke this intact execution path. It must not call only object movement or increase an external tick counter. Visual redraws and inspection must not consume gameplay RNG or mutate game state.

## Scenario, definitions and C4Script initialization

`C4Game::Init` (`C4Game.cpp:302`) orchestrates loading. The important `InitGame` sequence (`:2224`) is:

1. Register original engine functions and load `System.c4g` scripts through `InitScriptEngine` (`:2461`).
2. Load scenario components and local player information; initialize control/replay.
3. Load graphics and definitions (`InitDefs`, `:59`).
4. Load scenario scripts and scenario-local system scripts with original override priority.
5. Link scripts through `C4Aul` (`LinkScriptEngine`, `:2491`).
6. Load materials/textures and initialize the original landscape/map.
7. Initialize object sectors, pathfinding, PXS, mass movers and saved objects.
8. Initialize goals and remaining scenario state.
9. Initialize players; `InitGameFinal` (`:2423`) validates owners, invokes scenario `Initialize` for a fresh scenario, runs player final initialization, and creates viewports.

The VM is not optional. `C4AulParse`, `C4AulLink`, `C4AulExec`, `C4Script` and the original `C4Value` behavior must run unchanged. `C4AulExec::Exec` (`C4AulExec.cpp:297`) executes compiled script code; engine callbacks are registered by the original function map. Replacing a few recognized script names with JS handlers will silently change scenario behavior.

`C4Group::Open` (`C4Group.cpp:643`) and `OpenAsChild` (`:1791`) support the game's hierarchical group loading. A virtual filesystem should preserve those paths and group contents, including original case and override precedence. Use the exact Gold Mine scenario, its definitions, material files, system scripts and player initialization. Record hashes and original paths for all required packs. The matching official build330 content is now extracted at `original-content/import/files`; see the confirmed scenario and goal findings above. Keep its acquisition manifest and hashes with the port.

`C4Game::GameOverCheck` (`C4Game.cpp:603`) includes periodic original checks and legacy scenario conditions, while goal objects can implement newer rules. Evaluate the supplied scenario's real goal through those paths. Do not award victory by a new frontend gold counter.

## Original sprites and a Three.js presentation boundary

`C4DefGraphics::LoadBitmap` (`C4DefGraphics.cpp:51`) handles original PNG/bitmap and owner-color overlays. `C4Object::Draw` (`C4Object.cpp:2130`) uses action facets, original phase and direction, reverse animation, construction scaling, transforms, top faces and graphic overlays. The frame selection around `:2332` is a good reference for rendering parity.

A minimal faithful browser renderer can translate original draw commands into Three.js textured quads, preserving source rectangles, destinations, transforms, tint, clipping, blend order and owner overlays. Another validation path is to show an original-renderer output surface before introducing the Three.js draw bridge. Merely displaying a clonk sprite sheet while maintaining the sandbox's `walk/dig/jump` labels is not enough.

Original draw positions and gameplay state must remain authoritative. Future shader relief, lights and weather effects can consume exported state without moving collision edges or changing visibility rules. Keep a switch that shows the original visual presentation for comparison.

## Smallest credible full-engine browser architecture

The original `Makefile.am:85` engine source list is the starting compilation inventory. It includes the VM, definitions, object actions/movement, materials, groups, players, saves, controls and many native services. There is no demonstrated tiny isolated gameplay library in this archive.

Use a separate port tree/build layer and explicit, reviewable platform patches, retaining the supplied source archive unchanged. Compile the gameplay translation units into one WebAssembly module. An initial single-player bootstrap may adapt native networking, windowing, audio, file monitoring and dialogs, but it must not stub gameplay functions, material creation, scripts, goal evaluation, RNG or controls.

The archive offers two useful seams:

- `configure.ac:140` selects an SDL main loop; the original SDL dependency is 1.2 (`:124`). A modern browser toolchain integration still needs to be built and verified; existing configure flags alone do not produce a browser app.
- Dedicated mode defines `USE_CONSOLE` and disables native graphics/sound (`configure.ac:143`). `standard/inc/StdNoGfx.h:9` provides a no-graphics backend. This can help a headless parity runner, but its draw methods do nothing and cannot by itself render playable original sprites. Also audit console conditionals for differences in loading/UI dependencies before selecting it as the browser production mode.

Proposed host API, implemented as a thin C/C++ bridge:

- Load matching content into a virtual filesystem, initialize original engine/scenario/player and report original load errors.
- Enqueue original player control indices or keyboard events with original repeat semantics.
- Run one original simulation tick, or run under an application scheduler matching original tick timing.
- Pause/resume scheduling without changing persistent commands.
- Read an inspection snapshot of original object/action/material/script/player state.
- Export original draw operations or a renderer surface.
- Save/load through original save routines, with browser persistence outside them.

A worker can own the WebAssembly module and Three.js can own display. Preserve event order at the boundary. The native reference runner and WebAssembly runner should share the same bridge and content manifest so that tests compare execution rather than two independently written models.

## Concrete differences in the discarded TypeScript sandbox

References are to the sandbox as it existed when this audit was written; later removal may move these files.

| Sandbox source | Difference from the supplied original |
| --- | --- |
| `web/game/simulation.ts:22` | Hand-authored sinusoidal terrain and elliptical caves/seams instead of original scenario/map initialization. |
| `web/game/simulation.ts:46` | Two invented crew members and decorative fixed objects instead of definitions, scripts and player initialization. |
| `web/game/simulation.ts:57` | Hardcoded rectangular collision instead of definition vertices and C4Shape contacts. |
| `web/game/simulation.ts:58` | JS controls bypass original queue, single/double timing, menus, script overrides and action procedures. |
| `web/game/simulation.ts:67` | Single toggle directly selects all, unlike original cursor toggle/double behavior. |
| `web/game/simulation.ts:82` | Invented hut deposit/heal/pump behavior. |
| `web/game/simulation.ts:90` | New cellular water, rainfall and pump algorithm; original material runtime is absent. |
| `web/game/simulation.ts:122` | Invented nugget projectile parameters and pickup radius. |
| `web/game/simulation.ts:145` | Digging depends on a held button; original classic Dig is persistent action state. |
| `web/game/simulation.ts:148` | New floating-point speeds, acceleration, buoyancy and climb assistance. |
| `web/game/simulation.ts:185` | Hardcoded dig disc, offsets and 70-pixel inventory conversion, without ActMap or material definitions. |
| `web/game/simulation.ts:196` | Frontend-defined completion and final partial nugget instead of original scenario goal/scripts. |
| `web/game/simulation.ts:207` | Prototype JSON format does not contain original objects, scripts, effects, commands or mass movers. |

These differences should be retired from the exact port. More tweaks to this simulation cannot establish identity with the original executable.

## Acceptance gates for an original Gold Mine port

1. **Content identity:** hash the exact source revision and every loaded Gold Mine/system/definition/material asset; show original scenario title and goal text.
2. **Initialization parity:** same seed, player profile, scenario parameters and content produce equal object IDs, positions, actions, ownership, contents, landscape material hash, RNG state and script globals before the first command.
3. **Classic digging regression:** walking + one Dig press eventually enters the original down-diagonal Dig after original single-command timing; key release leaves Dig active; unobstructed downward digging has equal fixed-point x/y magnitudes; left/right taps rotate persistent direction; Down stops. Verify both facings, upward shallow directions, hard material contacts, loss of attachment and material-request toggles.
4. **Command parity:** original single/double timing, repeat, crew toggle/select-all, contextual Up, throwing/drop, menu navigation, containment and building interactions agree after each tick.
5. **World parity:** compare original terrain, PXS, mass movers, weather, object creation/collection, effects and script state, including water after digging breaches a pool.
6. **Scenario parity:** complete the actual Gold Mine objective through original controls and routines, with the original resulting evaluation; invented deposits or frontend completion flags do not count.
7. **Sprite parity:** at known actions/ticks, compare source rectangle, animation phase, facing, position, overlays and ordering to original output.
8. **Save/restore parity:** original saves restore the same continuation; browser pause/inspection/redraw must not advance timers or RNG. Test tab suspension explicitly.
9. **Browser playthrough:** use real keyboard and touch events or the same queued control bridge, pause between decisions, inspect original state, and complete the scenario without teleporting, editing terrain, scripting away objectives or changing inventories.

A successful original random-number comparison remains useful but satisfies only one narrow component of these gates. A successful new-sandbox playthrough satisfies none of the whole-engine parity requirements on its own.

## Executed original-code regression probe

`rage-port/tests/build_gameplay_probe.py` now compiles selected original functions/branches verbatim, together with the complete original `Fixed.h`, to native GCC and WebAssembly. `rage-port/tests/gameplay-parity.mjs` passed **40,329 matching operations**. Native assertions cover original delayed single/double Dig, persistent digging after release, direction steering and bounds, exact downward45-degree components, shallower upward components, Dig material-request toggles and seven physical strengths in both facings.

The fixture boundary deliberately excludes terrain collision, VM/scripts, material simulation and full initialization. This verifies the selected original branches and numeric portability; it does **not** claim that the full browser port already executes Gold Mine correctly. The production full-engine comparison and real Gold Mine playthrough remain required gates.

## Current full-engine browser verification

The full original C++ engine now runs Gold Mine in Chromium/WebAssembly with the matching original content:345 definitions and23,988 linked script lines, zero script warnings/errors, genuine dynamic landscape, original sprites, inventory/commands/material simulation and goals. The discarded TypeScript simulator is not used by this scene.

The browser bridge in `rage-port/source/engine/src/C4Browser.cpp` exposes read-only objects/materials/terrain, original key dispatch, full original game ticks while paused, and a whitelist of original queued player commands identical to the original mouse command path. It does not expose script evaluation, terrain edits, teleportation or inventory/wealth changes.

Executed checks include the classic nine-key hut purchase menu (original FLNT purchase50→45 wealth), original queued Buy/Get/Exit/Dig/Get/Enter commands, and an actual seam extraction and return cycle. In the latter, an original Super-Flint blast removed350 gold pixels (7368→7018), created four original GOLD objects (17→21), and the clonk retrieved newly created GOLD155 and returned from(407,455) to its hut at(561,235). Automatic sale removed the carried GOLD (21→20); the original hut charged five wealth for energy regeneration while the sale earned five, leaving net wealth40 unchanged and restoring clonk energy15000→50000. This is a completed mining/sale loop, not completed Gold Mine victory.

The pilot's external route planner reads original material pixels and chooses ordinary Dig destinations. Real failure cases were retained and diagnosed: buying before Tick10 base flag assignment fails; rock stops digging; a thrown impact explosive can hit a ceiling and miss gold; a stationary dropped explosive need not generate an impact; buried natural flints can explode and interrupt an order. None of these failures was bypassed by altering original gameplay. Planning beneath the seam enables the ordinary upward throw to strike gold.

Original sound buffers decode and play through the platform adapter, including the original Sloping Off.ogg at252.43seconds with an active WebAudio source and running audio context. Encoded metadata for498 original audio files was checked independently against ffprobe. See `rage-port/tests/BROWSER_AUDIO.md` for compatibility limits and preservation of original SDL lifetime arithmetic.

Root integration tests additionally cover native-recording replay synchronization (680 frames), original save/reload/resume, and actual browser keyboard/touch input. Their dedicated reports remain the evidence for those checks; this gameplay audit does not turn them into a claim of exhaustive engine equivalence.

Outstanding full-mission acceptance: remove solid gold below the original150-pixel threshold and sell every GOLD object, then observe the original evaluation. The current host planner only establishes a mining loop. A robust autonomous full mission needs repeated procurement under original stock/production timing, safe travel after terrain changes, and collection of every buried object, including material behind undiggable barriers. No fabricated victory fixture or changed goal is used.

Final autonomous-pilot scope: the capped rerun stopped on a genuine map where its downward-only route search found no safe route. Earlier narrow-shaft return AI also stalled. The earlier physically completed mining/sale loop is retained as `rage-port/outputs/goldmine-cycle-observed.json`, explicitly labeled a terminal-observation summary rather than a clean test PASS. The final planner failure is retained separately as `goldmine-planner-limit.json`/`.png`. No full-victory or general autonomous-routing claim follows from the observed loop.

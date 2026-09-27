# Neoclonk original engine port: implementation status

## What runs now

The first native/WebAssembly parity target exists in `engine-port/`: the original Clonk Rage deterministic random generator and complete pixel pathfinder run from unchanged source. The distributable WebAssembly module is approximately 14 KB, has zero host imports, and loads in plain browser JavaScript through its ES module loader. Tests compare it against the same original source compiled with native G++.

The browser adapter in `web/game/engine-core.ts` compiles that same distributed binary and creates an independent seeded instance per world. Its original RNG feeds development world generation; it does not replace the prototype physics. The worker reports loading failures and can continue with its explicitly identified development RNG. Original pathfinding is exported and tested but is not used by the playable prototype.

The atmosphere prototype is not the full original simulation. Porting these foundational modules proves the toolchain, source provenance, a C API boundary, and cross-architecture test method. It does not prove object movement, material simulation, production, C4Script, save compatibility, or multiplayer compatibility.

## Source provenance and tools

The supplied archive identifies itself as Clonk Rage 4.9.10.7, build 330. Its 1,461 files remain unchanged. `engine-port/source-manifest.json` locks all original inputs used by the executable proof; each build checks hashes. `engine-port/scripts/audit_source.py` creates a complete source file checksum and dependency inventory under ignored `engine-port/build/`.

The initial environment had G++ and Node, but no Emscripten, Clang, wasm-ld, or CMake on PATH. A local, checksum-pinned WASI SDK 24 supplies Clang and the WASM linker. The smaller proof does not yet justify importing the whole Emscripten browser runtime. Reconsider Emscripten when bringing in browser file storage, worker lifetime, and the full engine's libraries.

## Compiler probe and real blockers

A native syntax-only probe of `C4Landscape.cpp` with `C4ENGINE`, `HAVE_STDINT_H`, `NONETWORK`, and the bundled include directories reaches these blockers:

1. `C4Landscape.cpp` includes `C4Game.h`, whose messages/GUI headers include `C4Application.h`, which pulls in `StdWindow.h`. The latter emits `#error need window system` without a native platform backend. This coupling must be broken or implemented through a deliberate headless adapter.
2. `StdBuf.h` and `StdAdaptors.h` rely on old non-const temporary-reference conversion patterns rejected by modern G++. Update these carefully in a separate ported source tree, retaining explicit reference/copy ownership semantics and native tests.
3. UI headers contain further old-language assumptions, such as returning `false` from a function returning a pointer. The native reference needs modernization before the browser port can establish equivalence.
4. The source bundle does not contain the matching base game packs. `System.c4g`, `Objects.c4d`, `Material.c4g`, and `Graphics.c4g` are all absent. The editor's `New.c4s` and `New.c4d` are templates, not the full game content.

Reproduce the probe from the repository root:

```sh
g++ -std=c++17 -DC4ENGINE -DHAVE_STDINT_H -DNONETWORK \
  -Icr_source/standard/inc -Icr_source/engine/inc -Icr_source/engine/sec \
  -Icr_source/standard -Icr_source/standard/zlib -Icr_source/standard/lpng121 \
  -fsyntax-only cr_source/engine/src/C4Landscape.cpp
```

This is a diagnostic probe, not a supported build command. It intentionally fails and never edits original files.

## Simulation boundary to preserve

| System | Original source anchors | Required work |
| --- | --- | --- |
| Scenario lifecycle and tick | `C4Game.cpp`, `C4Application.cpp` | Separate initialization/ticks from windows, menus, and native event loop. The constructor sets 28 ms; preserve control scheduling too. |
| Objects and actions | `C4Object.cpp`, `C4Movement.cpp`, `C4Action.cpp`, `C4Command.cpp` | Preserve fixed-point math, object order, callbacks, attachment/containment, and action timing. Export snapshots only after authoritative ticks. |
| Landscape/materials | `C4Landscape.cpp`, `C4Material.cpp`, `C4MassMover.cpp`, `C4PXS.cpp`, `C4SolidMask.cpp` | Keep material bytes, solid masks, particles, material reactions, and mutation order. Replace native draw dependencies with dirty-region events. |
| Scripts and definitions | `C4Aul*.cpp`, `C4Def.cpp`, `C4Wrappers.cpp` | Compile the original VM and all gameplay wrappers. Preserve script value/reference semantics and definition/action ordering. |
| Commands and crew | `C4Control.cpp`, `C4Player.cpp`, `C4ObjectCom.cpp` | Route browser input through original command processing, including persistent movement, release, double press, menus, selection, and context. |
| Groups and data | `C4Group.cpp`, `C4GroupSet.cpp`, `C4GameSave.cpp`, `StdCompiler*` | Read user-supplied matching packs, preserve serialization, and bridge virtual files to browser persistent storage. |
| Weather | `C4Weather.cpp` | Preserve wind, climate, season, and disasters as simulated state. Export to effects; cosmetic renderer randomness uses a separate generator. |
| Network/replay | `C4GameControl.cpp`, `C4Record.cpp`, `C4Network2*` | First obtain deterministic single-player replay, then bridge command transport; retain authoritative command order and RNG state. |
| Native presentation | `StdDDraw2`, `StdGL`, `StdD3D`, GUI/audio/application files | Replace presentation with data/events and browser adapters. Some render surfaces also carry simulation-relevant pixel data, so audit each use. |

`C4Weather.cpp` specifically calls `Game.CreateObject` and scripted `Activate` callbacks to produce lightning and other disasters. Porting only its numeric wind/temperature fields would miss gameplay. Similarly, replacing C4Landscape with a new editable bitmap would not preserve reactions, particles, mass movement, collision masks, or script interactions.

## Next implementation sequence

1. Create an isolated ported source worktree with a patch series; retain the supplied source as the reference. Add a headless build target and fix the first modern-compiler failures with focused native tests.
2. Load matching content packs into a native reference. Inventory exact definitions/scripts/materials and archive license/attribution metadata alongside pack hashes. The original source license excludes game content, so do not silently treat scripts and art as engine code.
3. Separate `Game` state and tick execution from `Application` and graphics initialization. Use a fixed seed and known scenario. Generate replay command streams and hashes of objects, materials, script state, and RNG after each tick.
4. Compile that same headless target to WASM in a worker. Keep the reference and WASM outputs equal before connecting Three.js.
5. Publish a versioned ABI for command batches, object snapshots, terrain dirty rectangles, visibility, audio events, and saved-state data. Transfer binary buffers; add shared memory only if profiling justifies it.
6. Wire the existing atmospheric renderer to authoritative snapshots. Remove prototype physics/material/control behavior as each original subsystem takes over. Mark scenario compatibility explicitly until its replay gate passes.
7. Add complete original content coverage, import validation, save tests, replay fixtures, and real-device tests. Multiplayer follows successful deterministic single-player replay.

## Verification already passed

On this environment, `python3 engine-port/scripts/build.py` and `node engine-port/tests/parity.mjs` pass. The suite checks 13,026 identical native/WASM operations, including 10,000 random values verified independently, buffered RNG wrapping, 35 path cases, invalid coordinates, and 5,000 repeated path queries without memory growth. Initial linear memory is 1 MiB, with a 16 MiB cap. The WASM binary has no imports.

These are meaningful compatibility checks for the two compiled subsystems; they are not an acceptance test for unchanged Clonk Rage gameplay.

## Content importer now implemented

`tools/import-content.mjs` extracts supplied packed groups or unpacked content trees into an explicit new local output directory. It understands Rage's modified gzip magic, scrambled group headers, sequential entry records, and uncompressed nested groups. The manifest retains SHA-256 hashes, sprite image dimensions, `DefCore` fields, action-map fields, and attribution file locations. It does not execute scripts or automatically deploy imported assets.

`node --test tools/import-content.test.mjs` passes against the supplied original editor templates and synthetic nested/malformed archives. Full base game packs remain absent. See `tools/README.md` for commands, supported formats, and limits.

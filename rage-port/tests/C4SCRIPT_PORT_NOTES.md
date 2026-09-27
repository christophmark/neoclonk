# C4Script compiler compatibility notes

Only `rage-port/source/engine/src/C4Script.cpp` needed changes in the assigned script/value scope.

Four pointer-returning engine API functions returned `FALSE`, which the original platform header expands to the boolean `false`. Modern Clang rejects conversion of that boolean expression to a pointer. Changed those failure returns to `NULL`:

- `FnGetAction`, line 955: no object resolves to a null `C4String *`.
- `FnGetHiRank`, line 2887: invalid player resolves to a null `C4Object *`.
- `FnGetCrew`, line 2893: invalid player resolves to a null `C4Object *`.
- `FnGetCaptain`, line 3041: invalid player resolves to a null `C4Object *`.

These preserve the intended null result of the historical code. They do not change command dispatch, gameplay routines, script coercions, object identity or the VM. The supplied `cr_source` is unchanged. No common headers or C4Value files were edited.

Validation: `python3 rage-port/scripts/build.py --only C4Script --compile-only` exits successfully. The original C4ScriptHost and C4Value compilation logs have no errors; C4Script now compiles successfully with the port's Emscripten compiler.

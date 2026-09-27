# Triton's Path original warning baseline

The unmodified official Linux Clonk Rage **4.9.10.7 [330]** reproduces the
browser's **44,338 lines, 2 warnings, 0 errors** summary and reaches `Game started.`
The original scenario and definition packs are unchanged. Exact executable and
pack SHA-256 values are recorded in `report.json`; the raw native log is `Clonk.log`.

Both warnings originate in shipped
`Races.c4f/Tritonpath.c4s/Hippo.c4d/HippoSaddled.c4d/Script.c`:

```text
WARNING: parameter has the same name as type id (in Take, Races.c4f/Tritonpath.c4s/Hippo.c4d/HippoSaddled.c4d/Script.c:83:21)
WARNING: parameter has the same name as type id (in Put, Races.c4f/Tritonpath.c4s/Hippo.c4d/HippoSaddled.c4d/Script.c:95:20)
```

Those original functions declare `Take(id, pClonk, bRight)` and
`Put(id, pClonk, bRight)`. Their parameter name `id` is also a script type name.
No content correction or warning suppression was applied. Browser QA should
compare these exact messages; unrelated warnings remain failures.

## Reproduce

Use the isolated native dependencies described in `../README.md`. Copy the
official `clonk64` executable and a disposable original player profile into this
directory, and link the unchanged base packs plus Knights, Fantasy and FarWorlds
definition packs here. Copy the reference config with isolated user/save paths.
Start a private Xvfb display at `:94`, then run from this directory:

```sh
DISPLAY=:94 LIBGL_ALWAYS_SOFTWARE=1 SDL_AUDIODRIVER=dummy \
LD_LIBRARY_PATH=../libs/usr/lib/x86_64-linux-gnu:../libs/lib/x86_64-linux-gnu \
./clonk64 "/config:$PWD/reference.cfg" /fullscreen /nosplash \
Reference.c4p Races.c4f/Tritonpath.c4s
```

This audit verifies the compile warnings and successful startup. It does not
claim completion of the race. The separate browser sweep verifies original
controls, screenshot capture and saving.

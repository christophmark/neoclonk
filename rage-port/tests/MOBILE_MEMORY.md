# Mobile memory audit

This investigation reduces measured memory pressure; it does not establish why a particular physical iPhone crashed. Automated Chromium/WebKit runs are not a substitute for testing that device.

## Observed public runtime

An instrumented, unmodified Gold Mine round ran for 181 seconds / 4,987 simulation frames with movement/control input. WASM stayed at 128 MiB, live textures at 3,305, framebuffer objects at zero between reads, filesystem data near 23.9 MB, and JS heap between 33.0 and 37.8 MiB. No page errors occurred. Short sound resources were released as their cache aged.

The significant extra allocation was decoded Web Audio: about 99 MiB of PCM, mostly one stereo music track. Several minutes of stereo sound decode to far more memory than their compressed OGG files. Accelerated track completion checks showed previous music handles being freed rather than all songs accumulating in `SDL.audios`.

The original GL adapter also retained its texture-size metadata after deleting textures. That is corrected by retiring metadata with `glDeleteTextures`. Gold Mine did not exhibit a growing texture allocation count during this particular test, so that omission is not presented as the observed crash cause.

## Changes and limits

The mobile/coarse-pointer shell requests a 24,000 Hz AudioContext. The browser decoder resamples audio at that rate; duration, pitch, original sound lengths, and simulation remain unchanged. This reduces retained decoded PCM by about half versus 48,000 Hz while limiting high-frequency audio detail. Desktop requests the browser's normal default rate. Browsers rejecting the requested rate fall back to their default constructor.

This leaves the original music files and game data intact. It does not cap scenario size or promise a universal iOS memory limit. The browser and operating system account for additional native/GPU memory that JS heap metrics do not include.

## Verification

- `node rage-port/tests/mobile-audio-memory.mjs chromium`
- `node rage-port/tests/mobile-audio-memory.mjs webkit`
- Set `GAME_URL` to the test engine page with `?scenario=worlds.c4f%2Fgoldmine.c4s&play=1`.
- The audio test checks actual context rate, original music playback, a known 440 Hz tone's duration/frequency after decoding, playback rate, and release of the previous original music handle. `FORCE_AUDIO_FALLBACK=1` tests a rejected requested rate against the real runtime.
- `texture-lifetime.cpp` exercises 12,800 distinct texture deletions against the real adapter and asserts its metadata empties after every batch.

Diagnostic source and raw baseline reports are in `experiments/goldmine-hd/notes/audit-public-resources.mjs` and `public-resource-audit.json`. Diagnostics do not alter the public application.

## Rebuilt runtime results

Chromium decoded the same 298.062-second stereo music track to 114,455,816 bytes at the desktop 48,000 Hz default and 57,227,904 bytes at the mobile 24,000 Hz rate: a 50% reduction, saving approximately 54.6 MiB for that track. WebKit's mobile run also used 24,000 Hz and 57,227,912 bytes. All decoded the one-second test tone to one second, retaining its 440 Hz pitch and playback rate of 1. Previous music handles were released in all runs.

A forced constructor rejection verified fallback to the 48,000 Hz default with music continuing normally. Reports: `rage-port/outputs/mobile-audio-{chromium,webkit,chromium-fallback}.json`. These are automated browser results, not a physical iPhone test.

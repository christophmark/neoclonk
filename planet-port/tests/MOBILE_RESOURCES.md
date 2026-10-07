# Planet mobile resource audit

Planet composes indexed surfaces on the CPU and uses WebGL only to present the final image with a palette. Sprite and terrain surfaces remain in CPU memory; only an actually presented surface receives a GPU texture. Destroying or resizing that surface releases its texture. Offscreen GPU framebuffers are unnecessary in this renderer.

## Measurements

Instrumented WebGL calls in the production browser shell at 390×844 CSS pixels, zoom 2:

| Scenario | Baseline textures / framebuffers | Current textures / framebuffers | Baseline texture bytes | Current texture bytes |
| --- | --- | --- | --- | --- |
| Planet Gold Mine | 359 / 358 | 2 / 0 | 8,745,589 | 77,988 |
| Planet Hazard Research Facility | 289 / 288 | 2 / 0 | 15,583,984 | 77,988 |

The two textures are the screen image and palette. These are requested texture storage sizes, not total driver/native GPU memory. Browser canvas buffers, object overhead, CPU surfaces, filesystem data and WASM memory are additional. Larger viewports and zooming out require larger presentation textures. Peak texture storage while exercising zoom 0.5–8 was 1,236,288 bytes after optimization.

Chromium and WebKit both pass 360 controlled original simulation ticks with movement and 18 zoom changes per scenario. Texture counts return to two, framebuffers stay at zero, and no GPU readback occurs in these test sequences. WASM remained at its initial 128 MiB. Screenshots were visually inspected; original pixel sampling, composition and simulation are unchanged. These are short automated checks, not a long-session leak proof or a physical iPhone benchmark. No frame-rate improvement is claimed from these measurements.

Separate checks cover WebKit touch/save/reload and two deterministic original engine instances over 180 synchronized control frames. Source provenance and original content checksums pass.

## Reproduce

```sh
node planet-port/tests/mobile-resources.mjs
BROWSER=webkit node planet-port/tests/mobile-resources.mjs
```

The default URL is `http://127.0.0.1:3906`; override with `GAME_URL`. Reports and screenshots are under `planet-port/build/mobile-resources-*`. `AUDIT_TAG=baseline` records allocations without asserting the optimized resource limit, for comparing an older build.

## Other mobile considerations

- Planet already uses indexed CPU buffers, fast sprite-copy/fill paths and no routine GPU readback.
- Canvas sizing follows CSS pixels rather than multiplying by phone device-pixel ratio; this keeps original pixel art crisp without rendering unnecessary high-resolution buffers.
- Downloaded pack arrays are released after mounting. WASM can grow for demanding scenarios, so 128 MiB is not a total-memory cap.
- Planet uses miniaudio with original WAV effects. It does not load Rage's large decoded OGG music buffers, so Rage's mobile music resampling fix does not address this renderer's main overhead.
- CPU rendering cost can still rise when zooming far out or playing large/busy scenarios. Original simulation cadence and gameplay have not been reduced to improve benchmark numbers.

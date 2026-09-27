# Original scenario validation

- **80/80** scenarios passed initialization, native controls, short simulation and original rendering checks.
- **27** scenarios requiring multiple players passed in two independent browser contexts using the production WebRTC invitation/reply flow. Both devices applied original controls; native synchronization fields and landscape checksums matched at the same paused frame.
- **53** original solo saves succeeded. Saved rounds reopened in all **7 categories containing solo scenarios**. Melees and Knights contain only room scenarios; room saving is intentionally unavailable.
- **80** original full-landscape screenshots were captured, packaged as 640-pixel-wide WebP previews, and inspected together on the labeled contact sheet. No blank or visibly broken capture was observed; extreme map aspect ratios are retained.

Triton's Path has exactly two shipped script warnings reproduced with the unmodified official Linux Clonk Rage 4.9.10.7 [330] executable. The browser test accepts only the matching messages, file locations and linker summary. All other scenarios linked without script warnings or errors. Western also logs seven missing English localization keys; the exact keys are absent from the unchanged original string tables, whose hashes are recorded in `western-localization-audit.json`.

Browser Web Audio does not decode the shipped MIDI music. The adapter handles unsupported audio without ending the game and advances through the original playback loop. WAV/OGG playback is separately verified; this report does not assert MIDI playback.

These checks do **not** establish completion of every scenario objective, exhaustive menu coverage, or long multiplayer session stability. `report.json` retains exact ticks, controls, native state, definitions, seeds, save results and per-case artifacts. `engine-provenance.json` identifies build transitions and uncertain early relink overlaps; earlier captures are not attributed to an unobserved final binary.

The staged production gallery also passed at **1440×1000 desktop** and **390×844 mobile**: all 80 real previews decoded, nine galleries appeared, keyboard selection worked, and no horizontal page overflow or browser exception occurred. Startup and scrolled gallery screenshots were visually inspected; three scenario tiles fit the mobile width. Evidence is in `gallery/report.json` and the adjacent PNGs.

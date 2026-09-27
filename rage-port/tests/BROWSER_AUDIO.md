# Original audio in the browser

The original C4MusicSystem/C4MusicFile/C4SoundSystem still choose, schedule, spatialize and stop original asset sounds. Emscripten SDL1 implements the output using Web Audio for decoded effect and OGG buffers (with an HTML media fallback). `C4BrowserAudio.cpp` fills two unimplemented SDL1 emulation queries, reports header API compatibility honestly, and parses original encoded sound duration before asynchronous browser decoding.

The browser SDL `Mix_Chunk*` is an integer JavaScript resource handle. Dereferencing native `pSample->alen` is invalid. The adapter parses RIFF/WAVE PCM/fact metadata and Vorbis rate/final granule, derives the native mixer's converted 44100Hz stereo S16 byte count, and preserves Rage's original lifetime expression `uint32(1000 * convertedBytes) / (44100 * 2)`, including its historical stereo factor and integer wrap. Actual decoded duration is distinct from this original scheduling lifetime. Native compilation retains the original SDL branch.

SDL1's browser RWops loaders clone input bytes synchronously but ignore native freesrc ownership behavior. Browser guards explicitly release the RWops after load to avoid leaking a handle for each original sound/music resource.

Validation:

- `python3 rage-port/tests/test_browser_audio.py`: 498 original audio files (204 WAV, 294 OGG) match independent ffprobe sample rates and durations; legacy scheduling arithmetic and truncated/malformed rejection checked.
- `node rage-port/tests/browser-audio.mjs`: launches genuine original Gold Mine, starts with a real browser click, checks mixer rate/channels, running browser context, decoded original short effects and active original OGG music after its asynchronous decode. This is an output-path check; original sound selection is still controlled entirely by the original engine.

The Emscripten SDL1 implementation has preexisting limitations (e.g. finite loop counts/fades). The game's ordinary one-shot and indefinite-loop effect paths are supported. Tests wait for the asynchronous music decode to finish before checking the source. Original Sloping Off.ogg was observed decoded at252.43s with an active WebAudio source and running context.

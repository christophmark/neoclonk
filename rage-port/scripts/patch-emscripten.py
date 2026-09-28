#!/usr/bin/env python3
"""Repair Emscripten 3.1.74 legacy GL and SDL platform adapters.

The original optimizer regex stops at the texture matrix's first ')' and emits
invalid GLSL. Generated coordinates contain at most one matrix parenthesis;
match that complete expression while retaining the duplicate-load optimization.
SDL's DOM key table also omits Pause, although its headers use the scancode-based
SDLK_PAUSE (1096), not DOM keyCode 19. Match the key event to those same headers.
Rage's MOD2 blits use GL_ADD_SIGNED with RGB_SCALE=2. Supply the original
Arg0+Arg1-0.5 combine formula and reserve its own shader-cache key.
"""
from pathlib import Path
root=Path(__file__).resolve().parents[2]
p=root/'.toolchains/emsdk/upstream/emscripten/src/library_glemu.js'
text=p.read_text()
new=r'/(texture(?:2D|Cube)\((?:[^()]|\([^()]*\))*\))/g'
old=[r'/(texture.*?\(.*?\))/g',r'/(texture.*\(.*\))/g']
if text.count(new)==2:
    print('Emscripten legacy texture-sample parser already patched')
else:
    for pattern in old:
        if text.count(pattern)!=1: raise SystemExit('Unexpected Emscripten legacy renderer version; inspect before patching')
        text=text.replace(pattern,new,1)
    p.write_text(text)
    print('Patched Emscripten legacy texture-sample parser')

p=root/'.toolchains/emsdk/upstream/emscripten/src/library_glemu.js'
text=p.read_text()
replacements=[
    ('      var GL_SUBTRACT    = 0x84E7;',
     '      var GL_ADD_SIGNED  = 0x8574; // Rage MOD2 fixed-function blits\n      var GL_SUBTRACT    = 0x84E7;'),
    ('          0x8575 /* GL_INTERPOLATE */: 4,',
     '          0x8575 /* GL_INTERPOLATE */: 4,\n          0x8574 /* GL_ADD_SIGNED */: 5,'),
    ('          var key = k[this.mode] * 1638400; // 6 distinct values.\n'
     '          key += k[this.colorCombiner] * 327680; // 5 distinct values.\n'
     '          key += k[this.alphaCombiner] * 65536; // 5 distinct values.\n'
     '          // The above three fields have 6*5*5=150 distinct values -> 8 bits.',
     '          var key = k[this.mode] * 2359296; // 6 distinct values.\n'
     '          key += k[this.colorCombiner] * 393216; // 6 distinct values.\n'
     '          key += k[this.alphaCombiner] * 65536; // 6 distinct values.\n'
     '          // The above three fields have 6*6*6=216 distinct values -> 8 bits.'),
    ('          case GL_ADD:\n          case GL_SUBTRACT:\n            argsNeeded = 2;',
     '          case GL_ADD:\n          case GL_ADD_SIGNED:\n          case GL_SUBTRACT:\n            argsNeeded = 2;'),
    ('          case GL_SUBTRACT: {\n            lines = [`${outputType} ${outputVar} = ${src0Expr} - ${src1Expr};`]',
     '          case GL_ADD_SIGNED: {\n'
     '            lines = [`${outputType} ${outputVar} = ${src0Expr} + ${src1Expr} - 0.5;`];\n'
     '            break;\n'
     '          }\n'
     '          case GL_SUBTRACT: {\n            lines = [`${outputType} ${outputVar} = ${src0Expr} - ${src1Expr};`]'),
    ('            return [].concat(colorLines, alphaLines, [line]);',
     '            // OpenGL clamps each texture combine result after its RGB/alpha scale.\n'
     '            return [].concat(colorLines, alphaLines, [line,\n'
     '              passOutputVar + " = clamp(" + passOutputVar + ", 0.0, 1.0);"]);'),
]
for old,new in replacements:
    if text.count(new)==1:
        continue
    if text.count(old)!=1:
        raise SystemExit('Unexpected Emscripten texture-combiner implementation; inspect before patching')
    text=text.replace(old,new,1)
p.write_text(text)
print('Emscripten GL_ADD_SIGNED formula, scale clamp and cache keys patched')

p=root/'.toolchains/emsdk/upstream/emscripten/src/library_sdl.js'
text=p.read_text()
anchor='      18: 226 | 1<<10, // alt\n'
pause='      19: 72 | 1<<10, // pause (SDLK_PAUSE)\n'
if text.count(pause)==1:
    print('Emscripten SDL Pause key mapping already patched')
else:
    if text.count(anchor)!=1 or '\n      19:' in text[text.index('keyCodes: {'):text.index('scanCodes: {')]:
        raise SystemExit('Unexpected Emscripten SDL key table; inspect before patching')
    text=text.replace(anchor,anchor+pause,1)
    p.write_text(text)
    print('Patched Emscripten SDL Pause key mapping')

# Native SDL_mixer reports an unsupported/corrupt audio resource as a playback
# failure. Web Audio reports that asynchronously through both callback and
# Promise APIs; consume that resource error without a global rejection.
p=root/'.toolchains/emsdk/upstream/emscripten/src/library_sdl.js'
text=p.read_text()
replacements=[
    ('        var webAudio = audio.resource.webAudio;\n        audio.paused = false;',
     '        var webAudio = audio.resource.webAudio;\n'
     '        if (webAudio.decodeFailed) { audio.paused = true; return; }\n'
     '        audio.paused = false;'),
    ("      SDL.audioContext['decodeAudioData'](arrayBuffer, (data) => {",
     '      var onDecodeFailure = (error) => {\n'
     '        if (webAudio.decodeFailed) return; // callback and Promise can both report it\n'
     '        webAudio.decodeFailed = true;\n'
     "        err('[audio] Resource could not be decoded: ' + (filename || 'memory buffer') + ': ' + error);\n"
     '        var pending = webAudio.onDecodeComplete || [];\n'
     '        delete webAudio.onDecodeComplete;\n'
     '        pending.forEach((callback) => callback());\n'
     '      };\n'
     "      var decodePromise = SDL.audioContext['decodeAudioData'](arrayBuffer, (data) => {"),
    ('        delete webAudio.onDecodeComplete;\n      });\n    } else if (audio === undefined && bytes) {',
     '        delete webAudio.onDecodeComplete;\n'
     '      }, onDecodeFailure);\n'
     '      if (decodePromise) decodePromise.catch(onDecodeFailure);\n'
     '    } else if (audio === undefined && bytes) {'),
]
for old,new in replacements:
    if text.count(new)==1:
        continue
    if text.count(old)!=1:
        raise SystemExit('Unexpected Emscripten SDL audio decoder; inspect before patching')
    text=text.replace(old,new,1)
p.write_text(text)
print('Emscripten SDL resource decode failure handling patched')

# FS/IDBFS retain their JavaScript tree after native exit. An explicit final
# sync can therefore persist Config.Save and original crew writes, but creating
# an FS errno must not invoke native strerror after its runtime has shut down.
p=root/'.toolchains/emsdk/upstream/emscripten/src/library_fs.js'
text=p.read_text()
old="        super(runtimeInitialized ? strError(errno) : '');"
new="""#if EXIT_RUNTIME
        super(runtimeInitialized && !runtimeExited ? strError(errno) : '');
#else
        super(runtimeInitialized ? strError(errno) : '');
#endif"""
if text.count(new)==1:
    print('Emscripten FS post-exit errno guard already patched')
else:
    if text.count(old)!=1:
        raise SystemExit('Unexpected Emscripten FS errno implementation; inspect before patching')
    p.write_text(text.replace(old,new,1))
    print('Patched Emscripten FS post-exit errno diagnostic')

# Mobile Web Audio decoding otherwise expands a several-minute music track to
# roughly 100 MiB of PCM. An optional context rate bounds that decoded storage;
# Web Audio resamples decoded content while preserving its duration and pitch.
p=root/'.toolchains/emsdk/upstream/emscripten/src/library_sdl.js'
text=p.read_text()
old="""        if (typeof AudioContext != 'undefined') {
          SDL.audioContext = new AudioContext();
        } else if (typeof webkitAudioContext != 'undefined') {
          SDL.audioContext = new webkitAudioContext();
        }"""
new="""        var AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (AudioContextClass) {
          var rate = Module['neoclonkAudioSampleRate'];
          try {
            SDL.audioContext = new AudioContextClass(rate ? { sampleRate: rate } : undefined);
          } catch (error) {
            // Some older WebKit/device combinations reject a requested rate.
            SDL.audioContext = new AudioContextClass();
          }
        }"""
if text.count(new)==1:
    print('Emscripten optional audio context rate already patched')
else:
    if text.count(old)!=1:
        raise SystemExit('Unexpected Emscripten SDL context creation; inspect before patching')
    p.write_text(text.replace(old,new,1))
    print('Patched Emscripten optional audio context rate')

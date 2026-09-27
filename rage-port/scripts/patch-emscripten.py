#!/usr/bin/env python3
"""Repair Emscripten 3.1.74 legacy GL and SDL platform adapters.

The original optimizer regex stops at the texture matrix's first ')' and emits
invalid GLSL. Generated coordinates contain at most one matrix parenthesis;
match that complete expression while retaining the duplicate-load optimization.
SDL's DOM key table also omits Pause, although its headers use the scancode-based
SDLK_PAUSE (1096), not DOM keyCode 19. Match the key event to those same headers.
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
